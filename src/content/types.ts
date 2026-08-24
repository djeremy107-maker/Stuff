// Shared content type definitions for the fishing game.
// Content is data-driven: new fish, zones, rods, bait, and recipes are data.

export type SkillId = "fishing" | "cooking" | "crafting" | "foraging";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type ItemCategory = "fish" | "material" | "bait" | "rod" | "reel" | "line" | "tool" | "protection" | "dish" | "drink" | "treasure";

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

  // Rod-only (equipment; every rod is enhanceable — see PlayerState.enhancements)
  rodSpeedMult?: number; // multiplies fishing time (lower = faster)
  rodRareBonus?: number; // added to rare-catch bonus

  // Reel-only (equipment)
  reelEfficiency?: number; // added to fishing efficiency

  // Line-only (equipment)
  lineBaitSave?: number; // chance a cast doesn't consume the equipped lure

  // Tool-only (equipment, one per support skill)
  toolSkill?: SkillId; // which skill this tool applies to
  toolSpeedMult?: number; // multiplies that skill's action time
  toolEfficiency?: number; // added to that skill's efficiency

  // Bait-only (consumed per catch while active)
  baitRareBonus?: number;

  // Dish-only ("food" provisions — timed fishing speed/rare buff)
  buffDurationSec?: number;
  buffSpeedMult?: number; // multiplies cast time while active (lower = faster)
  buffRareBonus?: number; // added to rare-catch bonus while active

  // Drink-only ("drink" provisions — timed efficiency/XP buff, any skill)
  buffEfficiencyBonus?: number; // added to efficiency while active
  buffXpMult?: number; // multiplies XP gained while active
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

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  coins: number; // coin reward on unlock
  cond:
    | { type: "discover"; value: number } // species discovered
    | { type: "catch_total"; value: number } // total fish caught (personal)
    | { type: "skill"; skill: SkillId; value: number } // reach a skill level
    | { type: "rarity"; rarity: Rarity }; // catch any fish of this rarity
}

// A shared Boathouse room. Cost at level n = base cost x costGrowth^(n-1),
// paid from the shared Bank (materials) and shared Purse (coins).
export interface BoathouseRoomDef {
  id: string;
  name: string;
  icon: string;
  desc: string; // what each level grants, for display
  maxLevel: number;
  baseCoins: number;
  baseMaterials: { item: string; qty: number }[];
  costGrowth: number;
}

export interface GameData {
  skills: SkillDef[];
  items: Record<string, ItemDef>;
  zones: ZoneDef[];
  actions: ActionDef[];
  shop: ShopEntry[];
  achievements: AchievementDef[];
  guildRanks: string[]; // title per guild level (index = level)
  boathouseRooms: BoathouseRoomDef[];
  // XP awarded per catch by rarity (before a zone's xpMult).
  rarityXp: Record<Rarity, number>;
  rarityRank: Record<Rarity, number>;
}
