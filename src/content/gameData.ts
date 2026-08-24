import type { GameData, ItemDef, Rarity } from "./types.js";

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
const itemList: ItemDef[] = [
  // ---- Fish: Backyard Pond ----
  { id: "minnow", name: "Minnow", icon: "🐟", category: "fish", rarity: "common", value: 1, sizeMin: 3, sizeMax: 8 },
  { id: "bluegill", name: "Bluegill", icon: "🐠", category: "fish", rarity: "common", value: 2, sizeMin: 8, sizeMax: 20 },
  { id: "pond_carp", name: "Pond Carp", icon: "🐡", category: "fish", rarity: "uncommon", value: 5, sizeMin: 20, sizeMax: 50 },
  { id: "golden_carp", name: "Golden Carp", icon: "🥇", category: "fish", rarity: "rare", value: 25, sizeMin: 25, sizeMax: 60 },
  { id: "old_boot", name: "Old Boot", icon: "🥾", category: "treasure", value: 1, rarity: "common", sizeMin: 30, sizeMax: 45 },

  // ---- Fish: Riverbank ----
  { id: "river_perch", name: "River Perch", icon: "🐟", category: "fish", rarity: "common", value: 3, sizeMin: 10, sizeMax: 30 },
  { id: "smallmouth_bass", name: "Smallmouth Bass", icon: "🐠", category: "fish", rarity: "common", value: 5, sizeMin: 20, sizeMax: 45 },
  { id: "brown_trout", name: "Brown Trout", icon: "🐟", category: "fish", rarity: "uncommon", value: 9, sizeMin: 25, sizeMax: 55 },
  { id: "rainbow_trout", name: "Rainbow Trout", icon: "🌈", category: "fish", rarity: "rare", value: 22, sizeMin: 30, sizeMax: 65 },
  { id: "river_sturgeon", name: "River Sturgeon", icon: "🐊", category: "fish", rarity: "epic", value: 90, sizeMin: 80, sizeMax: 200 },

  // ---- Fish: Misty Lake ----
  { id: "lake_pike", name: "Lake Pike", icon: "🐟", category: "fish", rarity: "common", value: 8, sizeMin: 40, sizeMax: 90 },
  { id: "channel_catfish", name: "Channel Catfish", icon: "🐈", category: "fish", rarity: "common", value: 10, sizeMin: 40, sizeMax: 100 },
  { id: "lake_salmon", name: "Lake Salmon", icon: "🍥", category: "fish", rarity: "uncommon", value: 18, sizeMin: 40, sizeMax: 80 },
  { id: "mirror_carp", name: "Mirror Carp", icon: "🪞", category: "fish", rarity: "rare", value: 40, sizeMin: 30, sizeMax: 70 },
  { id: "moonfish", name: "Moonfish", icon: "🌙", category: "fish", rarity: "epic", value: 120, sizeMin: 20, sizeMax: 45 },
  { id: "lake_leviathan", name: "Lake Leviathan", icon: "🐉", category: "fish", rarity: "legendary", value: 600, sizeMin: 150, sizeMax: 400 },

  // ---- Fish: Coral Harbor ----
  { id: "mackerel", name: "Mackerel", icon: "🐟", category: "fish", rarity: "common", value: 12, sizeMin: 20, sizeMax: 45 },
  { id: "harbor_cod", name: "Harbor Cod", icon: "🐠", category: "fish", rarity: "common", value: 16, sizeMin: 40, sizeMax: 90 },
  { id: "sea_bass", name: "Sea Bass", icon: "🐟", category: "fish", rarity: "uncommon", value: 28, sizeMin: 30, sizeMax: 70 },
  { id: "yellowfin_tuna", name: "Yellowfin Tuna", icon: "🍣", category: "fish", rarity: "rare", value: 70, sizeMin: 80, sizeMax: 180 },
  { id: "swordfish", name: "Swordfish", icon: "🗡️", category: "fish", rarity: "epic", value: 180, sizeMin: 150, sizeMax: 300 },

  // ---- Fish: Deep Sea ----
  { id: "mahi_mahi", name: "Mahi-Mahi", icon: "🐬", category: "fish", rarity: "common", value: 30, sizeMin: 60, sizeMax: 120 },
  { id: "blue_marlin", name: "Blue Marlin", icon: "🐟", category: "fish", rarity: "uncommon", value: 60, sizeMin: 150, sizeMax: 350 },
  { id: "giant_squid", name: "Giant Squid", icon: "🦑", category: "fish", rarity: "rare", value: 140, sizeMin: 200, sizeMax: 500 },
  { id: "anglerfish", name: "Anglerfish", icon: "🎏", category: "fish", rarity: "epic", value: 320, sizeMin: 20, sizeMax: 60 },
  { id: "kraken_hatchling", name: "Kraken Hatchling", icon: "🐙", category: "fish", rarity: "legendary", value: 1200, sizeMin: 100, sizeMax: 300 },

  // ---- Fish: Abyssal Trench ----
  { id: "lanternfish", name: "Lanternfish", icon: "🏮", category: "fish", rarity: "common", value: 50, sizeMin: 5, sizeMax: 15 },
  { id: "gulper_eel", name: "Gulper Eel", icon: "🐍", category: "fish", rarity: "uncommon", value: 110, sizeMin: 40, sizeMax: 180 },
  { id: "ghost_shark", name: "Ghost Shark", icon: "🦈", category: "fish", rarity: "rare", value: 260, sizeMin: 60, sizeMax: 150 },
  { id: "abyssal_serpent", name: "Abyssal Serpent", icon: "🐉", category: "fish", rarity: "epic", value: 600, sizeMin: 300, sizeMax: 800 },
  { id: "ancient_coelacanth", name: "Ancient Coelacanth", icon: "🦴", category: "fish", rarity: "legendary", value: 2500, sizeMin: 100, sizeMax: 250 },

  // ---- Foraging materials ----
  { id: "worm", name: "Worm", icon: "🪱", category: "material", value: 1 },
  { id: "driftwood", name: "Driftwood", icon: "🪵", category: "material", value: 1 },
  { id: "kelp", name: "Kelp", icon: "🌿", category: "material", value: 2 },
  { id: "seashell", name: "Seashell", icon: "🐚", category: "material", value: 3 },
  { id: "grub", name: "Grub", icon: "🐛", category: "material", value: 2 },
  { id: "pearl", name: "Pearl", icon: "🫧", category: "treasure", value: 60 },

  // ---- Crafting intermediates ----
  { id: "fishing_line", name: "Fishing Line", icon: "🧵", category: "material", value: 4 },
  { id: "hook", name: "Bone Hook", icon: "🪝", category: "material", value: 5 },

  // ---- Bait ----
  { id: "worm_bait", name: "Worm Bait", icon: "🪱", category: "bait", value: 3, baitRareBonus: 0.05 },
  { id: "grub_lure", name: "Grub Lure", icon: "🐛", category: "bait", value: 8, baitRareBonus: 0.12 },
  { id: "shiny_lure", name: "Shiny Lure", icon: "✨", category: "bait", value: 30, baitRareBonus: 0.22 },

  // ---- Rods (equipment) ----
  { id: "bamboo_rod", name: "Bamboo Rod", icon: "🎋", category: "rod", value: 40, rodSpeedMult: 0.92, rodRareBonus: 0.03 },
  { id: "fiberglass_rod", name: "Fiberglass Rod", icon: "🎣", category: "rod", value: 120, rodSpeedMult: 0.82, rodRareBonus: 0.07 },
  { id: "carbon_rod", name: "Carbon Rod", icon: "🎣", category: "rod", value: 400, rodSpeedMult: 0.72, rodRareBonus: 0.12 },
  { id: "anglers_pro_rod", name: "Angler's Pro Rod", icon: "🏆", category: "rod", value: 1500, rodSpeedMult: 0.6, rodRareBonus: 0.2 },

  // ---- Dishes (cooking outputs) — "food" provisions: sell for coins OR set as
  // your Food loadout for a long timed fishing speed/rare buff, auto-consumed
  // from your stack so it keeps working while you're offline.
  { id: "grilled_trout", name: "Grilled Trout", icon: "🍤", category: "dish", value: 30, buffDurationSec: 1800, buffSpeedMult: 0.95, buffRareBonus: 0.02 },
  { id: "salmon_fillet", name: "Salmon Fillet", icon: "🍥", category: "dish", value: 55, buffDurationSec: 2700, buffSpeedMult: 0.92, buffRareBonus: 0.04 },
  { id: "tuna_steak", name: "Tuna Steak", icon: "🥩", category: "dish", value: 200, buffDurationSec: 3600, buffSpeedMult: 0.88, buffRareBonus: 0.06 },
  { id: "seafood_platter", name: "Seafood Platter", icon: "🍱", category: "dish", value: 380, buffDurationSec: 4500, buffSpeedMult: 0.85, buffRareBonus: 0.08 },
  { id: "sashimi_deluxe", name: "Sashimi Deluxe", icon: "🍣", category: "dish", value: 620, buffDurationSec: 5400, buffSpeedMult: 0.8, buffRareBonus: 0.1 },

  // ---- Drinks (cooking outputs) — "drink" provisions: a long timed efficiency
  // or XP buff that applies to whatever skill you're working, food's counterpart.
  { id: "kelp_tea", name: "Kelp Tea", icon: "🍵", category: "drink", value: 15, buffDurationSec: 1800, buffEfficiencyBonus: 0.05 },
  { id: "pearlgrass_tonic", name: "Pearlgrass Tonic", icon: "🧉", category: "drink", value: 60, buffDurationSec: 2700, buffEfficiencyBonus: 0.1 },
  { id: "anglers_coffee", name: "Angler's Coffee", icon: "☕", category: "drink", value: 90, buffDurationSec: 3600, buffXpMult: 1.08 },
];

const items: Record<string, ItemDef> = {};
for (const it of itemList) items[it.id] = it;

// ---------------------------------------------------------------------------
// Game data
// ---------------------------------------------------------------------------
export const gameData: GameData = {
  skills: [
    { id: "fishing", name: "Fishing", icon: "🎣", blurb: "Cast your line across ponds, rivers, and the deep sea. Every catch is a surprise." },
    { id: "foraging", name: "Foraging", icon: "🧺", blurb: "Dig for bait and comb the shore for crafting materials." },
    { id: "crafting", name: "Tackle Crafting", icon: "🛠️", blurb: "Craft bait, hooks, line, and better rods." },
    { id: "cooking", name: "Cooking", icon: "🍳", blurb: "Turn your catch into valuable dishes." },
  ],

  items,

  rarityXp: { common: 5, uncommon: 12, rare: 30, epic: 80, legendary: 200 },
  rarityRank: { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 },

  zones: [
    {
      id: "pond", name: "Backyard Pond", icon: "🏡", levelReq: 1, baseTimeSec: 3.5, xpMult: 1,
      blurb: "A quiet little pond. Where every angler starts.",
      fish: [
        { item: "minnow", weight: 1000 },
        { item: "bluegill", weight: 800 },
        { item: "old_boot", weight: 120 },
        { item: "pond_carp", weight: 250 },
        { item: "golden_carp", weight: 30 },
      ],
    },
    {
      id: "river", name: "Riverbank", icon: "🏞️", levelReq: 10, baseTimeSec: 4, xpMult: 2.2,
      blurb: "Fast, cold water full of fighting fish.",
      fish: [
        { item: "river_perch", weight: 900 },
        { item: "smallmouth_bass", weight: 750 },
        { item: "brown_trout", weight: 260 },
        { item: "rainbow_trout", weight: 55 },
        { item: "river_sturgeon", weight: 10 },
      ],
    },
    {
      id: "lake", name: "Misty Lake", icon: "🌫️", levelReq: 25, baseTimeSec: 4.5, xpMult: 4.5,
      blurb: "Deep and still. Locals say something old lives here.",
      fish: [
        { item: "lake_pike", weight: 850 },
        { item: "channel_catfish", weight: 700 },
        { item: "lake_salmon", weight: 240 },
        { item: "mirror_carp", weight: 55 },
        { item: "moonfish", weight: 12 },
        { item: "lake_leviathan", weight: 2 },
      ],
    },
    {
      id: "harbor", name: "Coral Harbor", icon: "⛵", levelReq: 40, baseTimeSec: 5, xpMult: 9,
      blurb: "Salt air and bigger fish. The sea proper begins here.",
      fish: [
        { item: "mackerel", weight: 850 },
        { item: "harbor_cod", weight: 700 },
        { item: "sea_bass", weight: 240 },
        { item: "yellowfin_tuna", weight: 55 },
        { item: "swordfish", weight: 12 },
      ],
    },
    {
      id: "deep_sea", name: "Deep Sea", icon: "🌊", levelReq: 60, baseTimeSec: 6, xpMult: 18,
      blurb: "Miles from shore over the open blue.",
      fish: [
        { item: "mahi_mahi", weight: 850 },
        { item: "blue_marlin", weight: 260 },
        { item: "giant_squid", weight: 55 },
        { item: "anglerfish", weight: 12 },
        { item: "kraken_hatchling", weight: 2 },
      ],
    },
    {
      id: "abyss", name: "Abyssal Trench", icon: "🕳️", levelReq: 80, baseTimeSec: 7.5, xpMult: 32,
      blurb: "The lightless deep. Only the boldest cast here.",
      fish: [
        { item: "lanternfish", weight: 850 },
        { item: "gulper_eel", weight: 260 },
        { item: "ghost_shark", weight: 55 },
        { item: "abyssal_serpent", weight: 12 },
        { item: "ancient_coelacanth", weight: 2 },
      ],
    },
  ],

  actions: [
    // ---- Foraging ----
    { id: "dig_worms", skill: "foraging", name: "Dig for Worms", levelReq: 1, durationSec: 3, xp: 5, inputs: [], outputs: [{ item: "worm", qty: 1 }] },
    { id: "gather_driftwood", skill: "foraging", name: "Gather Driftwood", levelReq: 1, durationSec: 3.5, xp: 6, inputs: [], outputs: [{ item: "driftwood", qty: 1 }] },
    { id: "gather_kelp", skill: "foraging", name: "Gather Kelp", levelReq: 8, durationSec: 4, xp: 12, inputs: [], outputs: [{ item: "kelp", qty: 1 }] },
    { id: "collect_seashells", skill: "foraging", name: "Collect Seashells", levelReq: 15, durationSec: 4.5, xp: 18, inputs: [], outputs: [{ item: "seashell", qty: 1 }] },
    { id: "catch_grubs", skill: "foraging", name: "Catch Grubs", levelReq: 25, durationSec: 5, xp: 26, inputs: [], outputs: [{ item: "grub", qty: 1 }] },
    { id: "dive_pearls", skill: "foraging", name: "Dive for Pearls", levelReq: 45, durationSec: 8, xp: 55, inputs: [], outputs: [{ item: "pearl", qty: 1, chance: 0.5 }, { item: "seashell", qty: 1 }] },

    // ---- Tackle Crafting ----
    { id: "craft_worm_bait", skill: "crafting", name: "Craft Worm Bait", levelReq: 1, durationSec: 2.5, xp: 6, inputs: [{ item: "worm", qty: 2 }], outputs: [{ item: "worm_bait", qty: 1 }] },
    { id: "craft_fishing_line", skill: "crafting", name: "Craft Fishing Line", levelReq: 1, durationSec: 3, xp: 8, inputs: [{ item: "kelp", qty: 2 }], outputs: [{ item: "fishing_line", qty: 1 }] },
    { id: "craft_hook", skill: "crafting", name: "Craft Bone Hook", levelReq: 3, durationSec: 3, xp: 10, inputs: [{ item: "seashell", qty: 1 }], outputs: [{ item: "hook", qty: 1 }] },
    { id: "craft_grub_lure", skill: "crafting", name: "Craft Grub Lure", levelReq: 20, durationSec: 4, xp: 24, inputs: [{ item: "grub", qty: 3 }], outputs: [{ item: "grub_lure", qty: 1 }] },
    { id: "craft_shiny_lure", skill: "crafting", name: "Craft Shiny Lure", levelReq: 40, durationSec: 5, xp: 50, inputs: [{ item: "pearl", qty: 1 }, { item: "seashell", qty: 2 }], outputs: [{ item: "shiny_lure", qty: 1 }] },
    { id: "craft_bamboo_rod", skill: "crafting", name: "Craft Bamboo Rod", levelReq: 1, durationSec: 6, xp: 20, inputs: [{ item: "driftwood", qty: 2 }, { item: "fishing_line", qty: 1 }, { item: "hook", qty: 1 }], outputs: [{ item: "bamboo_rod", qty: 1 }] },
    { id: "craft_fiberglass_rod", skill: "crafting", name: "Craft Fiberglass Rod", levelReq: 15, durationSec: 8, xp: 45, inputs: [{ item: "driftwood", qty: 3 }, { item: "fishing_line", qty: 2 }, { item: "hook", qty: 2 }], outputs: [{ item: "fiberglass_rod", qty: 1 }] },
    { id: "craft_carbon_rod", skill: "crafting", name: "Craft Carbon Rod", levelReq: 35, durationSec: 10, xp: 90, inputs: [{ item: "driftwood", qty: 5 }, { item: "fishing_line", qty: 3 }, { item: "hook", qty: 3 }, { item: "pearl", qty: 1 }], outputs: [{ item: "carbon_rod", qty: 1 }] },
    { id: "craft_pro_rod", skill: "crafting", name: "Craft Angler's Pro Rod", levelReq: 55, durationSec: 14, xp: 180, inputs: [{ item: "driftwood", qty: 8 }, { item: "fishing_line", qty: 5 }, { item: "hook", qty: 5 }, { item: "pearl", qty: 3 }], outputs: [{ item: "anglers_pro_rod", qty: 1 }] },

    // ---- Cooking (fish -> dishes) ----
    { id: "cook_grilled_trout", skill: "cooking", name: "Cook Grilled Trout", levelReq: 1, durationSec: 3.5, xp: 20, inputs: [{ item: "brown_trout", qty: 1 }], outputs: [{ item: "grilled_trout", qty: 1 }] },
    { id: "cook_salmon_fillet", skill: "cooking", name: "Cook Salmon Fillet", levelReq: 15, durationSec: 4, xp: 35, inputs: [{ item: "lake_salmon", qty: 1 }], outputs: [{ item: "salmon_fillet", qty: 1 }] },
    { id: "cook_tuna_steak", skill: "cooking", name: "Cook Tuna Steak", levelReq: 30, durationSec: 4.5, xp: 70, inputs: [{ item: "yellowfin_tuna", qty: 1 }], outputs: [{ item: "tuna_steak", qty: 1 }] },
    { id: "cook_seafood_platter", skill: "cooking", name: "Cook Seafood Platter", levelReq: 45, durationSec: 5.5, xp: 110, inputs: [{ item: "mahi_mahi", qty: 1 }, { item: "sea_bass", qty: 1 }], outputs: [{ item: "seafood_platter", qty: 1 }] },
    { id: "cook_sashimi", skill: "cooking", name: "Prepare Sashimi Deluxe", levelReq: 60, durationSec: 6, xp: 170, inputs: [{ item: "swordfish", qty: 1 }], outputs: [{ item: "sashimi_deluxe", qty: 1 }] },

    // ---- Cooking: drinks (brewed from foraged materials) ----
    { id: "brew_kelp_tea", skill: "cooking", name: "Brew Kelp Tea", levelReq: 10, durationSec: 3, xp: 12, inputs: [{ item: "kelp", qty: 2 }], outputs: [{ item: "kelp_tea", qty: 1 }] },
    { id: "brew_pearlgrass_tonic", skill: "cooking", name: "Brew Pearlgrass Tonic", levelReq: 35, durationSec: 4.5, xp: 40, inputs: [{ item: "pearl", qty: 1 }, { item: "kelp", qty: 3 }], outputs: [{ item: "pearlgrass_tonic", qty: 1 }] },
    { id: "brew_anglers_coffee", skill: "cooking", name: "Brew Angler's Coffee", levelReq: 50, durationSec: 5, xp: 65, inputs: [{ item: "pearl", qty: 1 }, { item: "grub", qty: 2 }], outputs: [{ item: "anglers_coffee", qty: 1 }] },
  ],

  shop: [
    { item: "worm_bait", price: 5 },
    { item: "bamboo_rod", price: 60 },
  ],

  achievements: [
    { id: "first_catch", name: "First Catch", desc: "Discover your first species.", icon: "🪝", coins: 20, cond: { type: "discover", value: 1 } },
    { id: "curious", name: "Curious Angler", desc: "Discover 10 species.", icon: "🔍", coins: 120, cond: { type: "discover", value: 10 } },
    { id: "naturalist", name: "Naturalist", desc: "Discover 20 species.", icon: "📚", coins: 400, cond: { type: "discover", value: 20 } },
    { id: "hooked", name: "Hooked", desc: "Catch 100 fish.", icon: "🎣", coins: 150, cond: { type: "catch_total", value: 100 } },
    { id: "obsessed", name: "Truly Hooked", desc: "Catch 1,000 fish.", icon: "🌀", coins: 800, cond: { type: "catch_total", value: 1000 } },
    { id: "lucky", name: "Lucky!", desc: "Catch a rare fish.", icon: "🍀", coins: 120, cond: { type: "rarity", rarity: "rare" } },
    { id: "trophy", name: "Trophy Catch", desc: "Catch an epic fish.", icon: "🏅", coins: 400, cond: { type: "rarity", rarity: "epic" } },
    { id: "legend", name: "Legend of the Deep", desc: "Catch a legendary fish.", icon: "🐉", coins: 2000, cond: { type: "rarity", rarity: "legendary" } },
    { id: "angler_10", name: "Getting the Hang of It", desc: "Reach Fishing level 10.", icon: "🎯", coins: 100, cond: { type: "skill", skill: "fishing", value: 10 } },
    { id: "angler_25", name: "Seasoned Angler", desc: "Reach Fishing level 25.", icon: "⭐", coins: 350, cond: { type: "skill", skill: "fishing", value: 25 } },
    { id: "angler_50", name: "Master Angler", desc: "Reach Fishing level 50.", icon: "👑", coins: 1200, cond: { type: "skill", skill: "fishing", value: 50 } },
    { id: "line_cook", name: "Line Cook", desc: "Reach Cooking level 20.", icon: "🍳", coins: 250, cond: { type: "skill", skill: "cooking", value: 20 } },
    { id: "tinkerer", name: "Tinkerer", desc: "Reach Tackle Crafting level 20.", icon: "🛠️", coins: 250, cond: { type: "skill", skill: "crafting", value: 20 } },
    { id: "beachcomber", name: "Beachcomber", desc: "Reach Foraging level 20.", icon: "🧺", coins: 250, cond: { type: "skill", skill: "foraging", value: 20 } },
  ],

  guildRanks: [
    "Bait Bucket",        // 0
    "Dock Hands",         // 1
    "Pier Regulars",      // 2
    "Weekend Anglers",    // 3
    "Line Slingers",      // 4
    "Reel Deal",          // 5
    "Tide Chasers",       // 6
    "Net Positive",       // 7
    "Current Riders",     // 8
    "Deep Enthusiasts",   // 9
    "Trophy Club",        // 10
    "Salt & Scales",      // 11
    "Blue Water Crew",    // 12
    "Storm Fishers",      // 13
    "Abyssal Society",    // 14
    "Leviathan Hunters",  // 15
    "Krakenborn",         // 16
    "Mythic Casters",     // 17
    "Ocean's Chosen",     // 18
    "Tidebreakers",       // 19
    "Poseidon's Circle",  // 20
    "Legends Two",        // 21
    "The Old Salts",      // 22
    "Master Mariners",    // 23
    "Grand Admirals",     // 24
    "The Idyllic",        // 25 (max)
  ],
};

// Lookups
export const zonesById = new Map(gameData.zones.map((z) => [z.id, z]));
export const actionsById = new Map(gameData.actions.map((a) => [a.id, a]));
export const shopByItem = new Map(gameData.shop.map((s) => [s.item, s]));

export function rarityOf(itemId: string): Rarity {
  return gameData.items[itemId]?.rarity ?? "common";
}
