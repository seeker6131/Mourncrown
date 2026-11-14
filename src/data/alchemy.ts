// Alchemy recipes (brewed at the village kitchen). Ores come only from mining; rare gems make the 'god' elixirs.
export interface Recipe { out: string; qty: number; need: Record<string, number>; gold: number; food: number; kitchen: number }
export const RECIPES: Recipe[] = [
  { out: 'elix_iron', qty: 1, need: { ore_iron: 6 }, gold: 30, food: 4, kitchen: 1 },
  { out: 'elix_silver', qty: 1, need: { ore_silver: 6 }, gold: 50, food: 4, kitchen: 1 },
  { out: 'elix_obsidian', qty: 1, need: { ore_obsidian: 6 }, gold: 70, food: 5, kitchen: 2 },
  { out: 'elix_frost', qty: 1, need: { ore_frost: 6 }, gold: 90, food: 5, kitchen: 2 },
  { out: 'elix_mithril', qty: 1, need: { ore_mithril: 6 }, gold: 120, food: 6, kitchen: 3 },
  { out: 'elix_emerald', qty: 1, need: { gem_emerald: 1, ore_iron: 10 }, gold: 300, food: 10, kitchen: 2 },
  { out: 'elix_soul', qty: 1, need: { gem_soul: 1, ore_silver: 10 }, gold: 450, food: 10, kitchen: 3 },
  { out: 'elix_magma', qty: 1, need: { gem_magma: 1, ore_obsidian: 10 }, gold: 600, food: 12, kitchen: 3 },
  { out: 'elix_frosttear', qty: 1, need: { gem_frosttear: 1, ore_frost: 10 }, gold: 800, food: 12, kitchen: 4 },
  { out: 'elix_god', qty: 1, need: { gem_crown: 1, gem_emerald: 1, gem_soul: 1, gem_magma: 1, gem_frosttear: 1 }, gold: 3000, food: 30, kitchen: 5 },
];
