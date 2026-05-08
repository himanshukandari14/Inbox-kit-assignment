"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useGridConvex } from "@/hooks/useGridConvex";

function tileColor(
  ownerId: string | null,
  selfId: string | null,
  selfColor: string,
  map: Map<string, string>,
): string | undefined {
  if (!ownerId) return undefined;
  if (ownerId === selfId) return selfColor;
  return map.get(ownerId);
}

/* ─── Cell ─── */
const Cell = memo(function Cell({
  color,
  title,
  flash,
  onPick,
}: {
  color?: string;
  title: string;
  flash?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onPick}
      className={[
        "group relative min-h-0 min-w-0 rounded-[2px] transition-all duration-150 ease-out",
        color
          ? "border-transparent"
          : "border border-white/[0.03] bg-[#0a0a0a]",
        "hover:z-10 hover:border-white/30 hover:bg-white/5",
        "focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-1",
        flash ? "animate-cell-pulse z-10" : "",
      ].join(" ")}
      style={
        color
          ? {
              backgroundColor: color,
              boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.2)`,
            }
          : undefined
      }
    />
  );
});

/* ─── Name Field ─── */
function NameField({
  defaultName,
  onSave,
}: {
  defaultName: string;
  onSave: (name: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const read = () => ref.current?.value.trim() ?? "";
  return (
    <div className="flex gap-2">
      <input
        ref={ref}
        defaultValue={defaultName}
        onBlur={() => onSave(read())}
        onKeyDown={(e) => e.key === "Enter" && onSave(read())}
        maxLength={24}
        className="min-w-0 flex-1 rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-transparent focus:outline-none transition-colors"
        placeholder="Display name"
        aria-label="Display name"
      />
      <button
        type="button"
        onClick={() => onSave(read())}
        className="btn-primary shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
      >
        Save
      </button>
    </div>
  );
}

export function TerritoryPage() {
  const g = useGridConvex();
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gridDims = useRef({ cols: 0, rows: 0 });
  const presenceSeedRef = useRef(false);
  const knownUserIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (g.userId === null) {
      presenceSeedRef.current = false;
      knownUserIdsRef.current = new Set();
    }
  }, [g.userId]);

  useEffect(() => {
    if (g.status !== "open" || g.userId === null) return;
    const nextIds = new Set(g.users.map((u) => u.id));
    if (!presenceSeedRef.current) {
      presenceSeedRef.current = true;
      knownUserIdsRef.current = nextIds;
      return;
    }
    const known = knownUserIdsRef.current;
    for (const u of g.users) {
      if (!known.has(u.id) && u.id !== g.userId) {
        toast.success(`${u.name} joined`, {
          description: "They’re on the board — say hi.",
        });
      }
    }
    knownUserIdsRef.current = nextIds;
  }, [g.users, g.status, g.userId]);

  useEffect(() => {
    gridDims.current = { cols: g.width, rows: g.height };
  }, [g.width, g.height]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const compute = (width: number, height: number) => {
      const { cols, rows } = gridDims.current;
      if (cols < 1 || rows < 1) return;
      const pad = 24;
      const availW = Math.max(0, width - pad * 2);
      const availH = Math.max(0, height - pad * 2);
      if (availW < 1 || availH < 1) return;
      const ar = cols / rows;
      let gw: number;
      let gh: number;
      if (availW / availH > ar) {
        gh = availH;
        gw = gh * ar;
      } else {
        gw = availW;
        gh = gw / ar;
      }
      setFit({ w: gw, h: gh });
    };

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) compute(cr.width, cr.height);
    });
    ro.observe(el);
    compute(el.clientWidth, el.clientHeight);
    const raf = requestAnimationFrame(() =>
      compute(el.clientWidth, el.clientHeight),
    );
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [g.width, g.height]);

  const userColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of g.users) m.set(u.id, u.color);
    return m;
  }, [g.users]);

  const myCells = useMemo(() => {
    if (!g.userId || !g.cells.length) return 0;
    let n = 0;
    for (const c of g.cells) if (c === g.userId) n += 1;
    return n;
  }, [g.cells, g.userId]);

  const flashCell = useCallback((idx: number) => {
    setFlashIdx(idx);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashIdx(null), 380);
  }, []);

  const onCellClick = useCallback(
    (x: number, y: number, idx: number) => {
      flashCell(idx);
      g.capture(x, y);
    },
    [g, flashCell],
  );

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const applyName = useCallback(
    (name: string) => {
      g.rename(name);
    },
    [g],
  );

  const connected = g.status === "open";
  const liveLabel =
    g.status === "open"
      ? "Live"
      : g.status === "connecting"
        ? "Connecting"
        : "Reconnecting";

  const total = g.width * g.height;
  const capturePercent = total > 0 ? ((myCells / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="animate-fade-in relative flex h-svh min-h-0 flex-col overflow-hidden bg-black selection:bg-white/20 selection:text-white">
      {/* ─── Layout ─── */}
      <div className="relative z-10 flex h-full min-h-0 flex-col gap-6 p-4 md:flex-row md:gap-8 md:p-8">
        
        {/* ─── Sidebar ─── */}
        <aside
          className="flex max-h-[35vh] w-full shrink-0 flex-col gap-8 overflow-y-auto pr-2 md:max-h-none md:w-[280px]"
          aria-label="Player and scores"
        >
          {/* ─── Header ─── */}
          <header className="space-y-4">
            <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight text-white">
              Territory
            </h1>
            <p className="text-[13px] leading-relaxed text-[#888888]">
              A minimalist, real-time grid capture experiment. Click a cell to claim it.
            </p>
            
            <div className="flex items-center gap-3 pt-2">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[#a1a1aa]">
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-white live-dot' : 'bg-white/20'}`} />
                {liveLabel}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#a1a1aa]">
                <span className="text-white">{g.onlineCount}</span> online
              </div>
            </div>
          </header>

          {/* ─── Profile ─── */}
          <section className="space-y-3">
            <h2 className="text-[10px] font-medium uppercase tracking-widest text-[#666666]">
              Profile
            </h2>
            
            <div className="clean-card rounded-xl p-4 space-y-4">
              {g.userId ? (
                <NameField
                  key={`${g.userId}-${g.myName}`}
                  defaultName={g.myName}
                  onSave={applyName}
                />
              ) : (
                <div className="flex items-center gap-2 py-1">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-white/20" />
                  <p className="text-sm text-[#888]">Connecting…</p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <div
                  className="h-8 w-8 shrink-0 rounded-full border border-white/10"
                  style={{ backgroundColor: g.myColor }}
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {g.myName || "—"}
                  </p>
                  <p className="text-[11px] text-[#888888] flex items-center gap-2">
                    <span><span className="text-white">{myCells}</span> cells</span>
                    <span>·</span>
                    <span>{capturePercent}%</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ─── Leaderboard ─── */}
          <section className="space-y-3 flex-1 flex flex-col min-h-0">
            <h2 className="text-[10px] font-medium uppercase tracking-widest text-[#666666] flex justify-between">
              <span>Leaderboard</span>
              {g.leaderboard.length > 0 && <span>{g.leaderboard.length} Total</span>}
            </h2>
            
            <div className="clean-card rounded-xl p-2 flex-1 overflow-auto">
              <ol className="space-y-0.5 text-sm">
                {!g.leaderboard.length && (
                  <li className="py-8 text-center text-xs text-[#666666]">
                    No territory claimed.
                  </li>
                )}
                {g.leaderboard.map((row, i) => {
                  const isMe = row.userId === g.userId;
                  return (
                    <li
                      key={row.userId}
                      className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors ${
                        isMe ? "bg-white/5" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <span className="rank-badge text-[#666666]">
                        {i + 1}
                      </span>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[#cccccc]">
                        {row.name}
                        {isMe && (
                          <span className="ml-2 text-[10px] text-white/40">
                            (you)
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-[#888888] font-mono">
                        {row.cells}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          {/* ─── Footer hint ─── */}
          <p className="text-[10px] text-[#555555]">
            Board scales to fit window.
          </p>
        </aside>

        {/* ─── Main Grid Area ─── */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden clean-card rounded-2xl">
          {/* ─── Error Toast ─── */}
          {g.lastError && (
            <div
              role="status"
              className="absolute left-1/2 top-4 z-20 max-w-[min(100%-1rem,300px)] -translate-x-1/2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-center text-xs text-red-200 backdrop-blur-md"
            >
              {g.lastError}
            </div>
          )}

          {/* ─── Board Header ─── */}
          <header className="shrink-0 border-b border-white/5 px-6 py-4 flex items-center justify-between bg-[#0f0f0f]">
            <div className="flex items-center gap-4">
              <p className="font-mono text-sm text-[#888888]">
                <span className="text-white">{g.width}</span>
                <span className="mx-1">×</span>
                <span className="text-white">{g.height}</span>
              </p>
              <div className="h-3 w-px bg-white/10" />
              <p className="text-xs text-[#888888]">
                <span className="text-white">{total}</span> total cells
              </p>
            </div>

            {/* ─── Progress bar ─── */}
            {total > 0 && myCells > 0 && (
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-24 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(Number(capturePercent), 1)}%` }}
                  />
                </div>
              </div>
            )}
          </header>

          {/* ─── Grid Viewport ─── */}
          <div
            ref={viewportRef}
            className="relative min-h-0 flex-1 overflow-hidden bg-[#0a0a0a]"
            role="application"
            aria-label="Tile grid"
          >
            {/* Subtle grid pattern background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.15) 1px, transparent 0)",
                backgroundSize: "20px 20px",
              }}
            />

            <div className="relative flex h-full items-center justify-center p-4 md:p-8">
              {g.cells.length > 0 && g.width > 0 && fit.w > 0 ? (
                <div
                  className="grid gap-[1px] bg-white/5 p-[1px] subtle-border rounded-sm"
                  style={{
                    width: fit.w,
                    height: fit.h,
                    gridTemplateColumns: `repeat(${g.width}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${g.height}, minmax(0, 1fr))`,
                  }}
                >
                  {g.cells.map((owner, idx) => {
                    const x = idx % g.width;
                    const y = Math.floor(idx / g.width);
                    return (
                      <Cell
                        key={`${x}-${y}`}
                        color={tileColor(
                          owner,
                          g.userId,
                          g.myColor,
                          userColors,
                        )}
                        flash={flashIdx === idx}
                        title={
                          owner
                            ? owner === g.userId
                              ? "Yours"
                              : "Taken"
                            : "Free"
                        }
                        onPick={() => onCellClick(x, y, idx)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-sm text-[#666]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-white/80" />
                  Building grid...
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
