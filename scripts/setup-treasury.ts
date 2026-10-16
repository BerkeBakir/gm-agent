// One-time setup of the delegated treasury (idempotent):
//   1. owner key (.treasury-owner.json, never leaves this machine)
//   2. MetaMask smart account (Hybrid), deployed by the agent EOA
//   3. delegation smart account → agent: USDC only, at most --daily USDC per 24 h (on-chain)
//   4. --move-funds: move the agent EOA's USDC into the smart account
// Usage: npm run treasury:setup -- [--daily 5] [--new-delegation] [--move-funds]
import "./load-env";
import fs from "node:fs";
import { createDelegation, Implementation, toMetaMaskSmartAccount } from "@metamask/smart-accounts-kit";
import { type Hex, isAddressEqual } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { BASE_SEPOLIA_USDC, EXPLORER_URL } from "../src/chain/base-sepolia";
import { getTxSender } from "../src/server/runtime";
import { DelegatedWallet } from "../src/wallet/delegated";
import { DEFAULT_TREASURY_CONFIG, loadTreasuryConfig, periodStart, serializeTreasuryConfig, type TreasuryConfig } from "../src/wallet/treasury-config";
import { formatUsdc, parseUsdc } from "../src/wallet/usdc";

const OWNER_FILE = ".treasury-owner.json";
const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const opt = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

const agent = getTxSender();

let ownerKey: Hex;
if (fs.existsSync(OWNER_FILE)) {
  ownerKey = (JSON.parse(fs.readFileSync(OWNER_FILE, "utf8")) as { privateKey: Hex }).privateKey;
} else {
  ownerKey = generatePrivateKey();
  fs.writeFileSync(OWNER_FILE, JSON.stringify({ privateKey: ownerKey }, null, 2));
  console.log(`Created owner key in ${OWNER_FILE} (keep it safe, never commit it).`);
}
const owner = privateKeyToAccount(ownerKey);

// The kit ships its own viem typings, so our client is cast to the kit's parameter type (runtime is identical).
type KitClient = Parameters<typeof toMetaMaskSmartAccount>[0]["client"];
const smartAccount = await toMetaMaskSmartAccount({
  client: agent.publicClient as unknown as KitClient,
  implementation: Implementation.Hybrid,
  deployParams: [owner.address, [], [], []],
  deploySalt: "0x",
  signer: { account: owner },
});
console.log(`Owner:         ${owner.address}`);
console.log(`Agent (EOA):   ${agent.address}`);
console.log(`Smart account: ${smartAccount.address}`);

const code = await agent.publicClient.getCode({ address: smartAccount.address });
if (!code || code === "0x") {
  const { factory, factoryData } = await smartAccount.getFactoryArgs();
  if (!factory || !factoryData) throw new Error("No factory args for the smart account");
  const hash = await agent.walletClient.sendTransaction({ to: factory, data: factoryData });
  const receipt = await agent.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Deploy reverted: ${hash}`);
  console.log(`Deployed smart account: ${EXPLORER_URL}/tx/${hash}`);
} else {
  console.log("Smart account already deployed.");
}

let config = loadTreasuryConfig();
let regenerateReason: string | null = null;
if (!config) regenerateReason = "no delegation yet";
else if (has("--new-delegation")) regenerateReason = "--new-delegation";
else if (!isAddressEqual(config.smartAccount, smartAccount.address)) regenerateReason = "smart account changed";
else if (!isAddressEqual(config.agent, agent.address)) regenerateReason = `agent key changed (${config.agent} -> ${agent.address})`;

if (config && !regenerateReason && has("--daily")) {
  console.log("Note: --daily is ignored unless --new-delegation is given (the existing delegation keeps its limit).");
}
if (regenerateReason) {
  if (config) {
    console.log(`Regenerating the delegation (${regenerateReason}).`);
    console.log(
      `WARNING: the previous delegation to ${config.agent} stays valid on-chain until it is revoked. ` +
        "If that agent key is still in use, revoke the old delegation (owner disables it on the DelegationManager).",
    );
  }
  const dailyLimit = parseUsdc(opt("--daily", "5"));
  const startDate = periodStart(new Date());
  const delegation = createDelegation({
    to: agent.address,
    from: smartAccount.address,
    environment: smartAccount.environment,
    scope: { type: "erc20PeriodTransfer", tokenAddress: BASE_SEPOLIA_USDC, periodAmount: dailyLimit, periodDuration: 86400, startDate },
  });
  const signature = await smartAccount.signDelegation({ delegation });
  const next: TreasuryConfig = {
    chainId: 84532,
    smartAccount: smartAccount.address,
    owner: owner.address,
    agent: agent.address,
    token: BASE_SEPOLIA_USDC,
    dailyLimit,
    periodDuration: 86400,
    startDate,
    delegation: { ...delegation, signature },
  };
  fs.mkdirSync("treasury", { recursive: true });
  fs.writeFileSync(DEFAULT_TREASURY_CONFIG, serializeTreasuryConfig(next));
  config = next;
  console.log(`Signed delegation: ${formatUsdc(dailyLimit)} per 24 h → ${DEFAULT_TREASURY_CONFIG} (commit this file).`);
}

if (has("--move-funds")) {
  const balance = await agent.getBalance();
  if (balance > 0n) {
    const tx = await agent.transfer(smartAccount.address, balance);
    console.log(`Moved ${formatUsdc(balance)} into the smart account: ${EXPLORER_URL}/tx/${tx.txHash}`);
  } else {
    console.log("Agent EOA holds no USDC, nothing to move.");
  }
}

if (!config) throw new Error("Treasury config missing after setup.");
const treasury = new DelegatedWallet(config, agent);
console.log(`Treasury balance: ${formatUsdc(await treasury.getBalance())}`);
console.log(`Available today:  ${formatUsdc(await treasury.availableToday())} of ${formatUsdc(config.dailyLimit)}`);
