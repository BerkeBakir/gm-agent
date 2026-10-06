/**
 * Closes the current game day and opens the next one (see src/gm/run-day.ts).
 *
 * NOT reachable from the public chat. Only:
 *  - Vercel Cron (GET, sends `Authorization: Bearer $CRON_SECRET` automatically)
 *  - the admin panel (POST, same bearer token)
 */
import { runDay } from "@/src/gm/run-day";
import { getRunDayDeps, jsonSafe } from "@/src/server/runtime";

export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const report = await runDay(getRunDayDeps());
    return Response.json(jsonSafe({ ok: true, log: report.log, newChallengeDay: report.newChallenge.day }));
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
