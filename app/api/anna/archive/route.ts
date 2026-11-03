/**
 * GET /api/anna/archive — closed puzzles for the Anna Edition app, newest first, plus the
 * GM's latest decisions (no player addresses). The open (paid) puzzle is never included. CORS is open on purpose: Anna runs apps
 * in a sandboxed iframe whose origin is "null", and all of this is already public
 * through /api/state.
 *
 * `?as=text` sends the same JSON as text/plain: Anna's host-side `web.fetch` (the app's
 * fallback on networks that block *.vercel.app) rejects application/json.
 */
import { getGameStore } from "@/src/game";
import { formatUsdc } from "@/src/wallet/usdc";

export const dynamic = "force-dynamic";

const MAX_PUZZLES = 30;
const MAX_DECISIONS = 7;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET(request?: Request) {
  const store = getGameStore();
  let recent;
  try {
    recent = await store.listChallenges(MAX_PUZZLES + 1);
  } catch (err) {
    console.error("anna archive: store failed", err);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { ...CORS, "Cache-Control": "no-store" } });
  }
  const puzzles = recent
    .filter((c) => c.status === "closed")
    .slice(0, MAX_PUZZLES)
    .map((c) => ({
      day: c.day,
      difficulty: c.difficulty,
      question: c.question,
      answer: c.answer,
      acceptedAnswers: c.acceptedAnswers ?? [],
      commitment: c.commitment ?? null,
      salt: c.salt ?? null,
    }));
  // The decision log is extra: if it fails, the puzzles still go out.
  const decisions = await store
    .listDecisions(MAX_DECISIONS)
    .then((list) =>
      list.map((d) => ({
        day: d.day,
        participants: d.participants,
        winners: d.winners,
        winRate: d.winRate,
        rewardPerWinner: formatUsdc(d.rewardPerWinner),
        totalPaid: formatUsdc(d.totalPaid),
        treasuryAfter: formatUsdc(d.treasuryAfter),
        nextDifficulty: d.nextDifficulty,
        decidedBy: d.decidedBy,
        reasoning: d.reasoning,
        anchorTx: d.anchorTx ?? null,
      })),
    )
    .catch((err) => {
      console.error("anna archive: decision log failed", err);
      return [];
    });
  const headers = { ...CORS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };
  if (request && new URL(request.url).searchParams.get("as") === "text") {
    return new Response(JSON.stringify({ puzzles, decisions }), {
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return Response.json({ puzzles, decisions }, { headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
