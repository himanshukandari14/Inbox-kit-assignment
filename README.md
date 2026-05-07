# Inbox Kit — shared territory grid

A **real-time multiplayer** board: **1,008 tiles** (36×28). Open the app, **click tiles to capture** them. A **Node.js** server holds game state; the **Next.js** client connects over **WebSockets** so updates appear for everyone at once.

## Repository layout

```
├── backend/          # Plain JavaScript (Node + ws)
│   └── src/
│       ├── server.js   # HTTP + WebSocket /ws
│       ├── game.js     # Grid, users, slugs, cooldowns
│       └── protocol.js # Grid size + cooldown constant
├── client/           # Next.js app (React, Tailwind)
│   ├── app/
│   ├── components/
│   └── hooks/        # WebSocket hook
└── README.md
```

## Prerequisites

- **Node.js** 18+ (`node --watch` is used for backend dev)
- **npm** (backend) and **pnpm** or **npm** (client)

## Quick start

Run **both** processes.

**1. Backend** — `http://localhost:4000`, WebSocket **`ws://localhost:4000/ws`**

```bash
cd backend
npm install
npm run dev
```

**2. Client** — `http://localhost:3000`

```bash
cd client
pnpm install
pnpm dev
```

### Environment (optional)

If the API is not on the same host/port, set in **`client/.env.local`**:

```bash
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:4000/ws
```

Backend port: **`PORT`** (default `4000`).

## Scripts

| Location  | Command        | Purpose                |
|-----------|----------------|------------------------|
| `backend` | `npm run dev`  | `node --watch src/server.js` |
| `backend` | `npm start`    | `node src/server.js`   |
| `client`  | `pnpm dev`     | Next.js dev            |
| `client`  | `pnpm build`   | Production build       |

## How it works

- **Real-time:** `ws` + small JSON messages (`welcome`, `patch`, `meta`, `sync`, `presence`, `error`).
- **State:** In-memory on the server; captures are validated there (bounds, cooldown, own-tile reject).
- **New players:** Random **kebab-case slug** via [`random-word-slugs`](https://www.npmjs.com/package/random-word-slugs), plus a **unique territory color** (HSL + golden-angle spacing so active players don’t share a hue).
- **Disconnect:** That player is removed and their tiles cleared; others get a **`sync`**.

### Client

- Grid **scales to fit** the map panel when you resize the window.
- Leaderboard and online count; brief error line for invalid captures.

## Production

- Run the backend with a real **`PORT`** and **`wss://`** in front if you use HTTPS.
- Point **`NEXT_PUBLIC_WS_URL`** at that WebSocket URL from the deployed client.
