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
    if (!this.hasPathfinder()) {
      throw new Error('Pathfinder desativado no modo leve');
    }
    await this.bot.pathfinder.goto(new goals.GoalNear(x, y, z, range));
  }

  /** Navega ate ficar exatamente dentro do bloco alvo, util para pegar drops. */
  async irParaBloco(x: number, y: number, z: number): Promise<void> {
    this.pararMovimento();
    if (!this.hasPathfinder()) {
      throw new Error('Pathfinder desativado no modo leve');
    }
    await this.bot.pathfinder.goto(new goals.GoalBlock(x, y, z));
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
    if (!this.hasPathfinder()) {
      this.andarNaDirecao('aleatorio');
      return;
    }

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

    if (!this.hasPathfinder()) {
      this.bot.lookAt(player.entity.position.offset(0, 1.6, 0));
      this.bot.setControlState('forward', true);
      this.autoStop(2500);
      return;
    }

    this.bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
  }

  fugirDeEntidade(nome: string): void {
    this.pararMovimento();

    const target = this.normalizeEntityTarget(nome);
    const entity = Object.values(this.bot.entities).find(
      (e) => {
        const names = [
          e.username,
          e.displayName,
          e.name,
          `entity_${e.id}`,
        ].filter(Boolean).map((value) => this.normalizeEntityTarget(String(value)));

        return names.some((name) => name === target || name.includes(target) || target.includes(name));
      },
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
      if (this.hasPathfinder()) this.bot.pathfinder.setGoal(null);
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

  private hasPathfinder(): boolean {
    return !!(this.bot as unknown as { pathfinder?: unknown }).pathfinder;
  }

  private normalizeEntityTarget(value: string): string {
    const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (normalized.includes('skele')) return 'skeleton';
    if (normalized.includes('creep')) return 'creeper';
    if (normalized.includes('zomb') || normalized.includes('zumbi')) return 'zombie';
    if (normalized.includes('spider') || normalized.includes('aranha')) return 'spider';
    if (normalized.includes('bat') || normalized.includes('morcego')) return 'bat';
    return normalized;
  }
}
