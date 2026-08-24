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
- **Provisions (Food/Drink loadout)**: `loadout: { food?, drink? }` names an
  item; `foodBuff`/`drinkBuff` are the currently-active instances
  (`{ speedMult, rareBonus, efficiencyBonus, xpMult, expiresAt }` — unused
  fields sit at their neutral value so one shape covers both kinds). Every
  iteration of the sim loop calls `refillBuffs(p, clock)`: if a slot's buff has
  expired (or never started), it consumes the next stacked item and starts a
  fresh buff beginning exactly at `clock`, so a stack of dishes/drinks chains
  back-to-back across a long offline window and stops cleanly once it runs
  out — same mechanism and precision as hotspot events.
- **Lure**: `equipped.lure` names one bait item; the timed fishing cast
  consumes one per completion (efficiency procs don't consume lure, matching
  "free" bonus output). Replaced the old auto-best-bait toggle.
- **Hotspot events** (`src/events.ts`): a server-side scheduler rotates a global
  `FishingEvent` (boosted zone) and broadcasts start/end. The fishing loop reads
  `getActiveEvent()` and applies its bonus per cast, gated on zone + sim-time —
  same exact mechanism as buffs.
- **Achievements**: definitions live in `gameData.achievements`; `processElapsed`
  evaluates unmet ones each advance and grants coin rewards, surfacing unlocks in
  the progress summary. Unlocked ids are stored per character.
- **Tackle & enhancement**: `equipped.{reel,line,toolForaging,toolCrafting,
  toolCooking}` are optional item ids feeding `efficiencyFor()`/`actionDurMs()`/
  the lure-save roll. `enhancements: Record<rodId, plus>` is a per-rod-*type*
  enhancement level (not per physical instance — the simplification is
  intentional, see DESIGN_REVIEW_MWI.md §5.2); `rodStatsFor()` derives the
  effective speed/rare from it. `enhanceRod()` in `engine.ts` is the one place
  that spends materials/coins and rolls success.
- **The Boathouse** (`src/boathouse.ts`, `src/purse.ts`, `src/records.ts`):
  three small modules, each owning one shared single-row/table concern
  (rooms+bait-tick, coin purse, per-species records), following the same
  pattern as `bank.ts`/the `guild` table. `boathouse.ts` exposes pure bonus
  getters (`boathouseSkillEfficiency`, `boathouseRareBonus`,
  `boathouseEnhanceBonus`, `chartRoomBonus`) that `engine.ts` and `events.ts`
  both call — a light DB read per call, same pattern already proven fine for
  Guild bonuses under offline-catch-up stress. `tickBaitGarden()` is driven by
  a 30-minute `setInterval` in `server.ts`, independent of any player session,
  with a 12h backlog cap carried forward via a stored `bait_last_tick`.
- **Persistence** (`src/db.ts`): SQLite. `characters` stores coins, a skills XP
  map, inventory, bestiary, equipped rod, and the current action. Offline
  progress falls out of the action's start timestamp.
- **Client** (`public/`): no build step. Vanilla ES modules render the fishing
  zones, trade-skill panels, the collection, the shop, inventory (with
  sell/equip), the Guild bar, party presence, and chat.

### The action model

A character has one active action plus a queue of pending ones. Each entry is
`{ type, refId, target }` (`type` = `fish` | `gather` | `produce`; `target` = 0
means run until stopped / out of materials). The active entry also tracks
`{ done, progressMs }`.

`processElapsed` distributes the elapsed window with a single per-completion
loop: for each completion it computes that step's duration at the current
sim-time (so meal buffs and hotspot events apply exactly), grants the reward,
and — when an entry reaches its target or a production entry runs out of inputs —
promotes the next queued entry, carrying leftover time forward. Partial progress
toward the next completion is stored in `progressMs`. This one loop powers the
live tick and offline catch-up identically.

## Roadmap

### MWI-inspired redesign (see `docs/DESIGN_REVIEW_MWI.md`)

Following the Fable 5 review. Decision: **collection-focused long tail, no combat**
— we replace the review's "Legendary Expeditions" pillar with deeper collection
content (shiny/variant fish, weather/time-of-day exclusives).

**Phase 1 — Levels Matter (in progress):**
- [x] **Efficiency system** — every level above an action's requirement gives a
      per-completion chance to instantly repeat for free extra output (+1%/level,
      plus a shared Guild efficiency bonus past Guild level 20). Slots into the
      per-completion loop; bonus completions cost no time and count toward queue
      targets.
- [x] **Level speed factor** — a small innate speed bonus (−0.25%/level over req,
      capped −15%) on fishing and support skills.
- [x] **XP/Guild pacing retune** — zone `xpMult` resteps to 1/2.2/4.5/9/18/32;
      the Guild curve is now a growing cumulative bar to level 60 (speed to +15%,
      then efficiency past level 20).
- [x] **Treasure ≠ fish** — the Old Boot no longer ticks the Guild or catch-total
      achievements.
- [x] **Consumable loadout** — `loadout: { food?, drink? }` on the player;
      dishes ("food") give speed/rare, brewed drinks ("drink") give
      efficiency/XP. Auto-refills from your stack the instant the active buff
      expires, evaluated per sim-tick so it chains seamlessly across long
      offline windows and stops cleanly when the stack runs out. Dish
      durations retuned to 30–90 min (1800–5400s). New drinks: Kelp Tea,
      Pearlgrass Tonic, Angler's Coffee (brewed via Cooking).
- [x] **Lure slot** — `equipped.lure` replaces the old auto-best bait toggle;
      equip a specific bait from Inventory, consumed one per timed cast.

Phase 1 is complete.

**Phase 2 — Gear & Home (complete):**
- [x] **Tackle slots + tools** — `equipped` gained `reel`, `line`,
      `toolForaging`, `toolCrafting`, `toolCooking` (all optional item-id
      strings, same JSON blob, no migration needed). Reels add fishing
      efficiency; lines give a % chance to save the equipped lure on a cast;
      tools give a skill-specific speed multiplier and (tier 2+) an efficiency
      bonus. 3 tiers × 5 slots = 15 new craftable items.
- [x] **Rod enhancement (+1…+10)** — simplified from the review's per-instance
      `GearRef` model to a per-**type** `enhancements: Record<rodId, plus>` on
      the player (a rod slot only ever holds one equipped instance anyway, so
      this avoids a gear-instance migration entirely). `enhanceRod()` charges
      materials/coins up front regardless of outcome, rolls
      `ENHANCE_SUCCESS[target] + Workshop bonus + (Blessed Lacquer ? 0.15 : 0)`,
      and on success bumps `enhancements[rodId]`. Effective stats:
      `speedMult × 0.98^plus`, `rareBonus + 0.01×plus`. Cozy contract intact —
      a failed attempt only costs the materials.
- [x] **The Boathouse** — new `src/boathouse.ts` (rooms, cost curve, bonus
      getters, Bait Garden tick) mirrors the `guild`/`bank` single-row DB
      pattern. Six rooms (Dock/Smokery/Workshop/Bait Garden/Chart
      Room/Trophy Hall) at level 0–5, cost ×2.2/level, paid from the shared
      Bank (materials) and a new shared **Purse** (`src/purse.ts`, coins) —
      never from the acting player's personal inventory, so it's a genuine
      joint project. Dock/Smokery/Workshop feed `efficiencyFor()`; Chart Room
      feeds `events.ts`'s `rollEvent()`; Trophy Hall's rare bonus feeds
      `fishParamsAt()` and its "displays biggest catches" is backed by a new
      `records` table (`src/records.ts`) checked on every catch and shown on
      the Collection page.
- [x] **Shared purse** — `contributeToPurse()` moves personal coins into the
      shared pool; Boathouse upgrades spend from it. (Direct item gifting was
      already covered by the existing shared Bank.)
- [x] **Shop expansion** — ~13 items (raw materials, bait, tier-1 gear) priced
      at roughly 3–4× sell value, so coins have a floor use even after the
      Boathouse is built out.

**Phase 3 — Harbor Life:** Merchant's Dock buy-orders + Notice Board + Guild Marks,
Guild shared milestones; then the collection long-tail (shiny variants, weather/
time exclusives) in place of combat.

### Engagement research (see `docs/RESEARCH_ENGAGEMENT.md`)

Research into idle-game psychology (Melvor, Milky Way Idle, OSRS) and the
social "flex" layer, with a 5-tier plan. Decision: honest-design guardrails —
no fake near-misses, no loss-based streaks.

**Tier 1 — Celebration & witness layer (complete):**
- [x] **Level-up fanfare** — confetti + an on-screen banner on every level-up;
      escalates at milestone levels (10/20/…/90/99). `MILESTONE_LEVELS` +
      `highestMilestoneCrossed` in `engine.ts`; `processElapsed` snapshots each
      skill's level before/after the advance and reports every crossing in
      `summary.levelUps` (from/to, so a big offline jump is one entry, not a
      flood).
- [x] **Notable-catch fanfare** — epic/legendary catches are flagged in
      `summary.notableCatches` and get a distinct rarity-colored banner
      (confetti too, for legendaries).
- [x] **Shared Guild level-up fanfare** — `processElapsed` diffs the Guild
      level around the `addGuild.run()` call and reports `guildLevelUp` when
      the catches from *this* advance pushed it over a threshold.
- [x] **Chat broadcasts** — a `messages.kind` column (`'chat'` | `'system'`)
      plus `rarity` for tinting. `announceSummary()` in `server.ts` turns
      level milestones, new species, notable catches, achievements, and Guild
      level-ups into persisted, broadcast system messages — so an achievement
      lands for a partner who's offline right now, not just a local toast.
- [x] **Live vs. offline framing** — the client only fires flashy fanfare
      during live play; the first sync after reconnecting (which may include
      a large offline catch-up) folds the same data into one enriched
      "while you were away" recap instead of firing a flurry of banners.

**Tier 2 — Zone Mastery** (per-zone 1–50 level fed by catches in that zone,
Melvor's per-action progression layer, fishing-flavored) — not started.

**Tier 3 — Chase content**: shiny 1/500 variants, a records & firsts board
(shared, stealable), collection-completion rewards, quiet bad-luck protection
on legendaries — not started.

**Tier 4 — Identity & titles**: equippable titles, cosmetic skill-99 badges,
total-level frames — not started.

**Tier 5 — Daily rhythm**: folds into Phase 3's Notice Board; gain-only
streaks — not started.

### Near term (original list)
- [x] **Meal buffs** — eat a cooked dish for a timed boost to cast speed and rare
      chance instead of only selling it. Buff is tracked per-player with an
      absolute expiry, applied per-cast (so it's exact across the offline window
      and clears mid-window correctly).
- [x] **Shared bank** — a single shared stash both anglers deposit into and
      withdraw from, broadcast live to both. (Direct gifting/shared coins TBD.)
- [x] **Action queue** — each action carries a target count (0 = infinite); the
      engine advances through a queue of tasks, distributing the elapsed window
      across entries per-completion (so buffs/events/offline stay exact) and
      advancing on target reached or materials exhausted.
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
