import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { getMyWallet, getPuzzle, getResults, submitAnswer, type PlayerToolDeps } from "../src/mcp/tools";
import { buildPaymentRequirements } from "../src/x402/exact";

const player = privateKeyToAccount(generatePrivateKey());
const state = {
  challenge: { day: 5, difficulty: "medium", question: "What has keys but can't open locks?", participants: 3, answer: undefined },
  pastChallenges: [{ day: 4, difficulty: "easy", question: "q4", answer: "clock" }],
  rules: { entryFee: "100000", maxPerTx: "2000000", maxDailyFractionBps: 1000 },
  decisions: [
    {
      day: 4,
      participants: 4,
      winners: 2,
      rewardPerWinner: "300000",
      nextDifficulty: "medium",
      reasoning: "Win rate 50%, keep it.",
      adjustments: ["difficulty change medium→hard blocked (hysteresis): win rate 50% is inside the target band 30%-50%"],
      payouts: [{ player: player.address, amount: "300000", txHash: "0xabc" }],
    },
  ],
  leaderboard: [{ player: player.address, wins: 1, earned: "300000" }],
};

function deps(overrides: Partial<PlayerToolDeps> = {}): PlayerToolDeps {
  const reqs = buildPaymentRequirements({ payTo: "0x5cb007cB053ce248529D84651ce53750666A799D", amount: 100_000n, resource: "x", description: "fee" });
  const fetchFn = (async (url: URL | string, init?: RequestInit) => {
    if (String(url).endsWith("/api/state")) return Response.json(state);
    const paid = new Headers(init?.headers).get("X-PAYMENT");
    return paid ? Response.json({ submitted: true, feeTx: "0xfee" }) : Response.json({ accepts: [reqs] }, { status: 402 });
  }) as typeof fetch;
  return { baseUrl: "https://gm.test", signer: player, maxFee: 500_000n, fetch: fetchFn, balanceOf: async () => 1_200_000n, ...overrides };
}

describe("MCP player tools", () => {
  it("get_puzzle shows the riddle and the fee, never an answer", async () => {
    const r = await getPuzzle(deps());
    expect(r.isError).toBeUndefined();
    expect(r.text).toMatch(/Day 5 puzzle \(medium\): What has keys/);
    expect(r.text).toMatch(/Entry fee: 0\.10 USDC/);
  });

  it("submit_answer pays via x402 and returns the BaseScan link", async () => {
    const r = await submitAnswer(deps(), " piano ");
    expect(r.isError).toBeUndefined();
    expect(r.text).toMatch(/"piano" submitted/);
    expect(r.text).toMatch(/sepolia\.basescan\.org\/tx\/0xfee/);
  });

  it("submit_answer refuses without a wallet or above the fee limit", async () => {
    expect((await submitAnswer(deps({ signer: undefined }), "piano")).text).toMatch(/PLAYER_PRIVATE_KEY/);
    const r = await submitAnswer(deps({ maxFee: 10_000n }), "piano");
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/above the limit/);
  });

  it("get_results explains the day, marks my payout and shows guardrail notes", async () => {
    const r = await getResults(deps());
    expect(r.text).toMatch(/Day 4: 2\/4 correct \(answer: "clock"\)/);
    expect(r.text).toMatch(/← you/);
    expect(r.text).toMatch(/Guardrail: .*hysteresis/);
  });

  it("returns readable errors instead of throwing", async () => {
    const down = (async () => new Response("oops", { status: 500 })) as unknown as typeof fetch;
    const r = await getPuzzle(deps({ fetch: down }));
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/returned 500/);
  });

  it("get_my_wallet shows address and balance", async () => {
    const r = await getMyWallet(deps());
    expect(r.text).toContain(player.address);
    expect(r.text).toMatch(/USDC balance: 1\.20 USDC/);
  });
});
