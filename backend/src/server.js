import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { GameState } from "./game.js";
import {
  CAPTURE_COOLDOWN_MS,
  GRID_HEIGHT,
  GRID_WIDTH,
} from "./protocol.js";

const PORT = Number(process.env.PORT ?? 4000);
const game = new GameState();

/** Simple token bucket: each socket gets at most maxPerSecond */
function createLimiter(maxPerSecond) {
  let tokens = maxPerSecond;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(maxPerSecond, tokens + ((now - last) / 1000) * maxPerSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function readClientMessage(data) {
  const raw =
    typeof data === "string" ? data : Buffer.isBuffer(data) ? data.toString("utf8") : null;
  if (!raw) return null;
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
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

const CAPTURE_ERROR = {
  cooldown: { code: "COOLDOWN", message: "Short cooldown between captures" },
  bounds: { code: "BOUNDS", message: "Out of bounds" },
  own: { code: "OWN", message: "You already hold this tile" },
  unknown_user: { code: "UNKNOWN", message: "Cannot capture" },
};

function captureErrorPayload(reason) {
  return CAPTURE_ERROR[reason] ?? CAPTURE_ERROR.unknown_user;
}

function broadcast(wss, msg, exceptSocket) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client === exceptSocket) continue;
    client.send(payload);
  }
}

function gridPayload() {
  return { width: GRID_WIDTH, height: GRID_HEIGHT, cells: [...game.cells] };
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Grid server — WebSocket /ws\n");
});

const wss = new WebSocketServer({ server, path: "/ws" });

function onlineCount() {
  return wss.clients.size;
}

function presenceMessage() {
  return { type: "presence", onlineCount: onlineCount() };
}

wss.on("connection", (socket) => {
  const limiter = createLimiter(24);
  const userId = randomUUID();
  const me = game.createUser(userId);
  const room = game.getRoomSnapshot();

  socket.send(JSON.stringify({
    type: "welcome",
    userId,
    name: me.name,
    color: me.color,
    grid: gridPayload(),
    users: room.users,
    leaderboard: room.leaderboard,
    cooldownMs: CAPTURE_COOLDOWN_MS,
    onlineCount: onlineCount(),
  }));

  broadcast(
    wss,
    {
      type: "meta",
      ...game.getRoomSnapshot(),
      onlineCount: onlineCount(),
    },
    socket,
  );
  broadcast(wss, presenceMessage(), null);

  socket.on("message", (data) => {
    if (!limiter()) return;
    const msg = readClientMessage(data);
    if (!msg) return;

    if (msg.type === "rename") {
      if (game.renameUser(userId, msg.name) === null) return;
      broadcast(wss, { type: "meta", ...game.getRoomSnapshot(), onlineCount: onlineCount() }, null);
      return;
    }

    if (msg.type === "capture") {
      const result = game.capture(userId, msg.x, msg.y, Date.now());
      if (!result.ok) {
        const err = captureErrorPayload(result.reason);
        socket.send(JSON.stringify({ type: "error", code: err.code, message: err.message }));
        return;
      }

      const snap = game.getRoomSnapshot();
      socket.send(
        JSON.stringify({
          type: "patch",
          x: msg.x,
          y: msg.y,
          ownerId: result.ownerId,
          you: true,
          ...snap,
          onlineCount: onlineCount(),
        }),
      );
      broadcast(
        wss,
        {
          type: "patch",
          x: msg.x,
          y: msg.y,
          ownerId: result.ownerId,
          ...snap,
          onlineCount: onlineCount(),
        },
        socket,
      );
    }
  });

  socket.on("close", () => {
    game.removeUser(userId);
    broadcast(
      wss,
      {
        type: "sync",
        grid: gridPayload(),
        ...game.getRoomSnapshot(),
        onlineCount: onlineCount(),
      },
      null,
    );
    broadcast(wss, presenceMessage(), null);
  });
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}  ws /ws`);
});
