import { createPublicClient, erc20Abi, getAddress, http } from "viem";
import { baseSepolia } from "viem/chains";
import type { Address } from "../wallet/types";

/** Circle's official testnet USDC on Base Sepolia. */
export const BASE_SEPOLIA_USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const EXPLORER_URL = "https://sepolia.basescan.org";

export function createBaseSepoliaClient(rpcUrl = process.env.BASE_SEPOLIA_RPC_URL) {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}

export type BaseSepoliaClient = ReturnType<typeof createBaseSepoliaClient>;

/** USDC balance in 6-decimal base units. */
export async function getUsdcBalance(client: BaseSepoliaClient, owner: Address): Promise<bigint> {
  return client.readContract({
    address: BASE_SEPOLIA_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [getAddress(owner)],
  });
}

/** Native ETH balance in wei (used only for gas). */
export async function getEthBalance(client: BaseSepoliaClient, owner: Address): Promise<bigint> {
  return client.getBalance({ address: getAddress(owner) });
}
