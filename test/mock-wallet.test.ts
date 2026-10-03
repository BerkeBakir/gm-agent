import { describe, expect, it } from "vitest";
import { MockWallet } from "../src/wallet/mock.js";
import { InsufficientFundsError } from "../src/wallet/types.js";

const PLAYER = "0x000000000000000000000000000000000000beef";

describe("MockWallet", () => {
  it("starts with the given balance", async () => {
    const wallet = new MockWallet(10_000_000n);
    expect(await wallet.getBalance()).toBe(10_000_000n);
  });

  it("transfers reduce balance and return a fake tx hash", async () => {
    const wallet = new MockWallet(10_000_000n);
    const result = await wallet.transfer(PLAYER, 2_500_000n);
    expect(await wallet.getBalance()).toBe(7_500_000n);
    expect(result.to).toBe(PLAYER);
    expect(result.amount).toBe(2_500_000n);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("refuses transfers above balance", async () => {
    const wallet = new MockWallet(1_000_000n);
    await expect(wallet.transfer(PLAYER, 1_000_001n)).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await wallet.getBalance()).toBe(1_000_000n);
  });

  it("refuses non-positive amounts", async () => {
    const wallet = new MockWallet(1_000_000n);
    await expect(wallet.transfer(PLAYER, 0n)).rejects.toThrow();
  });

  it("deposit simulates x402 entry-fee income", async () => {
    const wallet = new MockWallet(0n);
    wallet.deposit(100_000n);
    expect(await wallet.getBalance()).toBe(100_000n);
  });
});
