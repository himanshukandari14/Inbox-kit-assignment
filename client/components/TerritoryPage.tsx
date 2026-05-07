"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGridSocket } from "@/hooks/useGridSocket";

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
        "group relative min-h-0 min-w-0 rounded-[2px] border transition-[transform,box-shadow,filter] duration-150 ease-out",
        color
          ? "border-white/[0.12]"
          : "border-white/[0.06] bg-[#121212]",
        "hover:z-10 hover:scale-[1.08] hover:border-white/25 hover:brightness-110",
        "focus-visible:z-10 focus-visible:outline focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070707]",
        flash ? "animate-cell-pulse z-10" : "",
      ].join(" ")}
      style={
        color
          ? {
              background: `linear-gradient(165deg, ${color} 0%, color-mix(in oklab, ${color}, black 20%) 100%)`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
            }
          : undefined
      }
    />
  );
});

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
        className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/50 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-rose-500/50 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
        placeholder="Display name"
        aria-label="Display name"
      />
      <button
        type="button"
        onClick={() => onSave(read())}
        className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-rose-500 active:scale-[0.98]"
      >
        Save
      </button>
    </div>
  );
}

export function TerritoryPage() {
  const g = useGridSocket();
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gridDims = useRef({ cols: 0, rows: 0 });

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

  return (
    <div
      className="animate-shell-in relative flex h-svh min-h-0 flex-col gap-4 overflow-hidden p-4 md:flex-row md:gap-6 md:p-6 lg:p-8"
      style={{
        background:
          "radial-gradient(ellipse 85% 55% at 50% -40%, rgba(225, 29, 72, 0.06), transparent 50%), var(--ink)",
      }}
    >
      <aside
        className="flex max-h-[38vh] w-full shrink-0 flex-col gap-7 overflow-y-auto md:max-h-none md:w-[300px] lg:w-[320px]"
        aria-label="Player and scores"
      >
        <header>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-rose-400/90">
            Realtime
          </p>
          <h1 className="font-[family-name:var(--font-syne)] mt-2 text-3xl font-semibold tracking-tight text-white md:text-[2rem]">
            Territory
          </h1>
          <p className="mt-3 max-w-[260px] text-sm leading-relaxed text-neutral-500">
            Click any cell to claim it. Everyone sees the same board over the
            socket.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
              connected
                ? "bg-rose-500/10 text-rose-100 ring-1 ring-rose-500/25"
                : "bg-neutral-800 text-neutral-400 ring-1 ring-white/10",
            ].join(" ")}
          >
            <span
              className={[
                "h-1.5 w-1.5 rounded-full",
                connected
                  ? "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]"
                  : "bg-neutral-500",
              ].join(" ")}
              aria-hidden
            />
            {liveLabel}
          </span>
          <span className="font-mono text-xs tabular-nums text-neutral-500">
            <span className="text-neutral-300">{g.onlineCount}</span> online
          </span>
        </div>

        <section
          className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5"
          aria-labelledby="you-label"
        >
          <h2
            id="you-label"
            className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-500"
          >
            You
          </h2>
          <div className="mt-4 space-y-4">
            {g.userId ? (
              <NameField
                key={`${g.userId}-${g.myName}`}
                defaultName={g.myName}
                onSave={applyName}
              />
            ) : (
              <p className="text-sm text-neutral-500">Connecting…</p>
            )}
            <div className="flex items-center gap-3 border-t border-white/[0.06] pt-4">
              <div
                className="h-10 w-10 shrink-0 rounded-xl ring-1 ring-white/20 ring-offset-2 ring-offset-[var(--surface)]"
                style={{ backgroundColor: g.myColor }}
              />
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium text-neutral-100">
                  {g.myName || "—"}
                </p>
                <p className="mt-0.5 font-mono text-xs text-neutral-500">
                  <span className="text-rose-400">{myCells}</span> tiles ·{" "}
                  {g.cooldownMs}ms
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5"
          aria-labelledby="scores-label"
        >
          <h2
            id="scores-label"
            className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-500"
          >
            Leaderboard
          </h2>
          <ol className="mt-4 max-h-44 space-y-0 overflow-auto text-sm">
            {!g.leaderboard.length && (
              <li className="py-6 text-center text-neutral-600">
                No captures yet.
              </li>
            )}
            {g.leaderboard.map((row, i) => (
              <li
                key={row.userId}
                className="flex items-center gap-3 border-b border-white/[0.04] py-2.5 last:border-b-0"
              >
                <span className="w-6 text-center font-mono text-xs tabular-nums text-neutral-600">
                  {i + 1}
                </span>
                <span
                  className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/40"
                  style={{ backgroundColor: row.color }}
                />
                <span className="min-w-0 flex-1 truncate text-neutral-200">
                  {row.name}
                  {row.userId === g.userId && (
                    <span className="ml-1.5 text-xs font-normal text-rose-400">
                      you
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs tabular-nums text-neutral-500">
                  {row.cells}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <p className="text-[11px] leading-relaxed text-neutral-600">
          Board scales with the window; entire grid stays visible.
        </p>
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[var(--surface-raised)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
        {g.lastError && (
          <div
            role="status"
            className="absolute left-1/2 top-4 z-20 max-w-[min(100%-1rem,420px)] -translate-x-1/2 rounded-full border border-rose-500/35 bg-black/90 px-4 py-2 text-center text-xs text-rose-100 backdrop-blur-sm"
          >
            {g.lastError}
          </div>
        )}

        <header className="shrink-0 border-b border-white/[0.06] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Board
          </p>
          <p className="mt-1 font-mono text-sm text-neutral-300">
            <span className="text-neutral-100">
              {g.width}×{g.height}
            </span>
            <span className="mx-2 text-neutral-700">·</span>
            <span className="tabular-nums text-rose-400">{total}</span>
            <span className="text-neutral-600"> cells</span>
          </p>
        </header>

        <div
          ref={viewportRef}
          className="relative min-h-0 flex-1 overflow-hidden bg-[#070707]"
          role="application"
          aria-label="Tile grid"
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.4]" aria-hidden style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

          <div className="relative flex h-full items-center justify-center p-4 md:p-6">
            {g.cells.length > 0 && g.width > 0 && fit.w > 0 ? (
              <div
                className="grid gap-[2px] rounded-lg bg-neutral-800/90 p-[2px] ring-1 ring-white/10"
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
              <p className="text-sm text-neutral-500">Loading…</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
