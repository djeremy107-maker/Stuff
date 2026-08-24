# 🎣 Idyll — a coop fishing game

A cozy, two-player idle **fishing** game with shared incremental progression.
Cast a line, walk away, and come back to a bag full of fish — your partner can be
fishing from anywhere. Chase rare catches, fill your collection, craft better
rods, and level up a shared **Anglers' Guild** together.

Built for two people (you + your girlfriend), and designed to keep growing.

## What's in it (v0.4)

- **6 fishing zones** — Backyard Pond → Riverbank → Misty Lake → Coral Harbor →
  Deep Sea → Abyssal Trench, each unlocking with your Fishing level.
- **30+ fish species** across 5 rarities (common → legendary), each with a random
  **size** — so there's always a personal-best to beat.
- **A Collection / bestiary** logging every species you've caught and your record
  size for each.
- **True idle progress** — your line keeps fishing even with the browser closed.
  Log back in and your catch is waiting (capped at 24h by default).
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
  auth.ts         # register / login / sessions
  db.ts           # SQLite schema (+ shared guild table)
  server.ts       # Express REST + WebSocket + tick loop
public/           # the browser client (no build step)
```

Adding content is mostly editing `src/content/gameData.ts` — new fish, zones,
rods, bait, and dishes are just data.

See [DESIGN.md](./DESIGN.md) for how it all fits together and the roadmap.
