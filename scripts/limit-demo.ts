// Week-3 video scene: the agent tries to overspend and the delegation's contract says no.
//   1. shows today's on-chain allowance
//   2. a small legit payout through the delegation succeeds (skip with --skip-ok)
//   3. a payout above what's left is simulated → refused by the enforcer
//   4. --send also broadcasts it, so the revert is visible on BaseScan
// Usage: npm run treasury:demo -- [--skip-ok] [--send]
import "./load-env";
import { decodeRevertReason } from "@metamask/smart-accounts-kit/utils";
import { EXPLORER_URL } from "../src/chain/base-sepolia";
import { getAgentWallet } from "../src/server/runtime";
import { buildRedeemCalldata, DelegatedWallet } from "../src/wallet/delegated";
import { formatUsdc, parseUsdc } from "../src/wallet/usdc";

const args = process.argv.slice(2);
const wallet = getAgentWallet();
if (!(wallet instanceof DelegatedWallet)) throw new Error("No delegated treasury configured (run npm run treasury:setup).");
const { config, executor } = wallet;
const recipient = config.owner;

console.log(`Treasury (smart account): ${wallet.address} — ${formatUsdc(await wallet.getBalance())}`);
console.log(`Agent key may spend:      ${formatUsdc(config.dailyLimit)} per 24 h (enforced on-chain)`);
console.log(`Available right now:      ${formatUsdc(await wallet.availableToday())}\n`);

if (!args.includes("--skip-ok")) {
  const amount = parseUsdc("0.01");
  const tx = await wallet.transfer(recipient, amount);
  console.log(`✅ ${formatUsdc(amount)} payout through the delegation: ${EXPLORER_URL}/tx/${tx.txHash}`);
  console.log(`Available now:            ${formatUsdc(await wallet.availableToday())}\n`);
}

const over = (await wallet.availableToday()) + parseUsdc("1");
const data = buildRedeemCalldata(config.delegation, recipient, over);
console.log(`Trying ${formatUsdc(over)} (1 USDC more than the delegation allows today)...`);
try {
  await executor.publicClient.call({ account: executor.account, to: wallet.delegationManager, data });
  console.log("⚠️  Unexpected: the chain allowed it.");
} catch (err) {
  const reason = decodeRevertReason(err);
  console.log(`⛔ Refused on-chain: ${reason?.errorName ?? "revert"} — ${reason?.message ?? (err instanceof Error ? err.message.split("\n")[0] : String(err))}`);
}

if (args.includes("--send")) {
  const hash = await executor.walletClient.sendTransaction({ to: wallet.delegationManager, data, gas: 400_000n });
  const receipt = await executor.publicClient.waitForTransactionReceipt({ hash });
  console.log(`Broadcast anyway → status: ${receipt.status} · ${EXPLORER_URL}/tx/${hash}`);
}
