# Idyll — Design & Roadmap

A living design doc for our coop idle RPG. Inspired by Milkyway Idle in *feel*
(queue an action, idle, level trade skills + combat, shared economy) but its own
world and systems.

## Design pillars

1. **Idle-first & fair.** Progress happens server-side whether or not you're
   watching. No punishing "you must click" loops. Offline is capped only so it
   stays balanced (default 24h).
2. **Genuinely coop.** Two players should *feel* together: shared chat, live
   presence, and — soon — a shared bank, party combat, and a marketplace between
   just the two of you.
3. **Trade skills matter as much as combat.** Gathering → processing → crafting
   → gear/consumables that feed back into combat and into each other.
4. **Data-driven content.** New fish, trees, ores, recipes, and monsters are
   data in `src/content/gameData.ts`, not new code. Easy to keep fleshing out.

## Current architecture

- **Server** (`src/server.ts`): single Node process. Express serves the REST API
  (auth, game content) and the static client; `ws` provides a WebSocket channel
  for live state, presence, and chat. A 1-second tick advances every online
  player and broadcasts presence.
- **Engine** (`src/engine.ts`): the source of truth. `processElapsed` computes
  what happened since a player was last advanced — gathering/production
  completions (bulk math), or combat (kill-by-kill simulation with auto-eat).
  This same function handles both the per-second tick and offline catch-up.
- **Persistence** (`src/db.ts`): SQLite. `characters` stores coins, HP, a
  `skills` XP map, an `inventory` map, and the current `action` (type + refId +
  the timestamp its current cycle started). Offline progress falls out of that
  timestamp for free.
- **Leveling** (`src/leveling.ts`): a cumulative XP table, 1–99.
- **Client** (`public/`): no build step. Vanilla ES modules render skill panels,
  inventory, the action banner (smoothly animated locally between server ticks),
  the party panel, and chat.

### The action model

A character has at most one active action: `{ type, refId, startedAt }`.

- `startedAt` is when the *current in-progress cycle* began.
- On each advance we compute `completions = floor((now - startedAt) / duration)`,
  grant rewards, and roll `startedAt` forward by the whole completions (keeping
  the partial remainder). Offline time beyond the cap is discarded cleanly.
- Production actions are additionally limited by available inputs; running out
  stops the action.
- Combat is simulated kill-by-kill so HP, damage, and auto-eating food behave
  correctly.

## Roadmap

### Near term (make it richer for two players)
- [ ] **Action queue** — line up multiple actions (MWI-style) instead of one.
- [ ] **Shared bank / trading** — deposit into a shared stash, or send items to
      your partner.
- [ ] **Equipment & tools** — equip the gear you smith/craft; better tools =
      faster gathering, better weapons/armor = combat power. (Items already have
      an `equipment` category as a hook.)
- [ ] **Gathering/skill bonuses** — tool tiers, small level-based speed/yield
      bonuses, rare drops.
- [ ] **More content tiers** across every skill (higher fish, trees, ores, etc.).

### Mid term
- [ ] **Party combat / dungeons** — fight tougher monsters together, shared loot.
- [ ] **A tiny marketplace** between the two of you (post buy/sell orders).
- [ ] **Consumables & potions** (foraging → alchemy) with combat buffs.
- [ ] **Quests / achievements / milestones.**
- [ ] **Enhancing/upgrading gear** (sink for materials).

### Later / polish
- [ ] Prestige or ascension layer for long-term idle depth.
- [ ] Better art pass (sprites instead of emoji), sound.
- [ ] Push notifications when your action finishes / inventory is full.
- [ ] Mobile-friendly layout refinements.

## Balancing notes (initial, tune freely)

- XP curve: `delta(level) = floor((level-1) * 100 * 1.104^(level-2))`, cumulative.
  Early levels are quick; ~level 50 is a meaningful grind.
- Action durations: 3–8s, scaling with tier. Combat kill time scales down 2% per
  combat level above the monster's requirement (floored at 40%).
- Food heals scale with fish tier; max HP = `20 + (combatLevel-1)*2`.

Everything above lives in `src/content/gameData.ts` and the constants at the top
of `engine.ts`/`leveling.ts` — tweak and reload.
