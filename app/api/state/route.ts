/**
 * GET /api/state — public dashboard data: today's challenge (no answer), past
 * challenges WITH answers revealed, treasury, decision log and leaderboard.
 */
import { formatEther } from "viem";
import { getWalletAddress } from "@/agent/wallet";
import { createBaseSepoliaClient, getEthBalance, getUsdcBalance } from "@/src/chain/base-sepolia";
import { getGameStore, toPublicChallenge } from "@/src/game";
import { getEntryFee, getLimits, jsonSafe } from "@/src/server/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getGameStore();
  const address = getWalletAddress();
  const client = createBaseSepoliaClient();

  const [current, recent, decisions, usdc, eth] = await Promise.all([
    store.getCurrentChallenge(),
    store.listChallenges(8),
    store.listDecisions(30),
    address ? getUsdcBalance(client, address).catch(() => null) : null,
    address ? getEthBalance(client, address).catch(() => null) : null,
  ]);
  const participantsToday = current ? (await store.getSubmissions(current.id)).length : 0;

  const totals = new Map<string, { player: string; wins: number; earned: bigint }>();
  for (const d of decisions) {
    for (const p of d.payouts) {
      if (p.amount <= 0n) continue;
      const key = p.player.toLowerCase();
      const t = totals.get(key) ?? { player: p.player, wins: 0, earned: 0n };
      t.wins += 1;
      t.earned += p.amount;
      totals.set(key, t);
    }
  }
  const leaderboard = [...totals.values()].sort((a, b) => (b.earned > a.earned ? 1 : b.earned < a.earned ? -1 : 0)).slice(0, 10);

  return Response.json(
    jsonSafe({
      challenge: current ? { ...toPublicChallenge(current), participants: participantsToday } : null,
      pastChallenges: recent
        .filter((c) => c.status === "closed")
        .map((c) => ({ day: c.day, difficulty: c.difficulty, question: c.question, answer: c.answer })),
      treasury: { address, usdc, eth: eth !== null ? formatEther(eth) : null },
      rules: { entryFee: getEntryFee(), ...getLimits() },
      decisions,
      leaderboard,
    }),
  );
}
