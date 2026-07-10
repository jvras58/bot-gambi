/** Tipos globais do projeto. */

// ─── Bot Config ───────────────────────────────────────────────
export interface BotConfig {
  host: string;
  port: number;
  username: string;
  auth: 'offline' | 'microsoft';
  version?: string;
  checkTimeoutInterval: number;
  viewDistance?: 'far' | 'normal' | 'short' | 'tiny' | number;
  plugins?: Record<string, boolean>;
}

// ─── Perception ───────────────────────────────────────────────
export interface GameContext {
  vida: number;
  fome: number;
  modoJogo: string;
  posicao: { x: number; y: number; z: number };
  estaAndando: boolean;
  jogadoresProximos: string[];
  entidadesProximas: EntityInfo[];
  blocosProximos: BlockInfo[];
  horaDoDia: number;
  clima: string;
  inventario: InventoryItem[];
  bioma: string;
}

export interface EntityInfo {
  nome: string;
  tipo: string;
  distancia: number;
  vida?: number;
}

export interface BlockInfo {
  nome: string;
  posicao: { x: number; y: number; z: number };
  distancia: number;
}

export interface InventoryItem {
  nome: string;
  quantidade: number;
  slot: number;
}

// ─── Memory ───────────────────────────────────────────────────
export interface MemoryEntry {
  timestamp: number;
  tipo: 'acao' | 'evento' | 'observacao' | 'interacao';
  resumo: string;
  acao?: string;
  dados?: Record<string, unknown>;
}

// ─── LLM ──────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  /** Duração total da geração (ms). */
  responseTimeMs: number;
  /** Time-to-first-token: tempo até o 1º token (ms). */
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** outputTokens / duração total (mesma fórmula do hub). */
  tokensPerSecond: number | null;
}

// ─── Participante (usado no startup pra resolver --participant) ─
export interface OnlineParticipant {
  id: string;
  nickname: string;
  model: string;
  endpoint: string;
  specs?: {
    cpu?: string;
    ram?: string;
    gpu?: string;
    vram?: string;
    os?: string;
    [key: string]: unknown;
  };
}

// ─── Data Logger ─────────────────────────────────────────────
export interface CycleResponseData {
  session_id: string;
  cycle_number: number;
  room_code: string;

  participant_id: string;
  participant_nickname: string;
  model_name: string;

  llm_response_time_ms: number | null;
  llm_ttft_ms: number | null;
  llm_input_tokens: number | null;
  llm_output_tokens: number | null;
  llm_total_tokens: number | null;
  llm_tokens_per_second: number | null;

  hub_ttft_ms: number | null;
  hub_duration_ms: number | null;
  hub_input_tokens: number | null;
  hub_output_tokens: number | null;
  hub_total_tokens: number | null;
  hub_tokens_per_second: number | null;

  llm_raw_length: number | null;
  llm_json_repaired: boolean;
  llm_parse_error: boolean;
  llm_error: string | null;

  action: string | null;
  reasoning: string | null;
  direction: string | null;
  target: string | null;
  content: string | null;
  raw_response: string | null;

  action_success: boolean | null;
  action_execution_time_ms: number | null;
  action_error: string | null;

  prompt_sent: string;

  /** Pedido de jogador em destaque neste ciclo (null se não havia) */
  chat_request: string | null;
  chat_request_player: string | null;

  health: number;
  food: number;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  biome: string;
  weather: string;
  time_of_day: number;
  is_moving: boolean;
  nearby_players: number;
  nearby_entities: number;
  nearby_blocks: number;
  inventory_items: number;
}

// ─── Prompts ──────────────────────────────────────────────────
export interface PromptTemplate {
  system: string;
  human: string;
}

export interface ActionResult {
  success: boolean;
  action: string;
  direction?: string;
  content?: string;
  errorMessage?: string;
  executionTimeMs: number;
}
