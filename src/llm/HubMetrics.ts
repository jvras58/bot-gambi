/**
 * Consome o stream de eventos do hub (SSE) e captura as métricas
 * hub-observed do evento `llm.complete` — medidas no hub, sem o ruído
 * de rede do lado do cliente.
 */
import { createClient } from 'gambi-sdk';
import { sleep } from '@/utils/sleep';

/** Métricas de uma inferência, medidas pelo hub. */
export interface HubMetrics {
  ttftMs: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  tokensPerSecond: number | null;
}

/** Payload do evento `llm.complete` (campo `data` do RoomEvent). */
interface LlmCompleteData {
  requestId: string;
  participantId: string;
  model: string;
  protocol: string;
  metrics: {
    ttftMs: number;
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    tokensPerSecond?: number;
  };
}

export interface HubMetricsWatcherOptions {
  hubUrl: string;
  roomCode: string;
  participantId: string;
}

export class HubMetricsWatcher {
  private hubUrl: string;
  private roomCode: string;
  private participantId: string;

  private abort = new AbortController();
  private running = false;
  private warnedReconnect = false;
  private last: { metrics: HubMetrics; at: number } | null = null;
  private waiters: Array<(m: HubMetrics) => void> = [];

  constructor(options: HubMetricsWatcherOptions) {
    this.hubUrl = options.hubUrl;
    this.roomCode = options.roomCode;
    this.participantId = options.participantId;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.abort.abort();
  }

  /**
   * Métricas hub-observed do request iniciado depois de `since` (Date.now()).
   * Como o loop é sequencial (1 request por ciclo), o próximo `llm.complete`
   * que chega após `since` é, sem ambiguidade, o do ciclo atual.
   */
  async metricsSince(since: number, timeoutMs = 2500): Promise<HubMetrics | null> {
    if (this.last && this.last.at >= since) return this.last.metrics;

    return new Promise<HubMetrics | null>((resolve) => {
      const waiter = (m: HubMetrics) => {
        clearTimeout(timer);
        resolve(m);
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve(null);
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  private async loop(): Promise<void> {
    const client = createClient({ hubUrl: this.hubUrl });

    while (this.running) {
      try {
        for await (const event of client.events.watchRoom({
          roomCode: this.roomCode,
          signal: this.abort.signal,
        })) {
          if (event?.type !== 'llm.complete') continue;

          const data = event.data as LlmCompleteData;
          if (data?.participantId !== this.participantId) continue;

          const metrics = this.normalize(data.metrics);
          this.last = { metrics, at: Date.now() };

          for (const waiter of this.waiters.splice(0)) waiter(metrics);
        }
      } catch {
        if (!this.running) break;
        // O hub fecha o SSE quando fica ocioso (~10s). Reconectar é o normal.
        if (!this.warnedReconnect) {
          console.warn(
            '📡 O stream de eventos do hub reconecta sozinho quando fica ocioso — normal, as métricas seguem sendo capturadas.',
          );
          this.warnedReconnect = true;
        }
        await sleep(1000);
      }
    }
  }

  private normalize(m: LlmCompleteData['metrics']): HubMetrics {
    return {
      ttftMs: m.ttftMs,
      durationMs: m.durationMs,
      inputTokens: m.inputTokens ?? null,
      outputTokens: m.outputTokens ?? null,
      totalTokens: m.totalTokens ?? null,
      tokensPerSecond: m.tokensPerSecond ?? null,
    };
  }
}
