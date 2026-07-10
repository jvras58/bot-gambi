/** Loop principal do agente: percepção → LLM → parse → execução → log. */
import type { ChatMessage, LLMResponse, GameContext, ActionResult, CycleResponseData, OnlineParticipant } from '@/types/types';
import type { BotAction } from '@/schemas/botAction';
import { BotManager } from '@/bot/BotManager';
import { ActionExecutor } from '@/bot/ActionExecutor';
import { PerceptionManager } from '@/bot/PerceptionManager';
import { MemoryManager } from '@/core/MemoryManager';
import { DataLogger } from '@/core/DataLogger';
import { GambiLLM } from '@/llm/GambiarraLLM';
import { HubMetricsWatcher, type HubMetrics } from '@/llm/HubMetrics';
import { botActionSchema } from '@/schemas/botAction';
import { botPromptTemplate } from '@/prompts/botPrompts';
import { sleep } from '@/utils/sleep';
import { safeParseJSON } from '@/utils/jsonParser';
import { normalizeAction } from '@/utils/fuzzyAction';
import { agentConfig } from '@/config/settings';

export class AgentLoop {
  private botManager: BotManager;
  private llm: GambiLLM;
  private executor: ActionExecutor | null = null;
  private perception: PerceptionManager | null = null;
  private memory: MemoryManager;
  private logger: DataLogger;
  private hubWatcher: HubMetricsWatcher;
  private isRunning = false;
  private listenersAttached = false;

  private sessionId: string;
  private botUsername: string;
  private roomCode: string;
  private participantId: string;
  private participantNickname: string;
  private modelName: string;
  private participant: OnlineParticipant;
  private cycleNumber = 0;
  private lastActionName: string | null = null;
  private consecutiveActionCount = 0;
  private forcedVarietyIndex = 0;

  /** Usernames dos outros bots da sala — chat deles não vira pedido prioritário. */
  private knownBotUsernames: Set<string>;
  /** Último pedido de um jogador humano, destacado no prompt por até 3 ciclos. */
  private pendingRequest: { jogador: string; mensagem: string; cyclesShown: number } | null = null;
  /** Pedido incluído no prompt do ciclo atual (vai para o log do ciclo). */
  private shownRequest: { jogador: string; mensagem: string } | null = null;
  private static readonly REQUEST_MAX_CYCLES = 3;

  constructor(botManager: BotManager, llm: GambiLLM, options: {
    roomCode: string;
    botUsername: string;
    participantId: string;
    participantNickname: string;
    modelName: string;
    participant: OnlineParticipant;
    hubUrl: string;
    botUsernames?: string[];
  }) {
    this.botManager = botManager;
    this.llm = llm;
    this.memory = new MemoryManager();
    this.logger = new DataLogger();
    this.hubWatcher = new HubMetricsWatcher({
      hubUrl: options.hubUrl,
      roomCode: options.roomCode,
      participantId: options.participantId,
    });

    this.sessionId = crypto.randomUUID();
    this.botUsername = options.botUsername;
    this.roomCode = options.roomCode;
    this.participantId = options.participantId;
    this.participantNickname = options.participantNickname;
    this.modelName = options.modelName;
    this.participant = options.participant;
    this.knownBotUsernames = new Set(options.botUsernames ?? []);

    this.botManager.setCallbacks(
      () => this.onConnected(),
      () => this.onDisconnected(),
    );
  }

  async start(): Promise<void> {
    console.log(`🧠 Agente ativado — ${this.participantNickname} [${this.modelName}]`);
    console.log(`📊 Session ID: ${this.sessionId}`);

    await this.logger.logSession({
      id: this.sessionId,
      room_code: this.roomCode,
      bot_username: this.botUsername,
      participant_id: this.participantId,
    });

    // Snapshot depende da sessão já existir (FK session_id → sessions.id).
    await this.logger.logParticipantSnapshot(this.sessionId, this.participant);

    this.hubWatcher.start();
    this.isRunning = true;
    this.loop();
  }

  stop(): void {
    this.isRunning = false;
  }

  async shutdown(): Promise<void> {
    this.stop();
    this.hubWatcher.stop();
    await this.logger.shutdown(this.sessionId, this.cycleNumber);
  }

  // ─── Loop Principal ──────────────────────────────────────

  private async loop(): Promise<void> {
    while (this.isRunning) {
      if (!this.botManager.isConnected() || !this.executor || !this.perception) {
        await sleep(agentConfig.disconnectedWaitMs);
        continue;
      }

      try {
        this.cycleNumber++;
        console.log(`\n━━━ Ciclo #${this.cycleNumber} ━━━`);

        // 1. PERCEPÇÃO
        const contexto = this.perception.getContextString();
        const gameCtx = this.perception.getGameContext();

        // 2. PROMPT
        const messages = this.buildMessages(contexto);

        // 3. LLM
        let llmResponse: LLMResponse | null = null;
        let llmError: string | null = null;
        const requestAt = Date.now();
        try {
          llmResponse = await this.llm.invoke(messages);
        } catch (err) {
          llmError = err instanceof Error ? err.message : String(err);
          console.error(`❌ LLM erro: ${llmError}`);
        }

        // 3b. Métricas hub-observed (medidas no hub, sem ruído de rede)
        const hubMetrics = llmError ? null : await this.hubWatcher.metricsSince(requestAt);

        // 4. PARSE
        let { action, rawResponse, rawLength, jsonRepaired, parseError } = this.parseResponse(llmResponse);

        if (llmError || parseError) {
          console.warn('⚠️  Resposta inválida — fallback EXPLORAR');
          const fallback: BotAction = { raciocinio: 'Fallback: sem resposta válida', acao: 'EXPLORAR' };
          await this.executor.executar(fallback);
          this.memory.recordEvent('LLM não retornou JSON válido');

          this.logCycle({
            messages, gameCtx, llmResponse, llmError, hubMetrics,
            action: null, rawResponse, rawLength, jsonRepaired, parseError,
            actionResult: null,
          });
          this.logRuntimeDiagnostics();

          await sleep(agentConfig.loopIntervalMs);
          continue;
        }

        action = this.enforceActionVariety(action!, gameCtx);

        const tps = llmResponse!.tokensPerSecond;
        const ttft = llmResponse!.ttftMs;
        const metricas = [
          `${llmResponse!.responseTimeMs.toFixed(0)}ms`,
          ttft != null ? `TTFT ${ttft.toFixed(0)}ms` : null,
          tps != null ? `${tps.toFixed(1)} tok/s` : null,
        ].filter(Boolean).join(', ');
        console.log(`✅ ${action!.acao} (bot: ${metricas})`);
        if (hubMetrics) {
          const hubTps = hubMetrics.tokensPerSecond;
          console.log(
            `📡 Hub: ${hubMetrics.durationMs.toFixed(0)}ms, TTFT ${hubMetrics.ttftMs.toFixed(0)}ms` +
              (hubTps != null ? `, ${hubTps.toFixed(1)} tok/s` : ''),
          );
        }
        if (action!.raciocinio) {
          console.log(`💭 ${action!.raciocinio}`);
        }

        // 5. EXECUÇÃO
        const actionResult = await this.executor.executar(action!);

        // 6. MEMÓRIA
        this.memory.recordAction(
          actionResult.action,
          actionResult.success,
          actionResult.direction || actionResult.content || undefined,
        );

        if (!actionResult.success) {
          console.log(`⚠️  ${actionResult.action} falhou: ${actionResult.errorMessage}`);
        }

        // 7. LOG
        this.logCycle({
          messages, gameCtx, llmResponse, llmError, hubMetrics,
          action, rawResponse, rawLength, jsonRepaired, parseError,
          actionResult,
        });
        if (agentConfig.pruneWorldCache) {
          this.botManager.pruneWorldCache();
        }
        this.logRuntimeDiagnostics();

        await sleep(agentConfig.loopIntervalMs);
      } catch (err) {
        console.error('❌ Erro no loop:', err);
        await sleep(5000);
      }
    }
  }

  // ─── Construção do Prompt ────────────────────────────────

  private buildMessages(contexto: string): ChatMessage[] {
    if (this.pendingRequest && this.pendingRequest.cyclesShown >= AgentLoop.REQUEST_MAX_CYCLES) {
      this.pendingRequest = null;
    }
    let pedido = '';
    this.shownRequest = this.pendingRequest
      ? { jogador: this.pendingRequest.jogador, mensagem: this.pendingRequest.mensagem }
      : null;
    if (this.pendingRequest) {
      this.pendingRequest.cyclesShown++;
      pedido = `
      PEDIDO DE JOGADOR (atenda com a ação adequada, ou responda com FALAR):
    ${this.pendingRequest.jogador} disse: "${this.pendingRequest.mensagem}"
    `;
        }

    let humanMsg = botPromptTemplate.human
      .replace('{contexto}', contexto)
      .replace('{pedido}', pedido)
      .replace('{memoria}', this.memory.toPromptString())
      .replace('{contadorAcoes}', JSON.stringify(this.memory.getActionCounts()));

    if (agentConfig.lowMemoryMode) {
      humanMsg += `

MODO LEVE DE MEMÓRIA:
- Use apenas: ANDAR, EXPLORAR, PULAR, OLHAR, FALAR, PARAR, NADA.
- Não use COLETAR, CRAFTAR, SEGUIR, FUGIR ou ATACAR neste modo.`;
    }

    return [
      { role: 'system', content: botPromptTemplate.system },
      { role: 'user', content: humanMsg },
    ];
  }

  private logRuntimeDiagnostics(): void {
    const mem = process.memoryUsage();
    const diag = this.botManager.getDiagnostics();
    console.log(
      `🧪 Mem: RSS ${(mem.rss / 1024 / 1024).toFixed(0)} MB, ` +
        `heap ${(mem.heapUsed / 1024 / 1024).toFixed(0)}/${(mem.heapTotal / 1024 / 1024).toFixed(0)} MB, ` +
        `chunks ${diag.chunks}, entidades ${diag.entities}, jogadores ${diag.players}, pos ${diag.pos}`,
    );
  }

  // ─── Parse de Resposta ───────────────────────────────────

  private parseResponse(response: LLMResponse | null) {
    if (!response) {
      return { action: null, rawResponse: '', rawLength: 0, jsonRepaired: false, parseError: false };
    }

    const { data, error, repaired } = safeParseJSON(response.content);

    if (!data || error) {
      console.log(`⚠️  JSON inválido\n   📝 Raw: ${response.content.slice(0, 500)}`);
      return {
        action: null,
        rawResponse: response.content.slice(0, 500),
        rawLength: response.content.length,
        jsonRepaired: false,
        parseError: true,
      };
    }

    try {
      const normalized = typeof data === 'object' && data !== null
        ? normalizeAction(data as Record<string, unknown>)
        : data;
      return {
        action: botActionSchema.parse(normalized) as BotAction,
        rawResponse: response.content.slice(0, 500),
        rawLength: response.content.length,
        jsonRepaired: repaired,
        parseError: false,
      };
    } catch (zodErr) {
      const zodMsg = zodErr instanceof Error ? zodErr.message : String(zodErr);
      console.log(`🔍 Zod error: ${zodMsg.slice(0, 200)}`);
      return {
        action: null,
        rawResponse: response.content.slice(0, 500),
        rawLength: response.content.length,
        jsonRepaired: repaired,
        parseError: true,
      };
    }
  }

  private enforceActionVariety(action: BotAction, gameCtx: GameContext): BotAction {
    const nextCount = this.lastActionName === action.acao
      ? this.consecutiveActionCount + 1
      : 1;

    if (nextCount <= 2) {
      this.lastActionName = action.acao;
      this.consecutiveActionCount = nextCount;
      return action;
    }

    const alternatives = this.varietyAlternatives(action.acao, gameCtx);
    const forced = alternatives[this.forcedVarietyIndex % alternatives.length]!;
    this.forcedVarietyIndex++;
    this.lastActionName = forced.acao;
    this.consecutiveActionCount = 1;
    console.warn(`🔁 Variedade: troquei ${action.acao} repetido por ${forced.acao}`);
    return forced;
  }

  private varietyAlternatives(repeatedAction: string, gameCtx: GameContext): BotAction[] {
    const player = gameCtx.jogadoresProximos[0];
    const options: BotAction[] = [
      { raciocinio: 'Evitar repetição: coletar um bloco próximo.', acao: 'COLETAR' },
      { raciocinio: 'Evitar repetição: observar o ambiente.', acao: 'OLHAR' },
      { raciocinio: 'Evitar repetição: mover em outra direção.', acao: 'ANDAR', direcao: 'aleatorio' },
      { raciocinio: 'Evitar repetição: parar e reavaliar.', acao: 'PARAR' },
    ];

    if (player) {
      options.push({
        raciocinio: 'Evitar repetição: interagir com jogador próximo.',
        acao: 'FALAR',
        conteudo: `Oi, ${player}!`,
      });
    }

    return options.filter((option) => option.acao !== repeatedAction);
  }

  // ─── Log do Ciclo ────────────────────────────────────────

  private logCycle(data: {
    messages: ChatMessage[];
    gameCtx: GameContext;
    llmResponse: LLMResponse | null;
    llmError: string | null;
    hubMetrics: HubMetrics | null;
    action: BotAction | null;
    rawResponse: string;
    rawLength: number;
    jsonRepaired: boolean;
    parseError: boolean;
    actionResult: ActionResult | null;
  }): void {
    const promptSent = data.messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n');

    const row: CycleResponseData = {
      session_id: this.sessionId,
      cycle_number: this.cycleNumber,
      room_code: this.roomCode,

      participant_id: this.participantId,
      participant_nickname: this.participantNickname,
      model_name: this.modelName,

      llm_response_time_ms: data.llmResponse?.responseTimeMs ?? null,
      llm_ttft_ms: data.llmResponse?.ttftMs ?? null,
      llm_input_tokens: data.llmResponse?.inputTokens ?? null,
      llm_output_tokens: data.llmResponse?.outputTokens ?? null,
      llm_total_tokens: data.llmResponse?.totalTokens ?? null,
      llm_tokens_per_second: data.llmResponse?.tokensPerSecond ?? null,

      hub_ttft_ms: data.hubMetrics?.ttftMs ?? null,
      hub_duration_ms: data.hubMetrics?.durationMs ?? null,
      hub_input_tokens: data.hubMetrics?.inputTokens ?? null,
      hub_output_tokens: data.hubMetrics?.outputTokens ?? null,
      hub_total_tokens: data.hubMetrics?.totalTokens ?? null,
      hub_tokens_per_second: data.hubMetrics?.tokensPerSecond ?? null,

      llm_raw_length: data.rawLength || null,
      llm_json_repaired: data.jsonRepaired,
      llm_parse_error: data.parseError,
      llm_error: data.llmError,

      action: data.action?.acao ?? null,
      reasoning: data.action?.raciocinio ?? null,
      direction: data.action?.direcao ?? null,
      target: data.action?.alvo ?? null,
      content: data.action?.conteudo ?? null,
      raw_response: data.rawResponse || null,

      action_success: data.actionResult?.success ?? null,
      action_execution_time_ms: data.actionResult?.executionTimeMs ?? null,
      action_error: data.actionResult?.errorMessage ?? null,

      prompt_sent: promptSent,

      chat_request: this.shownRequest?.mensagem ?? null,
      chat_request_player: this.shownRequest?.jogador ?? null,

      health: data.gameCtx.vida,
      food: data.gameCtx.fome,
      pos_x: data.gameCtx.posicao.x,
      pos_y: data.gameCtx.posicao.y,
      pos_z: data.gameCtx.posicao.z,
      biome: data.gameCtx.bioma,
      weather: data.gameCtx.clima,
      time_of_day: data.gameCtx.horaDoDia,
      is_moving: data.gameCtx.estaAndando,
      nearby_players: data.gameCtx.jogadoresProximos.length,
      nearby_entities: data.gameCtx.entidadesProximas.length,
      nearby_blocks: data.gameCtx.blocosProximos.length,
      inventory_items: data.gameCtx.inventario.length,
    };

    this.logger.log(row);
  }

  // ─── Callbacks de Conexão ────────────────────────────────

  private onConnected(): void {
    const bot = this.botManager.getBot();
    if (!bot) return;

    this.executor = new ActionExecutor(bot);
    this.perception = new PerceptionManager(bot);

    if (!this.listenersAttached) {
      this.listenersAttached = true;
      this.memory.clear();
      this.memory.recordEvent('Conectado ao servidor');

      bot.on('chat', (user, msg) => {
        if (user === bot.username) return;
        this.memory.recordInteraction(user, msg);
        // Só mensagem de humano vira pedido destacado — bot obedecendo
        // bot geraria loops e contaminaria a métrica de obediência.
        if (!this.knownBotUsernames.has(user)) {
          this.pendingRequest = { jogador: user, mensagem: msg, cyclesShown: 0 };
          console.log(`📢 Pedido de jogador: ${user}: "${msg}"`);
        }
      });

      bot.on('health', () => {
        if (bot.health < 8) {
          this.memory.recordEvent(`Vida baixa: ${bot.health.toFixed(0)}/20`);
        }
      });

      bot.on('death', () => {
        this.memory.recordEvent('Morri! Respawnando...');
      });
    } else {
      this.memory.recordEvent('Respawnei');
    }
  }

  private onDisconnected(): void {
    this.executor = null;
    this.perception = null;
    this.listenersAttached = false;
  }
}
