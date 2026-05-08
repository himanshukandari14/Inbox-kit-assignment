import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup stale territory players",
  { minutes: 2 },
  internal.territory.cleanupStalePlayers,
);

crons.interval(
  "clear board every 30 mins",
  { minutes: 30 },
  internal.territory.clearBoard,
);

export default crons;
