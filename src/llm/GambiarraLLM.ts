/** Cliente Gambi Hub — 1 bot = 1 participante. */
import { createGambi, type GambiProvider } from 'gambi-sdk';
import { generateText } from 'ai';
import type { ChatMessage, LLMResponse, OnlineParticipant } from '@/types/types';
import { agentConfig } from '@/config/settings';

export interface GambiLLMOptions {
  roomCode: string;
  hubUrl?: string;
  participantId: string;
}

export class GambiLLM {
  private provider: GambiProvider;
  private participantId: string;

  constructor(options: GambiLLMOptions) {
    this.provider = createGambi({
      roomCode: options.roomCode,
      hubUrl: options.hubUrl ?? 'http://localhost:3000',
      defaultProtocol: 'chatCompletions',
    });
    this.participantId = options.participantId;
  }

  /**
   * Chamada não-streaming: o `usage` (contagem de tokens) vem garantido no
   * corpo da resposta — padrão OpenAI-compatible suportado por todos os
   * backends locais. Streaming traria TTFT separado, mas o `usage` no
   * streaming é opcional e inconsistente entre backends — ver
   * docs/metricas-streaming-vs-nao-streaming.md.
   */
  async invoke(messages: ChatMessage[]): Promise<LLMResponse> {
    const { system, userMessages } = this.splitMessages(messages);
    const start = performance.now();

    const result = await Promise.race([
      generateText({
        model: this.provider.participant(this.participantId),
        system,
        messages: userMessages,
        temperature: 0.8,
      }),
      this.timeout(agentConfig.llmTimeoutMs),
    ]);

    const responseTimeMs = performance.now() - start;
    const usage = result.usage;
    const outputTokens = usage?.outputTokens ?? null;
    const tokensPerSecond =
      outputTokens != null && responseTimeMs > 0
        ? outputTokens / (responseTimeMs / 1000)
        : null;

    return {
      content: result.text,
      responseTimeMs,
      ttftMs: null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens,
      totalTokens: usage?.totalTokens ?? null,
      tokensPerSecond,
    };
  }

  async getOnlineParticipants(): Promise<OnlineParticipant[]> {
    try {
      const participants = await this.provider.listParticipants();
      return participants
        .filter((p) => p.status === 'online')
        .map((p) => ({
          id: p.id,
          nickname: p.nickname,
          model: p.model,
          endpoint: p.endpoint,
          specs: p.specs ? { ...p.specs } : undefined,
        }));
    } catch {
      console.warn('⚠️  listParticipants falhou, tentando listModels...');
      const models = await this.provider.listModels();
      return models.map((m) => ({
        id: m.id,
        nickname: m.nickname,
        model: m.model,
        endpoint: m.endpoint,
      }));
    }
  }

  async healthCheck(): Promise<{ ok: boolean; participants: number }> {
    try {
      const models = await this.provider.listModels();
      return { ok: models.length > 0, participants: models.length };
    } catch {
      return { ok: false, participants: 0 };
    }
  }

  private splitMessages(messages: ChatMessage[]) {
    return {
      system: messages.find((m) => m.role === 'system')?.content,
      userMessages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    };
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms),
    );
  }
}
