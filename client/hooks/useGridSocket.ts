"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LeaderboardEntry,
  ServerMessage,
  UserPublic,
} from "@/lib/grid-protocol";

function wsUrl(): string {
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env;
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    const wsProto = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${hostname}:4000/ws`;
  }
  return "ws://localhost:4000/ws";
}

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

export function useGridSocket(): GridConnection {
  const [status, setStatus] = useState<GridConnection["status"]>("connecting");
  const [userId, setUserId] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState("#94a3b8");
  const [cells, setCells] = useState<(string | null)[]>(emptyCells);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [cooldownMs, setCooldownMs] = useState(420);
  const [onlineCount, setOnlineCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const gridW = useRef(0);
  const userIdRef = useRef<string | null>(null);

  const send = useCallback((payload: object) => {
    const w = wsRef.current;
    if (w && w.readyState === WebSocket.OPEN) {
      w.send(JSON.stringify(payload));
    }
  }, []);

  const rename = useCallback(
    (name: string) => {
      send({ type: "rename", name });
    },
    [send],
  );

  const capture = useCallback(
    (x: number, y: number) => {
      send({ type: "capture", x, y });
    },
    [send],
  );

  useEffect(() => {
    let cancelled = false;
    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const socket = new WebSocket(wsUrl());
      wsRef.current = socket;

      socket.onopen = () => {
        if (cancelled) return;
        setStatus("open");
        setLastError(null);
      };

      socket.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        wsRef.current = null;
        window.setTimeout(connect, 1200);
      };

      socket.onerror = () => {
        if (cancelled) return;
        setStatus("error");
        setLastError("Connection error");
      };

      socket.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string) as ServerMessage;
        } catch {
          return;
        }

        if (msg.type === "welcome") {
          gridW.current = msg.grid.width;
          userIdRef.current = msg.userId;
          setUserId(msg.userId);
          setMyName(msg.name);
          setMyColor(msg.color);
          setCells(msg.grid.cells);
          setWidth(msg.grid.width);
          setHeight(msg.grid.height);
          setUsers(msg.users);
          setCooldownMs(msg.cooldownMs);
          setOnlineCount(msg.onlineCount);
          setLeaderboard(msg.leaderboard);
          return;
        }

        if (msg.type === "patch") {
          const w = gridW.current;
          setCells((prev) => {
            if (prev.length === 0 || w <= 0) return prev;
            const next = prev.slice();
            const i = msg.y * w + msg.x;
            if (i >= 0 && i < next.length) {
              next[i] = msg.ownerId;
            }
            return next;
          });
          setLeaderboard(msg.leaderboard);
          setUsers(msg.users);
          setOnlineCount(msg.onlineCount);
          const selfPatch = msg.users.find((u) => u.id === userIdRef.current);
          if (selfPatch) setMyName(selfPatch.name);
          return;
        }

        if (msg.type === "meta") {
          setLeaderboard(msg.leaderboard);
          setUsers(msg.users);
          setOnlineCount(msg.onlineCount);
          const selfMeta = msg.users.find((u) => u.id === userIdRef.current);
          if (selfMeta) setMyName(selfMeta.name);
          return;
        }

        if (msg.type === "sync") {
          gridW.current = msg.grid.width;
          setCells(msg.grid.cells);
          setWidth(msg.grid.width);
          setHeight(msg.grid.height);
          setLeaderboard(msg.leaderboard);
          setUsers(msg.users);
          setOnlineCount(msg.onlineCount);
          return;
        }

        if (msg.type === "presence") {
          setOnlineCount(msg.onlineCount);
          return;
        }

        if (msg.type === "error") {
          setLastError(msg.message);
          window.setTimeout(() => setLastError(null), 2200);
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return {
    status,
    userId,
    myName,
    myColor,
    cells,
    width,
    height,
    users,
    leaderboard,
    cooldownMs,
    onlineCount,
    lastError,
    rename,
    capture,
  };
}
