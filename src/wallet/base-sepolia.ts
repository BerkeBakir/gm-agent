import { createWalletClient, erc20Abi, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_USDC, createBaseSepoliaClient, getUsdcBalance } from "../chain/base-sepolia";
import { type Address, InsufficientFundsError, type TransferResult, type Wallet } from "./types";

/** The agent's real treasury: USDC on Base Sepolia, signed with the agent's private key. */
export class BaseSepoliaWallet implements Wallet {
  readonly address: Address;
  readonly account;
  readonly publicClient = createBaseSepoliaClient();
  readonly walletClient;

  constructor(privateKey: Hex, rpcUrl = process.env.BASE_SEPOLIA_RPC_URL) {
    this.account = privateKeyToAccount(privateKey);
    this.address = this.account.address;
    this.walletClient = createWalletClient({ account: this.account, chain: baseSepolia, transport: http(rpcUrl) });
  }

  getBalance(): Promise<bigint> {
    return getUsdcBalance(this.publicClient, this.address);
  }

  async transfer(to: Address, amount: bigint): Promise<TransferResult> {
    if (amount <= 0n) throw new Error(`Transfer amount must be positive, got ${amount}`);
    const balance = await this.getBalance();
    if (amount > balance) throw new InsufficientFundsError(balance, amount);

    const txHash = await this.walletClient.writeContract({
      address: BASE_SEPOLIA_USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [getAddress(to), amount],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error(`USDC transfer reverted: ${txHash}`);
    return { txHash, to, amount };
  }
}
