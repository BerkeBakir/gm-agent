import { createDelegation, getSmartAccountsEnvironment, type Delegation } from "@metamask/smart-accounts-kit";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import { decodeFunctionData, ExecutionRevertedError, parseAbi } from "viem";
import { describe, expect, it, vi } from "vitest";
import { BASE_SEPOLIA_USDC } from "../src/chain/base-sepolia";
import { BaseSepoliaWallet } from "../src/wallet/base-sepolia";
import { buildRedeemCalldata, DelegatedWallet, OnChainLimitError } from "../src/wallet/delegated";
import { parseTreasuryConfig, serializeTreasuryConfig, type TreasuryConfig } from "../src/wallet/treasury-config";

const AGENT_KEY = `0x${"ab".repeat(32)}` as const;
const SMART = "0x6195934a02e820215aB3eEc02707CA38eec4A21C";
const TO = "0x000000000000000000000000000000000000bEEF";
const env = getSmartAccountsEnvironment(84532);

function delegation(agent: `0x${string}`): Delegation {
  const d = createDelegation({
    to: agent,
    from: SMART,
    environment: env,
    scope: { type: "erc20PeriodTransfer", tokenAddress: BASE_SEPOLIA_USDC, periodAmount: 5_000_000n, periodDuration: 86400, startDate: 1_760_572_800 },
  });
  return { ...d, signature: "0x1234" };
}

function config(agent: `0x${string}`): TreasuryConfig {
  return {
    chainId: 84532, smartAccount: SMART, owner: "0x0000000000000000000000000000000000000001", agent,
    token: BASE_SEPOLIA_USDC, dailyLimit: 5_000_000n, periodDuration: 86400, startDate: 1_760_572_800,
    delegation: delegation(agent),
  };
}

const redeemAbi = parseAbi(["function redeemDelegations(bytes[] _permissionContexts, bytes32[] _modes, bytes[] _executionCallDatas)"]);

describe("buildRedeemCalldata", () => {
  it("redeems the signed delegation with a single USDC transfer", () => {
    const agent = new BaseSepoliaWallet(AGENT_KEY);
    const d = delegation(agent.address);
    const data = buildRedeemCalldata(d, TO, 1_500_000n);
    const { functionName, args } = decodeFunctionData({ abi: redeemAbi, data });
    expect(functionName).toBe("redeemDelegations");
    const [contexts, modes, executions] = args;
    expect(modes).toHaveLength(1);
    expect(decodeDelegations(contexts[0]!)[0]?.delegate.toLowerCase()).toBe(agent.address.toLowerCase());
    const exec = executions[0]!.toLowerCase();
    expect(exec.startsWith(BASE_SEPOLIA_USDC.toLowerCase())).toBe(true); // packed: target ‖ value ‖ calldata
    expect(exec).toContain("a9059cbb"); // transfer(address,uint256)
    expect(exec).toContain(TO.slice(2).toLowerCase());
    expect(exec).toContain((1_500_000n).toString(16).padStart(64, "0"));
  });
});

describe("treasury config", () => {
  it("round-trips through JSON with bigints as strings", () => {
    const c = config(new BaseSepoliaWallet(AGENT_KEY).address);
    const json = serializeTreasuryConfig(c);
    expect(json).toContain('"dailyLimit": "5000000"');
    expect(parseTreasuryConfig(json)).toEqual(c);
  });

  it("refuses an unsigned delegation", () => {
    const c = config(new BaseSepoliaWallet(AGENT_KEY).address);
    const json = serializeTreasuryConfig({ ...c, delegation: { ...c.delegation, signature: "0x" } });
    expect(() => parseTreasuryConfig(json)).toThrow(/not signed/);
  });
});

describe("DelegatedWallet", () => {
  it("uses the smart account as its address", () => {
    const agent = new BaseSepoliaWallet(AGENT_KEY);
    expect(new DelegatedWallet(config(agent.address), agent).address).toBe(SMART);
  });

  it("refuses a delegation made for another agent key", () => {
    const agent = new BaseSepoliaWallet(AGENT_KEY);
    expect(() => new DelegatedWallet(config("0x0000000000000000000000000000000000000002"), agent)).toThrow(/Delegation is for/);
  });

  it("refuses a treasury token that is not Base Sepolia USDC", () => {
    const agent = new BaseSepoliaWallet(AGENT_KEY);
    const c = { ...config(agent.address), token: "0x0000000000000000000000000000000000000003" as const };
    expect(() => new DelegatedWallet(c, agent)).toThrow(/not Base Sepolia USDC/);
  });

  it("rethrows a non-revert error unchanged", async () => {
    const agent = new BaseSepoliaWallet(AGENT_KEY);
    const wallet = new DelegatedWallet(config(agent.address), agent);
    vi.spyOn(wallet, "getBalance").mockResolvedValue(10_000_000n);
    vi.spyOn(agent.publicClient, "call").mockRejectedValue(new Error("network down"));
    const error = await wallet.transfer(TO, 1n).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("network down");
    expect(error).not.toBeInstanceOf(OnChainLimitError);
  });

  it("maps a contract revert to OnChainLimitError", async () => {
    const agent = new BaseSepoliaWallet(AGENT_KEY);
    const wallet = new DelegatedWallet(config(agent.address), agent);
    vi.spyOn(wallet, "getBalance").mockResolvedValue(10_000_000n);
    vi.spyOn(agent.publicClient, "call").mockRejectedValue(
      new ExecutionRevertedError({ message: "ERC20PeriodTransferEnforcer:transfer-amount-exceeded" }),
    );
    await expect(wallet.transfer(TO, 1n)).rejects.toBeInstanceOf(OnChainLimitError);
  });
});
