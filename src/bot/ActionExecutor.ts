/** Traduz BotAction em comandos mineflayer (com pathfinder, collectblock, pvp). */
import type { Bot } from 'mineflayer';
import type { ActionResult } from '@/types/types';
import type { BotAction } from '@/schemas/botAction';
import { MovementManager } from '@/bot/MovementManager';

/** Blocos comuns demais para serem alvo de COLETAR sem alvo explícito. */
const BORING_BLOCKS = new Set([
  'air', 'cave_air', 'void_air', 'stone', 'dirt', 'grass_block',
  'bedrock', 'deepslate', 'water', 'lava', 'gravel', 'sand',
]);

/** Tempo máximo para ações que dependem de navegação (coletar/craftar). */
const ACTION_TIMEOUT_MS = 30_000;

export class ActionExecutor {
  private bot: Bot;
  private movement: MovementManager;

  constructor(bot: Bot) {
    this.bot = bot;
    this.movement = new MovementManager(bot);
  }

  async executar(decisao: BotAction): Promise<ActionResult> {
    const start = performance.now();

    try {
      switch (decisao.acao) {
        case 'FALAR':
          if (!decisao.conteudo) throw new Error('Conteúdo obrigatório para FALAR');
          this.bot.chat(decisao.conteudo);
          console.log(`🗣️  Falei: ${decisao.conteudo}`);
          break;

        case 'ANDAR': {
          const dir = decisao.direcao || 'frente';
          this.movement.andarNaDirecao(dir);
          console.log(`🚶 Andando para ${dir}`);
          return {
            success: true,
            action: decisao.acao,
            direction: dir,
            content: decisao.conteudo,
            executionTimeMs: performance.now() - start,
          };
        }

        case 'EXPLORAR':
          this.movement.explorarAleatorio();
          console.log('🗺️  Explorando...');
          break;

        case 'PULAR':
          await this.movement.pular();
          console.log('🦘 Pulei!');
          break;

        case 'PARAR':
          this.movement.pararMovimento();
          console.log('🛑 Parei');
          break;

        case 'OLHAR':
          this.olharAoRedor();
          break;

        case 'SEGUIR':
          if (!decisao.alvo) throw new Error('Alvo obrigatório para SEGUIR');
          this.movement.seguirJogador(decisao.alvo);
          console.log(`🏃 Seguindo ${decisao.alvo}`);
          break;

        case 'FUGIR':
          if (!decisao.alvo) throw new Error('Alvo obrigatório para FUGIR');
          this.movement.fugirDeEntidade(decisao.alvo);
          console.log(`💨 Fugindo de ${decisao.alvo}`);
          break;

        case 'COLETAR':
          await this.withTimeout(this.coletar(decisao.alvo));
          break;

        case 'CRAFTAR':
          if (!decisao.alvo) throw new Error('Alvo (nome do item) obrigatório para CRAFTAR');
          await this.withTimeout(this.craftar(decisao.alvo));
          break;

        case 'ATACAR':
          this.atacar(decisao.alvo);
          break;

        case 'NADA':
          console.log('💤 Observando...');
          break;

        default:
          throw new Error(`Ação desconhecida: ${String(decisao.acao)}`);
      }

      return {
        success: true,
        action: decisao.acao,
        direction: decisao.direcao,
        content: decisao.conteudo,
        executionTimeMs: performance.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Erro na ação ${decisao.acao}: ${msg}`);
      this.cleanup();
      return {
        success: false,
        action: decisao.acao,
        direction: decisao.direcao,
        content: decisao.conteudo,
        errorMessage: msg,
        executionTimeMs: performance.now() - start,
      };
    }
  }

  /** Interrompe tarefas pendentes após erro/timeout. */
  private cleanup(): void {
    this.bot.collectBlock.cancelTask().catch(() => {});
    this.movement.pararMovimento();
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout após ${ACTION_TIMEOUT_MS}ms`)), ACTION_TIMEOUT_MS),
      ),
    ]);
  }

  private olharAoRedor(): void {
    const players = Object.values(this.bot.players).filter(
      (p) => p.username !== this.bot.username && p.entity,
    );

    if (players.length > 0) {
      const target = players[Math.floor(Math.random() * players.length)];
      if (target?.entity) {
        this.bot.lookAt(target.entity.position.offset(0, 1.6, 0));
        console.log(`👀 Olhei para ${target.username}`);
      }
    } else {
      this.bot.look(Math.random() * Math.PI * 2, 0);
      console.log('👀 Olhei ao redor');
    }
  }

  /** Encontra um bloco (até 32m), caminha até ele, equipa ferramenta e coleta o drop. */
  private async coletar(alvo?: string): Promise<void> {
    const ids = this.resolverBlocoIds(alvo);
    if (ids.length === 0) {
      throw new Error(`Nenhum tipo de bloco corresponde a "${alvo}"`);
    }

    const block = this.bot.findBlock({ matching: ids, maxDistance: 32 });
    if (!block) {
      throw new Error(`Nenhum bloco ${alvo ?? 'notável'} encontrado num raio de 32m`);
    }

    await this.bot.tool.equipForBlock(block, {});
    await this.bot.collectBlock.collect(block);
    console.log(`⛏️  Coletei ${block.name}`);
  }

  /**
   * Resolve um nome (parcial) de bloco para os IDs numéricos correspondentes.
   * Passar IDs ao findBlock mantém a busca otimizada por palette — um matcher
   * como função varre milhões de blocos e congela o event loop.
   */
  private resolverBlocoIds(alvo?: string): number[] {
    const target = alvo?.toLowerCase().trim().replace(/\s+/g, '_');
    const blocks = this.bot.registry.blocksByName;
    const ids: number[] = [];

    for (const name of Object.keys(blocks)) {
      if (target) {
        if (!name.includes(target)) continue;
      } else if (BORING_BLOCKS.has(name)) {
        continue;
      }
      const def = blocks[name];
      if (def) ids.push(def.id);
    }

    return ids;
  }

  /** Crafta um item pelo nome, usando bancada próxima se necessário. */
  private async craftar(itemNome: string): Promise<void> {
    const nome = itemNome.toLowerCase().trim().replace(/\s+/g, '_');
    const itemDef = this.bot.registry.itemsByName[nome];
    if (!itemDef) throw new Error(`Item desconhecido: ${itemNome}`);

    let recipes = this.bot.recipesFor(itemDef.id, null, 1, null);
    const tableId = this.bot.registry.blocksByName['crafting_table']?.id ?? null;
    let table = tableId != null
      ? this.bot.findBlock({ matching: tableId, maxDistance: 32 })
      : null;

    if (recipes.length === 0) {
      if (!table) {
        throw new Error(`${itemNome} precisa de uma bancada (crafting_table) e não há nenhuma por perto`);
      }
      await this.movement.irPara(table.position.x, table.position.y, table.position.z, 2);
      recipes = this.bot.recipesFor(itemDef.id, null, 1, table);
    } else {
      table = null;
    }

    if (recipes.length === 0) {
      throw new Error(`Sem ingredientes suficientes para craftar ${itemNome}`);
    }

    await this.bot.craft(recipes[0]!, 1, table ?? undefined);
    console.log(`🔨 Craftei ${itemNome}`);
  }

  /** Inicia ataque contínuo (não-bloqueante) via plugin pvp. */
  private atacar(alvo?: string): void {
    const entity = Object.values(this.bot.entities).find((e) => {
      if (e === this.bot.entity) return false;
      if (!alvo) return e.type === 'mob' || e.type === 'hostile';
      const name = e.name || e.username || e.displayName || '';
      return name.toLowerCase().includes(alvo.toLowerCase());
    });

    if (!entity) {
      throw new Error(`Nenhuma entidade ${alvo ?? ''} encontrada para atacar`);
    }

    void this.bot.pvp.attack(entity).catch(() => {});
    console.log(`⚔️  Atacando ${entity.name || entity.username || entity.displayName || 'entidade'}`);
  }
}
