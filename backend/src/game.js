import { generateSlug } from "random-word-slugs";
import {
  CAPTURE_COOLDOWN_MS,
  CELL_COUNT,
  GRID_HEIGHT,
  GRID_WIDTH,
} from "./protocol.js";

const NAME_MAX_LEN = 24;
/** Step hue by the golden angle so each new player’s color is visually distinct */
const GOLDEN_ANGLE = 137.508;

function hslToHex(hDeg, sPerc, lPerc) {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(1, sPerc / 100));
  const l = Math.max(0, Math.min(1, lPerc / 100));
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x) =>
    Math.min(255, Math.round(x * 255))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function pickUniqueTerritoryColor(usedHex) {
  const n = usedHex.size;
  for (let attempt = 0; attempt < 720; attempt++) {
    const hue = (n * GOLDEN_ANGLE + attempt * 19.7) % 360;
    const sat = 58 + (attempt % 5) * 3;
    const light = 45 + ((attempt >> 3) % 4) * 5;
    const hex = hslToHex(hue, sat, light);
    if (!usedHex.has(hex)) return hex;
  }
  return hslToHex(Math.random() * 360, 64, 52);
}

function defaultSlug() {
  return generateSlug(3, { format: "kebab" }).slice(0, NAME_MAX_LEN);
}

function takeUnusedSlug(existingNames) {
  for (let i = 0; i < 48; i++) {
    const slug = defaultSlug();
    if (!existingNames.has(slug)) return slug;
  }
  return `player-${Math.random().toString(36).slice(2, 10)}`.slice(0, NAME_MAX_LEN);
}

function clampName(raw) {
  if (typeof raw !== "string") return defaultSlug();
  const s = raw.trim().slice(0, NAME_MAX_LEN);
  return s.length > 0 ? s : defaultSlug();
}

export class GameState {
  constructor() {
    this.cells = Array.from({ length: CELL_COUNT }, () => null);
    this.users = new Map();
  }

  /** What every client needs to render sidebar + scores (leaderboard order does not depend on “viewer”) */
  getRoomSnapshot() {
    const anyId = this.users.keys().next().value;
    const { leaderboard } = this.leaderboard(anyId);
    return { leaderboard, users: this.getPublicUsers() };
  }

  createUser(id) {
    const takenColors = new Set([...this.users.values()].map((u) => u.color));
    const color = pickUniqueTerritoryColor(takenColors);
    const name = takeUnusedSlug(new Set([...this.users.values()].map((u) => u.name)));
    this.users.set(id, { name, color, lastCaptureAt: 0 });
    return { id, name, color };
  }

  removeUser(id) {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === id) this.cells[i] = null;
    }
    this.users.delete(id);
  }

  renameUser(id, rawName) {
    const u = this.users.get(id);
    if (!u) return null;
    u.name = clampName(rawName);
    return u.name;
  }

  index(x, y) {
    return y * GRID_WIDTH + x;
  }

  capture(userId, x, y, now) {
    if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
      return { ok: false, reason: "bounds" };
    }
    const user = this.users.get(userId);
    if (!user) return { ok: false, reason: "unknown_user" };

    const idx = this.index(x, y);
    if (this.cells[idx] === userId) return { ok: false, reason: "own" };

    const elapsed = now - user.lastCaptureAt;
    if (elapsed < CAPTURE_COOLDOWN_MS && user.lastCaptureAt !== 0) {
      return { ok: false, reason: "cooldown" };
    }

    user.lastCaptureAt = now;
    this.cells[idx] = userId;
    return { ok: true, ownerId: userId };
  }

  leaderboard(yourId) {
    const counts = new Map();
    for (const id of this.cells) {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const entries = [];
    for (const [uid, u] of this.users) {
      entries.push({
        userId: uid,
        name: u.name,
        color: u.color,
        cells: counts.get(uid) ?? 0,
      });
    }
    entries.sort((a, b) => b.cells - a.cells || a.name.localeCompare(b.name));

    return {
      leaderboard: entries.slice(0, 12),
      yourCells: counts.get(yourId) ?? 0,
    };
  }

  getPublicUsers() {
    return [...this.users.entries()].map(([id, u]) => ({
      id,
      name: u.name,
      color: u.color,
    }));
  }
}
