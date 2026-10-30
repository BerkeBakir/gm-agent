/**
 * GET /api/anna/archive — closed puzzles for the Anna Edition app, newest first.
 * The open (paid) puzzle is never included. CORS is open on purpose: Anna runs apps
 * in a sandboxed iframe whose origin is "null", and all of this is already public
 * through /api/state.
 */
import { getGameStore } from "@/src/game";

export const dynamic = "force-dynamic";

const MAX_PUZZLES = 30;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET() {
  const recent = await getGameStore().listChallenges(MAX_PUZZLES + 1);
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
  return Response.json(
    { puzzles },
    { headers: { ...CORS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
