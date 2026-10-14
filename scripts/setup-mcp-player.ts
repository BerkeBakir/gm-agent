// Creates (once) the test wallet the MCP server plays with, and tops it up from the agent treasury.
//
//   npm run mcp:setup -- --fund 0.5
//
// The key is stored in .mcp-player.json (gitignored) and read by mcp/server.ts, so it never has to be
// pasted into an MCP config. Base Sepolia testnet only; the wallet needs USDC but no ETH (x402 is gasless).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createBaseSepoliaClient, EXPLORER_URL, getUsdcBalance } from "../src/chain/base-sepolia";
import { BaseSepoliaWallet } from "../src/wallet/base-sepolia";
import { formatUsdc, parseUsdc } from "../src/wallet/usdc";

for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

const FILE = ".mcp-player.json";
const i = process.argv.indexOf("--fund");
const target = parseUsdc(i >= 0 ? process.argv[i + 1]! : "0.5");

let key: Hex;
if (existsSync(FILE)) key = (JSON.parse(readFileSync(FILE, "utf8")) as { privateKey: Hex }).privateKey;
else {
  key = generatePrivateKey();
  writeFileSync(FILE, JSON.stringify({ privateKey: key }, null, 2));
}
const player = privateKeyToAccount(key);
const client = createBaseSepoliaClient();
const balance = await getUsdcBalance(client, player.address);
console.log(`MCP player wallet ${player.address}: ${formatUsdc(balance)}`);

if (balance < target) {
  const agentKey = process.env.WALLET_PRIVATE_KEY as Hex | undefined;
  if (!agentKey) throw new Error("WALLET_PRIVATE_KEY missing in .env (needed to top up from the treasury)");
  const tx = await new BaseSepoliaWallet(agentKey).transfer(player.address, target - balance);
  console.log(`Topped up to ${formatUsdc(target)} → ${EXPLORER_URL}/tx/${tx.txHash}`);
}
console.log(`\nConnect it to Claude Code:\n  claude mcp add gm-agent -- npx tsx "${process.cwd().replaceAll("\\", "/")}/mcp/server.ts"`);
