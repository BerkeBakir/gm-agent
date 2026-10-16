// Emergency withdrawal: proves the owner can always pull funds out of the treasury, with no bundler.
// The owner signs a one-off delegation (smart account → agent EOA, USDC, at most --amount) and the
// agent EOA redeems it, so the owner needs no ETH. The delegation is never written to disk.
// Usage: npm run treasury:withdraw -- --amount 0.5 [--to 0x...]   (default --to = the agent EOA)
import "./load-env";
import fs from "node:fs";
import { createDelegation, Implementation, toMetaMaskSmartAccount } from "@metamask/smart-accounts-kit";
import { getAddress, isAddress, isAddressEqual, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_SEPOLIA_USDC, EXPLORER_URL, getUsdcBalance } from "../src/chain/base-sepolia";
import { getTxSender } from "../src/server/runtime";
import { buildRedeemCalldata } from "../src/wallet/delegated";
import { loadTreasuryConfig } from "../src/wallet/treasury-config";
import { formatUsdc, parseUsdc } from "../src/wallet/usdc";

const OWNER_FILE = ".treasury-owner.json";
const args = process.argv.slice(2);
const opt = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1]! : undefined;
};

const amountArg = opt("--amount");
if (!amountArg) throw new Error("Usage: npm run treasury:withdraw -- --amount 0.5 [--to 0x...]");
const amount = parseUsdc(amountArg);
if (amount <= 0n) throw new Error("--amount must be positive.");

const config = loadTreasuryConfig();
if (!config) throw new Error("No treasury config (treasury/delegation.json); nothing to withdraw from.");
if (!fs.existsSync(OWNER_FILE)) throw new Error(`${OWNER_FILE} not found: only the treasury owner can withdraw.`);
const owner = privateKeyToAccount((JSON.parse(fs.readFileSync(OWNER_FILE, "utf8")) as { privateKey: Hex }).privateKey);

const agent = getTxSender();
const toArg = opt("--to");
if (toArg && !isAddress(toArg)) throw new Error(`--to is not an address: ${toArg}`);
const to = getAddress(toArg ?? agent.address);

// Same construction as setup-treasury.ts (the kit ships its own viem typings, hence the cast).
type KitClient = Parameters<typeof toMetaMaskSmartAccount>[0]["client"];
const smartAccount = await toMetaMaskSmartAccount({
  client: agent.publicClient as unknown as KitClient,
  implementation: Implementation.Hybrid,
  deployParams: [owner.address, [], [], []],
  deploySalt: "0x",
  signer: { account: owner },
});
if (!isAddressEqual(smartAccount.address, config.smartAccount)) {
  throw new Error(`Owner key rebuilds smart account ${smartAccount.address}, but the config says ${config.smartAccount}.`);
}

const balance = await getUsdcBalance(agent.publicClient, smartAccount.address);
if (amount > balance) throw new Error(`Treasury holds ${formatUsdc(balance)}, cannot withdraw ${formatUsdc(amount)}.`);
console.log(`Withdrawing ${formatUsdc(amount)} from ${smartAccount.address} to ${to}...`);

const delegation = createDelegation({
  to: agent.address,
  from: smartAccount.address,
  environment: smartAccount.environment,
  scope: { type: "erc20TransferAmount", tokenAddress: BASE_SEPOLIA_USDC, maxAmount: amount },
});
const signature = await smartAccount.signDelegation({ delegation });
const data = buildRedeemCalldata({ ...delegation, signature }, to, amount);

const manager = smartAccount.environment.DelegationManager;
await agent.publicClient.call({ account: agent.account, to: manager, data }); // simulate: throws with the reason if refused
const hash = await agent.walletClient.sendTransaction({ to: manager, data });
const receipt = await agent.publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`Withdrawal reverted: ${EXPLORER_URL}/tx/${hash}`);
console.log(`Done: ${EXPLORER_URL}/tx/${hash}`);
console.log(`Treasury balance now: ${formatUsdc(await getUsdcBalance(agent.publicClient, smartAccount.address))}`);
