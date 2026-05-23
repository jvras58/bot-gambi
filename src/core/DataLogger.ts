/** Envia métricas para Supabase (fire-and-forget). */
import type { OnlineParticipant, CycleResponseData } from '@/types/types';

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 15_000;
const MAX_BUFFER_SIZE = 500;

export class DataLogger {
  private supabaseUrl: string | null;
  private supabaseKey: string | null;
  private buffer: CycleResponseData[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private enabled: boolean;
  private isFlushing = false;

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '') || null;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY || null;
    this.enabled = !!(this.supabaseUrl && this.supabaseKey);

    if (this.enabled) {
      console.log('📊 DataLogger ativo — enviando métricas para Supabase');
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    } else {
      console.log('📊 DataLogger inativo — configure SUPABASE_URL e SUPABASE_ANON_KEY para coletar dados');
    }
  }

  async logSession(session: {
    id: string;
    room_code: string;
    bot_username: string;
    participant_id: string;
  }): Promise<void> {
    if (!this.enabled) return;
    await this.insert('sessions', [session]).catch((err) =>
      console.warn(`📊 Falha ao registrar sessão: ${err instanceof Error ? err.message : err}`),
    );
  }

  async logParticipantSnapshot(
    sessionId: string,
    participant: OnlineParticipant,
  ): Promise<void> {
    if (!this.enabled) return;

    const row = {
      session_id: sessionId,
      participant_id: participant.id,
      nickname: participant.nickname,
      model_name: participant.model,
      endpoint: participant.endpoint,
      cpu: participant.specs?.cpu ?? null,
      ram: participant.specs?.ram ?? null,
      gpu: participant.specs?.gpu ?? null,
      vram: participant.specs?.vram ?? null,
      os: participant.specs?.os ?? null,
      specs_raw: participant.specs ? JSON.stringify(participant.specs) : null,
    };

    await this.insert('participant_snapshots', [row]).catch((err) =>
      console.warn(`📊 Falha ao registrar specs: ${err instanceof Error ? err.message : err}`),
    );
  }

  /** Registra dados de um ciclo. */
  log(data: CycleResponseData): void {
    if (!this.enabled) return;
    this.buffer.push(data);
    this.trimBuffer();

    if (this.buffer.length >= BATCH_SIZE) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.enabled || this.buffer.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const batch = this.buffer.splice(0, BATCH_SIZE);
    let sent = false;
    try {
      await this.insert('cycle_responses', batch);
      sent = true;
    } catch (err) {
      console.warn(`📊 Falha ao enviar ${batch.length} registros — ${err instanceof Error ? err.message : err}`);
      this.requeueBatch(batch);
    } finally {
      this.isFlushing = false;
      if (sent && this.buffer.length >= BATCH_SIZE) {
        void this.flush();
      }
    }
  }

  async endSession(sessionId: string, totalCycles: number): Promise<void> {
    if (!this.enabled) return;
    await this.patch('sessions', `id=eq.${sessionId}`, {
      ended_at: new Date().toISOString(),
      total_cycles: totalCycles,
    }).catch((err) =>
      console.warn(`📊 Falha ao finalizar sessão: ${err instanceof Error ? err.message : err}`),
    );
  }

  async shutdown(sessionId?: string, totalCycles?: number): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.enabled && this.buffer.length > 0) {
      console.log(`📊 Enviando ${this.buffer.length} registros restantes...`);
      try {
        await this.insert('cycle_responses', this.buffer.splice(0));
      } catch (err) {
        console.warn(`📊 Falha no flush final — ${err instanceof Error ? err.message : err}`);
      }
    }

    if (sessionId && totalCycles !== undefined) {
      await this.endSession(sessionId, totalCycles);
    }
  }

  // ─── Helpers HTTP ────────────────────────────────────────

  private async request(method: string, table: string, body: unknown, filter?: string): Promise<void> {
    if (!this.supabaseUrl || !this.supabaseKey) return;

    const url = filter
      ? `${this.supabaseUrl}/rest/v1/${table}?${filter}`
      : `${this.supabaseUrl}/rest/v1/${table}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.supabaseKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
  }

  private insert<T extends object>(table: string, rows: T[]) {
    return this.request('POST', table, rows);
  }

  private patch<T extends object>(table: string, filter: string, data: T) {
    return this.request('PATCH', table, data, filter);
  }

  private requeueBatch(batch: CycleResponseData[]): void {
    const capacity = MAX_BUFFER_SIZE - this.buffer.length;
    if (capacity <= 0) return;
    this.buffer.unshift(...batch.slice(-capacity));
  }

  private trimBuffer(): void {
    if (this.buffer.length <= MAX_BUFFER_SIZE) return;
    this.buffer.splice(0, this.buffer.length - MAX_BUFFER_SIZE);
  }
}
