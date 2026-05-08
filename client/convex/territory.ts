import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  CAPTURE_COOLDOWN_MS,
  GRID_HEIGHT,
  GRID_WIDTH,
  STALE_PLAYER_MS,
} from "./lib/constants";
import {
  buildLeaderboard,
  clampName,
  createPlayerFields,
  ensureBoard,
  getBoardDoc,
  patchCellsAfterCapture,
  tryCapture,
} from "./lib/game";

export const getSnapshot = query({
  args: { viewerId: v.optional(v.id("players")) },
  handler: async (ctx, args) => {
    const board = await getBoardDoc(ctx);
    if (!board) return null;

    const users = await ctx.db.query("players").collect();
    const { leaderboard, yourCells } = buildLeaderboard(
      board.cells,
      users,
      args.viewerId,
    );

    return {
      grid: {
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        cells: board.cells.map((id) => (id === null ? null : id)),
      },
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        color: u.color,
        lastSeenAt: u.lastSeenAt,
      })),
      leaderboard,
      yourCells,
      cooldownMs: CAPTURE_COOLDOWN_MS,
    };
  },
});

export const join = mutation({
  args: { existingPlayerId: v.optional(v.id("players")) },
  handler: async (ctx, args) => {
    await ensureBoard(ctx);
    const now = Date.now();

    if (args.existingPlayerId) {
      const existing = await ctx.db.get(args.existingPlayerId);
      if (existing) {
        await ctx.db.patch(existing._id, { lastSeenAt: now });
        const board = await getBoardDoc(ctx);
        if (!board) throw new Error("Board missing after ensure");
        const users = await ctx.db.query("players").collect();
        const { leaderboard, yourCells } = buildLeaderboard(
          board.cells,
          users,
          existing._id,
        );
        return {
          playerId: existing._id,
          name: existing.name,
          color: existing.color,
          grid: {
            width: GRID_WIDTH,
            height: GRID_HEIGHT,
            cells: board.cells.map((id) => (id === null ? null : id)),
          },
          users: users.map((u) => ({
            id: u._id,
            name: u.name,
            color: u.color,
            lastSeenAt: u.lastSeenAt,
          })),
          leaderboard,
          yourCells,
          cooldownMs: CAPTURE_COOLDOWN_MS,
        };
      }
    }

    const { name, color } = await createPlayerFields(ctx);
    const playerId = await ctx.db.insert("players", {
      name,
      color,
      lastCaptureAt: 0,
      lastSeenAt: now,
    });

    const board = await getBoardDoc(ctx);
    if (!board) throw new Error("Board missing after ensure");
    const users = await ctx.db.query("players").collect();
    const { leaderboard, yourCells } = buildLeaderboard(
      board.cells,
      users,
      playerId,
    );

    return {
      playerId,
      name,
      color,
      grid: {
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        cells: board.cells.map((id) => (id === null ? null : id)),
      },
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        color: u.color,
        lastSeenAt: u.lastSeenAt,
      })),
      leaderboard,
      yourCells,
      cooldownMs: CAPTURE_COOLDOWN_MS,
    };
  },
});

export const pulse = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.playerId);
    if (!p) return;
    await ctx.db.patch(args.playerId, { lastSeenAt: Date.now() });
  },
});

export const capture = mutation({
  args: {
    playerId: v.id("players"),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const board = await getBoardDoc(ctx);
    if (!board) return { ok: false as const, code: "UNKNOWN" as const };

    const user = await ctx.db.get(args.playerId);
    if (!user) {
      return { ok: false as const, code: "UNKNOWN" as const };
    }

    const now = Date.now();
    const attempt = tryCapture(board.cells, user, args.x, args.y, now);
    if (!attempt.ok) {
      const code =
        attempt.reason === "cooldown"
          ? ("COOLDOWN" as const)
          : attempt.reason === "bounds"
            ? ("BOUNDS" as const)
            : attempt.reason === "own"
              ? ("OWN" as const)
              : ("UNKNOWN" as const);
      return { ok: false as const, code };
    }

    await ctx.db.patch(args.playerId, {
      lastCaptureAt: now,
    });

    const nextCells = patchCellsAfterCapture(
      board.cells,
      attempt.index,
      args.playerId,
    );
    await ctx.db.patch(board._id, { cells: nextCells });

    const users = await ctx.db.query("players").collect();
    const { leaderboard } = buildLeaderboard(nextCells, users, args.playerId);

    return {
      ok: true as const,
      x: args.x,
      y: args.y,
      ownerId: args.playerId,
      leaderboard,
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        color: u.color,
        lastSeenAt: u.lastSeenAt,
      })),
    };
  },
});

export const renamePlayer = mutation({
  args: { playerId: v.id("players"), name: v.string() },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.playerId);
    if (!u) return null;
    const name = clampName(args.name);
    await ctx.db.patch(args.playerId, { name });
    return name;
  },
});

export const cleanupStalePlayers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - STALE_PLAYER_MS;
    const board = await getBoardDoc(ctx);
    if (!board) return;

    const allPlayers = await ctx.db.query("players").collect();
    const stale = allPlayers.filter((p) => p.lastSeenAt < cutoff);
    if (stale.length === 0) return;

    let cells = board.cells;
    for (const p of stale) {
      cells = cells.map((c) => (c === p._id ? null : c));
      await ctx.db.delete(p._id);
    }
    await ctx.db.patch(board._id, { cells });
  },
});
