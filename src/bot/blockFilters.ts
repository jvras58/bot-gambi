/** Filtros de blocos compartilhados entre percepção e coleta. */

/**
 * Plantas/decoração que NÃO dropam nada quebradas na mão (precisam de
 * tesoura, ou têm drop raro demais). Coletá-las desperdiça o ciclo e
 * engana o LLM — ficam fora da percepção e da seleção de alvo.
 */
export const NO_HAND_DROP_BLOCKS = new Set([
  'short_grass', 'tall_grass', 'grass', 'fern', 'large_fern',
  'seagrass', 'tall_seagrass', 'vine', 'glow_lichen', 'sculk_vein',
  'hanging_roots', 'nether_sprouts', 'twisting_vines', 'weeping_vines',
  'short_dry_grass', 'tall_dry_grass', 'bush', 'firefly_bush', 'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'sunflower', 'lilac', 'rose_bush', 'peony', 'crimson_roots', 'warped_roots', 'crimson_fungus', 'warped_fungus', 'crimson_hyphae', 'warped_hyphae', 'crimson_stem', 'warped_stem', 'nether_sprouts', 'twisting_vines', 'weeping_vines',
]);

/** True se quebrar o bloco na mão não gera drop útil (inclui folhas). */
export function dropsNothingByHand(name: string): boolean {
  return NO_HAND_DROP_BLOCKS.has(name) || name.endsWith('_leaves');
}
