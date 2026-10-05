import { describe, expect, it } from "vitest";
import { formatUsdc, parseUsdc } from "../src/wallet/usdc";

describe("parseUsdc", () => {
  it("converts human-readable amounts to 6-decimal base units", () => {
    expect(parseUsdc("1")).toBe(1_000_000n);
    expect(parseUsdc("0.50")).toBe(500_000n);
    expect(parseUsdc("42.123456")).toBe(42_123_456n);
  });

  it("rejects more than 6 decimals, negatives and garbage", () => {
    expect(() => parseUsdc("0.1234567")).toThrow();
    expect(() => parseUsdc("-1")).toThrow();
    expect(() => parseUsdc("abc")).toThrow();
  });
});

describe("formatUsdc", () => {
  it("formats base units with two decimals minimum", () => {
    expect(formatUsdc(1_000_000n)).toBe("1.00 USDC");
    expect(formatUsdc(500_000n)).toBe("0.50 USDC");
    expect(formatUsdc(42_123_456n)).toBe("42.123456 USDC");
  });
});
