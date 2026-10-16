/**
 * GET /api/state — public dashboard data: today's challenge (no answer, but its
 * commitment), past challenges WITH answers revealed and commitments verified,
 * treasury (smart account + on-chain limit when delegated), decision log and
 * leaderboard.
 */
import { formatEther } from "viem";
import { createBaseSepoliaClient, getEthBalance, getUsdcBalance } from "@/src/chain/base-sepolia";
import { getGameStore, toPublicChallenge, verifyCommitment } from "@/src/game";
import { getAgentWallet, getEntryFee, getLimits, getTreasuryMode, getTxSender, jsonSafe } from "@/src/server/runtime";
import { DelegatedWallet } from "@/src/wallet/delegated";

export const dynamic = "force-dynamic";

function loadWallets() {
  try {
    const wallet = getAgentWallet();
    return { wallet, sender: getTxSender() };
  } catch {
    return { wallet: null, sender: null };
  }
}

export async function GET() {
  const store = getGameStore();
  const client = createBaseSepoliaClient();
  const { wallet, sender } = loadWallets();
  const delegated = wallet instanceof DelegatedWallet ? wallet : null;

  const [current, recent, decisions, usdc, eth, availableToday] = await Promise.all([
    store.getCurrentChallenge(),
    store.listChallenges(8),
    store.listDecisions(30),
    wallet ? getUsdcBalance(client, wallet.address).catch(() => null) : null,
    sender ? getEthBalance(client, sender.address).catch(() => null) : null,
    delegated ? delegated.availableToday().catch(() => null) : null,
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
        .map((c) => ({
          day: c.day,
          difficulty: c.difficulty,
          question: c.question,
          answer: c.answer,
          commitment: c.commitment,
          salt: c.salt,
          commitmentValid: c.commitment && c.salt ? verifyCommitment(c.commitment, c.salt, c.answer) : null,
        })),
      treasury: {
        mode: wallet ? getTreasuryMode(wallet) : "eoa",
        address: wallet?.address ?? null,
        agent: sender?.address ?? null,
        owner: delegated?.config.owner ?? null,
        usdc,
        eth: eth !== null ? formatEther(eth) : null,
        onchainLimit: delegated ? { dailyLimit: delegated.config.dailyLimit, availableToday } : null,
      },
      rules: { entryFee: getEntryFee(), ...getLimits() },
      decisions,
      leaderboard,
    }),
  );
}
