# 🎣 Idyll — a coop fishing game

A cozy, two-player idle **fishing** game with shared incremental progression.
Cast a line, walk away, and come back to a bag full of fish — your partner can be
fishing from anywhere. Chase rare catches, fill your collection, craft better
rods, and level up a shared **Anglers' Guild** together.

Built for two people (you + your girlfriend), and designed to keep growing.

## What's in it (v1.6)

- **6 fishing zones** — Backyard Pond → Riverbank → Misty Lake → Coral Harbor →
  Deep Sea → Abyssal Trench, each unlocking with your Fishing level.
- **30+ fish species** across 5 rarities (common → legendary), each with a random
  **size** — so there's always a personal-best to beat.
- **A Collection / bestiary** logging every species you've caught and your record
  size for each.
- **True idle progress** — your line keeps fishing even with the browser closed.
  Log back in and your catch is waiting (capped at 24h by default).
- **Action queue** — line up a run of tasks with target counts ("fish 200, then
  make 50 bait, then cook 30 meals") and they execute in order, hands-free,
  even while you're offline.
- **Levels that matter** — every level above an action's requirement grants
  **efficiency** (a chance for free instant extra output) plus a small speed
  boost, so leveling up visibly improves whatever you're doing and keeps old
  zones worth farming.
- **Provisions (Food & Drink loadout)** — set a dish as your Food and a brewed
  drink as your Drink, and they auto-consume from your stack while you play —
  no more manually re-eating every few minutes. Food boosts fishing speed/rare
  chance; drinks (Kelp Tea, Pearlgrass Tonic, Angler's Coffee) boost efficiency
  or XP for whatever skill you're working. Keeps working exactly across
  offline time.
- **Lure slot** — equip a specific bait instead of auto-burning your best one,
  so you can save shiny lures for when they matter.
- **Celebrations & broadcasts** — level-up fanfare (confetti + a banner,
  bigger at milestones like 10/25/50/99), a distinct fanfare for epic/legendary
  catches and shared Guild level-ups, and every notable moment posts to chat
  so your partner sees it even if they were offline when it happened. Based on
  research into what makes idle games (Melvor, Milky Way Idle) and OSRS's
  "number go up" loop so compelling — see `docs/RESEARCH_ENGAGEMENT.md`.
- **Tackle slots** — a reel (+efficiency), a line (chance to save your lure),
  and a tool for each trade skill (Foraging/Cooking/Tackle Crafting), each in
  three tiers you craft yourself.
- **Rod enhancement** — spend materials and coins to push a rod to +1…+10 for
  more speed and rare chance. Cozy rules: a failed attempt only costs the
  materials, never the rod. Craft *Blessed Lacquer* for a better shot.
- **The Boathouse** 🏠 — a shared home you build together: six rooms (Dock,
  Smokery, Workshop, Bait Garden, Chart Room, Trophy Hall) that boost
  efficiency, rare chance, enhancement odds, and hotspot events, funded by a
  **shared coin purse** and the shared Bank — so it's a genuine joint project.
  The Bait Garden passively grows worms & grubs into the Bank even while
  you're both offline; the Trophy Hall tracks record catches for each species,
  shown right on the Collection page (with a chat shout-out when a record
  falls).
- **A bigger shop** — sells materials, bait, and tier-1 gear at fair prices,
  so coins always have something to do.
- **The Merchant's Dock** 📋 — a daily-rotating notice board of buy-orders at
  premium prices (1.5–2× value), a reason to pick "tonight's target." Three
  regular orders plus a bigger **Coop Order** either (or both) of you can
  chip in on. Completing one pays **Guild Marks**.
- **Guild Marks** 🎖️ — a shared currency earned from Dock orders and new
  **shared Guild milestones** (catches together, legendary catches together,
  Guild level), spendable on Blessed Lacquer via a dedicated Guild Marks shop.
- **Supporting trade skills**: **Foraging** (bait & materials), **Tackle
  Crafting** (bait, hooks, line, and better **rods**), **Cooking** (turn fish
  into valuable dishes).
- **Rods & bait** — craft or buy rods that fish faster and improve your rare
  chance; toggle bait on to hunt for the good stuff.
- **Meal buffs** — cook your catch into dishes and *eat* them for a timed boost
  to cast speed and rare chance (or just sell them). The buff ticks down live and
  even applies correctly to offline progress.
- **Shared Bank** 🏦 — a stash you both use. Deposit fish and materials so either
  of you can grab them, updated live for both of you no matter who's online.
- **Economy** — sell your catch for coins, buy essentials from the shop.
- **Shared Anglers' Guild** 🏛️ — every fish *either* of you catches levels up a
  shared Guild (with a fun rank title), which makes casts faster for *both* of
  you. Genuine coop incremental progression.
- **Live hotspot events** 🔥 — every few minutes a random zone lights up with
  boosted rare chance and faster casts for a few minutes, announced to both of
  you — a shared "let's go fish there!" moment.
- **Achievements** 🏆 — goals to chase (discover species, hit level milestones,
  land your first legendary) that pay out coins.
- **"While you were away" recap** — reconnect after idling to a friendly summary
  of everything your line caught offline.
- **Live coop** — a party panel shows what your partner is doing and their
  progress; shared chat.
- **Accounts** with saved characters (SQLite), playable from anywhere.
- **Sound & notifications** ⚙️ — procedural sound effects (catches, level-ups,
  achievements, guild moments, errors — no audio files, just Web Audio tones)
  and opt-in browser notifications for your partner's big moments while the
  tab is in the background. Toggle both from the new settings button next to
  Log out; preferences persist locally per device.
- **Shared celebrations** — Guild level-ups and Guild milestones now broadcast
  to *both* players the instant they happen, so you see the exact same fanfare
  at the same moment — even if you weren't the one fishing.
- **A finishing coat** — a subtle drifting-bubble ambiance on the login screen,
  a pulsing glow on epic/legendary catches in your Collection and Inventory,
  and a shimmer sweep on the active-action progress bar.
- **Shiny catches** 💫 — any fish has a ~1-in-450 chance to bite as a shiny
  variant: same species, far rarer, worth ~15× as much, with its own glowing
  entry in your Collection. A shiny still fills in the regular species' entry
  too — no "not yet discovered" for a fish you've only ever caught shiny.
- **A living sky** 🌅 — a shared clock (visible in the topbar) cycles through
  dawn/day/dusk/night and clear/rain/storm/fog for both of you at once. A
  handful of species only bite under the right sky — Storm Runner in a
  Riverbank storm, Moonlit Koi on the Lake at night, Sunrise Snapper at dawn
  in the Harbor, Fogbound Ray in a Deep Sea fog, and the Void Wraith in the
  Abyss only when it's a stormy night. Zone cards show which of tonight's
  catches are actually biting right now.
- **A firsts board** 🥇 — whoever lands a shiny or a weather/time exclusive
  first gets permanent credit on the Collection page, right next to the
  Trophy Hall's biggest-size record — a second flex axis alongside size.
- **Titles** 🎖️ — select achievements (species discovery, catch totals,
  rarity milestones, and a level-99 mastery achievement for each skill) grant
  an equippable title worn next to your name in the topbar and your
  partner's party list — pure bragging rights, no stat effect.
- **Total-level frames** — your name gets a glowing bronze/silver/gold/
  diamond treatment as your four skills' combined total level climbs toward
  the 396 cap, visible to your partner live in the party list.
- **Prestige — the Master Angler rebirth** 🌟 — once all four skills hit
  level 99, rebirth: every skill resets to level 1, and in exchange you keep
  a permanent +3%/prestige efficiency bonus, stacking with every future
  rebirth. Nothing else resets — coins, gear, achievements, titles, your
  Collection, and every shared system (Guild, Boathouse, Bank) are
  completely untouched. A prestige is a witnessed moment: both of you see
  the same fanfare the instant it happens, and your star count shows next
  to your name everywhere.
- **Legendary luck (bad-luck protection)** 🍀 — the three zones with a
  legendary fish (Misty Lake, Deep Sea, Abyssal Trench) track your streak
  since the last one. The longer it's been, the better the odds get, and
  it's outright guaranteed by cast 1,500 — shown right on the zone card as
  a real, honest progress bar, not a hidden mechanic.
- **Zone Mastery** 🎓 — a second, independent 1–50 progression track per
  zone, fed only by catches made there (separate from the shared Fishing
  level). Higher mastery grants a small permanent rare-chance boost and
  faster casts in that specific zone — a reason to settle into a favorite
  spot beyond just chasing the next skill level.

## Run it locally

```bash
npm install
npm start
# open http://localhost:3000  (register two anglers, or use a second browser)
```

Dev mode with auto-reload: `npm run dev`.

### Environment variables

| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP/WebSocket port |
| `DB_PATH` | `./data/game.sqlite` | SQLite file location |
| `OFFLINE_CAP_HOURS` | `24` | Max hours of offline progress banked per session |

## Playing across networks

The whole game is one Node server (HTTP + WebSocket + SQLite), so you just need
to host it somewhere you can both reach:

- **Fly.io** — `fly launch` uses the included `Dockerfile` and `fly.toml`. Add a
  volume so your save persists: `fly volumes create idyll_data --size 1`.
- **Render** — a `render.yaml` Blueprint is included. In Render: **New →
  Blueprint** → pick this repo → **Apply**. It's a **Web Service** (Node), build
  `npm install`, start `npm start`, with a persistent disk mounted at `/var/data`
  so your save survives deploys. (Saves need a paid Starter instance for the
  disk; see the comments in `render.yaml` for a free-but-resets option.)
- **A home server / Raspberry Pi** + a tunnel (Tailscale, Cloudflare Tunnel, or
  port-forwarding). You both hit the same URL.

Progress runs server-side, so the world keeps ticking no matter who's online.

## Project layout

```
src/
  content/
    types.ts      # content type definitions
    gameData.ts   # all fish, zones, rods, bait, recipes, shop (edit me to add content!)
  leveling.ts     # XP curve
  engine.ts       # offline progress, catch rolls, bestiary, guild, economy
  world.ts        # the shared time-of-day/weather clock (pure function of real time)
  firsts.ts       # firsts board (first-ever shiny/exclusive catch per species)
  auth.ts         # register / login / sessions
  db.ts           # SQLite schema (+ shared guild table)
  server.ts       # Express REST + WebSocket + tick loop
public/           # the browser client (no build step)
```

Adding content is mostly editing `src/content/gameData.ts` — new fish, zones,
rods, bait, and dishes are just data.

See [DESIGN.md](./DESIGN.md) for how it all fits together and the roadmap.
