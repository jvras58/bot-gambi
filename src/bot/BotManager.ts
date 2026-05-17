/** Ciclo de vida do bot mineflayer (conexão, eventos, reconexão). */
import mineflayer, { type Bot } from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { plugin as collectBlock } from 'mineflayer-collectblock';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as tool } from 'mineflayer-tool';
import type { BotConfig } from '@/types/types';

export class BotManager {
  private bot: Bot | null = null;
  private config: BotConfig;
  private connected = false;
  private onConnected?: () => void;
  private onDisconnected?: () => void;

  constructor(config: BotConfig) {
    this.config = config;
  }

  setCallbacks(onConnected: () => void, onDisconnected: () => void): void {
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
  }

  createBot(): void {
    console.log('🔌 Conectando ao servidor Minecraft...');
    this.bot = mineflayer.createBot(this.config);
    this.bot.loadPlugin(pathfinder);
    this.bot.loadPlugin(collectBlock);
    this.bot.loadPlugin(pvp);
    this.bot.loadPlugin(tool);
    this.setupEvents();
  }

  getBot(): Bot | null {
    return this.bot;
  }

  isConnected(): boolean {
    return this.connected && this.bot !== null;
  }

  private setupEvents(): void {
    if (!this.bot) return;

    this.bot.on('spawn', () => {
      console.log('✅ Bot entrou no jogo!');
      if (this.bot) {
        const movements = new Movements(this.bot);
        this.bot.pathfinder.setMovements(movements);
        this.bot.collectBlock.movements = movements;
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
      if (!this.bot.entity.onGround) return;
      if (this.bot.pathfinder.isMoving()) return;

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
}
