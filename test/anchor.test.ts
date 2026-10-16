import { describe, expect, it } from "vitest";
import { ANCHOR_PREFIX, anchorCalldata, decisionHash, parseAnchorCalldata } from "../src/chain/anchor";
import type { DecisionLog } from "../src/game/types";

const log: DecisionLog = {
  id: "a", day: 3, challengeId: "c", treasuryBefore: 10_000_000n, treasuryAfter: 9_000_000n,
  participants: 2, winners: 1, winRate: 0.5, income: 200_000n, rewardPerWinner: 1_000_000n,
  totalPaid: 1_000_000n, nextDifficulty: "medium", decidedBy: "gemini", reasoning: "ok",
  adjustments: [], payouts: [{ player: "0x01", amount: 1_000_000n, txHash: "0xabc" }],
  createdAt: "2026-10-16T12:00:00.000Z",
};

describe("decision anchor", () => {
  it("hash ignores id, createdAt and anchor fields", () => {
    const h = decisionHash(log);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    expect(decisionHash({ ...log, id: "b", createdAt: "x", anchorHash: h, anchorTx: "0x1" })).toBe(h);
  });

  it("hash does not depend on key order but on content", () => {
    const reordered = Object.fromEntries(Object.entries(log).reverse()) as unknown as DecisionLog;
    expect(decisionHash(reordered)).toBe(decisionHash(log));
    expect(decisionHash({ ...log, totalPaid: 1n })).not.toBe(decisionHash(log));
  });

  it("calldata = prefix ‖ hash ‖ commitment and round-trips", () => {
    const h = decisionHash(log);
    const c = `0x${"22".repeat(32)}` as const;
    const data = anchorCalldata(h, c);
    expect(data.startsWith(ANCHOR_PREFIX)).toBe(true);
    expect(data.length).toBe(2 + 8 + 64 + 64);
    expect(parseAnchorCalldata(data)).toEqual({ decisionHash: h, commitment: c });
    expect(parseAnchorCalldata(anchorCalldata(h))?.commitment).toBe(`0x${"0".repeat(64)}`);
    expect(parseAnchorCalldata("0x1234")).toBeNull();
  });
});
