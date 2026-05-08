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
