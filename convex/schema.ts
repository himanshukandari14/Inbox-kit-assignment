import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  board: defineTable({
    singletonKey: v.literal("main"),
    cells: v.array(v.union(v.null(), v.id("players"))),
  }).index("by_singleton", ["singletonKey"]),

  players: defineTable({
    name: v.string(),
    color: v.string(),
    lastCaptureAt: v.number(),
    lastSeenAt: v.number(),
  }),
});
