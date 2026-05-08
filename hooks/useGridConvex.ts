"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { LeaderboardEntry, UserPublic } from "@/lib/grid-protocol";

const STORAGE_KEY = "territoryConvexPlayerId";
const HEARTBEAT_MS = 15_000;
const ONLINE_WINDOW_MS = 45_000;

export type GridConnection = {
  status: "connecting" | "open" | "closed" | "error";
  userId: string | null;
  myName: string;
  myColor: string;
  cells: (string | null)[];
  width: number;
  height: number;
  users: UserPublic[];
  leaderboard: LeaderboardEntry[];
  cooldownMs: number;
  onlineCount: number;
  lastError: string | null;
  rename: (name: string) => void;
  capture: (x: number, y: number) => void;
};

const emptyCells: (string | null)[] = [];

export function useGridConvex(): GridConnection {
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState("#94a3b8");
  const [lastError, setLastError] = useState<string | null>(null);
  const joinMut = useMutation(api.territory.join);
  const pulseMut = useMutation(api.territory.pulse);
  const captureMut = useMutation(api.territory.capture);
  const renameMut = useMutation(api.territory.renamePlayer);
  const joinStarted = useRef(false);

  const snapshot = useQuery(
    api.territory.getSnapshot,
    playerId ? { viewerId: playerId } : "skip",
  );

  useEffect(() => {
    if (joinStarted.current) return;
    joinStarted.current = true;
    let cancelled = false;

    void (async () => {
      const tryJoin = async (existingId: Id<"players"> | undefined) => {
        return joinMut({
          existingPlayerId: existingId,
        });
      };

      try {
        const raw =
          typeof window !== "undefined"
            ? localStorage.getItem(STORAGE_KEY)
            : null;
        const existing = raw
          ? (raw as Id<"players">)
          : undefined;

        try {
          const res = await tryJoin(existing);
          if (cancelled) return;
          localStorage.setItem(STORAGE_KEY, res.playerId);
          setPlayerId(res.playerId);
          setMyName(res.name);
          setMyColor(res.color);
        } catch {
          if (existing) {
            localStorage.removeItem(STORAGE_KEY);
            const res = await tryJoin(undefined);
            if (cancelled) return;
            localStorage.setItem(STORAGE_KEY, res.playerId);
            setPlayerId(res.playerId);
            setMyName(res.name);
            setMyColor(res.color);
          } else {
            throw new Error("join failed");
          }
        }
      } catch {
        if (cancelled) return;
        setFatalError("Could not join");
        joinStarted.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [joinMut]);

  useEffect(() => {
    if (!playerId) return;
    const tick = () => {
      void pulseMut({ playerId });
    };
    tick();
    const id = window.setInterval(tick, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [playerId, pulseMut]);

  /** Ticks every second so “online” presence next to the header stays fresh */
  const [onlineAt, setOnlineAt] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setOnlineAt(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const capture = useCallback(
    (x: number, y: number) => {
      if (!playerId) return;
      void (async () => {
        try {
          const res = await captureMut({ playerId, x, y });
          if (!res.ok) {
            const code = res.code;
            const message =
              code === "COOLDOWN"
                ? "Short cooldown between captures"
                : code === "OWN"
                  ? "You already hold this tile"
                  : code === "BOUNDS"
                    ? "Out of bounds"
                    : "Cannot capture";
            setLastError(message);
            window.setTimeout(() => setLastError(null), 2200);
          }
        } catch {
          setLastError("Cannot capture");
          window.setTimeout(() => setLastError(null), 2200);
        }
      })();
    },
    [captureMut, playerId],
  );

  const rename = useCallback(
    (name: string) => {
      if (!playerId) return;
      void renameMut({ playerId, name });
    },
    [renameMut, playerId],
  );

  if (fatalError) {
    return {
      status: "error",
      userId: null,
      myName: "",
      myColor: "#94a3b8",
      cells: emptyCells,
      width: 0,
      height: 0,
      users: [],
      leaderboard: [],
      cooldownMs: 420,
      onlineCount: 0,
      lastError: fatalError,
      rename: () => {},
      capture: () => {},
    };
  }

  const status: GridConnection["status"] =
    !playerId || snapshot === undefined ? "connecting" : "open";

  const usersPublic: UserPublic[] = snapshot
    ? snapshot.users.map((u) => ({ id: u.id, name: u.name, color: u.color }))
    : [];

  const me = snapshot?.users.find((u) => u.id === playerId);
  const myNameLive = me?.name ?? myName;
  const myColorLive = me?.color ?? myColor;

  const onlineCount = snapshot
    ? snapshot.users.filter(
        (u) => onlineAt - u.lastSeenAt < ONLINE_WINDOW_MS,
      ).length
    : 0;

  return {
    status,
    userId: playerId,
    myName: myNameLive,
    myColor: myColorLive,
    cells: snapshot?.grid.cells ?? emptyCells,
    width: snapshot?.grid.width ?? 0,
    height: snapshot?.grid.height ?? 0,
    users: usersPublic,
    leaderboard: snapshot?.leaderboard ?? [],
    cooldownMs: snapshot?.cooldownMs ?? 420,
    onlineCount,
    lastError,
    rename,
    capture,
  };
}
