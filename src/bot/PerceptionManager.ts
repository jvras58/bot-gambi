/** Extrai estado do jogo (vida, posição, entidades, blocos) para o LLM. */
import type { Bot } from 'mineflayer';
import type {
  GameContext,
  EntityInfo,
  BlockInfo,
  InventoryItem,
} from '@/types/types';
import { agentConfig } from '@/config/settings';
import { dropsNothingByHand } from '@/bot/blockFilters';

const BORING_BLOCKS = new Set([
  'air', 'cave_air', 'void_air', 'stone', 'dirt', 'grass_block',
  'bedrock', 'deepslate', 'water', 'lava',
]);

export class PerceptionManager {
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  getGameContext(): GameContext {
    return {
      vida: this.bot.health,
      fome: this.bot.food,
      modoJogo: this.bot.game.gameMode,
      posicao: {
        x: Math.round(this.bot.entity.position.x),
        y: Math.round(this.bot.entity.position.y),
        z: Math.round(this.bot.entity.position.z),
      },
      estaAndando: this.isMoving(),
      jogadoresProximos: this.getNearbyPlayerNames(),
      entidadesProximas: this.getNearbyEntities(),
      blocosProximos: this.getNearbyBlocks(),
      horaDoDia: this.bot.time.timeOfDay,
      clima: this.bot.isRaining ? 'chuva' : 'limpo',
      inventario: this.getInventory(),
      bioma: this.getBiome(),
    };
  }

  getContextString(): string {
    const ctx = this.getGameContext();

    const parts = [
      `Vida: ${ctx.vida.toFixed(0)}/20 | Fome: ${ctx.fome}/20`,
      `Modo de jogo: ${ctx.modoJogo}`,
      `Posição: X=${ctx.posicao.x} Y=${ctx.posicao.y} Z=${ctx.posicao.z}`,
      `Bioma: ${ctx.bioma} | Clima: ${ctx.clima} | Hora: ${ctx.horaDoDia}`,
      `Andando: ${ctx.estaAndando ? 'SIM' : 'NÃO'}`,
    ];

    if (ctx.jogadoresProximos.length > 0) {
      parts.push(`Jogadores próximos: ${ctx.jogadoresProximos.join(', ')}`);
    } else {
      parts.push('Jogadores próximos: nenhum');
    }

    if (ctx.entidadesProximas.length > 0) {
      const entStr = ctx.entidadesProximas
        .slice(0, 5)
        .map((e) => `${e.nome}(${e.tipo}, ${e.distancia.toFixed(1)}m)`)
        .join(', ');
      parts.push(`Entidades: ${entStr}`);
    }

    if (ctx.blocosProximos.length > 0) {
      const blockStr = ctx.blocosProximos
        .slice(0, 5)
        .map((b) => `${b.nome}(${b.distancia.toFixed(1)}m)`)
        .join(', ');
      parts.push(`Blocos notáveis: ${blockStr}`);
    }

    if (ctx.inventario.length > 0) {
      const invStr = ctx.inventario
        .slice(0, 8)
        .map((i) => `${i.nome}x${i.quantidade}`)
        .join(', ');
      parts.push(`Inventário: ${invStr}`);
    } else {
      parts.push('Inventário: vazio');
    }

    return parts.join('\n');
  }

  private isMoving(): boolean {
    const v = this.bot.entity.velocity;
    return Math.abs(v.x) > 0.01 || Math.abs(v.z) > 0.01;
  }

  private getNearbyPlayerNames(): string[] {
    return Object.keys(this.bot.players).filter(
      (name) => name !== this.bot.username,
    );
  }

  private getNearbyEntities(): EntityInfo[] {
    const entities: EntityInfo[] = [];
    const botPos = this.bot.entity.position;

    for (const entity of Object.values(this.bot.entities)) {
      if (entity === this.bot.entity) continue;
      const dist = botPos.distanceTo(entity.position);
      if (dist > agentConfig.perceptionEntityRadius) continue;

      entities.push({
        nome: entity.username || entity.displayName || `entity_${entity.id}`,
        tipo: entity.type || 'desconhecido',
        distancia: dist,
        vida: (entity as any).health,
      });
    }

    return entities.sort((a, b) => a.distancia - b.distancia);
  }

  private getNearbyBlocks(): BlockInfo[] {
    if (!('findBlocks' in this.bot) || typeof this.bot.findBlocks !== 'function') {
      return [];
    }

    const botPos = this.bot.entity.position;
    const r = agentConfig.perceptionBlockRadius;

    const positions = this.bot.findBlocks({
      matching: (block) =>
        block != null && !BORING_BLOCKS.has(block.name) && !dropsNothingByHand(block.name),
      maxDistance: r,
      count: 30,
    });

    const seen = new Set<string>();
    const result: BlockInfo[] = [];

    for (const pos of positions) {
      const block = this.bot.blockAt(pos);
      if (!block || seen.has(block.name)) continue;
      seen.add(block.name);
      result.push({
        nome: block.name,
        posicao: { x: pos.x, y: pos.y, z: pos.z },
        distancia: botPos.distanceTo(pos),
      });
      if (result.length >= 10) break;
    }

    return result;
  }

  private getInventory(): InventoryItem[] {
    return this.bot.inventory.items().map((item) => ({
      nome: item.name,
      quantidade: item.count,
      slot: item.slot,
    }));
  }

  private getBiome(): string {
    try {
      if (!('blockAt' in this.bot) || typeof this.bot.blockAt !== 'function') {
        return 'desconhecido';
      }
      const pos = this.bot.entity.position;
      const block = this.bot.blockAt(pos);
      return (block as any)?.biome?.name ?? 'desconhecido';
    } catch {
      return 'desconhecido';
    }
  }
}
