# GM Agent — Anna Edition: design

Date: 24 Oct 2026 · Status: decisions approved by Berke (brainstorming, GM Agent #6 session) · Background: `docs/anna-plan.md`

## 1. Goal

A free "Daily Puzzle" app in the Anna app store (Anna Founding Builder Program). It brings GM Agent's puzzles to Anna users with AI hints, needs no wallet, and links to the paid USDC game. The program pays a monthly grant by MAU (200 MAU → $50 …) plus a 70 % revenue share on Anna Token usage.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Where does the puzzle come from? | **Hybrid:** our API first; if unreachable, Anna's `llm.complete` generates a fallback puzzle. |
| 2 | Scores / leaderboard | **Personal progress only** (streak, history) in Anna `storage.*`. No shared leaderboard, no user data on our side. |
| 3 | Which puzzle? | **The GM's most recent closed puzzle** (answer and salt already revealed), plus an archive of older closed ones. The answer is checked inside the app. The live paid puzzle is never exposed, so Anna can't become a free answer oracle for the USDC game. |
| 4 | AI features | **Hints** (up to 3 per puzzle, each lowers the score) and **"Why was I wrong?"** (a short GM comment on a wrong guess). No free chat. |
| 5 | Code location | `anna/` folder in the gm-agent repo; answer normalization is shared with the main game. |
| 6 | When | **Stage 0 first** (Passionfroot payouts to Türkiye + Developer Forum question). Development starts after Demo Day (30 Oct) and only if Stage 0 is acceptable. |

## 3. Gate: Stage 0 (before any code)

1. **Passionfroot → Türkiye:** check whether Passionfroot pays creators in Türkiye, and how (bank, PayPal, Wise). Claude researches it, Berke reads the summary.
2. **Developer Forum question** (Claude drafts, Berke posts from his account): (a) can an app call its own backend via `ui.bundle.external_origins` for read-only public data, and does review accept a fallback when that backend is down? (b) any policy on apps that link to a crypto product outside Anna (the paid game)?
3. **Go/no-go:** payouts unclear → pause and ask Eli only "how would payout work if the app qualifies". Forum says no external API → switch decision 1 to fallback-only (Anna-generated puzzles), which is still within this design.

## 4. Architecture

```
Anna panel (sandbox iframe)                      GM Agent (Vercel)
┌──────────────────────────────┐   GET          ┌───────────────────────────┐
│ anna/ SPA                    │ ─────────────▶ │ /api/anna/archive         │
│  puzzle-source  ─ fallback ─▶ llm.complete    │  closed puzzles only,     │
│  answer-check (shared norm.) │                │  CORS: Anna origin only   │
│  hints / why-wrong ─────────▶ llm.complete    └───────────────────────────┘
│  progress ──────────────────▶ storage.*       (main game, treasury,
└──────────────────────────────┘                 SpendingGuard unchanged)
```

### 4.1 GM Agent side (small)
- **`GET /api/anna/archive`**: the closed puzzles, newest first, up to 30: `{ day, difficulty, question, answer, acceptedAnswers, commitment, salt }`. Only `status = closed` rows; the open puzzle is never included. Read-only, no auth, cached (`s-maxage=300`). CORS `Access-Control-Allow-Origin` is limited to the Anna app origin(s) from an env var (`ANNA_ORIGINS`).
- Tests: the open puzzle never appears; fields match; CORS header only for allowed origins.

### 4.2 Anna app (`anna/`)
Manifest (schema 3) + static SPA, built with Anna's `anna-app` tooling (`init` → study the focus-flow example → `dev` → `validate`). Units:

| Unit | Does | Depends on |
|---|---|---|
| `puzzle-source` | Returns today's puzzle: newest archive entry; on network error/timeout (5 s) a fallback puzzle from `llm.complete` (JSON: question, answer, acceptedAnswers), marked `source: "anna"`. | archive API, `llm.complete` |
| `answer-check` | `isCorrect(puzzle, guess)` with the **same normalization** as `src/game/answers.ts` (shared module, not a copy). For GM puzzles also shows "verified ✓" by recomputing `keccak256(salt, normalize(answer)) == commitment`. | shared normalizer, keccak |
| `hints` | Up to 3 escalating hints from `llm.complete`; prompt includes the answer and forbids revealing it; output is filtered (if it contains the normalized answer, it's replaced with a generic hint). | `llm.complete` |
| `why-wrong` | One short GM-voice comment on a wrong guess (no answer leak, same filter). | `llm.complete` |
| `progress` | Per-user streak, history, score in `storage.*`. Score per puzzle: 100, −25 per hint used, solved = streak +1; a day without a solve resets the streak. | `storage.*` |
| `ui` | Puzzle card, answer box, hint/why-wrong buttons, streak, archive list, and a link: "Real USDC prizes → GM Agent" (GitHub/README link; X flags the vercel.app domain, so check Anna's link policy in Stage 0). | all above |

### 4.3 Data flow
Open app → `puzzle-source` (archive, else fallback) → user guesses → `answer-check` → correct: `progress` update + "verified ✓" (GM puzzles) / wrong: offer "Why was I wrong?" → hints any time (≤ 3) → archive tab lets users play older puzzles (they count for score but not for the streak).

## 5. Error handling
- Archive unreachable or slow → fallback puzzle, with a small "GM is offline, here's a puzzle from Anna" note. Anna review counts a broken external dependency as a defect; the fallback covers it.
- `llm.complete` fails → hints/why-wrong buttons show "try again later"; puzzle play still works.
- Bad LLM JSON for a fallback puzzle → one retry, then a small built-in puzzle bank inside the app.
- `storage.*` fails → the game still runs; progress isn't saved (shown once).

## 6. Testing
- GM Agent: Vitest for `/api/anna/archive` (closed-only, CORS, shape) — existing `npm run typecheck && npm test && npm run build`.
- Anna app: unit tests for `answer-check` (shared normalizer cases), the hint answer-leak filter, scoring/streak rules, `puzzle-source` fallback on timeout; then `anna-app dev` by hand and `anna-app validate` before submission.

## 7. Out of scope (YAGNI)
Shared leaderboard, live/paid puzzle, x402 or wallets inside Anna, free chat with the GM, Anna-only daily puzzle generation on our backend. Candidates for the monthly "meaningful update" later: shared leaderboard, weekly themes.

## 8. After build (from `docs/anna-plan.md`)
Stage 1 Berke creates the Anna developer account (ToS acceptance is his) → Stage 3 listing text + images (Claude) and review submission (Berke, 3-5 business days) → Stage 4 growth: X @GMAgentHQ, Builder Discord, Rise In community; target ≥ 200 real MAU per calendar month; one meaningful update per month.

## 9. To verify during implementation
Exact Anna host API names and signatures (`llm.complete`, `storage.*`), manifest fields for `external_origins`, the Anna app origin for CORS, and whether keccak is available in the sandbox (else bundle `viem`'s `keccak256`).
