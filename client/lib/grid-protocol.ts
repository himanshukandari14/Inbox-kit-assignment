export type UserPublic = {
  id: string;
  name: string;
  color: string;
};

export type LeaderboardEntry = {
  userId: string;
  name: string;
  color: string;
  cells: number;
};

export type ServerMessage =
  | {
      type: "welcome";
      userId: string;
      name: string;
      color: string;
      grid: {
        width: number;
        height: number;
        cells: (string | null)[];
      };
      users: UserPublic[];
      leaderboard: LeaderboardEntry[];
      cooldownMs: number;
      onlineCount: number;
    }
  | {
      type: "patch";
      x: number;
      y: number;
      ownerId: string | null;
      you?: boolean;
      leaderboard: LeaderboardEntry[];
      users: UserPublic[];
      onlineCount: number;
    }
  | {
      type: "meta";
      leaderboard: LeaderboardEntry[];
      users: UserPublic[];
      onlineCount: number;
    }
  | {
      type: "sync";
      grid: {
        width: number;
        height: number;
        cells: (string | null)[];
      };
      leaderboard: LeaderboardEntry[];
      users: UserPublic[];
      onlineCount: number;
    }
  | { type: "presence"; onlineCount: number }
  | { type: "error"; code: string; message: string };
