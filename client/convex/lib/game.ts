import { generateSlug } from "random-word-slugs";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  CAPTURE_COOLDOWN_MS,
  CELL_COUNT,
  GRID_HEIGHT,
  GRID_WIDTH,
} from "./constants";

const NAME_MAX_LEN = 24;

const GOLDEN_ANGLE = 137.508;

function hslToHex(hDeg: number, sPerc: number, lPerc: number): string {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(1, sPerc / 100));
  const l = Math.max(0, Math.min(1, lPerc / 100));
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
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
  const toHex = (x: number) =>
    Math.min(255, Math.round(x * 255))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function pickUniqueTerritoryColor(usedHex: Set<string>): string {
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

function generateDefaultSlug(): string {
  return generateSlug(3, { format: "kebab" }).slice(0, NAME_MAX_LEN);
}

function takeUnusedSlug(existingNames: Set<string>): string {
  for (let i = 0; i < 48; i++) {
    const slug = generateDefaultSlug();
    if (!existingNames.has(slug)) return slug;
  }
  return `player-${Math.random().toString(36).slice(2, 10)}`.slice(
    0,
    NAME_MAX_LEN,
  );
}

function clampName(raw: unknown): string {
  if (typeof raw !== "string") return generateDefaultSlug();
  const s = raw.trim().slice(0, NAME_MAX_LEN);
  return s.length > 0 ? s : generateDefaultSlug();
}

export function indexFromXY(x: number, y: number): number {
  return y * GRID_WIDTH + x;
}

export async function getBoardDoc(ctx: QueryCtx | MutationCtx) {
  return ctx.db
    .query("board")
    .withIndex("by_singleton", (q) => q.eq("singletonKey", "main"))
    .unique();
}

export async function ensureBoard(ctx: MutationCtx): Promise<Id<"board">> {
  const existing = await getBoardDoc(ctx);
  if (existing) return existing._id;
  const cells: (Id<"players"> | null)[] = Array.from(
    { length: CELL_COUNT },
    () => null,
  );
  return ctx.db.insert("board", { singletonKey: "main", cells });
}

export async function createPlayerFields(ctx: MutationCtx): Promise<{
  name: string;
  color: string;
}> {
  const all = await ctx.db.query("players").collect();
  const takenColors = new Set(all.map((u) => u.color));
  const color = pickUniqueTerritoryColor(takenColors);
  const name = takeUnusedSlug(new Set(all.map((u) => u.name)));
  return { name, color };
}

export function buildLeaderboard(
  cells: (Id<"players"> | null)[],
  users: Doc<"players">[],
  yourId: Id<"players"> | undefined,
): {
  leaderboard: {
    userId: string;
    name: string;
    color: string;
    cells: number;
  }[];
  yourCells: number;
} {
  const counts = new Map<string, number>();
  for (const id of cells) {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const entries: {
    userId: string;
    name: string;
    color: string;
    cells: number;
  }[] = [];
  for (const u of users) {
    entries.push({
      userId: u._id,
      name: u.name,
      color: u.color,
      cells: counts.get(u._id) ?? 0,
    });
  }
  entries.sort(
    (a, b) => b.cells - a.cells || a.name.localeCompare(b.name),
  );
  return {
    leaderboard: entries.slice(0, 12),
    yourCells: yourId ? (counts.get(yourId) ?? 0) : 0,
  };
}

export type CaptureFail =
  | "bounds"
  | "unknown_user"
  | "own"
  | "cooldown";

export function tryCapture(
  cells: (Id<"players"> | null)[],
  user: Doc<"players">,
  x: number,
  y: number,
  now: number,
):
  | { ok: true; index: number }
  | { ok: false; reason: CaptureFail } {
  if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
    return { ok: false, reason: "bounds" };
  }
  const idx = indexFromXY(x, y);
  if (cells[idx] === user._id) {
    return { ok: false, reason: "own" };
  }
  const elapsed = now - user.lastCaptureAt;
  if (elapsed < CAPTURE_COOLDOWN_MS && user.lastCaptureAt !== 0) {
    return { ok: false, reason: "cooldown" };
  }
  return { ok: true, index: idx };
}

export function patchCellsAfterCapture(
  cells: (Id<"players"> | null)[],
  index: number,
  userId: Id<"players">,
): (Id<"players"> | null)[] {
  const next = [...cells];
  next[index] = userId;
  return next;
}

export { clampName };
