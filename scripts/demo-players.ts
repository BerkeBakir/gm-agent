// End-to-end ON-CHAIN demo with bot players (for the demo video / testing).
//
//   npm run demo:players -- --answers "piano,clock,wrong guess"
//
// 1. Loads (or creates) bot wallets in .demo-players.json (gitignored).
// 2. Tops each bot up to --fund USDC from the agent treasury (bots need NO ETH: x402 is gasless).
// 3. Each bot submits its answer to the live site through the real x402 flow:
//    402 → sign EIP-3009 → X-PAYMENT → settled on-chain.
// Then close the day from the Operator panel (or --close) to see rewards paid on-chain.
//
// Flags: --url <site> (default production), --answers "a,b,c", --fund 0.5, --close
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createBaseSepoliaClient, EXPLORER_URL, getUsdcBalance } from "../src/chain/base-sepolia";
import { BaseSepoliaWallet } from "../src/wallet/base-sepolia";
import { formatUsdc, parseUsdc } from "../src/wallet/usdc";
import { createPaymentHeader, type PaymentRequirements } from "../src/x402/exact";

for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const URL_BASE = arg("url", "https://gm-agent-lime.vercel.app")!;
const answers = (arg("answers") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const fund = parseUsdc(arg("fund", "0.50")!);
if (answers.length === 0) throw new Error('Pass --answers "answer1,answer2,..." (one bot per answer)');

const FILE = ".demo-players.json";
const keys: Hex[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
while (keys.length < answers.length) keys.push(generatePrivateKey());
writeFileSync(FILE, JSON.stringify(keys, null, 2));

const agentKey = process.env.WALLET_PRIVATE_KEY as Hex | undefined;
if (!agentKey) throw new Error("WALLET_PRIVATE_KEY missing in .env");
const agent = new BaseSepoliaWallet(agentKey);
const client = createBaseSepoliaClient();
console.log(`Agent treasury ${agent.address}: ${formatUsdc(await agent.getBalance())}`);

for (const [i, answer] of answers.entries()) {
  const bot = privateKeyToAccount(keys[i]!);
  const bal = await getUsdcBalance(client, bot.address);
  if (bal < fund) {
    const tx = await agent.transfer(bot.address, fund - bal);
    console.log(`bot${i + 1} ${bot.address} topped up → ${EXPLORER_URL}/tx/${tx.txHash}`);
  }

  const first = await fetch(`${URL_BASE}/api/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer }) });
  if (first.status !== 402) {
    console.log(`bot${i + 1}: unexpected ${first.status}`, await first.text());
    continue;
  }
  const { accepts } = (await first.json()) as { accepts: PaymentRequirements[] };
  const header = await createPaymentHeader(bot, accepts[0]!);
  const paid = await fetch(`${URL_BASE}/api/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-PAYMENT": header },
    body: JSON.stringify({ answer }),
  });
  const body = (await paid.json()) as { feeTx?: string; error?: string };
  console.log(`bot${i + 1} answered "${answer}" → ${paid.status}`, body.feeTx ? `fee settled ${EXPLORER_URL}/tx/${body.feeTx}` : body.error);
}

if (process.argv.includes("--close")) {
  const res = await fetch(`${URL_BASE}/api/gm/run-day`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const data = (await res.json()) as { log?: { reasoning: string; payouts: { player: string; amount: string; txHash?: string }[] } };
  console.log("Day closed:", data.log?.reasoning);
  for (const p of data.log?.payouts ?? []) console.log(`  paid ${formatUsdc(BigInt(p.amount))} → ${p.player}`, p.txHash ? `${EXPLORER_URL}/tx/${p.txHash}` : "");
}
