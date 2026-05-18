/** Ciclo de vida do bot mineflayer (conexão, eventos, reconexão). */
import mineflayer, { type Bot } from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as tool } from 'mineflayer-tool';
import type { BotConfig } from '@/types/types';
import { agentConfig } from '@/config/settings';

export class BotManager {
  private bot: Bot | null = null;
  private config: BotConfig;
  private connected = false;
  private onConnected?: () => void;
  private onDisconnected?: () => void;
  private lastWorldPruneAt = 0;

  constructor(config: BotConfig) {
    this.config = config;
  }

  setCallbacks(onConnected: () => void, onDisconnected: () => void): void {
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
  }

  createBot(): void {
    console.log('🔌 Conectando ao servidor Minecraft...');
    const config = agentConfig.lowMemoryMode
      ? {
          ...this.config,
          plugins: {
            ...this.config.plugins,
            blocks: false,
            digging: false,
            explosion: false,
            generic_place: false,
            particle: false,
            physics: false,
            place_block: false,
            ray_trace: false,
          },
        }
      : this.config;

    if (agentConfig.lowMemoryMode) {
      console.log('🪶 Modo leve ativo — sem cache de chunks/pathfinder para economizar RAM');
    }

    this.bot = mineflayer.createBot(config);
    if (!agentConfig.lowMemoryMode) {
      this.bot.loadPlugin(pathfinder);
      this.bot.loadPlugin(pvp);
      this.bot.loadPlugin(tool);
    }
    this.setupEvents();
  }

  getBot(): Bot | null {
    return this.bot;
  }

  isConnected(): boolean {
    return this.connected && this.bot !== null;
  }

  getDiagnostics(): {
    chunks: number;
    entities: number;
    players: number;
    pos: string;
  } {
    if (!this.bot) {
      return { chunks: 0, entities: 0, players: 0, pos: 'n/a' };
    }

    const world = this.bot.world as unknown as {
      getColumns?: () => unknown[];
    } | undefined;
    const pos = this.bot.entity?.position;

    return {
      chunks: world?.getColumns?.().length ?? 0,
      entities: Object.keys(this.bot.entities ?? {}).length,
      players: Object.keys(this.bot.players ?? {}).length,
      pos: pos
        ? `${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}`
        : 'n/a',
    };
  }

  pruneWorldCache(): void {
    if (!this.bot?.world || !this.bot.entity) return;

    const world = this.bot.world as unknown as {
      getColumns?: () => Array<{ chunkX: string | number; chunkZ: string | number }>;
      unloadColumn?: (chunkX: number, chunkZ: number) => void;
    };
    if (!world.getColumns || !world.unloadColumn) return;

    const centerX = Math.floor(this.bot.entity.position.x / 16);
    const centerZ = Math.floor(this.bot.entity.position.z / 16);
    const radius = agentConfig.chunkCacheRadius;
    let unloaded = 0;

    for (const column of world.getColumns()) {
      const chunkX = Number(column.chunkX);
      const chunkZ = Number(column.chunkZ);
      if (!Number.isFinite(chunkX) || !Number.isFinite(chunkZ)) continue;

      if (Math.abs(chunkX - centerX) > radius || Math.abs(chunkZ - centerZ) > radius) {
        world.unloadColumn(chunkX, chunkZ);
        unloaded++;
      }
    }

    if (unloaded > 0) {
      console.log(`🧹 Cache do mundo: descarreguei ${unloaded} chunks distantes`);
    }
  }

  private setupEvents(): void {
    if (!this.bot) return;

    this.bot.on('spawn', () => {
      console.log('✅ Bot entrou no jogo!');
      if (this.bot && !agentConfig.lowMemoryMode) {
        const movements = new Movements(this.bot);
        this.bot.pathfinder.setMovements(movements);
      }
      this.connected = true;
      this.onConnected?.();
    });

    this.bot.on('chat', (user, msg) => {
      if (user === this.bot?.username) return;
      console.log(`💬 ${user}: ${msg}`);
    });

    this.bot.on('death', () => {
      console.log('💀 Morri! Respawnando...');
      if (this.bot) {
        for (const s of ['forward', 'back', 'left', 'right', 'sprint'] as const) {
          this.bot.setControlState(s, false);
        }
      }
    });

    this.bot.on('end', (reason) => {
      console.log(`❌ Desconectado: ${reason}`);
      this.connected = false;
      this.onDisconnected?.();
      console.log('🔄 Reconectando em 5s...');
      setTimeout(() => this.createBot(), 5000);
    });

    this.bot.on('error', (err) => {
      console.error('⚠️  Erro:', err.message);
    });

    this.bot.on('kicked', (reason) => {
      console.log(`👢 Kickado: ${reason}`);
    });

    // Auto-pulo quando preso
    this.bot.on('physicsTick', () => {
      if (!this.bot || !this.isConnected()) return;
      this.pruneWorldCacheIfNeeded();
      if (!this.bot.entity.onGround) return;
      if ((this.bot as unknown as { pathfinder?: { isMoving?: () => boolean } }).pathfinder?.isMoving?.()) return;

      const walking =
        this.bot.controlState.forward ||
        this.bot.controlState.back ||
        this.bot.controlState.left ||
        this.bot.controlState.right;

      if (walking) {
        const v = this.bot.entity.velocity;
        if (Math.abs(v.x) < 0.01 && Math.abs(v.z) < 0.01 && Math.random() > 0.7) {
          this.bot.setControlState('jump', true);
          setTimeout(() => {
            if (this.bot && this.isConnected()) {
              this.bot.setControlState('jump', false);
            }
          }, 250);
        }
      }
    });
  }

  private pruneWorldCacheIfNeeded(): void {
    if (!agentConfig.pruneWorldCache) return;
    const now = Date.now();
    if (now - this.lastWorldPruneAt < agentConfig.worldPruneIntervalMs) return;
    this.lastWorldPruneAt = now;
    this.pruneWorldCache();
  }
}
