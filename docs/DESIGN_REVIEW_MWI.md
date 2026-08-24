# Idyll × Milky Way Idle — Design Review & Redesign Plan

*A review of Idyll v0.5 against Milky Way Idle's (MWI) design pillars, with a concrete,
phased plan to get the MWI "numbers keep getting better" feel while staying a cozy
two-player fishing game.*

> Grounding: everything here references the actual code — `src/engine.ts`,
> `src/leveling.ts`, `src/content/gameData.ts`, `src/events.ts`, `src/bank.ts`,
> `src/server.ts`, `public/app.js`, and the roadmap in `DESIGN.md`. Where I cite MWI
> specifics I'm confident about the shape of the mechanic; exact MWI constants are
> flagged where I'm unsure rather than invented.

---

## 1. Honest assessment of v0.5

### What's genuinely good

- **The engine is the right foundation.** `processElapsed` in `src/engine.ts` is a
  single per-completion simulation loop that walks sim-time forward and re-evaluates
  buffs/events *per cast* (`fishParamsAt` takes an absolute `clock`). That is exactly
  the substrate MWI-style systems need: efficiency procs, auto-consumed food, and
  tool bonuses all slot into this loop without a rewrite. Most idle games get this
  wrong; Idyll got it right first.
- **Coop is real, not cosmetic.** The shared Guild (`guild` table, +1% cast speed per
  level for *both* players), shared Bank with live broadcast, presence, chat, and
  global hotspot events are all genuinely two-player systems. MWI itself is weaker
  here per-pair — this is Idyll's identity and must be protected.
- **Data-driven content** (`src/content/gameData.ts`) — adding fish/zones/recipes is
  data, as `DESIGN.md` pillar 5 promises. All proposals below stay data-driven.
- **The collection/record-size chase** (bestiary with `max` size per species) is a
  good long-term hook MWI doesn't have an equivalent of. Keep and grow it.

### What's shallow vs. the MWI feel

1. **Levels do almost nothing.** This is the single biggest gap. In Idyll, a skill
   level is only a gate: `resolveEntry` checks `levelReq`, and that's the *entire*
   effect of leveling. Cast time (`fishParamsAt`) is
   `zone.baseTimeSec × rodSpeedMult × (1 − guildSpeedBonus) × buff × event` — the
   player's level appears nowhere. In MWI, every level above an action's requirement
   grants efficiency (a chance to instantly repeat the action), so *every single
   level-up makes the current grind visibly better*. In Idyll, after unlocking
   Abyssal Trench at Fishing 80, levels 81–99 are pure dead weight. Support-skill
   actions are even flatter: `currentDurMs` returns raw `def.durationSec` — a level-99
   cook cooks at exactly the speed of a level-1 cook.

2. **The pacing curve is broken for the top half of the game.** The XP curve
   (`src/leveling.ts`, per-level delta `(lvl−1) × 100 × 1.104^(lvl−2)`) grows ~10.4%
   per level, but zone XP/hour grows only linearly. Computed from the actual data
   (average XP per cast × casts/hour, 24/7 idle):

   | Milestone | Best zone | XP/hr there | Cumulative time |
   |---|---|---|---|
   | Fishing 10 (Riverbank) | Pond (6.3k/hr) | 6,312 | ~1.2 h |
   | Fishing 25 (Misty Lake) | River | 10,053 | ~15 h |
   | Fishing 40 (Coral Harbor) | Lake | 14,108 | ~3.5 days |
   | Fishing 60 (Deep Sea) | Harbor | 17,472 | **~36 days** |
   | Fishing 80 (Abyssal Trench) | Deep Sea | 26,412 | **~235 days** |
   | Fishing 99 | Abyss | 29,582 | **~4.7 years** |

   The first week is lovely; then the game hits a wall between Harbor and Deep Sea.
   MWI's answer is that throughput *compounds* (efficiency + tools + house + teas +
   community buffs all multiply), so the curve can be steep. Idyll has the steep
   curve without the compounding. Fix both sides (see §3 and §7).

3. **Gear is terminal and flat.** Four rods (`bamboo → anglers_pro_rod`), strictly
   ordered, no trade-offs, no enhancement, one slot. A player crafts the Pro Rod at
   Crafting 55 (0.60× speed, +0.20 rare) and gear progression is *over* — roughly
   week two. There are no tools for Foraging/Crafting/Cooking at all. MWI's feel
   depends on gear being a long, layered ladder (tiers × enhancement levels × slots).
   `DESIGN.md` already lists "Tackle depth — bobbers, reels, and line as separate
   slots" as mid-term; this review promotes it to the core plan.

4. **Bait removes choice instead of adding it.** `bestBait()` auto-consumes the
   highest-bonus bait in the bag when the `baitActive` toggle is on. The player can't
   choose to burn cheap worm bait while saving shiny lures. It should be an equipped
   slot (a loadout choice), like MWI's consumables.

5. **Meal buffs are a nice mechanic with the wrong ergonomics for an idle game.**
   Dishes last 5–20 minutes (`buffDurationSec` 300–1200) and must be manually eaten
   one at a time, against a 24-hour offline window. The engine already applies buffs
   exactly across offline time — but no one can press "Eat" 96 times overnight. MWI
   solves this with a consumables *loadout* that auto-drinks/eats from a stack while
   the action runs. Idyll needs the same (§5.4). Also, only 2 of 5 dishes are
   cookable from commonly-caught fish; `cook_seafood_platter` needs a `sea_bass` +
   `mahi_mahi` (levels 40/60 zones) but only requires Cooking 45 — inputs and levels
   are loosely aligned.

6. **The economy is a faucet with no drain.** Coin sources: selling anything
   (`sellItem` pays full `value`), plus achievement payouts (up to 2,000 coins each).
   Coin sinks: a shop with exactly **two items** (`worm_bait` @5, `bamboo_rod` @60 —
   and the bamboo rod is obsolete within hours). An Abyss-capable player generates
   ~24,000 coins/hour selling lanternfish (50 coins × ~480 casts/hr) with literally
   nothing to buy. Inflation per se can't hurt a 2-player game with fixed vendor
   prices — the real failure mode is that **coins become meaningless**, which kills
   the reward loop of achievements, orders, and selling. Sinks first, then faucets
   (§7).

7. **Guild progression ends in week one.** `CATCHES_PER_GUILD_LEVEL = 250`,
   `GUILD_MAX_LEVEL = 25` → the shared Guild maxes at 6,250 total catches. Two
   players idling the Pond (~3.5 s/cast → ~24,700 casts/day *each*) hit that in
   **a few hours**. The flagship coop-progression system is effectively a tutorial.
   Needs a scaling curve and more interesting per-level perks (§7).

8. **Missing MWI pillars entirely:** efficiency, enhancement, house/permanent
   upgrades, task board, consumable loadout, any combat-analogue "second pillar."
   Rotating hotspots + achievements are the only recurring "reasons to log in."

9. **Minor code observations while reading** (not blockers, worth a card each):
   - `personalCatchTotal`/achievements count the Old Boot (category `treasure`) as a
     fish catch, and it ticks the Guild counter too (`guildCatches++` runs for any
     successful roll in `processElapsed`).
   - Offline catch-up applies the *current* guild level and the *currently active*
     hotspot to the whole replayed window (`fishParamsAt` calls `guildSpeedBonus()`
     and `getActiveEvent()` live). Both are small, acceptable inexactnesses — but
     worth remembering when events get richer.
   - `sellItem` pays 100% of `value` while the shop sells `worm_bait` at 5 vs.
     `value: 3` — the vendor margin exists but is nearly zero; widen it (§7).

**Verdict:** Idyll v0.5 is a polished *first week* of a game with a superb simulation
core and real coop identity, but it has no mid-game: levels stop mattering, gear
tops out, coins pile up, and the shared Guild finishes early. Everything below is
about installing MWI's compounding-progression skeleton under the cozy skin.

---

## 2. MWI pillar → Idyll mapping

| MWI pillar | Verdict | Fishing-flavored equivalent | Why |
|---|---|---|---|
| Action queue w/ counts | **Have it** | Already shipped (`QueueEntry.target`, queue UI) | Parity; add "queue this order" shortcuts later. |
| Efficiency & speed from levels | **Adopt** (highest priority) | +1% instant-recast chance per level above a zone/action's requirement; small tool/room speed bonuses | This *is* the MWI feel; slots directly into the per-completion loop. §3. |
| Deep equipment + enhancement | **Adapt** | Tackle slots (rod / reel / line / lure) + tools per support skill + rod **enhancement +1…+10** with materials, no harsh failure | Long gear ladder, but cozy: failed enhances lose materials, never the rod or its level. §5.1–5.2. |
| Player-driven marketplace | **Skip the order book; adapt the loop** | (a) Direct gifting + shared coin purse; (b) **Merchant's Dock**: rotating NPC buy-orders at premium prices; (c) real vendor margins + big coin sinks (Boathouse, enhancement) | A bid/ask book needs liquidity two people can't provide; what MWI's market actually *does* for a player — "my surplus becomes someone's demand, and prices give goals" — is replicated by rotating orders and by the partner as the other market participant. §5.5. |
| Consumables loadout | **Adopt** | Food + Drink slots with auto-consume from a stack; dishes rebalanced to 30–90 min; new brewed "teas" from Foraging | The engine already applies buffs per-cast across offline windows; only the auto-refill is missing. §5.4. |
| House / permanent upgrades | **Adapt — make it shared** | **The Boathouse**: shared rooms (Dock, Smokery, Workshop, Bait Garden, Chart Room, Trophy Hall), leveled with coins+materials, bonuses apply to *both* players | Doubles as the main coin/material sink and a genuinely coop project — the two of you build a home. Reuses the `guild` single-row pattern. §5.3. |
| Combat (second pillar) | **Adapt, gently** | **Legendary Expeditions**: prepared, timed idle hunts for named sea monsters; success from gear score + provisions; joint expeditions get a bonus; soft failure ("it got away") | Full HP/ability combat fights the cozy theme; a prep-and-payoff expedition keeps the "second pillar" cadence (gear check, loadout, loot table) without stress. §6. |
| Task board | **Adopt** | **Notice Board**: 3 personal + 1 coop request per day ("the innkeeper wants 12 Sea Bass"), paying coins + Guild Marks | Cheap to build (it's the Merchant's Dock UI), gives daily direction, and coop tasks manufacture "let's do this together" moments. §5.5. |
| Guilds / leaderboards | **Skip external; deepen internal** | Extend the Anglers' Guild curve to ~100 levels with varied perks + shared milestone goals (already on the `DESIGN.md` roadmap) | There is no community beyond the couple; the Guild *is* the guild. §7. |

---

## 3. Efficiency & speed: concrete spec

### 3.1 Efficiency (the centerpiece)

**Rule:** every completion rolls bonus *instant* completions.

```
levelsAbove(p, entry) = skillLevel − levelReq        // zone.levelReq or action.levelReq
efficiency = 0.01 × levelsAbove
           + gearEfficiency          // reel (fishing) or tool (support skills), §5
           + boathouseEfficiency     // Dock/Smokery/Workshop/Garden room, §5.3
           + drinkEfficiency         // active tea buff, §5.4
```

MWI's baseline is exactly +1% per level above the requirement, and values above 100%
give guaranteed extra repeats plus a chance of another — keep both properties.
(*Unsure about MWI's exact stacking order of tool vs. tea efficiency; additive is
fine for us.*)

**Engine change** (in `processElapsed`, immediately after each completion is granted,
both in the `fish` branch and the gather/produce branch):

```ts
let eff = totalEfficiency(p, entry, clock);
while (eff > 0) {
  if (Math.random() < Math.min(1, eff)) grantCompletionRewards(/* consumes NO time */);
  eff -= 1;
}
```

- Bonus completions grant full rewards: the item roll, size roll, XP, guild tick, and
  (for produce) they consume inputs — skip the bonus if inputs are missing.
- Bonus completions increment `entry.done` (so "fish 200" finishes faster — that's
  the MWI feel: queues melt as you outlevel content).
- They consume **zero** sim-time, so the `SIM_GUARD` iteration budget is unaffected.
- Surface it in the client: on each zone/action card, show
  `⚡ 34% efficiency (level 44 vs. req 10)` next to the existing
  `~4s/cast` line, and add efficiency procs to the welcome-back summary
  ("… including 1,204 bonus catches from efficiency").

**Worked examples** (no gear, no rooms):

| Player | Zone (req) | levelsAbove | Efficiency | Avg. output/cast |
|---|---|---|---|---|
| Fishing 12 | Pond (1) | 11 | 11% | 1.11 |
| Fishing 40 | Riverbank (10) | 30 | 30% | 1.30 |
| Fishing 40 | Coral Harbor (40) | 0 | 0% | 1.00 |
| Fishing 75 | Misty Lake (25) | 50 | 50% | 1.50 |
| Fishing 99 + reel 15% + Dock 10% | Harbor (40) | 59 | 84% | 1.84 |

This creates MWI's signature choice: *push the new hard zone for unlocks, or farm an
old zone at high efficiency for volume* — which is exactly what makes old content
stay alive.

### 3.2 Speed from levels — keep it small

Note on the reference: MWI's *primary* level lever is efficiency; flat speed comes
mostly from tools, teas, and community buffs rather than from levels directly (I'm
not certain levels grant any innate speed in MWI). Recommendation: make efficiency
the level lever, and grant only a token innate speed so level-ups still tick the
timer down visibly:

```
levelSpeed = 1 − min(0.15, 0.0025 × levelsAbove)     // −0.25%/level, capped −15%
castMs = zone.baseTimeSec × 1000
       × rodSpeed(rod, plus)        // §5.1
       × levelSpeed
       × (1 − guildSpeedBonus())
       × buffSpeedMult × eventSpeedMult
```

Support-skill actions get the same `levelSpeed` and their tool's speed multiplier in
`currentDurMs`/the produce branch (today they have *no* modifiers at all).

Keep the aggregate speed floor in mind: with Pro Rod +10 (0.49×), guild −25%, level
−15%, sashimi 0.8×, hotspot 0.85× the Pond would hit ~0.9 s/cast. That's fine —
speed compounds multiplicatively but every factor is capped.

### 3.3 Retune the XP pacing (required alongside efficiency)

Efficiency raises XP/hour by ~1.3–1.8× in outleveled zones, which softens but does
not fix the §1.2 wall. Two data-only changes in `gameData.ts` / `leveling.ts`:

1. **Steepen zone `xpMult` to track the curve:** pond 1 → river **2.2** → lake
   **4.5** → harbor **9** → deep_sea **18** → abyss **32** (currently
   1/1.6/2.4/3.4/5/7). With efficiency, this puts Fishing 60 at roughly 8–10 days of
   mixed idle and Fishing 80 at ~5–6 weeks — a good "couple's long game."
2. *Alternative (touch one constant):* soften the curve base `1.104 → 1.075`. This
   also shortens support-skill grinds, but flattens the "levels feel expensive"
   MWI texture. Prefer option 1; revisit support-skill action XP separately (their
   `xp` values were tuned for the current curve and are already generous per hour).

---

## 4. What "deep progression" means here — chosen subsystems

Of MWI's depth systems, build these four (specs in §5): **tackle slots + tools**,
**rod enhancement**, **the Boathouse**, **consumable loadout**. Skip for now:
multi-piece armor-style sets (too much inventory for 2 people), gem/rune sockets
(a second enhancement system is redundant), and player-market infrastructure (§2).

---

## 5. Specs

### 5.1 Tackle slots & tools

Replace `equipped: { rod?: string }` with:

```ts
equipped: {
  rod?:  GearRef;   // speed + rare bonus (existing stats)
  reel?: GearRef;   // NEW: +efficiency
  line?: GearRef;   // NEW: bait saver — % chance a cast doesn't consume bait
  lure?: string;    // NEW: which bait to consume (replaces baitActive auto-best)
  tools?: { foraging?: GearRef; crafting?: GearRef; cooking?: GearRef };
}
type GearRef = { id: string; plus: number };   // plus = enhancement level, §5.2
```

New item stats in `types.ts` (all optional, same pattern as `rodSpeedMult`):
`reelEfficiency`, `lineBaitSave`, `toolSkill`, `toolSpeedMult`, `toolEfficiency`.

Content (data-only, crafted at Tackle Crafting; ~12 new items):

| Slot | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Reel | Wooden Reel — +4% eff (Craft 10) | Brass Reel — +8% (Craft 30) | Pearl Reel — +14% (Craft 50) |
| Line | Kelp Line — 15% bait save (Craft 5) | Silk Line — 30% (Craft 25) | Wire Line — 50% (Craft 45) |
| Foraging tool | Tin Spade — −5% time (Craft 8) | Steel Spade — −10%, +4% eff (Craft 28) | Moon Spade — −15%, +8% eff (Craft 48) |
| Cooking tool | Iron Pan — −5% (Craft 12) | Copper Pot — −10%, +4% eff (Craft 32) | Chef's Set — −15%, +8% eff (Craft 52) |
| Crafting tool | Whittling Kit — −5% (Craft 6) | Toolbench Kit — −10%, +4% eff (Craft 26) | Master's Kit — −15%, +8% eff (Craft 46) |

The `lure` slot replaces the `baitActive` boolean + `bestBait()` auto-pick: the
player equips a specific bait; casts consume 1 unless the line's `baitSave` procs;
the slot empties when the stack runs out (chip in the client, like the buff chip).
This restores player choice (worms for farming, shiny lures for legendary hunts).

### 5.2 Rod enhancement (+1 … +10)

Cozy adaptation of MWI enhancement (MWI uses success chances that fall with level,
enhancement materials, and "protection" items; failures there can drop the item's
enhance level — we keep the cost curve, drop the punishment):

- **Where:** a new "Enhance" action per owned rod on the Crafting tab.
- **Attempt cost:** materials scale with target level; coins too (a sink):
  `attempt(+n): n × driftwood, n × fishing_line, ceil(n/3) × pearl, 25 × n² coins`.
- **Success chance:** `+1…+10 = 90, 80, 70, 60, 50, 45, 40, 35, 30, 25 %`.
- **Failure:** materials and coins are lost; the rod is untouched. No downgrades,
  no destruction — the cozy contract.
- **Protection analogue:** *Blessed Lacquer* (craft: 1 pearl + 2 kelp, Craft 40, or
  buy with Guild Marks §5.5) — consume one to add +15 pp success to an attempt.
- **Effect per plus:** `rodSpeedMult × 0.98^plus`, `rodRareBonus + 0.01 × plus`.
  Pro Rod +10: 0.60 → **0.49** speed, 0.20 → **0.30** rare. Expected total cost of
  +10 ≈ 690 driftwood-equivalents and ~31k coins across ~23 expected attempts —
  a real mid-game project that finally gives Foraging/Crafting a continuing purpose.
- **Data model note (important for the implementer):** enhanced items must not be
  plain `inventory` counts. Keep unenhanced gear stackable in `inventory`; on first
  enhance (or on equip), move the item into a small per-character `gear` list
  `[{ id, plus }]` stored in a new `gear_json` column, and reference it via
  `GearRef`. Migration: existing `equipped.rod` string → `{ id, plus: 0 }` in
  `normalizeAction`-style backfill (`loadPlayer`).

Reels/lines/tools become enhanceable later with the same machinery; start with rods.

### 5.3 The Boathouse (shared house — MWI "house rooms," coop-ified)

One shared structure, one DB row (exactly the `guild`/`bank` single-row pattern:
`boathouse` table, `rooms_json`). Either player can contribute; bonuses apply to
both; the contribution log feeds chat ("Ana added 40 driftwood to the Smokery!").

| Room | Bonus per level (max 5) | Level 1 cost (scales ×2.2/level) |
|---|---|---|
| **Dock** | +2% fishing efficiency | 500c + 30 driftwood + 10 line |
| **Smokery** | +2% cooking efficiency; L3 unlocks Smoked dishes (longer buffs) | 500c + 25 driftwood + 15 kelp |
| **Workshop** | +2% crafting efficiency; +1 pp enhancement success | 500c + 20 driftwood + 10 hooks |
| **Bait Garden** | passive bait: 4×level worms + 1×level grubs per hour into the Bank (cap 12 h) | 400c + 20 worms + 10 grubs |
| **Chart Room** | hotspots +30 s duration and +2% rare per level | 800c + 5 seashells + 1 pearl |
| **Trophy Hall** | +0.5% global rare bonus; displays both players' record catches | 1,000c + 2 pearls |

- Total sink: ~90k coins + large material piles for max-everything — months of the
  §1.6 faucet, finally spent.
- Bait Garden delivers the roadmap's "nets/traps — passive gathering" in shared form.
- Trophy Hall absorbs the roadmap's "Aquarium / trophy room" item.
- Engine hooks: Dock/Smokery/Workshop feed `boathouseEfficiency` (§3.1); Chart Room
  modifies `rollEvent()` in `events.ts`; Bait Garden is a tiny `setInterval` deposit
  into the existing Bank.

### 5.4 Consumable loadout (food + drink, auto-consume)

- `loadout: { food?: string; drink?: string }` on `PlayerState`; "Set as provision"
  button on dishes replaces the bare "Eat" (keep Eat for one-offs).
- **Engine:** in the sim loop, whenever `clock ≥ buff.expiresAt` and
  `inventory[loadout.food] > 0`, consume one and start the next buff *at the exact
  expiry clock* — the existing per-cast `fishParamsAt(clock)` machinery then applies
  it perfectly across offline windows. Same for a parallel `drinkBuff`.
- **Rebalance dish durations for idle:** 300/480/720/900/1200 s →
  **1800/2700/3600/4500/5400 s** (30–90 min), same stats. A stack of 20 platters now
  covers a night, and Cooking gains a *recurring* demand loop (MWI's food economy in
  miniature: partner A fishes tuna, partner B cooks steaks for both — that's the
  2-player market working).
- **Drinks (new, Foraging/Cooking content):** Kelp Tea (+5% efficiency, 30 min,
  Cook 10, 2 kelp), Pearlgrass Tonic (+10% efficiency, 45 min, Cook 35),
  Anglers' Coffee (+8% XP, 60 min, Cook 50). Drinks carry the efficiency/XP buffs;
  food keeps speed/rare — mirroring MWI's food/drink split.

### 5.5 The 2-player economy: gifting, Merchant's Dock, Notice Board

What MWI's marketplace gives a player: (1) surplus → money, (2) money → things you
need, (3) prices → goals. For two people:

1. **Shared coin purse + direct gifting** (already a `DESIGN.md` near-term item).
   Recommendation: keep *personal* coins (individual reward feel) and add a shared
   purse that Boathouse construction draws from; gifting = the existing Bank plus a
   "send to partner" shortcut with a chat notification.
2. **Merchant's Dock (rotating buy-orders).** Every 24 h (seeded server-side), 3
   orders per player + 1 **coop order**, e.g. "Innkeeper wants 12× Sea Bass —
   1.8× value + 2 Guild Marks", coop: "Festival! Deliver 40× trout, any mix, both
   contribute — 6 Guild Marks each." Premium multiplier 1.5–2.0× on *rotating*
   species is demand direction: it makes yesterday's trash fish today's target and
   answers "what should we fish tonight?"
3. **Guild Marks** — earned only from orders/coop tasks; spent on: Blessed Lacquer,
   cosmetic Boathouse decor, title unlocks. A parallel currency keeps task rewards
   meaningful even when coins inflate.
4. **Vendor margins:** shop buy price = ~4× sell `value` for consumables; expand the
   shop to stock tier-1 tools, lines, and dish ingredients so coins always have a
   floor use.

This is the Notice Board (MWI task board) and the market replacement in one feature;
build them as one system (`orders` table + a panel).

---

## 6. The combat pillar: Legendary Expeditions

**Does big-game combat fit cozy?** Ability-rotation HP combat: no — it imports
stress, build anxiety, and failure spirals. But the *structure* combat gives MWI —
a second pillar that consumes production output (food/drinks/gear) and returns
unique loot — fits beautifully as **expeditions**:

- **Setup:** the Collection gains a "Legends" row per zone (Lake Leviathan, Kraken
  Hatchling's mother "The Deep Kraken", the Abyssal Serpent…). An expedition is a
  special queue entry (`type: "expedition"`) taking a fixed 45–90 min of sim-time.
- **Preparation, not reflexes:** launch cost = provisions (e.g. 3 dishes + 1 special
  tackle item like a "Leviathan Hook", new Craft 50 recipe) and a cooldown (1 per
  player per day). Success chance is transparent:
  `base 35% + gearScore (rod tier & plus, up to +30%) + provisions quality (up to
  +15%) + partner bonus (+15% if both run it within the same hour) + Trophy Hall %`.
- **Resolution:** at completion, roll. **Success:** the legend joins the bestiary
  with a size roll, drops a unique material (Leviathan Scale → best-in-slot rod
  recipe; Kraken Ink → premium bait), big XP, Trophy Hall display. **Failure is
  soft:** "It got away… but it took the bait — +10% success next attempt" (stacking
  pity), and half the provisions are refunded. No damage, no death, no gear loss.
- **Why it works:** it's a gear check (gives enhancement a *purpose*), a production
  sink (dishes/tackle), a coop moment (the partner-hour bonus manufactures "let's
  both launch tonight"), and a drip of chase-content — MWI's combat loop with the
  anxiety removed. The engine's queue + sim-time model already supports a
  fixed-duration entry with an end-roll.

If even this feels un-cozy in playtesting, the fallback replacement for the pillar
is doubling down on Collection depth: shiny/variant fish (1-in-500 recolors logged
separately) + weather/time-of-day exclusives (already on the roadmap) as the
long-tail chase system. Expeditions are recommended first.

---

## 7. Balance & economy notes

- **Guild curve:** replace `floor(total/250), cap 25` with a growing curve:
  `needed(level) = 200 × 1.15^level`, cap 60 (~cumulative 4.4M catches — a genuine
  multi-month shared bar). Diversify perks by level band: levels 1–20 → +0.5%/lvl
  cast speed (keeps current cap ~+10%… tune), then alternate +0.5% rare, +1%
  efficiency, +1 order slot at fixed milestones. Keep rank titles; add the roadmap's
  shared milestone goals ("100 legendaries together") paying Guild Marks.
- **Efficiency + speed stacking risk:** the product of all speed multipliers must be
  floored (recommend min 0.35× of base) and efficiency displayed uncapped but
  designed to reach ~100% only for max-outleveled content with full gear/rooms/tea.
  Watch the Pond: at end-game (~1 s casts, ~2× efficiency) it's ~7k catches/hour —
  fine for bait farming, but any *order* asking for pond fish must pay by value, not
  count.
- **Coin flow after the plan:** faucets = sales (+orders premium); sinks =
  enhancement attempts (25n² coins), Boathouse (~90k total), shop tools/ingredients,
  expedition tackle. Two players at Harbor-era income (~8–12k/hr idle) should take
  4–8 weeks to "finish" sinks — acceptable; add cosmetic decor sinks for the tail.
- **Offline cap interaction:** auto-consumed provisions make 24 h offline much
  stronger; that's intended (it converts Cooking output into fishing throughput).
  If it feels too strong, cap auto-consumption at 8 buffs per offline window rather
  than lowering `OFFLINE_CAP_HOURS`.
- **Treasure ≠ fish:** exclude `category: "treasure"` from guild ticks, catch-total
  achievements, and efficiency procs' bestiary side (`old_boot` currently counts).
- **Two-player griefing/imbalance is a non-issue** (it's a couple), but *pace
  divergence* isn't: if one partner plays 5× more, shared systems (Guild, Boathouse)
  still feel fair because contributions pool, while personal levels diverge. The
  coop order ("both contribute") is the mechanism that keeps the lighter player
  relevant — don't gate coop orders on high-level zones.
- **SQLite/perf:** efficiency multiplies completions, not loop iterations — the
  `SIM_GUARD = 500000` budget and per-tick `savePlayer` JSON writes are unaffected.
  The biggest state growth is the `gear` list and `orders` table; both are tiny.

---

## 8. Phased roadmap

Effort scale: **S** ≈ an evening or two, **M** ≈ a weekend, **L** ≈ 2+ weekends.
Ordering favors "make existing play feel better" before new surfaces.

### Phase 1 — Levels Matter (the MWI core) — ~2 weekends total
1. **Efficiency system** (§3.1) — engine loop change + card/summary UI. **M**
2. **Level speed factor + support-skill speed hooks** (§3.2). **S**
3. **XP retune**: zone `xpMult` restep (§3.3), guild curve replacement (§7). **S**
4. **Lure slot** replacing `baitActive`/`bestBait` auto-pick (§5.1 partial). **S**
5. **Consumable loadout + dish duration retune** (§5.4, food slot first). **M**

*Absorbs from `DESIGN.md`: nothing removed; this is the new foundation everything
else multiplies against.*

### Phase 2 — Gear & Home — ~3-4 weekends
6. **Tackle slots + tools content** (§5.1: reel, line, 3 tools, ~12 items). **M**
7. **Rod enhancement** (+gear instance storage & migration, §5.2). **L**
8. **The Boathouse** (§5.3; includes Bait Garden = roadmap "nets/traps", Trophy
   Hall = roadmap "aquarium"). **L**
9. **Shared purse + gifting** (existing roadmap item; purse funds Boathouse). **S**
10. **Shop expansion + vendor margins** (§5.5.4). **S**

*Replaces roadmap's "Tackle depth" and "A tiny market" line items.*

### Phase 3 — The Harbor Life (reasons to come back) — ~3 weekends
11. **Merchant's Dock + Notice Board** (orders, coop orders, Guild Marks, §5.5). **M**
12. **Legendary Expeditions** (§6). **L**
13. **Drinks/tea line + Smoked dishes** (content for Smokery, §5.4). **S**
14. **Guild shared milestones** (existing roadmap item, pays Guild Marks). **S**

### Phase 4 — Long tail (existing roadmap, unchanged order)
Weather & time-of-day exclusives → shiny variants → prestige ("Master Angler"
rebirth — design it to grant *account* efficiency so it compounds with Phase 1) →
art pass / sound / notifications / mobile polish.

---

## 9. Summary of number changes to existing values

| Where | Current | Proposed |
|---|---|---|
| `leveling.ts` curve | keep `1.104` | keep (retune via xpMult instead) |
| `gameData.ts` zone `xpMult` | 1 / 1.6 / 2.4 / 3.4 / 5 / 7 | 1 / 2.2 / 4.5 / 9 / 18 / 32 |
| `engine.ts` guild | `floor(total/250)`, cap 25, +1%/lvl speed | `200×1.15^lvl` per level, cap 60, banded perks (§7) |
| Dish `buffDurationSec` | 300–1200 s | 1800–5400 s |
| Shop | 2 items, ~0–66% margin | ~10 items, ~4× sell-value pricing |
| `baitActive` + `bestBait()` | auto-best toggle | equipped `lure` slot |
| Rod stats | fixed | ×0.98^plus speed, +0.01×plus rare via enhancement |
| Guild/achievement catch counting | includes treasure | fish category only |

---

*Prepared 2026-08-24 against Idyll v0.5 (`main`). All proposals preserve the three
non-negotiables: idle-exact simulation, data-driven content, and the couple-first
cozy tone.*
