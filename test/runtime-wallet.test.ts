import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDelegation, getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import { afterEach, describe, expect, it } from "vitest";
import { BASE_SEPOLIA_USDC } from "../src/chain/base-sepolia";
import { getAgentWallet, getTxSender } from "../src/server/runtime";
import { BaseSepoliaWallet } from "../src/wallet/base-sepolia";
import { DelegatedWallet } from "../src/wallet/delegated";
import { serializeTreasuryConfig } from "../src/wallet/treasury-config";

const KEY = `0x${"cd".repeat(32)}` as const;
const SMART = "0x6195934a02e820215aB3eEc02707CA38eec4A21C";
const saved = { ...process.env };

function writeConfig(agent: `0x${string}`): string {
  const d = createDelegation({
    to: agent, from: SMART, environment: getSmartAccountsEnvironment(84532),
    scope: { type: "erc20PeriodTransfer", tokenAddress: BASE_SEPOLIA_USDC, periodAmount: 5_000_000n, periodDuration: 86400, startDate: 1_760_572_800 },
  });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gm-")), "delegation.json");
  fs.writeFileSync(file, serializeTreasuryConfig({
    chainId: 84532, smartAccount: SMART, owner: "0x0000000000000000000000000000000000000001", agent,
    token: BASE_SEPOLIA_USDC, dailyLimit: 5_000_000n, periodDuration: 86400, startDate: 1_760_572_800,
    delegation: { ...d, signature: "0x1234" },
  }));
  return file;
}

afterEach(() => {
  process.env = { ...saved };
});

describe("getAgentWallet", () => {
  it("uses the delegated treasury when a config exists", () => {
    process.env.WALLET_PRIVATE_KEY = KEY;
    process.env.TREASURY_CONFIG = writeConfig(new BaseSepoliaWallet(KEY).address);
    delete process.env.TREASURY_MODE;
    const w = getAgentWallet();
    expect(w).toBeInstanceOf(DelegatedWallet);
    expect(w.address).toBe(SMART);
    expect(getTxSender().address).toBe(new BaseSepoliaWallet(KEY).address);
  });

  it("falls back to the EOA without a config", () => {
    process.env.WALLET_PRIVATE_KEY = KEY;
    process.env.TREASURY_CONFIG = path.join(os.tmpdir(), "does-not-exist.json");
    expect(getAgentWallet()).toBeInstanceOf(BaseSepoliaWallet);
  });

  it("TREASURY_MODE=eoa forces the EOA, =delegated requires the config", () => {
    process.env.WALLET_PRIVATE_KEY = KEY;
    process.env.TREASURY_CONFIG = writeConfig(new BaseSepoliaWallet(KEY).address);
    process.env.TREASURY_MODE = "eoa";
    expect(getAgentWallet()).toBeInstanceOf(BaseSepoliaWallet);
    process.env.TREASURY_MODE = "delegated";
    process.env.TREASURY_CONFIG = path.join(os.tmpdir(), "does-not-exist.json");
    expect(() => getAgentWallet()).toThrow(/delegation\.json/);
  });
});
