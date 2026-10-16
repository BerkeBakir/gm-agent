import { describe, expect, it, vi } from "vitest";
import { MockWallet } from "../src/wallet/mock";
import { SpendingGuard, SpendingLimitError } from "../src/wallet/spending-guard";

const PLAYER = "0x000000000000000000000000000000000000beef";

function setup(balance = 100_000_000n) {
  const wallet = new MockWallet(balance); // 100 USDC
  const guard = new SpendingGuard(wallet, {
    maxPerTx: 5_000_000n, // 5 USDC
    maxDailyFractionBps: 1_000, // 10%
  });
  return { wallet, guard };
}

describe("SpendingGuard", () => {
  it("requires startDay before sending", async () => {
    const { guard } = setup();
    await expect(guard.send(PLAYER, 1_000_000n)).rejects.toThrow(/startDay/);
  });

  it("allows payments within limits", async () => {
    const { wallet, guard } = setup();
    await guard.startDay(1);
    await guard.send(PLAYER, 5_000_000n);
    expect(await wallet.getBalance()).toBe(95_000_000n);
    expect(guard.spentToday).toBe(5_000_000n);
  });

  it("rejects a single payment above maxPerTx", async () => {
    const { wallet, guard } = setup();
    await guard.startDay(1);
    await expect(guard.send(PLAYER, 5_000_001n)).rejects.toBeInstanceOf(SpendingLimitError);
    expect(await wallet.getBalance()).toBe(100_000_000n);
  });

  it("caps daily spending at the fraction of the start-of-day balance", async () => {
    const { guard } = setup(); // daily cap = 10 USDC
    await guard.startDay(1);
    await guard.send(PLAYER, 5_000_000n);
    await guard.send(PLAYER, 5_000_000n);
    await expect(guard.send(PLAYER, 1n)).rejects.toBeInstanceOf(SpendingLimitError);
    expect(guard.remainingToday).toBe(0n);
  });

  it("resets the budget on a new day, based on the new balance", async () => {
    const { guard } = setup();
    await guard.startDay(1);
    await guard.send(PLAYER, 5_000_000n);
    await guard.send(PLAYER, 5_000_000n);
    await guard.startDay(2); // balance now 90 USDC → cap 9 USDC
    expect(guard.remainingToday).toBe(9_000_000n);
  });

  it("income during the day does not raise today's cap", async () => {
    const { wallet, guard } = setup();
    await guard.startDay(1);
    wallet.deposit(100_000_000n);
    expect(guard.remainingToday).toBe(10_000_000n);
  });
});

describe("SpendingGuard with an on-chain allowance", () => {
  const limits = { maxPerTx: 5_000_000n, maxDailyFractionBps: 1_000 };

  it("caps the day at the on-chain allowance when it is below the fraction cap", async () => {
    const wallet = new MockWallet(100_000_000n);
    (wallet as MockWallet & { availableToday: () => Promise<bigint> }).availableToday = async () => 1_000_000n;
    const guard = new SpendingGuard(wallet, limits);
    await guard.startDay(1);
    expect(guard.remainingToday).toBe(1_000_000n);
    await expect(guard.send(PLAYER, 2_000_000n)).rejects.toThrow(SpendingLimitError);
  });

  it("falls back to the fraction cap when the allowance read throws", async () => {
    const wallet = new MockWallet(100_000_000n);
    (wallet as MockWallet & { availableToday: () => Promise<bigint> }).availableToday = async () => {
      throw new Error("rpc down");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = new SpendingGuard(wallet, limits);
    await guard.startDay(1);
    expect(guard.remainingToday).toBe(10_000_000n);
    warn.mockRestore();
  });
});
