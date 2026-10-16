# GM Agent v3 — Delegated Treasury Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the agent's USDC into a MetaMask smart account that the agent can only spend through a delegation with an on-chain daily limit, and add verifiable answer commitments + an on-chain anchor of each day's decision.

**Architecture:** A new `DelegatedWallet` implements the existing `Wallet` interface: balance = smart account's USDC, `transfer` = agent EOA calls `DelegationManager.redeemDelegations` with a signed `erc20PeriodTransfer` delegation. `runtime.ts` picks it when `treasury/delegation.json` exists, so every consumer (run-day, x402 submit, scripts) switches automatically. Commitments live on the `Challenge`; the anchor is an optional `RunDayDeps.anchor` callback.

**Tech Stack:** Next.js 16, TypeScript, viem 2.57, `@metamask/smart-accounts-kit` 2.0.0, Neon Postgres, Vitest. Chain: Base Sepolia (84532), USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

Spec: `docs/superpowers/specs/2026-10-16-delegated-treasury-design.md`.

## Global Constraints

- Code, comments, commit messages, README: English. Match the existing style (short doc comments, no semicolon-free style changes, 2-space indent, double quotes).
- All USDC amounts are `bigint` base units (6 decimals). JSON output uses `jsonSafe` / string bigints.
- Never commit secrets: `.env*`, `.treasury-owner.json`, `.agent-wallet.json`. `treasury/delegation.json` IS committed (public by design).
- Daily on-chain limit default: 5 USDC (`5_000_000n`), `periodDuration` 86400, `startDate` = today 00:00 UTC.
- Before every commit: `npm run typecheck && npm test` must pass. Before the final merge also `npm run build`.
- Simulations and tests must keep working without any treasury file or network (they use `MockWallet`).
- Work on branch `week3-delegated-treasury` in `D:\Claude Code\gm-agent`.

---

### Task 1: Answer commitments

**Files:**
- Create: `src/game/commitment.ts`
- Modify: `src/game/types.ts` (Challenge, PublicChallenge, toPublicChallenge)
- Modify: `src/game/store.ts` (MemoryGameStore.createChallenge)
- Modify: `src/game/postgres-store.ts` (ChallengeRow, toChallenge, init, createChallenge)
- Modify: `src/game/index.ts` (re-export)
- Test: `test/commitment.test.ts`, `test/game-store.test.ts`

**Interfaces:**
- Produces: `commitAnswer(salt: Hex, answer: string): Hex`, `makeCommitment(answer: string): { salt: Hex; commitment: Hex }`, `verifyCommitment(commitment: Hex, salt: Hex, answer: string): boolean` from `src/game/commitment.ts` (re-exported from `src/game`). `Challenge.commitment?: Hex`, `Challenge.salt?: Hex`. `PublicChallenge` has `commitment` but never `salt`.

- [ ] **Step 1: Write failing tests**

`test/commitment.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { commitAnswer, makeCommitment, verifyCommitment } from "../src/game/commitment";

describe("answer commitments", () => {
  it("verifies the committed answer, normalized", () => {
    const { salt, commitment } = makeCommitment("An Egg!");
    expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verifyCommitment(commitment, salt, "an egg")).toBe(true);
  });

  it("rejects a different answer or salt", () => {
    const { salt, commitment } = makeCommitment("egg");
    expect(verifyCommitment(commitment, salt, "chicken")).toBe(false);
    const other = makeCommitment("egg");
    expect(verifyCommitment(commitment, other.salt, "egg")).toBe(false);
  });

  it("is deterministic for a given salt", () => {
    const salt = `0x${"11".repeat(32)}` as const;
    expect(commitAnswer(salt, "Glove")).toBe(commitAnswer(salt, "  glove "));
  });
});
```

Append to `test/game-store.test.ts` inside `describe("MemoryGameStore", ...)`:
```ts
  it("commits to the answer and hides the salt from players", async () => {
    const store = new MemoryGameStore();
    const c = await store.createChallenge(input);
    expect(c.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verifyCommitment(c.commitment!, c.salt!, c.answer)).toBe(true);
    const pub = toPublicChallenge(c);
    expect(pub).toHaveProperty("commitment", c.commitment);
    expect(pub).not.toHaveProperty("salt");
    expect(pub).not.toHaveProperty("answer");
  });
```
and add `import { verifyCommitment } from "../src/game/commitment";` at the top.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/commitment.test.ts test/game-store.test.ts`
Expected: FAIL (module `../src/game/commitment` not found).

- [ ] **Step 3: Implement**

`src/game/commitment.ts`:
```ts
import { randomBytes } from "node:crypto";
import { encodeAbiParameters, type Hex, keccak256, toHex } from "viem";
import { normalizeAnswer } from "./answers";

/**
 * Commit-reveal for the answer key: the commitment is published when a puzzle opens,
 * the salt when it closes, so anyone can check the GM never changed the answer.
 * commitment = keccak256(abi.encode(bytes32 salt, string normalizedAnswer))
 */
export function commitAnswer(salt: Hex, answer: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "string" }], [salt, normalizeAnswer(answer)]));
}

export function makeCommitment(answer: string): { salt: Hex; commitment: Hex } {
  const salt = toHex(randomBytes(32));
  return { salt, commitment: commitAnswer(salt, answer) };
}

export function verifyCommitment(commitment: Hex, salt: Hex, answer: string): boolean {
  return commitAnswer(salt, answer).toLowerCase() === commitment.toLowerCase();
}
```

`src/game/types.ts` — in `interface Challenge extends NewChallenge` add after `createdAt: string;`:
```ts
  /** keccak256(salt, normalized answer), public from the moment the puzzle opens. */
  commitment?: `0x${string}`;
  /** Secret until the puzzle closes; revealed with the answer. */
  salt?: `0x${string}`;
```
Change `PublicChallenge` and `toPublicChallenge`:
```ts
export type PublicChallenge = Omit<Challenge, "answer" | "acceptedAnswers" | "salt">;
```
```ts
export function toPublicChallenge({ answer: _a, acceptedAnswers: _b, salt: _s, ...pub }: Challenge): PublicChallenge {
  return pub;
}
```

`src/game/store.ts` — `MemoryGameStore.createChallenge`: import `makeCommitment` from `./commitment` and build the challenge as:
```ts
    const challenge: Challenge = {
      ...input,
      ...makeCommitment(input.answer),
      id: randomUUID(),
      day: this.challenges.length + 1,
      status: "open",
      createdAt: new Date().toISOString(),
    };
```

`src/game/postgres-store.ts`:
- `ChallengeRow` add `commitment: string | null; salt: string | null;`
- `toChallenge` add after `status`:
```ts
    ...(r.commitment && { commitment: r.commitment as `0x${string}` }),
    ...(r.salt && { salt: r.salt as `0x${string}` }),
```
- In `init()`, right after the `CREATE TABLE IF NOT EXISTS challenges (...)` statement add:
```ts
      await this.sql`ALTER TABLE challenges ADD COLUMN IF NOT EXISTS commitment text, ADD COLUMN IF NOT EXISTS salt text`;
```
- `createChallenge`: compute `const { salt, commitment } = makeCommitment(input.answer);` first, and change the INSERT to
```ts
        INSERT INTO challenges (id, day, difficulty, question, answer, accepted_answers, status, commitment, salt)
        SELECT ${randomUUID()}, COALESCE(MAX(day), 0) + 1, ${input.difficulty}, ${input.question},
               ${input.answer}, ${JSON.stringify(input.acceptedAnswers ?? [])}::jsonb, 'open', ${commitment}, ${salt}
        FROM challenges
        RETURNING *`,
```
(import `makeCommitment` from `./commitment`).

`src/game/index.ts`: add `export * from "./commitment";` (match the existing export style in that file).

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npm test`
Expected: all pass (79 existing + 4 new).

- [ ] **Step 5: Commit**
```bash
git add src/game test/commitment.test.ts test/game-store.test.ts
git commit -m "feat: commit-reveal answer commitments on every puzzle"
```

---

### Task 2: Decision hash + on-chain anchor in the daily loop

**Files:**
- Create: `src/chain/anchor.ts`
- Modify: `src/game/types.ts` (DecisionLog)
- Modify: `src/game/store.ts` (GameStore interface + MemoryGameStore.setDecisionAnchor)
- Modify: `src/game/postgres-store.ts` (DecisionRow, toDecision, init, setDecisionAnchor)
- Modify: `src/gm/run-day.ts` (RunDayDeps.anchor, call after addDecision)
- Test: `test/anchor.test.ts`, `test/run-day.test.ts`

**Interfaces:**
- Consumes: `Challenge.commitment?: Hex` (Task 1).
- Produces: `decisionHash(log: DecisionLog): Hex`, `anchorCalldata(hash: Hex, nextCommitment?: Hex): Hex`, `parseAnchorCalldata(data: Hex): { decisionHash: Hex; commitment: Hex } | null`, `ANCHOR_PREFIX` (= `0x474d5633`, "GMV3"), `makeAnchorSender(sender: BaseSepoliaWallet): (data: Hex) => Promise<string>` from `src/chain/anchor.ts`. `DecisionLog.anchorHash?: Hex`, `DecisionLog.anchorTx?: string`. `GameStore.setDecisionAnchor(id: string, hash: Hex, txHash: string | null): Promise<void>`. `RunDayDeps.anchor?: (data: Hex) => Promise<string>`, `RunDayDeps.timeouts.anchorMs` (default 30_000).

- [ ] **Step 1: Write failing tests**

`test/anchor.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ANCHOR_PREFIX, anchorCalldata, decisionHash, parseAnchorCalldata } from "../src/chain/anchor";
import type { DecisionLog } from "../src/game/types";

const log: DecisionLog = {
  id: "a", day: 3, challengeId: "c", treasuryBefore: 10_000_000n, treasuryAfter: 9_000_000n,
  participants: 2, winners: 1, winRate: 0.5, income: 200_000n, rewardPerWinner: 1_000_000n,
  totalPaid: 1_000_000n, nextDifficulty: "medium", decidedBy: "gemini", reasoning: "ok",
  adjustments: [], payouts: [{ player: "0x01", amount: 1_000_000n, txHash: "0xabc" }],
  createdAt: "2026-10-16T12:00:00.000Z",
};

describe("decision anchor", () => {
  it("hash ignores id, createdAt and anchor fields", () => {
    const h = decisionHash(log);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    expect(decisionHash({ ...log, id: "b", createdAt: "x", anchorHash: h, anchorTx: "0x1" })).toBe(h);
  });

  it("hash does not depend on key order but on content", () => {
    const reordered = Object.fromEntries(Object.entries(log).reverse()) as unknown as DecisionLog;
    expect(decisionHash(reordered)).toBe(decisionHash(log));
    expect(decisionHash({ ...log, totalPaid: 1n })).not.toBe(decisionHash(log));
  });

  it("calldata = prefix ‖ hash ‖ commitment and round-trips", () => {
    const h = decisionHash(log);
    const c = `0x${"22".repeat(32)}` as const;
    const data = anchorCalldata(h, c);
    expect(data.startsWith(ANCHOR_PREFIX)).toBe(true);
    expect(data.length).toBe(2 + 8 + 64 + 64);
    expect(parseAnchorCalldata(data)).toEqual({ decisionHash: h, commitment: c });
    expect(parseAnchorCalldata(anchorCalldata(h))?.commitment).toBe(`0x${"0".repeat(64)}`);
    expect(parseAnchorCalldata("0x1234")).toBeNull();
  });
});
```

Append to `test/run-day.test.ts` inside `describe("runDay", ...)`:
```ts
  it("anchors the decision hash and next commitment on-chain", async () => {
    const { store, deps } = setup();
    const sent: `0x${string}`[] = [];
    const report = await runDay({ ...deps, anchor: async (data) => { sent.push(data); return "0xanchor"; } });
    expect(sent).toHaveLength(1);
    const parsed = parseAnchorCalldata(sent[0]!);
    expect(parsed?.decisionHash).toBe(decisionHash(report.log));
    expect(parsed?.commitment).toBe(report.newChallenge.commitment);
    const [log] = await store.listDecisions(1);
    expect(log?.anchorTx).toBe("0xanchor");
    expect(log?.anchorHash).toBe(parsed?.decisionHash);
  });

  it("a failing anchor never fails the day", async () => {
    const { store, deps } = setup();
    const report = await runDay({ ...deps, anchor: async () => { throw new Error("rpc down"); } });
    expect(report.newChallenge.day).toBe(1);
    const [log] = await store.listDecisions(1);
    expect(log?.anchorTx).toBeUndefined();
    expect(log?.anchorHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
```
and add `import { decisionHash, parseAnchorCalldata } from "../src/chain/anchor";` at the top.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/anchor.test.ts test/run-day.test.ts`
Expected: FAIL (module `../src/chain/anchor` not found).

- [ ] **Step 3: Implement**

`src/game/types.ts` — add to `interface DecisionLog` before `createdAt`:
```ts
  /** keccak256 of this log's canonical JSON, written on-chain by the agent. */
  anchorHash?: `0x${string}`;
  /** Base Sepolia tx carrying the anchor; missing if anchoring failed or is off. */
  anchorTx?: string;
```
`NewDecisionLog` must not require them; change it to:
```ts
export type NewDecisionLog = Omit<DecisionLog, "id" | "createdAt" | "anchorHash" | "anchorTx">;
```

`src/chain/anchor.ts`:
```ts
import { concat, type Hex, keccak256, size, slice, stringToHex } from "viem";
import type { DecisionLog } from "../game/types";
import type { BaseSepoliaWallet } from "../wallet/base-sepolia";

/** "GMV3" — marks GM Agent anchor transactions in calldata. */
export const ANCHOR_PREFIX: Hex = stringToHex("GMV3");
const ZERO32: Hex = `0x${"0".repeat(64)}`;

/** Sorted keys, bigints as strings, undefined dropped: the same log always hashes the same. */
function canonical(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, canonical(o[k])]),
    );
  }
  return v;
}

export function decisionHash(log: DecisionLog): Hex {
  const { id: _id, createdAt: _c, anchorHash: _h, anchorTx: _t, ...rest } = log;
  return keccak256(stringToHex(JSON.stringify(canonical(rest))));
}

/** prefix (4 bytes) ‖ decision hash (32) ‖ next puzzle's answer commitment (32, zero if none). */
export function anchorCalldata(hash: Hex, nextCommitment?: Hex): Hex {
  return concat([ANCHOR_PREFIX, hash, nextCommitment ?? ZERO32]);
}

export function parseAnchorCalldata(data: Hex): { decisionHash: Hex; commitment: Hex } | null {
  if (size(data) !== 68 || slice(data, 0, 4) !== ANCHOR_PREFIX) return null;
  return { decisionHash: slice(data, 4, 36), commitment: slice(data, 36, 68) };
}

/** Sends a 0-ETH tx from the agent to itself carrying the anchor calldata. */
export function makeAnchorSender(sender: BaseSepoliaWallet): (data: Hex) => Promise<string> {
  return async (data) => {
    const hash = await sender.walletClient.sendTransaction({ to: sender.address, value: 0n, data });
    const receipt = await sender.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Anchor tx reverted: ${hash}`);
    return hash;
  };
}
```

`src/game/store.ts` — add to `GameStore` interface after `listDecisions`:
```ts
  /** Records the on-chain anchor of a decision (txHash null = hash computed but not anchored). */
  setDecisionAnchor(id: string, hash: `0x${string}`, txHash: string | null): Promise<void>;
```
MemoryGameStore:
```ts
  async setDecisionAnchor(id: string, hash: `0x${string}`, txHash: string | null): Promise<void> {
    const d = this.decisions.find((x) => x.id === id);
    if (!d) throw new Error(`Unknown decision ${id}`);
    d.anchorHash = hash;
    if (txHash) d.anchorTx = txHash;
  }
```

`src/game/postgres-store.ts`:
- `DecisionRow` add `anchor_hash: string | null; anchor_tx: string | null;`
- `toDecision` add before `createdAt`:
```ts
    ...(r.anchor_hash && { anchorHash: r.anchor_hash as `0x${string}` }),
    ...(r.anchor_tx && { anchorTx: r.anchor_tx }),
```
- `init()` after the `decisions` CREATE TABLE:
```ts
      await this.sql`ALTER TABLE decisions ADD COLUMN IF NOT EXISTS anchor_hash text, ADD COLUMN IF NOT EXISTS anchor_tx text`;
```
- method:
```ts
  async setDecisionAnchor(id: string, hash: `0x${string}`, txHash: string | null): Promise<void> {
    await this.init();
    await this.sql`UPDATE decisions SET anchor_hash = ${hash}, anchor_tx = ${txHash} WHERE id = ${id}`;
  }
```
If any other class implements `GameStore` (search `implements GameStore`), add the same method there.

`src/gm/run-day.ts`:
- imports: `import type { Hex } from "viem";` and `import { anchorCalldata, decisionHash } from "../chain/anchor";`
- `RunDayDeps` add:
```ts
  /** Writes the day's decision hash + next commitment on-chain. Optional; failures never fail the day. */
  anchor?: (data: Hex) => Promise<string>;
```
  and extend `timeouts?: { decideMs?: number; authorMs?: number; anchorMs?: number };`
- `DEFAULT_TIMEOUTS = { decideMs: 90_000, authorMs: 120_000, anchorMs: 30_000 };`
- Replace the final `return { log, newChallenge };` with:
```ts
  if (deps.anchor) {
    const hash = decisionHash(log);
    let txHash: string | null = null;
    try {
      txHash = await withTimeout(deps.anchor(anchorCalldata(hash, newChallenge.commitment)), timeouts.anchorMs, "anchor");
    } catch (err) {
      console.warn(`Decision anchor failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await store.setDecisionAnchor(log.id, hash, txHash);
    log.anchorHash = hash;
    if (txHash) log.anchorTx = txHash;
  }

  return { log, newChallenge };
```
Also update the doc comment list of steps in `runDay` with `7. anchor the decision on-chain (optional)`.

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add src test
git commit -m "feat: anchor each day's decision hash and next answer commitment on-chain"
```

---

### Task 3: DelegatedWallet + treasury config

**Files:**
- Modify: `package.json` / `package-lock.json` (`npm i @metamask/smart-accounts-kit@2.0.0`)
- Create: `src/wallet/treasury-config.ts`
- Create: `src/wallet/delegated.ts`
- Modify: `src/wallet/types.ts` (doc comment only: list `DelegatedWallet`)
- Test: `test/delegated-wallet.test.ts`

**Interfaces:**
- Produces:
  - `interface TreasuryConfig { chainId: number; smartAccount: Address; owner: Address; agent: Address; token: Address; dailyLimit: bigint; periodDuration: number; startDate: number; delegation: Delegation }`
  - `DEFAULT_TREASURY_CONFIG = "treasury/delegation.json"`, `serializeTreasuryConfig(c): string`, `parseTreasuryConfig(json: string): TreasuryConfig`, `loadTreasuryConfig(file?: string): TreasuryConfig | null`
  - `buildRedeemCalldata(delegation: Delegation, to: Address, amount: bigint): Hex`
  - `class OnChainLimitError extends Error`
  - `class DelegatedWallet implements Wallet { address; config; executor: BaseSepoliaWallet; delegationManager: Address; getBalance(); transfer(to, amount); availableToday(): Promise<bigint> }`

- [ ] **Step 1: Install the kit**

Run: `npm i @metamask/smart-accounts-kit@2.0.0`
Expected: added to `dependencies`, no peer errors (it uses the installed viem).

- [ ] **Step 2: Write failing tests**

`test/delegated-wallet.test.ts`:
```ts
import { createDelegation, getSmartAccountsEnvironment, type Delegation } from "@metamask/smart-accounts-kit";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import { decodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { BASE_SEPOLIA_USDC } from "../src/chain/base-sepolia";
import { BaseSepoliaWallet } from "../src/wallet/base-sepolia";
import { buildRedeemCalldata, DelegatedWallet } from "../src/wallet/delegated";
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
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/delegated-wallet.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement**

`src/wallet/treasury-config.ts`:
```ts
import fs from "node:fs";
import path from "node:path";
import type { Delegation } from "@metamask/smart-accounts-kit";
import type { Address } from "./types";

/**
 * Public description of the delegated treasury, written by `npm run treasury:setup`
 * and committed to the repo. Safe to publish: only the agent key can redeem the delegation.
 */
export interface TreasuryConfig {
  chainId: number;
  /** MetaMask smart account that holds the USDC. */
  smartAccount: Address;
  /** Owner key of the smart account (kept off the server). */
  owner: Address;
  /** Agent EOA allowed to spend through the delegation. */
  agent: Address;
  token: Address;
  /** On-chain cap per period, USDC base units. */
  dailyLimit: bigint;
  periodDuration: number;
  startDate: number;
  delegation: Delegation;
}

export const DEFAULT_TREASURY_CONFIG = "treasury/delegation.json";

export function serializeTreasuryConfig(c: TreasuryConfig): string {
  return `${JSON.stringify(c, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`;
}

export function parseTreasuryConfig(json: string): TreasuryConfig {
  const raw = JSON.parse(json) as Record<string, unknown> & { delegation?: { signature?: string } };
  for (const k of ["smartAccount", "owner", "agent", "token", "dailyLimit", "delegation"]) {
    if (raw[k] === undefined || raw[k] === null) throw new Error(`Treasury config: missing "${k}"`);
  }
  if (!raw.delegation?.signature || raw.delegation.signature === "0x") throw new Error("Treasury config: delegation is not signed");
  return { ...(raw as unknown as TreasuryConfig), dailyLimit: BigInt(raw.dailyLimit as string) };
}

/** Reads the config from TREASURY_CONFIG or treasury/delegation.json; null if there is none. */
export function loadTreasuryConfig(file = process.env.TREASURY_CONFIG || DEFAULT_TREASURY_CONFIG): TreasuryConfig | null {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return null;
  return parseTreasuryConfig(fs.readFileSync(full, "utf8"));
}
```

`src/wallet/delegated.ts`:
```ts
import {
  contracts,
  createCaveatEnforcerClient,
  createExecution,
  type Delegation,
  ExecutionMode,
  getSmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { decodeRevertReason } from "@metamask/smart-accounts-kit/utils";
import { encodeFunctionData, erc20Abi, getAddress, type Hex } from "viem";
import { BASE_SEPOLIA_USDC, getUsdcBalance } from "../chain/base-sepolia";
import type { BaseSepoliaWallet } from "./base-sepolia";
import type { TreasuryConfig } from "./treasury-config";
import { type Address, InsufficientFundsError, type TransferResult, type Wallet } from "./types";

/** The delegation's on-chain caveats (e.g. the daily limit) refused a transfer. */
export class OnChainLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnChainLimitError";
  }
}

/** Calldata for DelegationManager.redeemDelegations: one delegation, one USDC transfer. */
export function buildRedeemCalldata(delegation: Delegation, to: Address, amount: bigint): Hex {
  const execution = createExecution({
    target: BASE_SEPOLIA_USDC,
    callData: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(to), amount] }),
  });
  return contracts.DelegationManager.encode.redeemDelegations({
    delegations: [[delegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });
}

/**
 * The treasury as a MetaMask smart account. The agent's EOA holds no USDC: it can only move
 * money by redeeming the owner's delegation, whose daily limit is enforced by a contract.
 */
export class DelegatedWallet implements Wallet {
  readonly address: Address;
  readonly delegationManager: Address;

  constructor(
    readonly config: TreasuryConfig,
    readonly executor: BaseSepoliaWallet,
  ) {
    if (getAddress(config.agent) !== executor.address) {
      throw new Error(`Delegation is for ${config.agent}, but the agent key is ${executor.address}`);
    }
    this.address = getAddress(config.smartAccount);
    this.delegationManager = getSmartAccountsEnvironment(config.chainId).DelegationManager;
  }

  getBalance(): Promise<bigint> {
    return getUsdcBalance(this.executor.publicClient, this.address);
  }

  /** What the delegation still allows today, read from the enforcer contract. */
  async availableToday(): Promise<bigint> {
    const client = createCaveatEnforcerClient({
      client: this.executor.publicClient,
      environment: getSmartAccountsEnvironment(this.config.chainId),
    });
    const { availableAmount } = await client.getErc20PeriodTransferEnforcerAvailableAmount({ delegation: this.config.delegation });
    return availableAmount;
  }

  async transfer(to: Address, amount: bigint): Promise<TransferResult> {
    if (amount <= 0n) throw new Error(`Transfer amount must be positive, got ${amount}`);
    const balance = await this.getBalance();
    if (amount > balance) throw new InsufficientFundsError(balance, amount);

    const data = buildRedeemCalldata(this.config.delegation, to, amount);
    let txHash: Hex;
    try {
      // Simulate first so a refused transfer costs no gas and returns a readable reason.
      await this.executor.publicClient.call({ account: this.executor.account, to: this.delegationManager, data });
      txHash = await this.executor.walletClient.sendTransaction({ to: this.delegationManager, data });
    } catch (err) {
      const reason = decodeRevertReason(err);
      throw new OnChainLimitError(`Delegation refused the transfer: ${reason?.message ?? (err instanceof Error ? err.message : String(err))}`);
    }
    const receipt = await this.executor.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new OnChainLimitError(`Delegated transfer reverted: ${txHash}`);
    return { txHash, to, amount };
  }
}
```

`src/wallet/types.ts`: update the doc comment list to:
```ts
 * - MockWallet: in-memory, used for tests and off-chain simulations
 * - BaseSepoliaWallet: plain EOA on Base Sepolia (also the agent's gas/tx sender)
 * - DelegatedWallet: MetaMask smart account, spent through an on-chain-limited delegation
```

- [ ] **Step 5: Run tests**

Run: `npm run typecheck && npm test`
Expected: all pass. If `decodeRevertReason` / `contracts` typings differ from the above, read `node_modules/@metamask/smart-accounts-kit/dist/index.d.ts` and adapt only the import, not the behavior.

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json src/wallet test/delegated-wallet.test.ts
git commit -m "feat: DelegatedWallet spends the smart-account treasury through a limited delegation"
```

---

### Task 4: Wire the delegated treasury into runtime, x402 and scripts

**Files:**
- Modify: `src/server/runtime.ts`
- Modify: `app/api/submit/route.ts`
- Create: `scripts/load-env.ts`
- Modify: `scripts/demo-players.ts`, `scripts/setup-mcp-player.ts`
- Modify: `next.config.ts` (trace `treasury/**` into serverless bundles)
- Test: `test/runtime-wallet.test.ts`

**Interfaces:**
- Consumes: `DelegatedWallet`, `loadTreasuryConfig`, `serializeTreasuryConfig` (Task 3); `makeAnchorSender` (Task 2).
- Produces: `getTxSender(): BaseSepoliaWallet`, `getAgentWallet(): BaseSepoliaWallet | DelegatedWallet`, `getTreasuryMode(wallet): "delegated" | "eoa"` in `src/server/runtime.ts`; `getRunDayDeps()` now sets `anchor` unless `ANCHOR_DECISIONS=off`.

- [ ] **Step 1: Write failing test**

`test/runtime-wallet.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/runtime-wallet.test.ts`
Expected: FAIL (`getTxSender` is not exported / wallet is not a DelegatedWallet).

- [ ] **Step 3: Implement**

`src/server/runtime.ts` — replace `getAgentWallet` with:
```ts
/** The agent's EOA: signs and pays gas for every tx (payouts, x402 settlement, anchors). */
export function getTxSender(): BaseSepoliaWallet {
  const key = getAgentPrivateKey();
  if (!key) throw new Error("The agent has no wallet yet (set WALLET_PRIVATE_KEY or click Create wallet).");
  return new BaseSepoliaWallet(key);
}

/**
 * The treasury. With treasury/delegation.json present it is the MetaMask smart account,
 * spendable only through the owner's delegation; otherwise (or TREASURY_MODE=eoa) the agent EOA.
 */
export function getAgentWallet(): BaseSepoliaWallet | DelegatedWallet {
  const sender = getTxSender();
  const mode = process.env.TREASURY_MODE;
  if (mode === "eoa") return sender;
  const config = loadTreasuryConfig();
  if (!config) {
    if (mode === "delegated") throw new Error("TREASURY_MODE=delegated but treasury/delegation.json is missing (run npm run treasury:setup).");
    return sender;
  }
  return new DelegatedWallet(config, sender);
}

export function getTreasuryMode(wallet: BaseSepoliaWallet | DelegatedWallet): "delegated" | "eoa" {
  return wallet instanceof DelegatedWallet ? "delegated" : "eoa";
}
```
Imports to add: `import { makeAnchorSender } from "../chain/anchor";`, `import { DelegatedWallet } from "../wallet/delegated";`, `import { loadTreasuryConfig } from "../wallet/treasury-config";`.
In `getRunDayDeps()` add the field:
```ts
    anchor: process.env.ANCHOR_DECISIONS === "off" ? undefined : makeAnchorSender(getTxSender()),
```

`app/api/submit/route.ts`:
- import `getTxSender` alongside `getAgentWallet, getEntryFee`.
- `payTo: wallet.address` stays (it is now the smart account in delegated mode).
- change `txHash = await settlePayment(payment, wallet);` to `txHash = await settlePayment(payment, getTxSender());`
- update the header comment: "settle ON-CHAIN into the treasury (smart account in delegated mode)".

`scripts/load-env.ts` (moved from `demo-players.ts`):
```ts
// Loads .env and .env.local into process.env for tsx scripts (Next.js does this for the app).
import { existsSync, readFileSync } from "node:fs";

for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}
```
`scripts/demo-players.ts`: put `import "./load-env";` as the first import, delete the inline env loop (lines 19-25), and replace
```ts
const agentKey = process.env.WALLET_PRIVATE_KEY as Hex | undefined;
if (!agentKey) throw new Error("WALLET_PRIVATE_KEY missing in .env");
const agent = new BaseSepoliaWallet(agentKey);
```
with
```ts
const agent = getAgentWallet(); // smart-account treasury when delegated: top-ups count against the daily limit
```
(import `getAgentWallet` from `../src/server/runtime`; drop now-unused imports).
`scripts/setup-mcp-player.ts`: same — `import "./load-env";` first if it reads `.env` itself (check; if it has its own loader, replace that loader with this import), and replace `new BaseSepoliaWallet(agentKey).transfer(...)` with `getAgentWallet().transfer(...)`, removing the `agentKey` lines.

`next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // treasury/delegation.json is read with fs at runtime; ship it with every serverless function.
  outputFileTracingIncludes: { "/**": ["./treasury/**"] },
};

export default nextConfig;
```

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add src/server/runtime.ts app/api/submit/route.ts scripts next.config.ts test/runtime-wallet.test.ts
git commit -m "feat: switch treasury to the delegated smart account when configured"
```

---

### Task 5: Setup and limit-demo scripts

**Files:**
- Create: `scripts/setup-treasury.ts`
- Create: `scripts/limit-demo.ts`
- Modify: `package.json` (scripts `treasury:setup`, `treasury:demo`)
- Modify: `.gitignore` (add `.treasury-owner.json`)

**Interfaces:**
- Consumes: `getTxSender`, `getAgentWallet` (Task 4); `DelegatedWallet`, `buildRedeemCalldata` (Task 3); `TreasuryConfig`, `serializeTreasuryConfig`, `loadTreasuryConfig`, `DEFAULT_TREASURY_CONFIG` (Task 3); `parseUsdc`, `formatUsdc` from `src/wallet/usdc`; `EXPLORER_URL`, `BASE_SEPOLIA_USDC` from `src/chain/base-sepolia`.
- Produces: `npm run treasury:setup [-- --daily 5] [-- --new-delegation] [-- --move-funds]`, `npm run treasury:demo [-- --send]`.

No unit tests (network scripts); verified live by the controller after this task. `npm run typecheck` must pass.

- [ ] **Step 1: `.gitignore`** — under `# secrets — never commit` add `.treasury-owner.json`.

- [ ] **Step 2: `scripts/setup-treasury.ts`**
```ts
// One-time setup of the delegated treasury (idempotent):
//   1. owner key (.treasury-owner.json, never leaves this machine)
//   2. MetaMask smart account (Hybrid), deployed by the agent EOA
//   3. delegation smart account → agent: USDC only, at most --daily USDC per 24 h (on-chain)
//   4. --move-funds: move the agent EOA's USDC into the smart account
// Usage: npm run treasury:setup -- [--daily 5] [--new-delegation] [--move-funds]
import "./load-env";
import fs from "node:fs";
import { createDelegation, Implementation, toMetaMaskSmartAccount } from "@metamask/smart-accounts-kit";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { BASE_SEPOLIA_USDC, EXPLORER_URL } from "../src/chain/base-sepolia";
import { getTxSender } from "../src/server/runtime";
import { DelegatedWallet } from "../src/wallet/delegated";
import { DEFAULT_TREASURY_CONFIG, loadTreasuryConfig, serializeTreasuryConfig, type TreasuryConfig } from "../src/wallet/treasury-config";
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

const smartAccount = await toMetaMaskSmartAccount({
  client: agent.publicClient,
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
if (!config || has("--new-delegation") || config.smartAccount !== smartAccount.address) {
  const dailyLimit = parseUsdc(opt("--daily", "5"));
  const now = new Date();
  const startDate = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
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

const treasury = new DelegatedWallet(config, agent);
console.log(`Treasury balance: ${formatUsdc(await treasury.getBalance())}`);
console.log(`Available today:  ${formatUsdc(await treasury.availableToday())} of ${formatUsdc(config.dailyLimit)}`);
```
If `formatUsdc` / `EXPLORER_URL` names differ, check `src/wallet/usdc.ts` and `src/chain/base-sepolia.ts` (both are used by `scripts/balance.ts`).

- [ ] **Step 3: `scripts/limit-demo.ts`**
```ts
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
```

- [ ] **Step 4: `package.json` scripts** — add after `"mcp:setup"`:
```json
    "treasury:setup": "tsx scripts/setup-treasury.ts",
    "treasury:demo": "tsx scripts/limit-demo.ts"
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: pass. Do NOT run the scripts (they spend real testnet funds; the controller runs them).

- [ ] **Step 6: Commit**
```bash
git add scripts package.json .gitignore
git commit -m "feat: treasury setup and on-chain limit demo scripts"
```

---

### Task 6: State API and UI

**Files:**
- Modify: `app/api/state/route.ts`
- Modify: `components/gm/format.ts` (types)
- Modify: `components/gm/dashboard.tsx` (TreasuryStats, DecisionLogList, PastChallenges)
- Modify: `app/page.tsx` (commitment under today's puzzle)
- Test: `test/state-route.test.ts`

**Interfaces:**
- Consumes: `getAgentWallet`, `getTxSender`, `getTreasuryMode` (Task 4); `DelegatedWallet.availableToday`, `config` (Task 3); `verifyCommitment` (Task 1); `DecisionLog.anchorTx/anchorHash` (Task 2).
- Produces: `/api/state` JSON:
  - `treasury: { mode: "delegated" | "eoa"; address: string | null; agent: string | null; owner: string | null; usdc: string | null; eth: string | null; onchainLimit: { dailyLimit: string; availableToday: string | null } | null }`
  - `pastChallenges[]`: adds `commitment?: string; salt?: string; commitmentValid: boolean | null`
  - `challenge` (open) adds `commitment?: string` and never `salt`.

- [ ] **Step 1: Write failing test**

`test/state-route.test.ts` (uses the memory store, no chain: wallet calls fail and are caught):
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/state", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GAME_STORE = "memory";
    process.env.WALLET_PRIVATE_KEY = `0x${"ef".repeat(32)}`;
    process.env.TREASURY_MODE = "eoa";
    process.env.BASE_SEPOLIA_RPC_URL = "http://127.0.0.1:9"; // unreachable → balances null
  });

  it("shows the open commitment, hides its salt, and verifies closed ones", async () => {
    const { getGameStore } = await import("../src/game");
    const store = getGameStore();
    await store.createChallenge({ difficulty: "easy", question: "Q1?", answer: "Egg" });
    await store.createChallenge({ difficulty: "easy", question: "Q2?", answer: "Glove" });
    const { GET } = await import("../app/api/state/route");
    const body = await (await GET()).json();

    expect(body.challenge.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.challenge.salt).toBeUndefined();
    expect(body.pastChallenges[0]).toMatchObject({ day: 1, answer: "Egg", commitmentValid: true });
    expect(body.pastChallenges[0].salt).toMatch(/^0x/);
    expect(body.treasury.mode).toBe("eoa");
    expect(body.treasury.onchainLimit).toBeNull();
  }, 20_000);
});
```
If `getGameStore()` is not a per-process singleton for `GAME_STORE=memory`, check `src/game/index.ts` and adapt the test to how the route obtains its store (it must be the same instance). If the `@/` path alias does not resolve in Vitest, check `vitest.config.*` for an alias and add `"@": path.resolve(__dirname, ".")` if missing.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/state-route.test.ts`
Expected: FAIL (`commitmentValid` / `treasury.mode` missing).

- [ ] **Step 3: Implement the route**

`app/api/state/route.ts` — replace the `getWalletAddress` based treasury lookup:
```ts
import { formatEther } from "viem";
import { createBaseSepoliaClient, getEthBalance, getUsdcBalance } from "@/src/chain/base-sepolia";
import { getGameStore, toPublicChallenge, verifyCommitment } from "@/src/game";
import { getAgentWallet, getEntryFee, getLimits, getTreasuryMode, getTxSender, jsonSafe } from "@/src/server/runtime";
import { DelegatedWallet } from "@/src/wallet/delegated";

export const dynamic = "force-dynamic";

function loadWallets() {
  try {
    const wallet = getAgentWallet();
    return { wallet, sender: getTxSender() };
  } catch {
    return { wallet: null, sender: null };
  }
}

export async function GET() {
  const store = getGameStore();
  const client = createBaseSepoliaClient();
  const { wallet, sender } = loadWallets();
  const delegated = wallet instanceof DelegatedWallet ? wallet : null;

  const [current, recent, decisions, usdc, eth, availableToday] = await Promise.all([
    store.getCurrentChallenge(),
    store.listChallenges(8),
    store.listDecisions(30),
    wallet ? getUsdcBalance(client, wallet.address).catch(() => null) : null,
    sender ? getEthBalance(client, sender.address).catch(() => null) : null,
    delegated ? delegated.availableToday().catch(() => null) : null,
  ]);
```
Keep the existing `participantsToday` and leaderboard code unchanged. Change `pastChallenges` and `treasury` in the response:
```ts
      pastChallenges: recent
        .filter((c) => c.status === "closed")
        .map((c) => ({
          day: c.day,
          difficulty: c.difficulty,
          question: c.question,
          answer: c.answer,
          commitment: c.commitment,
          salt: c.salt,
          commitmentValid: c.commitment && c.salt ? verifyCommitment(c.commitment, c.salt, c.answer) : null,
        })),
      treasury: {
        mode: wallet ? getTreasuryMode(wallet) : "eoa",
        address: wallet?.address ?? null,
        agent: sender?.address ?? null,
        owner: delegated?.config.owner ?? null,
        usdc,
        eth: eth !== null ? formatEther(eth) : null,
        onchainLimit: delegated ? { dailyLimit: delegated.config.dailyLimit, availableToday } : null,
      },
```
Update the header comment: "treasury (smart account + on-chain limit when delegated)".

- [ ] **Step 4: Types** — `components/gm/format.ts`:
```ts
export type GameStateResponse = {
  challenge: { id: string; day: number; difficulty: string; question: string; createdAt: string; participants: number; commitment?: string } | null;
  pastChallenges: { day: number; difficulty: string; question: string; answer: string; commitment?: string; salt?: string; commitmentValid: boolean | null }[];
  treasury: {
    mode: "delegated" | "eoa";
    address: string | null;
    agent: string | null;
    owner: string | null;
    usdc: string | null;
    eth: string | null;
    onchainLimit: { dailyLimit: string; availableToday: string | null } | null;
  };
  rules: { entryFee: string; maxPerTx: string; maxDailyFractionBps: number };
  decisions: Decision[];
  leaderboard: { player: string; wins: number; earned: string }[];
};
```
and add to `Decision`: `anchorHash?: string; anchorTx?: string;`.

- [ ] **Step 5: UI** — `components/gm/dashboard.tsx`:

In `TreasuryStats`, replace the single "Agent wallet" link block with:
```tsx
      {t?.onchainLimit && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[11px] text-muted-foreground uppercase">
            On-chain limit · {fmtUsdc(t.onchainLimit.dailyLimit)} / day
          </p>
          <div className="h-2 w-full border bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${t.onchainLimit.availableToday != null ? Math.min(100, (Number(t.onchainLimit.availableToday) / Number(t.onchainLimit.dailyLimit)) * 100) : 0}%` }}
            />
          </div>
          <p className="font-mono text-xs">{t.onchainLimit.availableToday != null ? `${fmtUsdc(t.onchainLimit.availableToday)} left today` : "—"}</p>
        </div>
      )}
      <div className="flex flex-col gap-1 font-mono text-xs text-muted-foreground uppercase">
        {t?.address && (
          <a className="inline-flex items-center gap-1 hover:text-primary" href={addrUrl(t.address)} target="_blank" rel="noreferrer">
            {t.mode === "delegated" ? "Smart account" : "Agent wallet"} {short(t.address)} <ExternalLink className="size-3" />
          </a>
        )}
        {t?.mode === "delegated" && t.agent && (
          <a className="inline-flex items-center gap-1 hover:text-primary" href={addrUrl(t.agent)} target="_blank" rel="noreferrer">
            Agent key (gas only) {short(t.agent)} <ExternalLink className="size-3" />
          </a>
        )}
        {t?.owner && (
          <a className="inline-flex items-center gap-1 hover:text-primary" href={addrUrl(t.owner)} target="_blank" rel="noreferrer">
            Owner {short(t.owner)} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
```
and replace the limits paragraph with:
```tsx
      {state && (
        <p className="text-xs text-muted-foreground">
          {t?.mode === "delegated" && (
            <>
              <Badge variant="outline" className="mr-1 font-mono uppercase">MetaMask delegation</Badge>
              The treasury is a smart account; the agent can only spend through a delegation capped at {fmtUsdc(t.onchainLimit?.dailyLimit)} per day by a contract.{" "}
            </>
          )}
          In code: max {fmtUsdc(state.rules.maxPerTx)} per winner, at most {state.rules.maxDailyFractionBps / 100}% of the treasury per day.
        </p>
      )}
```
In `DecisionLogList`, after the payouts `<ul>` add:
```tsx
          {d.anchorTx && (
            <a className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-primary uppercase" href={txUrl(d.anchorTx)} target="_blank" rel="noreferrer">
              Anchored on Base · {short(d.anchorHash)} <ExternalLink className="size-3" />
            </a>
          )}
```
In `PastChallenges`, after the answer `<p>` add:
```tsx
          {c.commitmentValid !== null && (
            <p className="font-mono text-xs text-muted-foreground">
              Commitment {short(c.commitment)} · {c.commitmentValid ? "verified ✓" : "MISMATCH ✗"}
            </p>
          )}
```
`app/page.tsx` — directly after `<p className="text-lg leading-snug font-medium">{challenge.question}</p>` add:
```tsx
                  {challenge.commitment && (
                    <p className="font-mono text-[11px] text-muted-foreground" title={challenge.commitment}>
                      Answer committed: {challenge.commitment.slice(0, 10)}…{challenge.commitment.slice(-6)} · salt revealed when the day closes
                    </p>
                  )}
```
Check where `challenge` on the page gets its type (it may come from `/api/challenge` with its own type); add `commitment?: string` to that type if needed. `/api/challenge` already returns `toPublicChallenge`, which now includes `commitment`.

- [ ] **Step 6: Run tests + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 7: Commit**
```bash
git add app components test/state-route.test.ts
git commit -m "feat: show smart-account treasury, on-chain limit, commitments and anchors"
```

---

### Task 7: Docs — README v3 and handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/handoff-week3.md` (section 4 code map + section 5 env)
- Modify: `.env.example` (if it exists: add `TREASURY_MODE`, `TREASURY_CONFIG`, `ANCHOR_DECISIONS` with comments)

**Interfaces:** none (docs only).

- [ ] **Step 1: README**
  - Add a section `## What's new in v3 (Week 3)` ABOVE `## What's new in v2 (Week 2)`:
    - Treasury moved to a **MetaMask smart account** (`@metamask/smart-accounts-kit` 2.0.0, Hybrid DeleGator). The agent's key holds only gas; it spends through an owner-signed **delegation** with an `erc20PeriodTransfer` caveat: max 5 USDC per 24 h, enforced by the `ERC20PeriodTransferEnforcer` contract. Code caps (2 USDC/winner, 10%/day) stay as a second layer.
    - **Answer commitments**: `keccak256(salt, normalizedAnswer)` published when a puzzle opens, salt revealed at close, verified on the page.
    - **On-chain decision log**: each day the agent sends a tx whose calldata is `"GMV3" ‖ keccak256(decision) ‖ next commitment`.
    - `npm run treasury:demo`: the agent tries to overspend and the chain refuses.
  - Tech stack table: add a row `| Smart account / delegation | @metamask/smart-accounts-kit | 2.0.0 |`.
  - Tools section: add `DelegatedWallet.transfer` (redeem delegation), `treasury:setup`, `treasury:demo` if the section lists scripts/tools; keep the existing format.
  - "Crypto integration" → "Rewards" subsection: describe the two layers (contract-enforced daily limit + code guard) and the anchor.
  - Architecture mermaid: add node `SA[(Smart account<br/>USDC treasury)]`, edge `S4 -- redeemDelegations --> SA`, `SUB -- transferWithAuthorization --> SA` (fees land in the smart account), `S6 -- anchor tx --> CHAIN`.
  - Path table: add `src/wallet/delegated.ts`, `src/wallet/treasury-config.ts`, `src/chain/anchor.ts`, `src/game/commitment.ts`, `treasury/delegation.json`.
  - Future scope: move the shipped items to `**Done in Week 3 (gmagent.v3):** smart-account treasury with on-chain daily limit (MetaMask delegation), answer commitments (commit-reveal), on-chain decision anchors.` Keep the rest (ZK proofs instead of commit-reveal, sponsored pools, game modes) under a `**Next**` list.
  - Leave `Week 3 (gmagent.v3): _coming in Week 3_` as is (video comes later).
- [ ] **Step 2: handoff** — in `docs/handoff-week3.md` section 4 add rows for the new files and a line "v3: treasury is a MetaMask smart account (see treasury/delegation.json); owner key in `.treasury-owner.json` on Berke's machine only". Section 5: `ANCHOR_DECISIONS=off` disables anchors; `TREASURY_MODE=eoa` forces the old EOA treasury.
- [ ] **Step 3: Verify** `npm run typecheck && npm test` (sanity) and commit:
```bash
git add README.md docs .env.example
git commit -m "docs: README v3 — delegated treasury, commitments, anchors"
```

---

## Controller steps after Task 7 (not for subagents)

1. `npm run treasury:setup -- --daily 5` (no funds moved) → check deploy tx and `treasury/delegation.json`.
2. Send 1 USDC from the agent EOA to the smart account manually (or `--move-funds` later), then `npm run treasury:demo` → ✅ small payout, ⛔ over-limit refusal.
3. Local `npm run dev:memory`, open the page, run a day via admin → anchor tx + commitment visible.
4. `npm run treasury:setup -- --move-funds`, commit `treasury/delegation.json`, open PR, merge, verify prod `/api/state` shows `mode: "delegated"` and the next cron run anchors.
