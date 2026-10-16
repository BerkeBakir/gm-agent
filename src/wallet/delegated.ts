import {
  contracts,
  createCaveatEnforcerClient,
  createExecution,
  type Delegation,
  ExecutionMode,
  getSmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { decodeRevertReason } from "@metamask/smart-accounts-kit/utils";
import { encodeFunctionData, erc20Abi, getAddress, type Hex } from "viem";
import { BASE_SEPOLIA_USDC, getUsdcBalance } from "../chain/base-sepolia";
import type { BaseSepoliaWallet } from "./base-sepolia";
import type { TreasuryConfig } from "./treasury-config";
import { type Address, InsufficientFundsError, type TransferResult, type Wallet } from "./types";

/** The delegation's on-chain caveats (e.g. the daily limit) refused a transfer. */
export class OnChainLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnChainLimitError";
  }
}

/** Calldata for DelegationManager.redeemDelegations: one delegation, one USDC transfer. */
export function buildRedeemCalldata(delegation: Delegation, to: Address, amount: bigint): Hex {
  const execution = createExecution({
    target: BASE_SEPOLIA_USDC,
    callData: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(to), amount] }),
  });
  return contracts.DelegationManager.encode.redeemDelegations({
    delegations: [[delegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });
}

/**
 * The treasury as a MetaMask smart account. The agent's EOA holds no USDC: it can only move
 * money by redeeming the owner's delegation, whose daily limit is enforced by a contract.
 */
export class DelegatedWallet implements Wallet {
  readonly address: Address;
  readonly delegationManager: Address;

  constructor(
    readonly config: TreasuryConfig,
    readonly executor: BaseSepoliaWallet,
  ) {
    if (getAddress(config.agent) !== executor.address) {
      throw new Error(`Delegation is for ${config.agent}, but the agent key is ${executor.address}`);
    }
    this.address = getAddress(config.smartAccount);
    this.delegationManager = getSmartAccountsEnvironment(config.chainId).DelegationManager;
  }

  getBalance(): Promise<bigint> {
    return getUsdcBalance(this.executor.publicClient, this.address);
  }

  /** What the delegation still allows today, read from the enforcer contract. */
  async availableToday(): Promise<bigint> {
    const client = createCaveatEnforcerClient({
      client: this.executor.publicClient,
      environment: getSmartAccountsEnvironment(this.config.chainId),
    });
    const { availableAmount } = await client.getErc20PeriodTransferEnforcerAvailableAmount({ delegation: this.config.delegation });
    return availableAmount;
  }

  async transfer(to: Address, amount: bigint): Promise<TransferResult> {
    if (amount <= 0n) throw new Error(`Transfer amount must be positive, got ${amount}`);
    const balance = await this.getBalance();
    if (amount > balance) throw new InsufficientFundsError(balance, amount);

    const data = buildRedeemCalldata(this.config.delegation, to, amount);
    let txHash: Hex;
    try {
      // Simulate first so a refused transfer costs no gas and returns a readable reason.
      await this.executor.publicClient.call({ account: this.executor.account, to: this.delegationManager, data });
      txHash = await this.executor.walletClient.sendTransaction({ to: this.delegationManager, data });
    } catch (err) {
      const reason = decodeRevertReason(err);
      throw new OnChainLimitError(`Delegation refused the transfer: ${reason?.message ?? (err instanceof Error ? err.message : String(err))}`);
    }
    const receipt = await this.executor.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new OnChainLimitError(`Delegated transfer reverted: ${txHash}`);
    return { txHash, to, amount };
  }
}
