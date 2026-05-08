# Inbox Kit — shared territory grid

A **real-time multiplayer** board: **1,008 tiles** (36×28). Open the app, **click tiles to capture** them. **Convex** stores the grid and player roster; the **Next.js** client subscribes with reactive queries so everyone sees the same state.

## Repository layout

```
├── client/                 # Next.js app + Convex backend (same package)
│   ├── app/
│   ├── components/
│   ├── convex/             # schema, territory queries/mutations, crons
│   ├── hooks/              # useGridConvex (Convex react hooks)
│   └── package.json
└── README.md
```

## Prerequisites

- **Node.js** 18+
- **pnpm** (or npm) for the client

## Quick start

**1. Convex** — from `client/`, start the dev deployment (creates/updates `.env.local` with `NEXT_PUBLIC_CONVEX_URL`):

```bash
cd client
pnpm install
pnpm exec convex dev
```

Leave that process running (or run it again before you develop).

**2. Client** — in another terminal:

```bash
cd client
pnpm dev
```

Open **http://localhost:3000**.

### Environment

- **`NEXT_PUBLIC_CONVEX_URL`** — set automatically by `pnpm exec convex dev` in `.env.local`. For production, use the URL from your Convex dashboard. See `client/.env.local.example`.

## Scripts (client)

| Command           | Purpose                    |
|-------------------|----------------------------|
| `pnpm dev`        | Next.js dev server         |
| `pnpm build`      | Production build           |
| `pnpm exec convex dev` | Convex dev + codegen  |

## How it works

- **Realtime:** Convex queries (`getSnapshot`) subscriptions; captures use mutations and update the board for all subscribers.
- **State:** One `board` document (singleton) with a `cells` array matching **GRID_WIDTH × GRID_HEIGHT**; `players` rows hold name, color, cooldown, and **heartbeat** `lastSeenAt`.
- **New players:** Random kebab **slug** via [`random-word-slugs`](https://www.npmjs.com/package/random-word-slugs), plus a **unique territory color** (HSL + golden-angle spacing).
- **Stale sessions:** A cron clears players who stop heartbeating (~2 minutes without `pulse`), and frees their tiles.
- **Identity:** An **opaque Convex `players` id** is stored in `localStorage` and passed into mutations (demo-level trust model, same spirit as the old per-socket UUID).

### Client

- Grid **fits the viewport** when you resize.
- Leaderboard and approximate **online** count (players with a recent heartbeat).
- Brief inline errors for invalid captures (cooldown, own tile, bounds).

## Production

1. `pnpm exec convex deploy` for the backend (from `client/`).
2. Set **`NEXT_PUBLIC_CONVEX_URL`** on your Next.js host to the deployed Convex URL.
