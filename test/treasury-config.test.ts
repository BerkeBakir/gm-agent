import { describe, expect, it } from "vitest";
import { parseTreasuryConfig, periodStart } from "../src/wallet/treasury-config";

describe("periodStart", () => {
  it("before 11:30 UTC uses the previous day's 11:30", () => {
    expect(periodStart(new Date("2026-10-16T10:00:00Z"))).toBe(Date.parse("2026-10-15T11:30:00Z") / 1000);
  });
  it("after 11:30 UTC uses the same day's 11:30", () => {
    expect(periodStart(new Date("2026-10-16T15:00:00Z"))).toBe(Date.parse("2026-10-16T11:30:00Z") / 1000);
  });
});

describe("parseTreasuryConfig validation", () => {
  const base = {
    chainId: 84532, smartAccount: "0x1", owner: "0x2", agent: "0x3", token: "0x4", dailyLimit: "5000000",
    periodDuration: 86400, startDate: 1, delegation: { signature: "0x1234" },
  };
  it("accepts a complete config", () => {
    expect(parseTreasuryConfig(JSON.stringify(base)).dailyLimit).toBe(5_000_000n);
  });
  it.each(["chainId", "periodDuration", "startDate"])("requires %s", (k) => {
    const c: Record<string, unknown> = { ...base };
    delete c[k];
    expect(() => parseTreasuryConfig(JSON.stringify(c))).toThrow(/missing/);
  });
  it("rejects a wrong chain", () => {
    expect(() => parseTreasuryConfig(JSON.stringify({ ...base, chainId: 1 }))).toThrow(/84532/);
  });
});
