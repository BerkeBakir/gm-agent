import { randomBytes } from "node:crypto";
import { type Address, InsufficientFundsError, type TransferResult, type Wallet } from "./types.js";

/** In-memory wallet for tests and off-chain simulations. */
export class MockWallet implements Wallet {
  readonly address: Address = "0x00000000000000000000000000000000000a6e47";
  private balance: bigint;

  constructor(initialBalance: bigint) {
    this.balance = initialBalance;
  }

  async getBalance(): Promise<bigint> {
    return this.balance;
  }

  async transfer(to: Address, amount: bigint): Promise<TransferResult> {
    if (amount <= 0n) throw new Error(`Transfer amount must be positive, got ${amount}`);
    if (amount > this.balance) throw new InsufficientFundsError(this.balance, amount);
    this.balance -= amount;
    return { txHash: `0x${randomBytes(32).toString("hex")}`, to, amount };
  }

  /** Simulates incoming funds, e.g. an x402 entry fee. */
  deposit(amount: bigint): void {
    if (amount <= 0n) throw new Error(`Deposit amount must be positive, got ${amount}`);
    this.balance += amount;
  }
}
