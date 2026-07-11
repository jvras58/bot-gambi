/** Configurações globais do bot, Gambi Hub e agente. */
import { embedded } from '@/config/embedded';
import type { BotConfig } from '@/types/types';

export const botConfig: BotConfig = {
  host: process.env.MINECRAFT_HOST || embedded.minecraftHost || 'localhost',
  port: parseInt(process.env.MINECRAFT_PORT || embedded.minecraftPort || '25565'),
  username: process.env.BOT_USERNAME || 'AgenteBot',
  auth: ((process.env.BOT_AUTH || embedded.botAuth) as 'offline' | 'microsoft') || 'offline',
  version: process.env.MINECRAFT_VERSION || embedded.minecraftVersion || '1.21.11',
  checkTimeoutInterval: 60_000,
  viewDistance: (process.env.MINECRAFT_VIEW_DISTANCE as BotConfig['viewDistance']) || 'far',
};

export const gambiarraConfig = {
  hubUrl: process.env.GAMBIARRA_HUB_URL || 'http://localhost:3000',
};

export const agentConfig = {
  loopIntervalMs: 3_000,
  disconnectedWaitMs: 2_000,
  shortTermMemorySize: 15,
  perceptionBlockRadius: 8,
  perceptionEntityRadius: 16,
  /** Timeout da chamada LLM (ms) */
  llmTimeoutMs: 120_000,
  /** Limite de tokens gerados por ciclo para evitar respostas infinitas. */
  llmMaxOutputTokens: parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '256', 10),
  /** Modo emergencial: desliga cache de chunks/pathfinder e reduz ações. */
  lowMemoryMode: process.env.LOW_MEMORY_MODE === 'true',
  /** Poda chunks distantes. Desligado por padrão porque o vazamento real era o collectblock. */
  pruneWorldCache: process.env.PRUNE_WORLD_CACHE === 'true',
  /** Mantem apenas chunks proximos no cache local do Mineflayer. */
  chunkCacheRadius: parseInt(process.env.MINECRAFT_CHUNK_CACHE_RADIUS || '12', 10),
  worldPruneIntervalMs: 5_000,
  /**
   * Nicks (separados por vírgula) cujas mensagens de chat viram "pedido de
   * jogador". Vazio = qualquer não-bot vira pedido (modo dev).
   */
  chatAdmins: (process.env.CHAT_ADMINS || embedded.chatAdmins || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
};
