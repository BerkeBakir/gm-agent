/** USDC base units (string or bigint from the API) → "1.25 USDC". */
export function fmtUsdc(v: string | number | bigint | null | undefined, withUnit = true): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v) / 1e6;
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return withUnit ? `${s} USDC` : s;
}

export const short = (addr?: string | null) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—");

export const EXPLORER = "https://sepolia.basescan.org";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addrUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

export type Decision = {
  id: string;
  day: number;
  participants: number;
  winners: number;
  winRate: number | null;
  income: string;
  rewardPerWinner: string;
  totalPaid: string;
  treasuryBefore: string;
  treasuryAfter: string;
  nextDifficulty: string;
  decidedBy: string;
  reasoning: string;
  adjustments: string[];
  payouts: { player: string; amount: string; txHash?: string; error?: string }[];
  createdAt: string;
};

export type GameStateResponse = {
  challenge: { id: string; day: number; difficulty: string; question: string; createdAt: string; participants: number } | null;
  pastChallenges: { day: number; difficulty: string; question: string; answer: string }[];
  treasury: { address: string | null; usdc: string | null; eth: string | null };
  rules: { entryFee: string; maxPerTx: string; maxDailyFractionBps: number };
  decisions: Decision[];
  leaderboard: { player: string; wins: number; earned: string }[];
};
