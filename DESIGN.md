# Idyll — Design & Roadmap

A living design doc for our coop **fishing** game. Fishing is the heart; a few
tightly-themed trade skills (foraging, crafting, cooking) and a shared Guild give
it incremental depth for two players.

## Design pillars

1. **Fishing first.** The core loop is: pick a spot, cast, and see what you reel
   in. Variety and rare surprises make each cast interesting; a collection and
   record sizes give long-term chase goals.
2. **Idle-first & fair.** Your line keeps fishing whether or not you're watching.
   Offline is capped only so it stays balanced (default 24h).
3. **Genuinely coop.** Two anglers should *feel* like they're fishing together:
   live presence, shared chat, and a **shared Anglers' Guild** that both of you
   level by catching fish — with a perk that benefits you both.
4. **Support skills serve fishing.** Foraging → bait & materials; Crafting →
   rods/bait/tackle; Cooking → valuable dishes. Everything feeds the fishing
   economy rather than competing with it.
5. **Data-driven content.** New fish, zones, rods, bait, and recipes are data in
   `src/content/gameData.ts`, not new code.

## Current architecture

- **Server** (`src/server.ts`): one Node process. Express serves the REST API
  (auth, content) and the static client; `ws` provides a live channel for state,
  presence, and chat. A 1-second tick advances every online player and
  broadcasts presence + Guild status.
- **Engine** (`src/engine.ts`): source of truth. `processElapsed` advances a
  player since they were last seen — fishing (per-cast rolls) or foraging/
  crafting/cooking (bulk completions). Same function powers the live tick and
  offline catch-up.
- **Fishing model**: each zone has a weighted fish table. A cast rolls one
  species; `rareBonus` (from your rod + active bait) shifts the odds toward rarer
  fish. Each catch rolls a size, updates your bestiary record, grants XP scaled
  by the zone, and ticks the shared Guild counter.
- **Shared Guild** (`guild` table): total catches across both players → Guild
  level → a cast-speed bonus applied to everyone. Coop incremental progression.
- **Shared Bank** (`bank` table + `src/bank.ts`): a single item stash both
  players deposit into / withdraw from; changes are broadcast live to both.
- **Meal buffs**: eating a dish sets a per-player buff `{ speedMult, rareBonus,
  expiresAt }`. The fishing loop walks sim-time forward and checks the buff per
  cast, so it applies exactly (and expires mid-window correctly) even offline.
- **Hotspot events** (`src/events.ts`): a server-side scheduler rotates a global
  `FishingEvent` (boosted zone) and broadcasts start/end. The fishing loop reads
  `getActiveEvent()` and applies its bonus per cast, gated on zone + sim-time —
  same exact mechanism as buffs.
- **Achievements**: definitions live in `gameData.achievements`; `processElapsed`
  evaluates unmet ones each advance and grants coin rewards, surfacing unlocks in
  the progress summary. Unlocked ids are stored per character.
- **Persistence** (`src/db.ts`): SQLite. `characters` stores coins, a skills XP
  map, inventory, bestiary, equipped rod, and the current action. Offline
  progress falls out of the action's start timestamp.
- **Client** (`public/`): no build step. Vanilla ES modules render the fishing
  zones, trade-skill panels, the collection, the shop, inventory (with
  sell/equip), the Guild bar, party presence, and chat.

### The action model

A character has at most one active action: `{ type, refId, startedAt }` where
`type` is `fish` (refId = zone) or `gather`/`produce` (refId = action).
`startedAt` marks the current in-progress cast/craft; on each advance we compute
whole completions, grant rewards, and roll `startedAt` forward by the remainder.
Production is additionally limited by available inputs.

## Roadmap

### Near term
- [x] **Meal buffs** — eat a cooked dish for a timed boost to cast speed and rare
      chance instead of only selling it. Buff is tracked per-player with an
      absolute expiry, applied per-cast (so it's exact across the offline window
      and clears mid-window correctly).
- [x] **Shared bank** — a single shared stash both anglers deposit into and
      withdraw from, broadcast live to both. (Direct gifting/shared coins TBD.)
- [ ] **Action queue** — line up multiple casts/crafts (MWI-style).
- [ ] **Direct gifting & shared coins** — send items straight to your partner;
      an optional shared coin pool.
- [x] **Fishing events** — a rotating global hotspot: one zone gets boosted rare
      chance + faster casts for a short window, broadcast to both players.
      Applied per-cast via sim-time (same mechanism as meal buffs).
- [x] **Achievements** — personal goals (discover N species, catch totals, skill
      milestones, first rare/epic/legendary) that pay out coins. Guild also has
      flavour rank titles per level.
- [x] **Welcome-back summary** — the first sync after reconnecting surfaces the
      offline catch as a recap modal.
- [ ] **Guild goals & milestones with shared rewards** — combined targets
      ("catch 100 legendaries together") granting perks/titles to both.

### Mid term
- [ ] **Nets / traps / crab pots** — passive gathering that runs alongside your
      active line.
- [ ] **Tackle depth** — bobbers, reels, and line as separate equipment slots
      with trade-offs.
- [ ] **A tiny market** between the two of you (post buy/sell orders).
- [ ] **Aquarium / trophy room** — display your record catches on a shared page.
- [ ] **Weather & time-of-day** affecting which fish bite.

### Later / polish
- [ ] Prestige layer ("master angler" rebirth) for long-term idle depth.
- [ ] Art pass (sprites instead of emoji), ambient sound.
- [ ] Push notifications when your bag is full / a legendary bites.
- [ ] Mobile layout refinements.

## Balancing notes (initial, tune freely)

- Fishing XP per catch = `rarityXp[rarity] × zone.xpMult`
  (`rarityXp`: 5 / 12 / 30 / 80 / 200).
- Cast time = `zone.baseTimeSec × rodSpeedMult × (1 − guildSpeedBonus)`.
- `rareBonus = rod.rodRareBonus + (bait on ? bait.baitRareBonus : 0)`, applied to
  non-common weights as `weight × (1 + rareBonus × (1 + rarityRank))`.
- Guild: `level = floor(totalCatches / 250)` (max 25), `speedBonus = level × 1%`.

Everything above lives in `src/content/gameData.ts` and the constants at the top
of `engine.ts`/`leveling.ts` — tweak and reload.
