import type { GameData, ItemDef } from "./types.js";

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
const itemList: ItemDef[] = [
  // Fish (raw)
  { id: "raw_shrimp", name: "Raw Shrimp", icon: "🦐", category: "resource", value: 1 },
  { id: "raw_sardine", name: "Raw Sardine", icon: "🐟", category: "resource", value: 2 },
  { id: "raw_trout", name: "Raw Trout", icon: "🐠", category: "resource", value: 5 },
  { id: "raw_salmon", name: "Raw Salmon", icon: "🍣", category: "resource", value: 10 },
  { id: "raw_lobster", name: "Raw Lobster", icon: "🦞", category: "resource", value: 20 },
  { id: "raw_swordfish", name: "Raw Swordfish", icon: "🗡️", category: "resource", value: 35 },
  // Cooked food
  { id: "shrimp", name: "Cooked Shrimp", icon: "🍤", category: "food", heals: 3, value: 2 },
  { id: "sardine", name: "Cooked Sardine", icon: "🐟", category: "food", heals: 5, value: 4 },
  { id: "trout", name: "Cooked Trout", icon: "🐠", category: "food", heals: 8, value: 9 },
  { id: "salmon", name: "Cooked Salmon", icon: "🍥", category: "food", heals: 13, value: 18 },
  { id: "lobster", name: "Cooked Lobster", icon: "🦞", category: "food", heals: 20, value: 34 },
  { id: "swordfish", name: "Cooked Swordfish", icon: "🍢", category: "food", heals: 28, value: 55 },
  // Logs
  { id: "log", name: "Log", icon: "🪵", category: "resource", value: 1 },
  { id: "oak_log", name: "Oak Log", icon: "🪵", category: "resource", value: 3 },
  { id: "willow_log", name: "Willow Log", icon: "🪵", category: "resource", value: 8 },
  { id: "maple_log", name: "Maple Log", icon: "🪵", category: "resource", value: 16 },
  // Ores & bars
  { id: "copper_ore", name: "Copper Ore", icon: "🟤", category: "resource", value: 2 },
  { id: "tin_ore", name: "Tin Ore", icon: "⚪", category: "resource", value: 2 },
  { id: "iron_ore", name: "Iron Ore", icon: "🔩", category: "resource", value: 6 },
  { id: "coal", name: "Coal", icon: "⚫", category: "resource", value: 8 },
  { id: "mithril_ore", name: "Mithril Ore", icon: "🔵", category: "resource", value: 20 },
  { id: "bronze_bar", name: "Bronze Bar", icon: "🟫", category: "bar", value: 6 },
  { id: "iron_bar", name: "Iron Bar", icon: "⬜", category: "bar", value: 14 },
  { id: "mithril_bar", name: "Mithril Bar", icon: "🟦", category: "bar", value: 48 },
  // Foraging (herbs / plants)
  { id: "green_herb", name: "Green Herb", icon: "🌿", category: "resource", value: 3 },
  { id: "blue_herb", name: "Blue Herb", icon: "🪻", category: "resource", value: 7 },
  { id: "sunbloom", name: "Sunbloom", icon: "🌻", category: "resource", value: 14 },
  { id: "moonpetal", name: "Moonpetal", icon: "🌼", category: "resource", value: 26 },
  // Crafted equipment (from smithing / crafting)
  { id: "bronze_dagger", name: "Bronze Dagger", icon: "🗡️", category: "equipment", value: 20 },
  { id: "iron_sword", name: "Iron Sword", icon: "⚔️", category: "equipment", value: 60 },
  { id: "leather", name: "Leather", icon: "🟧", category: "resource", value: 4 },
  { id: "leather_gloves", name: "Leather Gloves", icon: "🧤", category: "equipment", value: 18 },
  // Combat drops
  { id: "bones", name: "Bones", icon: "🦴", category: "misc", value: 1 },
  { id: "rat_tail", name: "Rat Tail", icon: "🐀", category: "misc", value: 2 },
  { id: "goblin_cloth", name: "Goblin Cloth", icon: "🧵", category: "misc", value: 4 },
  { id: "wolf_pelt", name: "Wolf Pelt", icon: "🐺", category: "resource", value: 9 },
];

const items: Record<string, ItemDef> = {};
for (const it of itemList) items[it.id] = it;

// ---------------------------------------------------------------------------
// Game data
// ---------------------------------------------------------------------------
export const gameData: GameData = {
  skills: [
    { id: "fishing", name: "Fishing", kind: "gathering", icon: "🎣", blurb: "Reel in fish from ponds, rivers, and the deep sea." },
    { id: "woodcutting", name: "Woodcutting", kind: "gathering", icon: "🪓", blurb: "Chop trees for logs." },
    { id: "mining", name: "Mining", kind: "gathering", icon: "⛏️", blurb: "Mine ore from rocks." },
    { id: "foraging", name: "Foraging", kind: "gathering", icon: "🌿", blurb: "Gather herbs and plants in the wild." },
    { id: "cooking", name: "Cooking", kind: "production", icon: "🍳", blurb: "Cook raw fish into food that heals you in combat." },
    { id: "smithing", name: "Smithing", kind: "production", icon: "🔨", blurb: "Smelt ore into bars and forge equipment." },
    { id: "crafting", name: "Crafting", kind: "production", icon: "🧵", blurb: "Craft leather goods and trinkets." },
    { id: "combat", name: "Combat", kind: "combat", icon: "⚔️", blurb: "Fight monsters for XP and loot." },
  ],

  items,

  actions: [
    // ---- Fishing ----
    { id: "fish_shrimp", skill: "fishing", name: "Fish Shrimp", levelReq: 1, durationSec: 3, xp: 5, inputs: [], outputs: [{ item: "raw_shrimp", qty: 1 }] },
    { id: "fish_sardine", skill: "fishing", name: "Fish Sardine", levelReq: 5, durationSec: 3.5, xp: 8, inputs: [], outputs: [{ item: "raw_sardine", qty: 1 }] },
    { id: "fish_trout", skill: "fishing", name: "Fish Trout", levelReq: 15, durationSec: 4.5, xp: 15, inputs: [], outputs: [{ item: "raw_trout", qty: 1 }] },
    { id: "fish_salmon", skill: "fishing", name: "Fish Salmon", levelReq: 30, durationSec: 5.5, xp: 25, inputs: [], outputs: [{ item: "raw_salmon", qty: 1 }] },
    { id: "fish_lobster", skill: "fishing", name: "Fish Lobster", levelReq: 40, durationSec: 6.5, xp: 40, inputs: [], outputs: [{ item: "raw_lobster", qty: 1 }] },
    { id: "fish_swordfish", skill: "fishing", name: "Fish Swordfish", levelReq: 50, durationSec: 8, xp: 60, inputs: [], outputs: [{ item: "raw_swordfish", qty: 1 }] },

    // ---- Woodcutting ----
    { id: "chop_log", skill: "woodcutting", name: "Chop Tree", levelReq: 1, durationSec: 3, xp: 5, inputs: [], outputs: [{ item: "log", qty: 1 }] },
    { id: "chop_oak", skill: "woodcutting", name: "Chop Oak", levelReq: 10, durationSec: 4, xp: 12, inputs: [], outputs: [{ item: "oak_log", qty: 1 }] },
    { id: "chop_willow", skill: "woodcutting", name: "Chop Willow", levelReq: 25, durationSec: 5, xp: 22, inputs: [], outputs: [{ item: "willow_log", qty: 1 }] },
    { id: "chop_maple", skill: "woodcutting", name: "Chop Maple", levelReq: 40, durationSec: 6.5, xp: 40, inputs: [], outputs: [{ item: "maple_log", qty: 1 }] },

    // ---- Mining ----
    { id: "mine_copper", skill: "mining", name: "Mine Copper", levelReq: 1, durationSec: 3, xp: 5, inputs: [], outputs: [{ item: "copper_ore", qty: 1 }] },
    { id: "mine_tin", skill: "mining", name: "Mine Tin", levelReq: 1, durationSec: 3, xp: 5, inputs: [], outputs: [{ item: "tin_ore", qty: 1 }] },
    { id: "mine_iron", skill: "mining", name: "Mine Iron", levelReq: 15, durationSec: 4.5, xp: 15, inputs: [], outputs: [{ item: "iron_ore", qty: 1 }] },
    { id: "mine_coal", skill: "mining", name: "Mine Coal", levelReq: 30, durationSec: 5.5, xp: 25, inputs: [], outputs: [{ item: "coal", qty: 1 }] },
    { id: "mine_mithril", skill: "mining", name: "Mine Mithril", levelReq: 45, durationSec: 7, xp: 50, inputs: [], outputs: [{ item: "mithril_ore", qty: 1 }] },

    // ---- Foraging ----
    { id: "forage_green", skill: "foraging", name: "Gather Green Herb", levelReq: 1, durationSec: 3.5, xp: 6, inputs: [], outputs: [{ item: "green_herb", qty: 1 }] },
    { id: "forage_blue", skill: "foraging", name: "Gather Blue Herb", levelReq: 12, durationSec: 4.5, xp: 14, inputs: [], outputs: [{ item: "blue_herb", qty: 1 }] },
    { id: "forage_sunbloom", skill: "foraging", name: "Gather Sunbloom", levelReq: 28, durationSec: 5.5, xp: 26, inputs: [], outputs: [{ item: "sunbloom", qty: 1 }] },
    { id: "forage_moonpetal", skill: "foraging", name: "Gather Moonpetal", levelReq: 44, durationSec: 7, xp: 48, inputs: [], outputs: [{ item: "moonpetal", qty: 1 }] },

    // ---- Cooking (raw fish -> food) ----
    { id: "cook_shrimp", skill: "cooking", name: "Cook Shrimp", levelReq: 1, durationSec: 3, xp: 6, inputs: [{ item: "raw_shrimp", qty: 1 }], outputs: [{ item: "shrimp", qty: 1 }] },
    { id: "cook_sardine", skill: "cooking", name: "Cook Sardine", levelReq: 5, durationSec: 3, xp: 9, inputs: [{ item: "raw_sardine", qty: 1 }], outputs: [{ item: "sardine", qty: 1 }] },
    { id: "cook_trout", skill: "cooking", name: "Cook Trout", levelReq: 15, durationSec: 3.5, xp: 18, inputs: [{ item: "raw_trout", qty: 1 }], outputs: [{ item: "trout", qty: 1 }] },
    { id: "cook_salmon", skill: "cooking", name: "Cook Salmon", levelReq: 30, durationSec: 4, xp: 30, inputs: [{ item: "raw_salmon", qty: 1 }], outputs: [{ item: "salmon", qty: 1 }] },
    { id: "cook_lobster", skill: "cooking", name: "Cook Lobster", levelReq: 40, durationSec: 4.5, xp: 48, inputs: [{ item: "raw_lobster", qty: 1 }], outputs: [{ item: "lobster", qty: 1 }] },
    { id: "cook_swordfish", skill: "cooking", name: "Cook Swordfish", levelReq: 50, durationSec: 5, xp: 70, inputs: [{ item: "raw_swordfish", qty: 1 }], outputs: [{ item: "swordfish", qty: 1 }] },

    // ---- Smithing (smelt bars, forge gear) ----
    { id: "smelt_bronze", skill: "smithing", name: "Smelt Bronze Bar", levelReq: 1, durationSec: 4, xp: 8, inputs: [{ item: "copper_ore", qty: 1 }, { item: "tin_ore", qty: 1 }], outputs: [{ item: "bronze_bar", qty: 1 }] },
    { id: "smelt_iron", skill: "smithing", name: "Smelt Iron Bar", levelReq: 15, durationSec: 5, xp: 18, inputs: [{ item: "iron_ore", qty: 1 }, { item: "coal", qty: 1 }], outputs: [{ item: "iron_bar", qty: 1 }] },
    { id: "smelt_mithril", skill: "smithing", name: "Smelt Mithril Bar", levelReq: 45, durationSec: 7, xp: 55, inputs: [{ item: "mithril_ore", qty: 1 }, { item: "coal", qty: 2 }], outputs: [{ item: "mithril_bar", qty: 1 }] },
    { id: "forge_bronze_dagger", skill: "smithing", name: "Forge Bronze Dagger", levelReq: 5, durationSec: 6, xp: 16, inputs: [{ item: "bronze_bar", qty: 1 }], outputs: [{ item: "bronze_dagger", qty: 1 }] },
    { id: "forge_iron_sword", skill: "smithing", name: "Forge Iron Sword", levelReq: 20, durationSec: 8, xp: 36, inputs: [{ item: "iron_bar", qty: 2 }], outputs: [{ item: "iron_sword", qty: 1 }] },

    // ---- Crafting ----
    { id: "craft_gloves", skill: "crafting", name: "Craft Leather Gloves", levelReq: 1, durationSec: 4, xp: 8, inputs: [{ item: "leather", qty: 1 }], outputs: [{ item: "leather_gloves", qty: 1 }] },
    { id: "tan_pelt", skill: "crafting", name: "Tan Wolf Pelt", levelReq: 10, durationSec: 4, xp: 14, inputs: [{ item: "wolf_pelt", qty: 1 }], outputs: [{ item: "leather", qty: 2 }] },
  ],

  monsters: [
    { id: "rat", name: "Giant Rat", icon: "🐀", combatLevelReq: 1, killTimeSec: 4, hp: 8, damage: 1, xp: 8, coins: { min: 1, max: 3 }, loot: [{ item: "bones", qty: 1, chance: 1 }, { item: "rat_tail", qty: 1, chance: 0.5 }] },
    { id: "goblin", name: "Goblin", icon: "👺", combatLevelReq: 5, killTimeSec: 5, hp: 18, damage: 2, xp: 16, coins: { min: 3, max: 8 }, loot: [{ item: "bones", qty: 1, chance: 1 }, { item: "goblin_cloth", qty: 1, chance: 0.4 }] },
    { id: "wolf", name: "Grey Wolf", icon: "🐺", combatLevelReq: 15, killTimeSec: 6, hp: 40, damage: 4, xp: 32, coins: { min: 5, max: 14 }, loot: [{ item: "bones", qty: 1, chance: 1 }, { item: "wolf_pelt", qty: 1, chance: 0.6 }] },
    { id: "bandit", name: "Bandit", icon: "🥷", combatLevelReq: 30, killTimeSec: 8, hp: 80, damage: 7, xp: 60, coins: { min: 15, max: 40 }, loot: [{ item: "bones", qty: 1, chance: 1 }, { item: "goblin_cloth", qty: 1, chance: 0.3 }] },
  ],
};

// Fast lookups
export const actionsById = new Map(gameData.actions.map((a) => [a.id, a]));
export const monstersById = new Map(gameData.monsters.map((m) => [m.id, m]));
