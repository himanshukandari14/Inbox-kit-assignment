/** Keep in sync with client/lib/grid-constants.ts */
export const GRID_WIDTH = 36;
export const GRID_HEIGHT = 28;
export const CELL_COUNT = GRID_WIDTH * GRID_HEIGHT;
export const CAPTURE_COOLDOWN_MS = 420;
/** Remove sessions with no heartbeat after this long */
export const STALE_PLAYER_MS = 120_000;
