# 🎣 Idyll — a coop idle RPG

A cozy, two-player incremental/idle RPG inspired by Milkyway Idle. Queue up a
skill, walk away, and come back to your loot — your partner can be playing from
anywhere. Trade skills (fishing, woodcutting, mining, foraging, cooking,
smithing, crafting) sit alongside combat, and you can see what each other is up
to in real time and chat while you grind.

Built for two people (you + your girlfriend), but it'll grow.

## Features so far (v0.1)

- **8 skills**: Fishing 🎣, Woodcutting 🪓, Mining ⛏️, Foraging 🌿, Cooking 🍳,
  Smithing 🔨, Crafting 🧵, Combat ⚔️.
- **True idle progress** — your active action keeps running even when your
  browser is closed. Log back in and your loot is waiting (capped at 24h by
  default).
- **Production chains** — mine ore → smelt bars → forge gear; fish → cook food
  that heals you in combat.
- **Combat** with monsters, auto-eating food, HP, loot tables, and coins.
- **Coop presence** — a live party panel shows what your partner is doing, their
  levels, and HP.
- **Shared chat.**
- **Accounts** with saved characters (SQLite), playable from anywhere over the
  internet.

## Run it locally

```bash
npm install
npm start
# open http://localhost:3000  (register two accounts, or open a second browser)
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
to host it somewhere you can both reach. Easiest options:

- **Fly.io** — `fly launch` uses the included `Dockerfile` and `fly.toml`. Add a
  volume so your save persists: `fly volumes create idyll_data --size 1`.
- **Render / Railway** — point it at this repo, build `npm install`, start
  `npm start`, and set a persistent disk mounted where `DB_PATH` points.
- **A little home server / Raspberry Pi** + a tunnel (Tailscale, Cloudflare
  Tunnel, or port-forwarding). Both of you hit the same URL.

Because progress runs server-side, it doesn't matter who is online — the world
keeps ticking.

## Project layout

```
src/
  content/        # data-driven game content
    types.ts      #   content type definitions
    gameData.ts   #   all skills, items, actions, monsters (edit me to add content!)
  leveling.ts     # XP curve
  engine.ts       # offline progress, XP, loot, combat simulation
  auth.ts         # register / login / sessions
  db.ts           # SQLite schema
  server.ts       # Express REST + WebSocket + tick loop
public/           # the browser client (no build step)
  index.html, style.css, app.js
```

Adding content is mostly editing `src/content/gameData.ts` — new fish, trees,
recipes, and monsters are just data.

See [DESIGN.md](./DESIGN.md) for the roadmap and how the systems fit together.
