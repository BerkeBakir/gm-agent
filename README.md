<p align="center">
  <img src="public/gm-agent-logo.svg" alt="GM Agent logo" width="128" height="128" />
</p>

<h1 align="center">GM Agent</h1>

<p align="center">
  <b>An autonomous AI game master that runs a daily puzzle game and manages its own on-chain treasury.</b><br/>
  <a href="https://gm-agent-lime.vercel.app">Live app</a> ·
  <a href="https://x.com/GMAgentHQ">@GMAgentHQ</a> ·
  Base Sepolia (testnet) ·
  Built for <b>Agentmaxxing</b> by <a href="https://x.com/riseinweb3">@riseinweb3</a> (Oct 2026)
</p>

---

## What's new in v2 (Week 2)

- 🎚️ **Difficulty hysteresis, enforced in code.** Week-1 experiments showed Gemini flipped puzzle difficulty
  almost every day even when the prompt told it not to. The rule now lives in the guardrails: Gemini proposes,
  the code only lets a change through when the evidence supports it. Switches dropped from **19–23 to 9** per
  30 simulated days, with more days in the target band ([details](#experiments)).
- 🤖 **Other AI agents can play.** An [MCP server](#let-other-agents-play) gives any agent (Claude Desktop,
  Claude Code, ...) four tools. The agent reads the puzzle, then **pays the 0.10 USDC entry fee itself via x402**
  from its own wallet. Agents paying agents.
- ⏱️ **The daily loop can't hang anymore.** Each Gemini call has a 40 s timeout and each LLM step a time budget;
  on timeout the rule-based decider or the puzzle bank takes over. If a run ever dies half-way, the next run
  reopens the game by itself (this happened once in production; the fix comes with a test).

## Agent canvas

| | GM Agent (the game master) | Player agent (via MCP) |
|---|---|---|
| **Goal** | Keep a daily puzzle game fun and alive without going broke | Solve today's riddle and win USDC |
| **Tools** | Gemini decision + puzzle author, USDC wallet, x402 paywall, decision log, 5 chat tools | `get_puzzle`, `submit_answer`, `get_results`, `get_my_wallet` |
| **Memory** | Postgres: puzzles + answer keys, submissions, decision log fed back into every decision | Results and leaderboard from `get_results` |
| **Guardrails** | Max 2 USDC per winner and 10% of treasury per day; difficulty hysteresis; chat can't move money; answer key never leaves the server | Testnet USDC only; never pays more than `MAX_ENTRY_FEE_USDC`; one answer per wallet per day |
| **Output** | On-chain payouts + a public decision log with written reasoning | One paid answer + a BaseScan link |

## Project description

GM Agent is an autonomous AI game master. Every day it publishes an original puzzle, players
pay a small **USDC entry fee via x402** to answer, and at the end of the day the agent grades the
answers, **decides how much to pay the winners**, sends the rewards **on-chain from its own
wallet**, tunes tomorrow's difficulty and writes down **why** — with no human operator.

It is built on top of the default Agentmaxxing starter kit (Next.js + Gemini + viem), extended
with real x402 settlement, a Postgres-backed game store, an autonomous daily loop and hard
spending guardrails.

## The problem it solves

Online communities love daily puzzles and prize games, but running one is a chore: someone has to
write fresh puzzles every day, collect entry fees, check answers, decide prize sizes and pay
winners — and do it fairly and without going broke. Prize pools are usually managed by hand,
opaquely, and die when the organizer loses interest.

GM Agent hands that whole job to an AI agent **that holds its own money**:

- **No operator needed** — puzzles, grading, payouts and difficulty tuning happen on a daily cron.
- **Sustainable economics** — too generous and the treasury drains; too stingy and players leave.
  The agent balances income vs. rewards every day, and code-level guardrails make bankruptcy
  impossible (see [Experiments](#experiments)).
- **Transparent and trustless** — every fee and payout is a public USDC transaction, and every
  decision is logged with the agent's own written reasoning.
- **Micro-payments that actually work** — x402 + EIP-3009 lets players pay a 0.10 USDC fee with a
  single gasless signature, no account or approval step.

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | ≥ 22 |
| Framework | Next.js (App Router) | 16.3.8 |
| UI | React / React DOM | 19.3.0 |
| Styling | Tailwind CSS (+ `@tailwindcss/postcss`) | 4.3.3 |
| Components | shadcn · Base UI · lucide-react | 4.21.1 · 1.8.0 · 1.52.0 |
| Language | TypeScript | 5.9.3 |
| LLM SDK | `@google/genai` (Google Gemini) | 2.27.0 |
| Blockchain | viem | 2.57.2 |
| Network / token | Base Sepolia testnet · Circle USDC (EIP-3009) | chain id 84532 |
| Payments | x402 protocol, `exact` scheme | v1 |
| Database | Neon Postgres (`@neondatabase/serverless`) | 1.2.0 |
| Hosting / cron | Vercel (+ Vercel Cron) | — |
| Agent interop | Model Context Protocol (`@modelcontextprotocol/sdk`, stdio) · zod | 1.32.1 · 3.25.76 |
| Testing | Vitest · tsx | 5.0.3 · 4.23.15 |

## Tools

The chat agent ([`agent/tools.ts`](agent/tools.ts)) has **5 built-in tools** that Gemini calls via
function calling:

| # | Tool | What it does |
|---|---|---|
| 1 | `create_challenge` | Publishes a new original puzzle (difficulty, question, private answer key, accepted variants). Only allowed when no day is open. |
| 2 | `get_today_challenge` | Returns the currently open puzzle — never the answer key. |
| 3 | `get_treasury_balance` | Reads the agent wallet's USDC and ETH balance on Base Sepolia, with a BaseScan link. |
| 4 | `get_decision_log` | Reads the GM's own decision log: participants, win rate, income, payouts, treasury before/after and written reasoning. |
| 5 | `get_game_rules` | Returns the rules and economic limits: entry fee, max reward per winner, daily payout budget. |

Chat tools are **read-only with respect to money**. On top of them, the autonomous daily loop
([`src/gm/run-day.ts`](src/gm/run-day.ts)) performs these actions:

| Action | What it does |
|---|---|
| Decide rewards & difficulty | Gemini proposes reward per winner + next difficulty with reasoning (3 personas). |
| Apply guardrails | `SpendingGuard` clamps every proposal to per-tx and daily caps. |
| Pay winners | Real USDC transfers on Base Sepolia from the agent wallet. |
| Author next puzzle | Gemini writes a puzzle; a second, blind Gemini call must solve it or it is rewritten. |
| Settle entry fees | x402 paywall on `/api/submit` settles EIP-3009 authorizations on-chain. |

**New in v2: 4 player tools for other agents**, served by the MCP server in [`mcp/server.ts`](mcp/server.ts)
(logic in [`src/mcp/tools.ts`](src/mcp/tools.ts)):

| # | Tool | What it does |
|---|---|---|
| 6 | `get_puzzle` | Today's riddle, difficulty, day, players so far and entry fee. Never the answer. |
| 7 | `submit_answer(answer)` | Pays the entry fee via x402 from the agent's own wallet and submits one answer. Returns the BaseScan link. |
| 8 | `get_results` | Latest GM decisions: winners, rewards with tx links, reasoning, guardrail notes, past answers, leaderboard. |
| 9 | `get_my_wallet` | The player wallet's address and USDC balance. |

Every tool returns a readable message instead of throwing, so the calling agent can recover
(e.g. "This wallet already answered today's challenge.").

## Supported AI models

GM Agent runs on **Google Gemini** through `@google/genai` 2.27.0, with automatic model fallback
([`src/llm/gemini.ts`](src/llm/gemini.ts)): on 503 / 429 / network errors each model gets 2
attempts, then the next model in the chain is tried. Every call is aborted after 40 s
(`GEMINI_CALL_TIMEOUT_MS`) and the next model takes over. The model is switchable via env vars.

| Role | Model | Version / alias |
|---|---|---|
| Primary (`GEMINI_MODEL`) | Gemini Flash | `gemini-flash-latest` (latest stable Flash) |
| Fallback 1 | Gemini 2.5 Flash | `gemini-2.5-flash` |
| Fallback 2 | Gemini Flash-Lite | `gemini-flash-lite-latest` |
| No API key / all models down | Rule-based strategy + built-in puzzle bank | — |

Any other Gemini model id can be set via `GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS`.
The economic decision maker also supports three personas (`GM_PERSONA`): `balanced`,
`treasurer`, `entertainer`.

## Key features

- 🧩 **Writes puzzles** — Gemini authors an original riddle; the answer key is stored privately at creation.
  A second, independent Gemini call solves each draft *blind*; if it can't reach the same answer, the
  puzzle is treated as ambiguous and rewritten.
- 💸 **Charges entry fees with x402** — `POST /api/submit` answers `402 Payment Required`; the player
  signs a gasless EIP-3009 USDC authorization; the server **settles it on-chain** into the treasury.
- ✅ **Grades deterministically** — answers are normalized and compared to the stored key, so the LLM
  can never "misremember" its own riddle.
- 🧠 **Makes the economic call** — at day end Gemini sees treasury, income, participation, win rate
  and history, and proposes a reward per winner and the next difficulty, with written reasoning.
- 🛡️ **Is kept honest by guardrails** — max 2 USDC per winner and max 10% of the treasury per day,
  enforced in code (`SpendingGuard`). The LLM proposes; the code disposes.
- 🎚️ **Keeps difficulty stable (v2)** — difficulty may only change when today's win rate is far outside the
  30–50% band or outside it two days in a row, one step at a time. Gemini proposes; blocked proposals are logged.
- 🤖 **Lets other AI agents play (v2)** — MCP server with 4 tools; the agent pays its own x402 entry fee.
- 🏦 **Pays winners on-chain** — real USDC transfers on Base Sepolia, every tx linked on the page.
- 📒 **Keeps a public decision log** — what it saw, what it decided, what the guardrails changed, and why.
- 💬 **Talks** — a chat where anyone can ask the GM about today's puzzle, the treasury, or why it paid
  what it paid. Chat tools are read-only; money only moves in the daily loop.
- 🔁 **Resilient** — Gemini retries + model fallback + per-call timeouts, rule-based fallback when no LLM is
  available, and self-recovery if a day-close is ever interrupted.
- 🧪 **Tested & simulated** — unit tests for every money path and a 30-day economy simulator.

## Demo video

[![GM Agent v2 demo](https://img.youtube.com/vi/eltZ4UOp-ls/hqdefault.jpg)](https://youtu.be/eltZ4UOp-ls)

▶️ **Week 2 demo (v2):** https://youtu.be/eltZ4UOp-ls: hysteresis in code, and Claude playing via MCP and paying its own x402 entry fee.
▶️ **Week 1 demo (v1):** https://youtu.be/1hf2Hj-q76E

## Demo links

- Week 1 (gmagent.v1): https://youtu.be/1hf2Hj-q76E
- Week 2 (gmagent.v2): https://youtu.be/eltZ4UOp-ls
- Week 3 (gmagent.v3): _coming in Week 3_

Live app: https://gm-agent-lime.vercel.app

## Future scope

**Done in Week 2 (gmagent.v2):** code-enforced difficulty hysteresis, MCP server so other AI agents
play and pay via x402, time budgets + self-recovery for the daily loop.

**Week 3 (gmagent.v3)**
- **ZK answer commitments** — publish a hash commitment of the answer key at puzzle creation and a
  ZK proof at grading time, so players can verify the GM didn't change the answer after the fact.
- **Sponsored prize pools** — anyone can top up the treasury via x402 and the GM accounts for it.
- **Multiple game modes** — trivia, word games and multi-day tournaments run by the same agent.
- **Onchain decision log** — anchor each day's decision hash on Base for tamper-evident accounting.
- **Smart-account treasury** — move the agent key to a smart account with on-chain spending limits
  (delegated allowance) instead of an env var, so the caps hold even outside our code.

**Later**
- **Model switching in the UI** — pick Gemini / Claude / OpenAI per role: chat, puzzle author, treasurer.
- **Streaks** — per-wallet history and streak bonuses decided by the GM within the caps.

## Social media

- X / Twitter: [@GMAgentHQ](https://x.com/GMAgentHQ)
- Built for Agentmaxxing by [@riseinweb3](https://x.com/riseinweb3)
- GitHub: [BerkeBakir/gm-agent](https://github.com/BerkeBakir/gm-agent)

## Architecture

```mermaid
flowchart LR
  subgraph Players
    P[Browser wallet<br/>Coinbase Wallet / MetaMask]
  end
  subgraph App["Next.js on Vercel"]
    UI[Page: puzzle, play, treasury,<br/>decision log, chat]
    SUB["/api/submit<br/>x402 paywall"]
    RUN["/api/gm/run-day<br/>daily cron · CRON_SECRET"]
    CHAT["/api/agent<br/>Gemini chat + read-only tools"]
    STATE["/api/state"]
  end
  subgraph GM["GM loop · src/gm/run-day.ts"]
    S1[Read state] --> S2[Gemini decides<br/>reward + difficulty]
    S2 --> S3[Guardrails<br/>per-tx + daily cap]
    S3 --> S4[Pay winners<br/>SpendingGuard]
    S4 --> S5[Gemini writes<br/>next puzzle]
    S5 --> S6[Decision log]
  end
  DB[(Neon Postgres<br/>challenges · submissions · decisions)]
  CHAIN[(Base Sepolia<br/>USDC · agent wallet)]

  P -- "1. answer → 402" --> SUB
  P -- "2. EIP-3009 signature (X-PAYMENT)" --> SUB
  SUB -- transferWithAuthorization --> CHAIN
  SUB --> DB
  RUN --> GM
  GM --> DB
  S4 -- USDC transfer --> CHAIN
  UI --> STATE --> DB
  STATE --> CHAIN
  UI --> CHAT
```

| Path | What it is |
|---|---|
| [`src/gm/run-day.ts`](src/gm/run-day.ts) | The daily loop: state → decide → guardrails → pay → next puzzle → log. Cron, admin button and simulator all call this. |
| [`src/gm/gemini.ts`](src/gm/gemini.ts) | Gemini decision maker (3 personas) and puzzle author, structured JSON output. |
| [`src/gm/policy.ts`](src/gm/policy.ts) | Hard guardrails applied to every proposal: spending caps + difficulty hysteresis. |
| [`src/gm/strategies.ts`](src/gm/strategies.ts) | Rule-based strategies for experiments and as LLM fallback. |
| [`src/x402/exact.ts`](src/x402/exact.ts) | x402 `exact` scheme: requirements, EIP-3009 signing, verification, on-chain settlement. |
| [`src/x402/client.ts`](src/x402/client.ts) | `payAndSubmit()`: the client side (402 → sign → X-PAYMENT) with a fee limit, used by the bots and the MCP server. |
| [`mcp/server.ts`](mcp/server.ts) · [`src/mcp/tools.ts`](src/mcp/tools.ts) | MCP server that lets other AI agents play. |
| [`src/wallet/`](src/wallet/) | `Wallet` interface, `BaseSepoliaWallet` (real USDC), `MockWallet` (sims), `SpendingGuard`. |
| [`src/game/`](src/game/) | Challenges, submissions, decision log; in-memory and Neon Postgres stores; answer checking. |
| [`src/sim/simulate.ts`](src/sim/simulate.ts) | Off-chain economy simulator with bot players. |
| [`agent/`](agent/) | Agent loop + chat tools (from the Agentmaxxing starter kit, adapted). |
| [`app/`](app/) | Next.js page and API routes. |

## Crypto integration

All money is **USDC on Base Sepolia** (Circle's testnet USDC, `0x036C…CF7e`), so income and
expenses share one unit. ETH is only used for gas, paid by the agent.

### Entry fee: x402, settled on-chain

The starter kit's x402 demo only *signs* payments. GM Agent **settles** them:

1. `POST /api/submit {answer}` → `402` with x402 v1 `PaymentRequirements`
   (`scheme: "exact"`, `network: "base-sepolia"`, `maxAmountRequired: "100000"`, `payTo: <agent>`, `asset: USDC`).
2. The player's wallet signs an EIP-712 `TransferWithAuthorization` (EIP-3009) — **no gas, no approve**.
3. The client retries with `X-PAYMENT: base64(json)`.
4. The server checks recipient, amount, validity window, signature and that the nonce is unused
   (on-chain `authorizationState`), refuses duplicates **before** charging, then calls
   `transferWithAuthorization` on the USDC contract from the agent wallet.
5. `200` + `X-PAYMENT-RESPONSE` with the settlement tx. The fee is now in the treasury.

Verified against the real Base Sepolia USDC contract: a valid signature passes signature checks,
a tampered amount fails with `FiatTokenV2: invalid signature`.

### Rewards: real transfers, behind a spending guard

At day end every payout goes through `SpendingGuard` (`src/wallet/spending-guard.ts`):
per-transfer cap and a daily cap of 10% of the start-of-day treasury. Each payout's tx hash is
stored and shown in the decision log with a BaseScan link.

### Why this is meaningful, not bolted on

Without the wallet there is no game: the treasury is the GM's score, entry fees are its income,
rewards are its spending, and the decision log is its accounting. The agent's core job — keep the
game alive and fun without going broke — only exists because it holds money.

## Experiments

Full write-up: **[docs/experiments.md](docs/experiments.md)**. 30 simulated days, 40 bot players,
50 USDC starting treasury, same seeds for every strategy:

| Strategy | Final treasury | Bankrupt runs | Last-week players | Difficulty switches |
|---|---:|---:|---:|---:|
| fixed | 22.18 | 0/5 | 22.2 | 1.0 |
| generous | 18.90 | 0/5 | 17.9 | 0.0 |
| stingy | 78.46 | 0/5 | 8.5 | 1.0 |
| adaptive | 27.63 | 0/5 | 22.9 | 22.8 |
| adaptive-v2 (hysteresis) | 27.57 | 0/5 | 23.0 | 11.0 |
| generous, **no daily cap** | 0.06 | **5/5** | 16.3 | 0.0 |
| adaptive + **code hysteresis** (v2) | 27.54 | 0/5 | 23.0 | 11.0 |

Key findings: the hard daily cap is what prevents bankruptcy (5/5 → 0/5); stingy keeps money but
loses players; generous makes the game boring; the first adaptive controller oscillated and was
fixed with hysteresis.

**Week 2: Gemini + hysteresis in code** (prompt v2, seed 1). In week 1, putting "don't change difficulty on
one noisy day" in the prompt did not work. Moving the rule into the guardrails did:

| Gemini persona | Difficulty switches: prompt only → **code rule** | Days in 30–50% band | Final treasury |
|---|---:|---:|---:|
| balanced | 23 → **9** | 8 → **10** | 26.60 → 27.84 |
| treasurer | 22 → **9** | 9 → **12** | 39.43 → **44.65** |
| entertainer | 19 → **9** | 11 → **12** | 27.78 → 27.07 |

LLMs are good at the judgment call (how generous to be, explained in words) and unreliable at
stateful rules. Anything that must always hold belongs in code.

## Run it locally

Requirements: Node 22+, a free [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/BerkeBakir/gm-agent && cd gm-agent
npm install
cp .env.example .env        # add GEMINI_API_KEY; WALLET_PRIVATE_KEY optional (or use "Create wallet")
npm run dev:memory          # in-memory store, http://localhost:3000
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (store, answers, guardrails, run-day loop, x402, simulator) |
| `npm run simulate` | Strategy experiments → `docs/sim/` |
| `npm run balance -- 0xAddr` | Read ETH + USDC balance of any address on Base Sepolia |
| `npm run mcp:setup` | Create + fund the test wallet the MCP player agent pays from |
| `npm run mcp` | Start the MCP server (stdio) |
| `npm run dev` | Dev server using `DATABASE_URL` if set (Postgres) |

To close a day manually: open the **Operator** panel on the page and use the `CRON_SECRET` token,
or `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/gm/run-day`.

### Environment

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | LLM for chat, decisions and puzzles (without it, rule-based fallback + puzzle bank) |
| `GEMINI_MODEL` | Default `gemini-flash-latest` |
| `GEMINI_FALLBACK_MODELS` | Tried in order on 503/429/network errors. Default `gemini-2.5-flash,gemini-flash-lite-latest` |
| `WALLET_PRIVATE_KEY` | Agent treasury key (testnet only). Required on Vercel. |
| `DATABASE_URL` | Neon Postgres (auto-set by the Vercel Neon integration) |
| `CRON_SECRET` | Protects `/api/gm/run-day` (Vercel Cron sends it automatically) |
| `ENTRY_FEE_USDC` | Default `0.10` |
| `MAX_REWARD_PER_TX` / `MAX_DAILY_TREASURY_FRACTION` | Guardrails, default `2.00` / `0.10` |
| `GM_PERSONA` | `balanced` (default), `treasurer` or `entertainer` |

## Let other agents play

Any MCP-capable agent can play GM Agent with its own money. It reads the puzzle, solves it, and
pays the entry fee itself through x402 (a gasless EIP-3009 signature, settled on-chain).

```bash
npm run mcp:setup                 # creates .mcp-player.json (gitignored) and funds it with 0.5 test USDC
claude mcp add gm-agent -- npx tsx "/absolute/path/to/gm-agent/mcp/server.ts"
```

Then ask Claude: *"Get today's GM Agent puzzle, solve it, and submit your answer."* It calls
`get_puzzle` → `submit_answer` and returns the BaseScan link of the fee it paid.

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gm-agent": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/gm-agent/mcp/server.ts"],
      "env": { "MAX_ENTRY_FEE_USDC": "0.5" }
    }
  }
}
```

| Env | Default | |
|---|---|---|
| `PLAYER_PRIVATE_KEY` | key in `.mcp-player.json` | Base Sepolia **test** wallet with a little USDC (no ETH needed). Without a key the server is read-only. |
| `GM_AGENT_URL` | `https://gm-agent-lime.vercel.app` | Point it at `http://localhost:3000` for local runs. |
| `MAX_ENTRY_FEE_USDC` | `0.5` | The client refuses to sign anything above this, and anything that isn't Base Sepolia USDC. |

## Security notes

- **Testnet only.** No real funds; the agent key lives in env vars, never in git.
- **Money can't be moved from chat.** Chat tools are read-only; payouts only happen in the
  `CRON_SECRET`-protected daily loop.
- **The LLM can't overspend.** Per-tx and daily caps are enforced in code after the LLM decides.
- **Player agents can't be overcharged.** The x402 client checks network, asset and amount before signing.
- **The answer key never leaves the server** while a puzzle is open (`toPublicChallenge` strips it;
  tested). The system prompt also forbids revealing it.
- **One answer per wallet per day**, enforced by a unique index; duplicates are rejected *before*
  the entry fee is settled. The entry fee makes Sybil spam cost money.

## Built on

[Agentmaxxing starter kit](https://www.npmjs.com/package/agentmaxxin) (Next.js + Gemini + viem),
[x402](https://x402.org), EIP-3009 USDC, [Neon](https://neon.tech), [Vercel](https://vercel.com).

Design doc (Turkish): [docs/proje-gm-agent.md](docs/proje-gm-agent.md).
