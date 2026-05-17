/** Controla movimentação do bot — pathfinder para navegação com destino. */
import type { Bot, ControlState } from 'mineflayer';
import { goals } from 'mineflayer-pathfinder';

const DIRECTION_MAP: Record<string, ControlState> = {
  frente: 'forward',
  tras: 'back',
  esquerda: 'left',
  direita: 'right',
};

const ALL_DIRS: ControlState[] = ['forward', 'back', 'left', 'right'];

export class MovementManager {
  private bot: Bot;
  private moveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  /** Navega até uma posição usando pathfinder e espera chegar. */
  async irPara(x: number, y: number, z: number, range = 1): Promise<void> {
    this.pararMovimento();
    await this.bot.pathfinder.goto(new goals.GoalNear(x, y, z, range));
  }

  /** Andar manualmente numa direção curta (movimento reativo, sem destino). */
  andarNaDirecao(direcao: string): void {
    this.pararMovimento();

    if (direcao === 'aleatorio') {
      this.bot.setControlState(ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)]!, true);
    } else {
      const ctrl = DIRECTION_MAP[direcao];
      if (ctrl) this.bot.setControlState(ctrl, true);
    }

    this.autoStop(2000 + Math.random() * 2000);
  }

  /** Explora caminhando até um ponto aleatório distante via pathfinder. */
  explorarAleatorio(): void {
    this.pararMovimento();
    const pos = this.bot.entity.position;
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 20;
    const x = pos.x + Math.cos(angle) * dist;
    const z = pos.z + Math.sin(angle) * dist;
    this.bot.pathfinder.setGoal(new goals.GoalNearXZ(x, z, 2));
  }

  seguirJogador(nome: string): void {
    this.pararMovimento();
    const player = this.bot.players[nome];
    if (!player?.entity) throw new Error(`Jogador ${nome} não encontrado ou fora do alcance`);

    this.bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
  }

  fugirDeEntidade(nome: string): void {
    this.pararMovimento();

    const entity = Object.values(this.bot.entities).find(
      (e) => e.username === nome || e.displayName === nome || `entity_${e.id}` === nome,
    );

    if (!entity) throw new Error(`Entidade ${nome} não encontrada`);

    const pos = this.bot.entity.position;
    const dx = pos.x - entity.position.x;
    const dz = pos.z - entity.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const fleeX = pos.x + (dx / len) * 20;
    const fleeZ = pos.z + (dz / len) * 20;

    this.bot.pathfinder.setGoal(new goals.GoalNearXZ(fleeX, fleeZ, 2));
  }

  pararMovimento(): void {
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
      this.moveTimeout = null;
    }
    try {
      this.bot.pathfinder.setGoal(null);
    } catch {
      // pathfinder ainda não inicializado — ignora
    }
    for (const dir of ALL_DIRS) this.bot.setControlState(dir, false);
    this.bot.setControlState('sprint', false);
  }

  async pular(): Promise<void> {
    this.bot.setControlState('jump', true);
    await new Promise((r) => setTimeout(r, 100));
    this.bot.setControlState('jump', false);
  }

  private autoStop(ms: number): void {
    this.moveTimeout = setTimeout(() => this.pararMovimento(), ms);
  }
}
