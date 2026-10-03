// Usage: npm run balance -- 0xYourAddress
import { formatEther, isAddress } from "viem";
import {
  createBaseSepoliaClient,
  EXPLORER_URL,
  getEthBalance,
  getUsdcBalance,
} from "../src/chain/base-sepolia.js";
import { formatUsdc } from "../src/wallet/usdc.js";

const address = process.argv[2];
if (!address || !isAddress(address)) {
  console.error("Usage: npm run balance -- 0xYourAddress");
  process.exit(1);
}

const client = createBaseSepoliaClient();
const [eth, usdc] = await Promise.all([getEthBalance(client, address), getUsdcBalance(client, address)]);

console.log(`Address: ${address}`);
console.log(`ETH:     ${formatEther(eth)} ETH (gas)`);
console.log(`USDC:    ${formatUsdc(usdc)}`);
console.log(`Explorer: ${EXPLORER_URL}/address/${address}`);
