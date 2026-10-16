# GM Agent v3 — Delegated treasury + on-chain receipts

Week 3 of Agentmaxxing ("give your agent a wallet / it learns to pay"). Approved 2026-10-16.

## Goal

Today the agent's USDC sits on a plain EOA whose private key lives in Vercel env. The spending caps
(2 USDC per transfer, 10% of the treasury per day) exist only in our TypeScript. If the key leaks
or the code is bypassed, the whole treasury can be drained.

v3 moves the money into a **MetaMask smart account** owned by a separate **owner key** that never
leaves the developer's machine. The owner signs one **delegation** to the agent's EOA with an
on-chain **daily USDC limit** (`erc20PeriodTransfer`, 5 USDC per 24 h). The agent can only spend
by redeeming that delegation, so the cap is enforced by a contract, not by our code.

It also adds two public, verifiable receipts:
- **Answer commitment:** each puzzle publishes `keccak256(salt, normalizedAnswer)` when it opens;
  the salt is revealed when it closes, so anyone can check the GM did not change the answer.
- **On-chain decision anchor:** after each day the agent writes one Base Sepolia tx whose calldata
  is the hash of that day's decision log plus the next puzzle's commitment.

Out of scope: sponsored prize pools, real ZK proofs, new game modes, a bundler / user operations.

## Library

`@metamask/smart-accounts-kit` 2.0.0 (viem-based, Base Sepolia supported via
`getSmartAccountsEnvironment(84532)`). Used pieces: `toMetaMaskSmartAccount`
(`Implementation.Hybrid`), `createDelegation` with scope `{ type: "erc20PeriodTransfer" }`,
`signDelegation`, `createExecution`, `contracts.DelegationManager.encode.redeemDelegations`,
`ExecutionMode.SingleDefault`, `createCaveatEnforcerClient(...).getErc20PeriodTransferEnforcerAvailableAmount`.

## Roles and addresses

| Role | Key | Holds | Lives |
|---|---|---|---|
| Owner (human) | new key, `.treasury-owner.json` (gitignored) | nothing, no ETH needed | developer machine only |
| Treasury | smart account (Hybrid DeleGator), owner = owner key | the USDC | on-chain |
| Agent | existing `WALLET_PRIVATE_KEY` EOA `0x5cb0…799D` | ETH for gas only | Vercel env |

The smart account is deployed by the agent EOA calling the kit's factory (`getFactoryArgs()`),
so the owner never needs gas.

## Components

### 1. `scripts/setup-treasury.ts` (`npm run treasury:setup`)
Idempotent, one-time:
1. Load or create the owner key (`.treasury-owner.json`).
2. Build the Hybrid smart account (deploySalt `0x`), deploy it if `getCode` is empty.
3. Create and sign the delegation: delegator = smart account, delegate = agent EOA, scope
   `erc20PeriodTransfer { tokenAddress: USDC, periodAmount: 5 USDC, periodDuration: 86400,
   startDate: today 00:00 UTC }`. Amount configurable with `--daily 5`.
4. Write `treasury/delegation.json` (committed — it is public and only the agent can redeem it):
   `{ chainId, smartAccount, owner, agent, dailyLimit, periodDuration, startDate, delegation }`
   (bigints as strings).
5. With `--move-funds`, transfer the agent EOA's USDC balance to the smart account.

Revocation (owner self-delegation calling `disableDelegation`) is left for later; the owner key can always sign a new delegation.

### 2. `src/wallet/delegated.ts` — `DelegatedWallet implements Wallet`
- `address` = smart account (this is the treasury everyone sees and pays into).
- `executor: BaseSepoliaWallet` = agent EOA; sends all txs and pays gas.
- `getBalance()` = USDC balance of the smart account.
- `transfer(to, amount)`: checks balance (`InsufficientFundsError`), encodes
  `USDC.transfer(to, amount)` as an execution, calls `redeemDelegations([[signedDelegation]],
  [SingleDefault], [execution])` on the DelegationManager from the executor, waits for receipt.
  A revert from the enforcer surfaces as `OnChainLimitError` with the decoded reason.
- `availableToday()`: reads the enforcer's available amount for the current period.
- Encoding is split into a pure function `buildRedeemCalldata(delegation, to, amount)` so it can be
  unit-tested without a chain.

### 3. Wiring (`src/server/runtime.ts`)
`loadTreasuryConfig()` reads `treasury/delegation.json` (path override `TREASURY_CONFIG`). If present
and `TREASURY_MODE` is not `eoa`, `getAgentWallet()` returns a `DelegatedWallet`; otherwise the
existing `BaseSepoliaWallet` (simulations, tests, `dev:memory` without the file keep working).
`getTxSender()` returns the agent `BaseSepoliaWallet` in both modes.

### 4. x402
`settlePayment(payment, sender)` keeps its signature (a `BaseSepoliaWallet`) — the submit route
passes `getTxSender()`, and `payTo` becomes `wallet.address` (the smart account). EIP-3009 lets any
account submit the transfer, so entry fees land directly in the smart account.
Scripts that top up from the treasury (`setup-mcp-player`, `demo-players`) go through
`getAgentWallet()` so they respect the delegation too.

### 5. Answer commitment (`src/game/commitment.ts`)
- `makeCommitment(answer) → { salt, commitment }`: `salt` = 32 random bytes,
  `commitment = keccak256(encodeAbiParameters([bytes32, string], [salt, normalizeAnswer(answer)]))`
  (`normalizeAnswer` from `answers.ts`).
- `verifyCommitment(commitment, salt, answer) → boolean`.
- `Challenge` gains `commitment?: Hex` and `salt?: Hex`. `createChallenge` in both stores computes
  them. `toPublicChallenge` drops `salt` while open; closed challenges in `/api/state` expose
  `answer`, `salt`, `commitment` and `commitmentValid`.

### 6. Decision anchor (`src/chain/anchor.ts`)
- `decisionHash(log)` = keccak256 of a canonical JSON of the log (fixed key order, bigints as strings,
  excluding `id`/`createdAt`/`anchor*`).
- `anchorCalldata(decisionHash, nextCommitment)` = `0x474d5633` ("GMV3") ‖ decisionHash ‖ commitment.
- `RunDayDeps.anchor?: (data: Hex) => Promise<string>`; prod implementation sends a 0-ETH tx from the
  agent EOA to itself with that calldata. Called after `addDecision`; failure is logged as an
  adjustment note and never fails the day. Store gets `setDecisionAnchor(id, hash, txHash)`.
- `DecisionLog` gains `anchorHash?`, `anchorTx?`.

### 7. Database
Same "create on first use" approach: `ALTER TABLE challenges ADD COLUMN IF NOT EXISTS commitment
text, ADD COLUMN IF NOT EXISTS salt text`; `ALTER TABLE decisions ADD COLUMN IF NOT EXISTS
anchor_hash text, ADD COLUMN IF NOT EXISTS anchor_tx text`. Old rows stay null and the UI hides
missing fields.

### 8. API and UI
- `/api/state` `treasury` becomes `{ mode, address (smart account), agent, owner, usdc, eth (agent gas),
  onchainLimit: { dailyLimit, availableToday } | null }`.
- Treasury card: "Smart account · MetaMask delegation" badge, smart account + agent + owner links,
  "On-chain limit 5.00 USDC/day · X available today" with a bar.
- Today's puzzle shows its commitment (short hash). Past puzzles show answer + "commitment verified".
- Decision log entries show an "anchored on Base" BaseScan link.
- "What's new in v3" section in the page footer/README.

### 9. Demo script `scripts/limit-demo.ts` (`npm run treasury:demo`)
Shows, against the real chain: available amount today → a small legit transfer succeeds → a
transfer above the remaining limit is attempted; `simulateContract` returns the enforcer revert,
printed in plain words; with `--send` the reverting tx is broadcast with a fixed gas limit so the
failure is visible on BaseScan. This is the key scene of the week-3 video.

## Error handling
- Delegation revert → `OnChainLimitError`; `SpendingGuard` treats it like any failed payout (recorded
  in `payouts[].error`, day continues).
- Missing/invalid `treasury/delegation.json` with `TREASURY_MODE=delegated` → throw at startup with a
  clear message; otherwise fall back to EOA mode.
- Anchor failure → warning in the server log; the decision keeps its `anchorHash` without `anchorTx`, day still completes. Anchor runs inside the existing time
  budget (one tx, ~5 s).

## Testing
- Unit (Vitest): `buildRedeemCalldata` decodes back to the right delegation/execution; commitment
  make/verify (normalization, wrong salt fails); `decisionHash` is stable and order-independent;
  `runDay` calls `anchor` with the right calldata and survives an anchor failure; stores persist
  commitment/salt/anchor; `/api/state` hides salt for the open puzzle.
- Live (Base Sepolia, manual, documented): setup → deploy → delegation → move funds → small payout
  via delegation succeeds → over-limit payout reverts → one `run-day` with anchor.
- `npm run typecheck && npm test && npm run build` before merge.

## Rollout
1. Merge code with EOA mode default (no `treasury/delegation.json` yet) → prod unchanged.
2. Run `treasury:setup --move-funds` locally, commit `treasury/delegation.json`, push → prod switches
   to delegated mode. Rollback = move funds back to the agent EOA (owner self-delegation, or the
   agent's daily allowance), then delete the file.
3. README v3 section, future scope "Done in Week 3", architecture diagram update.
