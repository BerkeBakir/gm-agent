import { getGameStore, toPublicChallenge } from "@/src/game";

// GET /api/challenge -> the open challenge for players (never includes the answer key)
export async function GET() {
  const challenge = await getGameStore().getCurrentChallenge();
  return Response.json({ challenge: challenge ? toPublicChallenge(challenge) : null });
}
