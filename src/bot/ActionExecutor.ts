/** Traduz BotAction em comandos mineflayer (com pathfinder, collectblock, pvp). */
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { ActionResult } from '@/types/types';
import type { BotAction } from '@/schemas/botAction';
import { MovementManager } from '@/bot/MovementManager';
import { dropsNothingByHand } from '@/bot/blockFilters';

/** Blocos comuns demais para serem alvo de COLETAR sem alvo explícito. */
const BORING_BLOCKS = new Set([
  'air', 'cave_air', 'void_air', 'stone', 'dirt', 'grass_block',
  'bedrock', 'deepslate', 'water', 'lava', 'gravel', 'sand',
]);

/** Blocos simples para quando COLETAR vier sem alvo e nao houver recurso coletavel. */
const HAND_COLLECT_FALLBACK_BLOCKS = [
  'dirt',
  'grass_block',
  'coarse_dirt',
  'rooted_dirt',
  'podzol',
  'mud',
  'sand',
  'red_sand',
  'gravel',
  'clay',
];

/** Tempo máximo para ações que dependem de navegação (coletar/craftar). */
const ACTION_TIMEOUT_MS = 12_000;

export class ActionExecutor {
  private bot: Bot;
  private movement: MovementManager;

  constructor(bot: Bot) {
    this.bot = bot;
    this.movement = new MovementManager(bot);
  }

  async executar(decisao: BotAction): Promise<ActionResult> {
    const start = performance.now();

    try {
      switch (decisao.acao) {
        case 'FALAR':
          if (!decisao.conteudo) throw new Error('Conteúdo obrigatório para FALAR');
          this.bot.chat(decisao.conteudo);
          console.log(`🗣️  Falei: ${decisao.conteudo}`);
          break;

        case 'ANDAR': {
          const dir = decisao.direcao || 'frente';
          this.movement.andarNaDirecao(dir);
          console.log(`🚶 Andando para ${dir}`);
          return {
            success: true,
            action: decisao.acao,
            direction: dir,
            content: decisao.conteudo,
            executionTimeMs: performance.now() - start,
          };
        }

        case 'EXPLORAR':
          this.movement.explorarAleatorio();
          console.log('🗺️  Explorando...');
          break;

        case 'PULAR':
          await this.movement.pular();
          console.log('🦘 Pulei!');
          break;

        case 'PARAR':
          this.movement.pararMovimento();
          console.log('🛑 Parei');
          break;

        case 'OLHAR':
          this.olharAoRedor();
          break;

        case 'SEGUIR':
          if (!decisao.alvo) throw new Error('Alvo obrigatório para SEGUIR');
          this.movement.seguirJogador(decisao.alvo);
          console.log(`🏃 Seguindo ${decisao.alvo}`);
          break;

        case 'FUGIR': {
          const alvo = decisao.alvo || this.nearestThreatTarget();
          if (!alvo) throw new Error('Nenhuma entidade próxima para FUGIR');
          this.movement.fugirDeEntidade(alvo);
          console.log(`💨 Fugindo de ${alvo}`);
          break;
        }

        case 'COLETAR':
          if (!this.hasWorldActions()) throw new Error('COLETAR desativado no modo leve');
          await this.withTimeout(this.coletar(decisao.alvo));
          break;

        case 'CRAFTAR':
          if (!this.hasWorldActions()) throw new Error('CRAFTAR desativado no modo leve');
          if (!decisao.alvo) throw new Error('Alvo (nome do item) obrigatório para CRAFTAR');
          await this.withTimeout(this.craftar(decisao.alvo));
          break;

        case 'ATACAR':
          this.atacar(decisao.alvo);
          break;

        case 'NADA':
          console.log('💤 Observando...');
          break;

        default:
          throw new Error(`Ação desconhecida: ${String(decisao.acao)}`);
      }

      return {
        success: true,
        action: decisao.acao,
        direction: decisao.direcao,
        content: decisao.conteudo,
        executionTimeMs: performance.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Erro na ação ${decisao.acao}: ${msg}`);
      this.cleanup();
      return {
        success: false,
        action: decisao.acao,
        direction: decisao.direcao,
        content: decisao.conteudo,
        errorMessage: msg,
        executionTimeMs: performance.now() - start,
      };
    }
  }

  /** Interrompe tarefas pendentes após erro/timeout. */
  private cleanup(): void {
    try {
      this.bot.stopDigging();
    } catch {
      // Pode não haver escavação ativa.
    }
    this.movement.pararMovimento();
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout após ${ACTION_TIMEOUT_MS}ms`)), ACTION_TIMEOUT_MS),
      ),
    ]);
  }

  private olharAoRedor(): void {
    const players = Object.values(this.bot.players).filter(
      (p) => p.username !== this.bot.username && p.entity,
    );

    if (players.length > 0) {
      const target = players[Math.floor(Math.random() * players.length)];
      if (target?.entity) {
        this.bot.lookAt(target.entity.position.offset(0, 1.6, 0));
        console.log(`👀 Olhei para ${target.username}`);
      }
    } else {
      this.bot.look(Math.random() * Math.PI * 2, 0);
      console.log('👀 Olhei ao redor');
    }
  }

  /** Encontra um bloco (até 32m), caminha até ele, equipa ferramenta e coleta o drop. */
  private async coletar(alvo?: string): Promise<void> {
    const target = this.normalizarAlvoBloco(alvo);
    const ids = this.resolverBlocoIds(alvo);
    if (ids.length === 0 && target) {
      console.warn(`⛏️  ${target} nao e coletavel (nao existe ou nao dropa na mao); usando fallback`);
    }

    let block = ids.length > 0 ? this.findCollectableBlock(ids) : null;
    if (!block) {
      const fallbackBlock = this.findCollectableBlock(this.fallbackCollectableIds());
      if (fallbackBlock && target) {
        console.warn(`⛏️  ${target} nao dropa com as ferramentas atuais; coletando ${fallbackBlock.name}`);
      }
      block = fallbackBlock;
    }

    if (!block) {
      throw new Error(`Nenhum bloco ${alvo ?? 'notável'} coletável com as ferramentas atuais num raio de 16m`);
    }

    const dist = this.bot.entity.position.distanceTo(block.position);
    if (dist > 4) {
      console.log(`⛏️  Alvo: ${block.name} a ${dist.toFixed(1)}m — navegando...`);
      await this.movement.irPara(block.position.x, block.position.y, block.position.z, 3);
    } else {
      console.log(`⛏️  Alvo: ${block.name} a ${dist.toFixed(1)}m — perto o suficiente`);
    }

    const currentBlock = this.bot.blockAt(block.position);
    if (!currentBlock || currentBlock.name !== block.name) {
      throw new Error(`Bloco ${block.name} mudou antes de minerar`);
    }

    console.log(`⛏️  Cavando ${currentBlock.name}...`);
    const inventoryBefore = this.totalInventoryItems();
    await this.bot.tool.equipForBlock(currentBlock, {}).catch(() => {});
    if (!currentBlock.canHarvest(this.bot.heldItem?.type ?? null)) {
      throw new Error(`Sem ferramenta para coletar ${currentBlock.name} com drop`);
    }
    await this.bot.lookAt(currentBlock.position.offset(0.5, 0.5, 0.5), true);
    try {
      await this.bot.dig(currentBlock, true, 'auto');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Block not in view')) throw err;
      await this.bot.dig(currentBlock, 'ignore', 'auto');
    }
    console.log(`⛏️  Minerei ${currentBlock.name}`);

    if (this.bot.game.gameMode === 'creative') {
      console.warn('📦 Modo creative não gera drops ao quebrar blocos; para validar coleta real, rode o bot em survival');
      return;
    }

    const pickedUp = await this.pickupNearbyDrops(currentBlock.position, inventoryBefore);
    const inventoryAfter = this.totalInventoryItems();

    if (pickedUp || inventoryAfter > inventoryBefore) {
      console.log(`📦 Drop confirmado no inventário (+${Math.max(0, inventoryAfter - inventoryBefore)} itens)`);
    } else {
      // Falha de verdade: sem drop no inventário a coleta não rendeu nada.
      // Assim o LLM vê o erro na memória e a métrica action_success fica honesta.
      throw new Error(
        `Minerei ${currentBlock.name} mas o drop não chegou ao inventário ` +
          `(inv ${inventoryBefore}->${inventoryAfter}, drops perto ${this.countDroppedItemsNear(currentBlock.position, 8)})`,
      );
    }
  }

  private findCollectableBlock(ids: number[]): Block | null {
    const positions = this.bot.findBlocks({ matching: ids, maxDistance: 16, count: 64 });
    const candidate = positions
      .map((position) => this.bot.blockAt(position))
      .find((block): block is Block =>
        !!block &&
        block.diggable &&
        block.name !== 'air' &&
        !dropsNothingByHand(block.name) &&
        this.canHarvestWithInventory(block),
      );

    return candidate ?? null;
  }

  private canHarvestWithInventory(block: Block): boolean {
    const harvestTools = block.harvestTools;
    if (!harvestTools) return true;

    const heldType = this.bot.heldItem?.type;
    if (heldType != null && harvestTools[String(heldType)]) return true;

    return this.bot.inventory.items().some((item) => harvestTools[String(item.type)]);
  }

  private fallbackCollectableIds(): number[] {
    return HAND_COLLECT_FALLBACK_BLOCKS
      .map((name) => this.bot.registry.blocksByName[name]?.id)
      .filter((id): id is number => typeof id === 'number');
  }

  private async pickupNearbyDrops(origin: Block['position'], inventoryBefore: number): Promise<boolean> {
    const pickupEvent = this.waitForPickup(inventoryBefore, 5_000);
    const deadline = Date.now() + 5_000;

    await this.passarPorCimaDoDrop(origin).catch(() => {});
    if (this.totalInventoryItems() > inventoryBefore) return true;

    while (Date.now() < deadline) {
      if (this.totalInventoryItems() > inventoryBefore) return true;

      const drop = this.nearestDroppedItem(origin, 6);
      if (drop) {
        await this.passarPorCimaDoDrop(drop.position).catch(() => {});
      } else {
        await this.sleep(250);
      }

      if (this.totalInventoryItems() > inventoryBefore) return true;
    }

    return pickupEvent;
  }

  private async passarPorCimaDoDrop(position: Block['position']): Promise<void> {
    await this.movement.irParaBloco(position.x, position.y, position.z);
    await this.sleep(250);
  }

  private nearestDroppedItem(origin: Block['position'], maxDistance: number) {
    let best: { entity: Bot['entity']; distance: number } | null = null;

    for (const entity of Object.values(this.bot.entities)) {
      if (!this.isDroppedItemEntity(entity)) continue;

      const distance = origin.distanceTo(entity.position);
      if (distance > maxDistance) continue;
      if (!best || distance < best.distance) {
        best = { entity, distance };
      }
    }

    return best?.entity ?? null;
  }

  private countDroppedItemsNear(origin: Block['position'], maxDistance: number): number {
    return Object.values(this.bot.entities).filter(
      (entity) => this.isDroppedItemEntity(entity) && origin.distanceTo(entity.position) <= maxDistance,
    ).length;
  }

  private isDroppedItemEntity(entity: Bot['entity']): boolean {
    const label = `${entity.name ?? ''} ${entity.displayName ?? ''} ${entity.type ?? ''}`.toLowerCase();
    return label.includes('item');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Resolve um nome (parcial) de bloco para os IDs numéricos correspondentes.
   * Passar IDs ao findBlock mantém a busca otimizada por palette — um matcher
   * como função varre milhões de blocos e congela o event loop.
   */
  private resolverBlocoIds(alvo?: string): number[] {
    let target = this.normalizarAlvoBloco(alvo);
    const blocks = this.bot.registry.blocksByName;
    const ids: number[] = [];

    if (target) {
      const requested = target;
      if (!Object.keys(blocks).some((name) => name.includes(requested))) {
        target = this.closestBlockName(requested, Object.keys(blocks)) ?? requested;
      }
    }

    for (const name of Object.keys(blocks)) {
      // Plantas/folhas sem drop na mão nunca são alvo — minerar não rende nada
      if (dropsNothingByHand(name)) continue;
      if (target) {
        if (!name.includes(target)) continue;
      } else if (BORING_BLOCKS.has(name)) {
        continue;
      }
      const def = blocks[name];
      if (def) ids.push(def.id);
    }

    return ids;
  }

  private normalizarAlvoBloco(alvo?: string): string | undefined {
    const rawTarget = alvo?.toLowerCase().trim();
    const target = rawTarget && !['-', 'bloco', 'block', 'recurso', 'recursos', 'nenhum', 'n/a', 'null', 'undefined'].includes(rawTarget)
      ? rawTarget.replace(/\s+/g, '_')
      : undefined;

    const normalized = target
      ?.replace(/^bloco_de_/, '')
      .replace(/^bloco_/, '')
      .replace(/^minerio_de_/, '')
      .replace(/^minério_de_/, '');

    if (!normalized) return undefined;
    if (['wooden_log', 'wood_log', 'tree', 'tronco', 'madeira'].includes(normalized)) return 'log';
    return normalized;
  }

  private closestBlockName(input: string, names: string[]): string | null {
    let best: { name: string; distance: number } | null = null;
    for (const name of names) {
      const distance = this.levenshtein(input, name);
      if (!best || distance < best.distance) best = { name, distance };
    }
    return best && best.distance <= 3 ? best.name : null;
  }

  private levenshtein(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
      Array(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
    for (let j = 0; j <= b.length; j++) dp[0]![j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }

    return dp[a.length]![b.length]!;
  }

  /** Crafta um item pelo nome, usando bancada próxima se necessário. */
  private async craftar(itemNome: string): Promise<void> {
    const nome = itemNome.toLowerCase().trim().replace(/\s+/g, '_');
    const itemDef = this.bot.registry.itemsByName[nome];
    if (!itemDef) throw new Error(`Item desconhecido: ${itemNome}`);

    let recipes = this.bot.recipesFor(itemDef.id, null, 1, null);
    const tableId = this.bot.registry.blocksByName['crafting_table']?.id ?? null;
    let table = tableId != null
      ? this.bot.findBlock({ matching: tableId, maxDistance: 32 })
      : null;

    if (recipes.length === 0) {
      if (!table) {
        throw new Error(`${itemNome} precisa de uma bancada (crafting_table) e não há nenhuma por perto`);
      }
      await this.movement.irPara(table.position.x, table.position.y, table.position.z, 2);
      recipes = this.bot.recipesFor(itemDef.id, null, 1, table);
    } else {
      table = null;
    }

    if (recipes.length === 0) {
      throw new Error(`Sem ingredientes suficientes para craftar ${itemNome}`);
    }

    await this.bot.craft(recipes[0]!, 1, table ?? undefined);
    console.log(`🔨 Craftei ${itemNome}`);
  }

  /** Inicia ataque contínuo (não-bloqueante) via plugin pvp. */
  private atacar(alvo?: string): void {
    const normalizedTarget = alvo ? this.normalizeEntityTarget(alvo) : null;
    let entity = Object.values(this.bot.entities).find((e) => {
      if (e === this.bot.entity) return false;
      if (!alvo) return e.type === 'mob' || e.type === 'hostile';
      const name = e.name || e.username || e.displayName || '';
      const normalizedName = this.normalizeEntityTarget(name);
      return normalizedName.includes(normalizedTarget!) || normalizedTarget!.includes(normalizedName);
    });

    if (!entity && alvo) {
      entity = Object.values(this.bot.entities).find(
        (e) => e !== this.bot.entity && (e.type === 'mob' || e.type === 'hostile'),
      );
    }

    if (!entity) {
      throw new Error(`Nenhuma entidade ${alvo ?? ''} encontrada para atacar`);
    }

    const pvp = (this.bot as unknown as {
      pvp?: { attack?: (entity: unknown) => Promise<void> };
    }).pvp;
    if (!pvp?.attack) {
      throw new Error('ATACAR desativado no modo leve');
    }

    void pvp.attack(entity).catch(() => {});
    console.log(`⚔️  Atacando ${entity.name || entity.username || entity.displayName || 'entidade'}`);
  }

  private hasWorldActions(): boolean {
    const bot = this.bot as unknown as {
      pathfinder?: unknown;
      tool?: unknown;
    };
    return !!(bot.pathfinder && bot.tool);
  }

  private nearestThreatTarget(): string | null {
    const botPos = this.bot.entity.position;
    let best: { target: string; distance: number } | null = null;

    for (const entity of Object.values(this.bot.entities)) {
      if (entity === this.bot.entity) continue;
      if (entity.type !== 'hostile' && entity.type !== 'mob') continue;

      const distance = botPos.distanceTo(entity.position);
      const target = entity.username || entity.displayName || entity.name || `entity_${entity.id}`;
      if (!best || distance < best.distance) {
        best = { target, distance };
      }
    }

    return best?.target ?? null;
  }

  private totalInventoryItems(): number {
    return this.bot.inventory.items().reduce((total, item) => total + item.count, 0);
  }

  private waitForPickup(inventoryBefore: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(this.totalInventoryItems() > inventoryBefore);
      }, timeoutMs);

      const interval = setInterval(() => {
        if (this.totalInventoryItems() > inventoryBefore) {
          cleanup();
          resolve(true);
        }
      }, 150);

      const onCollect = (collector: unknown) => {
        if (collector === this.bot.entity) {
          cleanup();
          resolve(true);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(interval);
        this.bot.off('playerCollect', onCollect);
      };

      this.bot.on('playerCollect', onCollect);
    });
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
