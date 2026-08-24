// Shared content type definitions for the fishing game.
// Content is data-driven: new fish, zones, rods, bait, and recipes are data.

export type SkillId = "fishing" | "cooking" | "crafting" | "foraging";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type ItemCategory = "fish" | "material" | "bait" | "rod" | "dish" | "treasure";

export interface SkillDef {
  id: SkillId;
  name: string;
  icon: string;
  blurb: string;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  category: ItemCategory;
  value?: number; // vendor sell price in coins

  // Fish-only
  rarity?: Rarity;
  sizeMin?: number; // cm
  sizeMax?: number; // cm

  // Rod-only (equipment)
  rodSpeedMult?: number; // multiplies fishing time (lower = faster)
  rodRareBonus?: number; // added to rare-catch bonus

  // Bait-only (consumed per catch while active)
  baitRareBonus?: number;

  // Dish-only (eaten for a timed fishing buff)
  buffDurationSec?: number;
  buffSpeedMult?: number; // multiplies cast time while active (lower = faster)
  buffRareBonus?: number; // added to rare-catch bonus while active
}

// A fishing spot. Each catch rolls one species from the weighted table.
export interface ZoneDef {
  id: string;
  name: string;
  icon: string;
  levelReq: number;
  baseTimeSec: number; // seconds per cast at base
  xpMult: number; // multiplies each species' rarity XP
  blurb: string;
  fish: { item: string; weight: number }[];
}

// Cooking / crafting / foraging actions (non-fishing).
export interface ActionDef {
  id: string;
  skill: Exclude<SkillId, "fishing">;
  name: string;
  levelReq: number;
  durationSec: number;
  xp: number;
  inputs: { item: string; qty: number }[];
  outputs: { item: string; qty: number; chance?: number }[];
}

export interface ShopEntry {
  item: string;
  price: number;
}

export interface GameData {
  skills: SkillDef[];
  items: Record<string, ItemDef>;
  zones: ZoneDef[];
  actions: ActionDef[];
  shop: ShopEntry[];
  // XP awarded per catch by rarity (before a zone's xpMult).
  rarityXp: Record<Rarity, number>;
  rarityRank: Record<Rarity, number>;
}
