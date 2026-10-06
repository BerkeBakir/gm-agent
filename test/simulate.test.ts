import { describe, expect, it } from "vitest";
import { RuleBasedDecisionMaker } from "../src/gm/strategies";
import { DEFAULT_SIM, simulate } from "../src/sim/simulate";

const cfg = { ...DEFAULT_SIM, days: 10, players: 15 };

describe("simulate", () => {
  it("runs N days and reports metrics", async () => {
    const r = await simulate(new RuleBasedDecisionMaker("adaptive"), cfg);
    expect(r.days).toHaveLength(10);
    expect(r.summary.totalIncome).toBeGreaterThan(0);
    expect(r.days.every((d) => d.reasoning.length > 0)).toBe(true);
  });

  it("is deterministic for the same seed", async () => {
    const a = await simulate(new RuleBasedDecisionMaker("fixed"), cfg);
    const b = await simulate(new RuleBasedDecisionMaker("fixed"), cfg);
    expect(a.summary).toEqual(b.summary);
  });

  it("never lets the treasury go negative or pay above the daily budget", async () => {
    const r = await simulate(new RuleBasedDecisionMaker("generous"), cfg);
    for (const d of r.days) {
      expect(d.treasury).toBeGreaterThanOrEqual(0);
      expect(d.rewardPerWinner).toBeLessThanOrEqual(2);
    }
  });
});
