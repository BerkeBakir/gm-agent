/**
 * The agent's treasury. All amounts are USDC base units (6 decimals) as bigint,
 * so there is no floating-point drift in treasury math.
 *
 * Implementations:
 * - MockWallet: in-memory, used for tests and off-chain simulations
 * - BaseSepoliaWallet (week 3): real on-chain wallet
 */
export type Address = `0x${string}`;

export interface TransferResult {
  txHash: string;
  to: Address;
  amount: bigint;
}

export interface Wallet {
  readonly address: Address;
  getBalance(): Promise<bigint>;
  transfer(to: Address, amount: bigint): Promise<TransferResult>;
}

export class InsufficientFundsError extends Error {
  constructor(balance: bigint, amount: bigint) {
    super(`Insufficient funds: balance ${balance}, requested ${amount}`);
    this.name = "InsufficientFundsError";
  }
}
