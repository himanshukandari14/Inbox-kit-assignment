import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { GameState } from "./game.js";
import {
  CAPTURE_COOLDOWN_MS,
  GRID_HEIGHT,
  GRID_WIDTH,
} from "./protocol.js";

const PORT = Number(process.env.PORT ?? 4000);
const game = new GameState();

function createLimiter(maxPerSecond) {
  let tokens = maxPerSecond;
  let last = Date.now();
  return () => {
    const now = Date.now();
    const elapsed = (now - last) / 1000;
    last = now;
    tokens = Math.min(maxPerSecond, tokens + elapsed * maxPerSecond);
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseClientMessage(data) {
  const raw =
    typeof data === "string"
      ? data
      : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : null;
  if (!raw) return null;
  const v = safeJsonParse(raw);
  if (!v || typeof v !== "object") return null;
  if (v.type === "rename" && typeof v.name === "string") {
    return { type: "rename", name: v.name };
  }
  if (
    v.type === "capture" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    Number.isInteger(v.x) &&
    Number.isInteger(v.y)
  ) {
    return { type: "capture", x: v.x, y: v.y };
  }
  return null;
}

function broadcast(msg, except) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    if (client === except) continue;
    client.send(payload);
  }
}

function broadcastPresence() {
  broadcast({
    type: "presence",
    onlineCount: wss.clients.size,
  });
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Grid server — WebSocket /ws\n");
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  const limiter = createLimiter(24);
  const userId = randomUUID();
  const me = game.createUser(userId);

  socket.send(
    JSON.stringify({
      type: "welcome",
      userId,
      name: me.name,
      color: me.color,
      grid: {
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        cells: [...game.cells],
      },
      users: game.getPublicUsers(),
      leaderboard: game.leaderboard(userId).leaderboard,
      cooldownMs: CAPTURE_COOLDOWN_MS,
      onlineCount: wss.clients.size,
    }),
  );

  broadcast(
    {
      type: "meta",
      leaderboard: game.leaderboard(userId).leaderboard,
      users: game.getPublicUsers(),
      onlineCount: wss.clients.size,
    },
    socket,
  );

  broadcastPresence();

  socket.on("message", (data) => {
    if (!limiter()) return;
    const msg = parseClientMessage(data);
    if (!msg) return;

    if (msg.type === "rename") {
      if (game.renameUser(userId, msg.name) === null) return;
      const lb = game.leaderboard(userId).leaderboard;
      broadcast({
        type: "meta",
        leaderboard: lb,
        users: game.getPublicUsers(),
        onlineCount: wss.clients.size,
      });
      return;
    }

    if (msg.type === "capture") {
      const result = game.capture(userId, msg.x, msg.y, Date.now());
      if (!result.ok) {
        const code =
          result.reason === "cooldown"
            ? "COOLDOWN"
            : result.reason === "bounds"
              ? "BOUNDS"
              : result.reason === "own"
                ? "OWN"
                : "UNKNOWN";
        socket.send(
          JSON.stringify({
            type: "error",
            code,
            message:
              result.reason === "cooldown"
                ? "Short cooldown between captures"
                : result.reason === "own"
                  ? "You already hold this tile"
                  : result.reason === "bounds"
                    ? "Out of bounds"
                    : "Cannot capture",
          }),
        );
        return;
      }

      const lb = game.leaderboard(userId).leaderboard;
      const users = game.getPublicUsers();
      socket.send(
        JSON.stringify({
          type: "patch",
          x: msg.x,
          y: msg.y,
          ownerId: result.ownerId,
          you: true,
          leaderboard: lb,
          users,
          onlineCount: wss.clients.size,
        }),
      );
      broadcast(
        {
          type: "patch",
          x: msg.x,
          y: msg.y,
          ownerId: result.ownerId,
          leaderboard: lb,
          users,
          onlineCount: wss.clients.size,
        },
        socket,
      );
    }
  });

  socket.on("close", () => {
    game.removeUser(userId);
    broadcast({
      type: "sync",
      grid: {
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        cells: [...game.cells],
      },
      leaderboard: game.leaderboard(userId).leaderboard,
      users: game.getPublicUsers(),
      onlineCount: wss.clients.size,
    });
    broadcastPresence();
  });
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}  ws /ws`);
});
