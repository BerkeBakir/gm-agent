import type { Address, TransferResult, Wallet } from "./types";

export interface SpendingLimits {
  /** Hard cap for a single payment (USDC base units). */
  maxPerTx: bigint;
  /** Daily cap as basis points of the start-of-day balance (1000 = 10%). */
  maxDailyFractionBps: number;
}

export class SpendingLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendingLimitError";
  }
}

/** Fraction-of-balance daily cap, lowered to what the wallet's on-chain limit still allows (if it has one). */
export async function dailyBudget(wallet: Wallet, balance: bigint, limits: SpendingLimits): Promise<bigint> {
  const fractionCap = (balance * BigInt(limits.maxDailyFractionBps)) / 10_000n;
  if (typeof wallet.availableToday !== "function") return fractionCap;
  try {
    const available = await wallet.availableToday();
    return available < fractionCap ? available : fractionCap;
  } catch (err) {
    console.warn(`Could not read the on-chain allowance, using the fraction cap: ${err instanceof Error ? err.message : String(err)}`);
    return fractionCap;
  }
}

/**
 * Every payment goes through here. The LLM decides amounts, but these limits
 * are enforced in code and cannot be talked around.
 */
export class SpendingGuard {
  private day: number | null = null;
  private dailyCap = 0n;
  private spent = 0n;

  constructor(
    private readonly wallet: Wallet,
    private readonly limits: SpendingLimits,
  ) {}

  /** Opens a new day's budget, based on the balance at this moment. */
  async startDay(day: number): Promise<void> {
    const balance = await this.wallet.getBalance();
    this.day = day;
    this.dailyCap = await dailyBudget(this.wallet, balance, this.limits);
    this.spent = 0n;
  }

  get spentToday(): bigint {
    return this.spent;
  }

  get remainingToday(): bigint {
    return this.dailyCap - this.spent;
  }

  async send(to: Address, amount: bigint): Promise<TransferResult> {
    if (this.day === null) throw new Error("SpendingGuard: call startDay() before sending");
    if (amount > this.limits.maxPerTx) {
      throw new SpendingLimitError(`Amount ${amount} exceeds per-tx limit ${this.limits.maxPerTx}`);
    }
    if (amount > this.remainingToday) {
      throw new SpendingLimitError(`Amount ${amount} exceeds remaining daily budget ${this.remainingToday}`);
    }
    const result = await this.wallet.transfer(to, amount);
    this.spent += amount;
    return result;
  }
}
