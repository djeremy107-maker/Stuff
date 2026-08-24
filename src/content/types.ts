// Shared content type definitions for the game.
// All game content is data-driven so new skills/items/actions are just data.

export type SkillId =
  | "fishing"
  | "woodcutting"
  | "mining"
  | "foraging"
  | "cooking"
  | "smithing"
  | "crafting"
  | "combat";

export type SkillKind = "gathering" | "production" | "combat";

export interface SkillDef {
  id: SkillId;
  name: string;
  kind: SkillKind;
  icon: string; // emoji, for a lightweight UI
  blurb: string;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  // Optional: when eaten during combat, restore this much HP.
  heals?: number;
  // Base value in coins (used for the future marketplace / vendor).
  value?: number;
  category: "resource" | "food" | "bar" | "equipment" | "misc";
}

// A repeatable action. Gathering & production share the same shape.
export interface ActionDef {
  id: string;
  skill: SkillId;
  name: string;
  levelReq: number;
  // Base seconds per completion (before any speed bonuses).
  durationSec: number;
  xp: number;
  // Items consumed per completion (production skills). Empty for gathering.
  inputs: { item: string; qty: number }[];
  // Items produced per completion. Each output may be probabilistic.
  outputs: { item: string; qty: number; chance?: number }[];
}

export interface MonsterDef {
  id: string;
  name: string;
  icon: string;
  combatLevelReq: number;
  // Seconds to defeat one at base (scaled by the player's combat level).
  killTimeSec: number;
  hp: number;
  // Damage the monster deals to the player per kill attempt.
  damage: number;
  xp: number;
  // Loot rolled per kill.
  loot: { item: string; qty: number; chance: number }[];
  coins: { min: number; max: number };
}

export interface GameData {
  skills: SkillDef[];
  items: Record<string, ItemDef>;
  actions: ActionDef[];
  monsters: MonsterDef[];
}
