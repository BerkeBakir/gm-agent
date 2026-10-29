# GM Agent — Anna Edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a free, wallet-free "GM Daily Riddle" app for the Anna app store that serves GM Agent's most recent closed riddle, with AI hints, a "Why was I wrong?" comment, and a personal streak, then launch it toward 200 monthly active users.

**Architecture:** GM Agent gets one read-only endpoint, `GET /api/anna/archive`, which returns closed puzzles only. The Anna app is a static SPA in `anna/`. TypeScript in `anna/src/` is bundled by esbuild into `anna/bundle/app.js`, and it reuses the main game's answer normalizer and commitment hash from `src/game/`. The app talks to Anna only through the Anna App SDK: `llm.complete` for hints, why-wrong and the fallback puzzle, and `storage.get/set` for progress. When our API is down it falls back to an Anna-generated puzzle, and after that to a built-in bank.

**Tech Stack:** TypeScript 5 · esbuild (bundle) · Vitest · viem (`keccak256`, `encodeAbiParameters`) · Next.js 16 route handler · Anna App SDK (`/static/anna-apps/_sdk/latest/index.js`) · `@anna-ai/cli` (`anna-app` validate/dev/apps push).

**Spec:** `docs/superpowers/specs/2026-10-24-anna-edition-design.md` (approved by Berke on 29 Oct 2026). Background: `docs/anna-plan.md`, `docs/anna-stage0.md`.

## Global Constraints

- The live (open, paid) puzzle must **never** be returned to the Anna app. Only `status = "closed"` puzzles leave `/api/anna/archive`.
- The app has no wallets, no x402 and no payments. The only link out is to the GitHub repo (`https://github.com/BerkeBakir/gm-agent`). X flags the vercel.app domain, so the link never points there.
- Answer normalization is **shared, not copied**: the app imports `normalizeAnswer` / `isCorrectAnswer` from `src/game/answers.ts`, and `commitAnswer` from `src/game/commitment-core.ts`.
- Scoring: 100 per solved puzzle, −25 per hint used, at most 3 hints. Solving the **today** puzzle advances the streak, archive puzzles count for score only, and a calendar day with no solve resets the streak.
- Timeouts: archive fetch 5 s. When it fails, generate an Anna puzzle (1 retry on bad JSON), then fall back to the built-in bank.
- Hints and why-wrong never reveal the answer. Output that contains the normalized answer or any accepted answer is replaced with a generic line.
- If `llm.complete` fails, the hint and why-wrong controls show "The GM is busy, try again later." and play continues.
- If `storage.*` fails, the game still runs and the user sees "Progress can't be saved right now." once.
- CORS on `/api/anna/archive` is `Access-Control-Allow-Origin: *`. **Deviation from spec §4.1, on purpose:** Anna loads apps in an `<iframe sandbox>` without `allow-same-origin`, so the request origin is `null` and cannot be allow-listed. The data is already public through `/api/state` (closed puzzles with answer and salt).
- Code, commits and app copy are in English. Talk to Berke in Turkish.
- Before every commit that touches app or server code, run `npm run typecheck && npm test`. Before the PR, also run `npm run build`.
- Work on branch `feat/anna-edition`. Never commit `.env*` or keys.
- Account steps are Berke's own actions: Anna account creation, Developer ToS acceptance, `anna-app login`, and submitting for review. Prepare everything for them, but don't perform them.

## File Structure

| File | Responsibility |
|---|---|
| `src/game/commitment-core.ts` (new) | Browser-safe `commitAnswer` / `verifyCommitment` (viem only, no `node:crypto`). |
| `src/game/commitment.ts` (modify) | Keeps `makeCommitment` (uses `node:crypto`) and re-exports the core. |
| `app/api/anna/archive/route.ts` (new) | `GET` + `OPTIONS`: closed puzzles, newest first, ≤ 30, CORS `*`, cached. |
| `test/anna-archive-route.test.ts` (new) | Route tests. |
| `anna/src/types.ts` | `Puzzle`, `Complete`, `KV` types shared by app modules. |
| `anna/src/answer-check.ts` | `isCorrect`, `isVerified`. |
| `anna/src/progress.ts` | Pure progress state: hints, wrong guesses, solves, score, streak, dates. |
| `anna/src/progress-store.ts` | Load/save progress through `KV`, failure-tolerant. |
| `anna/src/anna-host.ts` | Adapters from the Anna SDK runtime to `Complete` and `KV` (handles both RPC response shapes). |
| `anna/src/leak-filter.ts` | `leaksAnswer`. |
| `anna/src/hints.ts` | `getHint`, `whyWrong` (LLM + leak filter + generic fallbacks). |
| `anna/src/bank.ts` | Built-in fallback riddles + `bankPuzzle(date)`. |
| `anna/src/puzzle-source.ts` | Archive fetch, LLM fallback puzzle, per-date cache, `loadPuzzles`. |
| `anna/src/ui.ts` | DOM rendering and event wiring (no business rules). |
| `anna/src/main.ts` | Entry: connect SDK, build deps, start UI. |
| `anna/bundle/index.html`, `anna/bundle/style.css`, `anna/bundle/icon.svg` | Static bundle files. `anna/bundle/app.js` is a build output and is git-ignored. |
| `anna/manifest.json`, `anna/app.json` | Anna manifest and store listing basics. |
| `anna/test/*.test.ts` | Unit tests for every `anna/src` module except `ui.ts` / `main.ts`. |
| `anna/README.md`, `anna/PRIVACY.md`, `anna/LISTING.md` | How to build/run/publish, privacy note, store listing copy. |
| `docs/anna-launch.md` | Launch and growth plan toward 200 MAU. |

---

### Task 1: Archive endpoint + browser-safe commitment core

**Files:**
- Create: `src/game/commitment-core.ts`
- Modify: `src/game/commitment.ts`
- Create: `app/api/anna/archive/route.ts`
- Test: `test/anna-archive-route.test.ts`

**Interfaces:**
- Produces: `commitAnswer(salt: Hex, answer: string): Hex` and `verifyCommitment(commitment: Hex, salt: Hex, answer: string): boolean` from `src/game/commitment-core.ts` (still re-exported from `src/game/commitment.ts` and `src/game/index.ts`).
- Produces: `GET /api/anna/archive` → `200 { puzzles: ArchiveEntry[] }` where `ArchiveEntry = { day: number; difficulty: "easy"|"medium"|"hard"; question: string; answer: string; acceptedAnswers: string[]; commitment: string | null; salt: string | null }`. Newest first, max 30, closed only. Headers: `Access-Control-Allow-Origin: *`, `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
- Produces: `OPTIONS /api/anna/archive` → `204` with CORS headers.

- [ ] **Step 1: Create the branch**

```bash
cd "D:/Claude Code/gm-agent"
git checkout main && git pull --ff-only
git checkout -b feat/anna-edition
```

- [ ] **Step 2: Write the failing route test**

Create `test/anna-archive-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/anna/archive", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GAME_STORE = "memory";
  });

  async function seed(n: number) {
    const { getGameStore } = await import("../src/game");
    const store = getGameStore();
    for (let i = 1; i <= n; i++) {
      await store.createChallenge({
        difficulty: "medium",
        question: `Q${i}?`,
        answer: `A${i}`,
        ...(i === 1 && { acceptedAnswers: ["Alpha one"] }),
      });
    }
    return store;
  }

  it("returns closed puzzles only, newest first, with answer, salt and accepted answers", async () => {
    await seed(3); // days 1, 2 closed; day 3 open
    const { GET } = await import("../app/api/anna/archive/route");
    const res = await GET();
    const body = await res.json();

    expect(body.puzzles.map((p: { day: number }) => p.day)).toEqual([2, 1]);
    expect(body.puzzles[1]).toMatchObject({
      day: 1,
      difficulty: "medium",
      question: "Q1?",
      answer: "A1",
      acceptedAnswers: ["Alpha one"],
    });
    expect(body.puzzles[0].acceptedAnswers).toEqual([]);
    expect(body.puzzles[0].commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.puzzles[0].salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("Q3?");
  });

  it("never exposes the open puzzle even when it is the only one", async () => {
    await seed(1);
    const { GET } = await import("../app/api/anna/archive/route");
    const body = await (await GET()).json();
    expect(body.puzzles).toEqual([]);
  });

  it("caps the list at 30", async () => {
    await seed(35);
    const { GET } = await import("../app/api/anna/archive/route");
    const body = await (await GET()).json();
    expect(body.puzzles).toHaveLength(30);
    expect(body.puzzles[0].day).toBe(34);
  });

  it("sends open CORS and cache headers, and answers preflight", async () => {
    await seed(2);
    const { GET, OPTIONS } = await import("../app/api/anna/archive/route");
    const res = await GET();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
    const pre = OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/anna-archive-route.test.ts`
Expected: FAIL, "Cannot find module '../app/api/anna/archive/route'" or similar.

- [ ] **Step 4: Split out the browser-safe commitment core**

Create `src/game/commitment-core.ts`:

```ts
import { encodeAbiParameters, type Hex, keccak256 } from "viem";
import { normalizeAnswer } from "./answers";

/**
 * Browser-safe half of the answer commitment (no node:crypto), shared with the Anna app.
 * commitment = keccak256(abi.encode(bytes32 salt, string normalizedAnswer))
 */
export function commitAnswer(salt: Hex, answer: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "string" }], [salt, normalizeAnswer(answer)]));
}

export function verifyCommitment(commitment: Hex, salt: Hex, answer: string): boolean {
  return commitAnswer(salt, answer).toLowerCase() === commitment.toLowerCase();
}
```

Replace the whole content of `src/game/commitment.ts` with:

```ts
import { randomBytes } from "node:crypto";
import { type Hex, toHex } from "viem";
import { commitAnswer } from "./commitment-core";

export { commitAnswer, verifyCommitment } from "./commitment-core";

/**
 * Commit-reveal for the answer key: the commitment is published when a puzzle opens,
 * the salt when it closes, so anyone can check the GM never changed the answer.
 */
export function makeCommitment(answer: string): { salt: Hex; commitment: Hex } {
  const salt = toHex(randomBytes(32));
  return { salt, commitment: commitAnswer(salt, answer) };
}
```

- [ ] **Step 5: Write the route**

Create `app/api/anna/archive/route.ts`:

```ts
/**
 * GET /api/anna/archive — closed puzzles for the Anna Edition app, newest first.
 * The open (paid) puzzle is never included. CORS is open on purpose: Anna runs apps
 * in a sandboxed iframe whose origin is "null", and all of this is already public
 * through /api/state.
 */
import { getGameStore } from "@/src/game";

export const dynamic = "force-dynamic";

const MAX_PUZZLES = 30;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET() {
  const recent = await getGameStore().listChallenges(MAX_PUZZLES + 1);
  const puzzles = recent
    .filter((c) => c.status === "closed")
    .slice(0, MAX_PUZZLES)
    .map((c) => ({
      day: c.day,
      difficulty: c.difficulty,
      question: c.question,
      answer: c.answer,
      acceptedAnswers: c.acceptedAnswers ?? [],
      commitment: c.commitment ?? null,
      salt: c.salt ?? null,
    }));
  return Response.json(
    { puzzles },
    { headers: { ...CORS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
```

- [ ] **Step 6: Run the new test and the full suite**

Run: `npx vitest run test/anna-archive-route.test.ts`
Expected: PASS (4 tests).

Run: `npm run typecheck && npm test`
Expected: typecheck clean. All tests pass, including the existing `test/commitment.test.ts` and `test/state-route.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/game/commitment-core.ts src/game/commitment.ts app/api/anna/archive/route.ts test/anna-archive-route.test.ts
git commit -m "feat(anna): closed-puzzle archive endpoint and browser-safe commitment core"
```

---

### Task 2: Anna project skeleton, build, and answer checking

**Files:**
- Create: `anna/src/types.ts`, `anna/src/answer-check.ts`
- Create: `anna/manifest.json`, `anna/app.json`, `anna/bundle/index.html`, `anna/bundle/style.css`, `anna/bundle/icon.svg`
- Modify: `package.json` (scripts + devDependency `esbuild`), `.gitignore`
- Test: `anna/test/answer-check.test.ts`

**Interfaces:**
- Consumes: `isCorrectAnswer` (`src/game/answers.ts`), `commitAnswer` (`src/game/commitment-core.ts`).
- Produces (`anna/src/types.ts`):
  ```ts
  export interface Puzzle {
    key: string; // "gm-<day>" | "anna-<YYYY-MM-DD>" | "bank-<YYYY-MM-DD>"
    source: "gm" | "anna" | "bank";
    question: string;
    answer: string;
    acceptedAnswers: string[];
    difficulty?: string;
    day?: number;
    commitment?: `0x${string}` | null;
    salt?: `0x${string}` | null;
  }
  export type Complete = (req: { system: string; user: string; maxTokens?: number; temperature?: number }) => Promise<string>;
  export interface KV { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; }
  ```
- Produces (`anna/src/answer-check.ts`): `isCorrect(puzzle: Puzzle, guess: string): boolean`, `isVerified(puzzle: Puzzle): boolean`.
- Produces: `npm run anna:build` → writes `anna/bundle/app.js` from `anna/src/main.ts`. Task 7 creates `main.ts`. Until then the build is only run in Task 7.

- [ ] **Step 1: Install tooling and look at the official scaffold**

```bash
cd "D:/Claude Code/gm-agent"
npm i -D esbuild
mkdir -p .tmp && cd .tmp
npx -y @anna-ai/cli@latest init anna-scaffold --slug gm-daily-riddle
cat anna-scaffold/manifest.json anna-scaffold/app.json
ls -R anna-scaffold | head -40
cd ..
```

Expected: a scaffold with `manifest.json`, `app.json` and a bundle folder (`.tmp/` is git-ignored). Read the scaffold's `manifest.json` and `app.json`. If its top-level keys or `schema` value differ from Step 2 below, follow the scaffold, because it matches the current CLI. Keep our `ui.bundle`, `ui.views` and `ui.host_api` values.

- [ ] **Step 2: Write the manifest and app metadata**

Create `anna/manifest.json`:

```json
{
  "schema": 3,
  "tags": ["game", "puzzle", "riddle", "daily"],
  "ui": {
    "bundle": {
      "format": "static-spa",
      "entry": "index.html",
      "external_origins": ["https://gm-agent-lime.vercel.app"]
    },
    "views": [
      {
        "name": "main",
        "title": "GM Daily Riddle",
        "icon": "icon.svg",
        "default": true,
        "default_size": { "w": 420, "h": 640 },
        "min_size": { "w": 340, "h": 480 },
        "resizable": true,
        "single_instance": true
      }
    ],
    "host_api": {
      "llm": ["complete"],
      "storage": ["get", "set"]
    }
  }
}
```

Create `anna/app.json`. Copy the scaffold's `app.json` and set these values. If the scaffold has extra required keys, keep them:

```json
{
  "slug": "gm-daily-riddle",
  "name": "GM Daily Riddle",
  "category": "games",
  "description": "A new riddle every day from GM Agent, an AI game master. Ask for hints, learn why a guess was wrong, and keep your streak alive."
}
```

- [ ] **Step 3: Static bundle files**

Create `anna/bundle/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GM Daily Riddle</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <main id="root" class="app">Loading the GM's riddle…</main>
  <script type="module" src="./app.js"></script>
</body>
</html>
```

Create `anna/bundle/style.css`:

```css
:root { --bg: #0f1115; --card: #181b22; --text: #e8eaf0; --muted: #9aa3b2; --accent: #7c5cff; --ok: #2fbf71; --bad: #e5484d; }
:root[data-theme="light"] { --bg: #f6f7fb; --card: #ffffff; --text: #151821; --muted: #5d6576; --accent: #5b3df5; --ok: #1f9d5c; --bad: #d13438; }
@media (prefers-color-scheme: light) { :root:not([data-theme]) { --bg: #f6f7fb; --card: #ffffff; --text: #151821; --muted: #5d6576; --accent: #5b3df5; --ok: #1f9d5c; --bad: #d13438; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.app { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.top { display: flex; justify-content: space-between; align-items: center; }
.title { font-weight: 700; font-size: 17px; }
.streak { color: var(--muted); font-size: 13px; }
.tabs { display: flex; gap: 6px; }
.tabs button { flex: 1; }
.card { background: var(--card); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.meta { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.question { font-size: 16px; white-space: pre-wrap; }
.note { color: var(--muted); font-size: 12px; }
form { display: flex; gap: 6px; }
input { flex: 1; padding: 9px 10px; border-radius: 8px; border: 1px solid var(--muted); background: transparent; color: var(--text); font: inherit; }
button { padding: 9px 12px; border-radius: 8px; border: 0; background: var(--accent); color: #fff; font: inherit; cursor: pointer; }
button.ghost { background: transparent; color: var(--text); border: 1px solid var(--muted); }
button:disabled { opacity: .45; cursor: default; }
.row { display: flex; gap: 6px; flex-wrap: wrap; }
.ok { color: var(--ok); font-weight: 600; }
.bad { color: var(--bad); }
ol.hints { margin: 0; padding-left: 20px; }
.archive { display: flex; flex-direction: column; gap: 6px; }
.archive button { text-align: left; background: var(--card); color: var(--text); border: 1px solid transparent; }
.archive button.done { border-color: var(--ok); }
a { color: var(--accent); }
.footer { color: var(--muted); font-size: 12px; text-align: center; }
```

Create `anna/bundle/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#7c5cff"/><text x="32" y="42" font-family="Segoe UI, sans-serif" font-size="26" font-weight="700" fill="#fff" text-anchor="middle">GM</text></svg>
```

- [ ] **Step 4: Build script and ignore rules**

In `package.json` `"scripts"`, add after `"treasury:withdraw"`:

```json
"anna:build": "esbuild anna/src/main.ts --bundle --format=esm --target=es2022 --minify --outfile=anna/bundle/app.js",
"anna:validate": "npm run anna:build && cd anna && npx -y @anna-ai/cli@latest validate --strict --bundle bundle",
"anna:dev": "npm run anna:build && cd anna && npx -y @anna-ai/cli@latest dev --bundle bundle --no-llm"
```

Append to `.gitignore`:

```
# Anna app build output
anna/bundle/app.js
anna/.anna/
```

- [ ] **Step 5: Write the failing answer-check test**

Create `anna/test/answer-check.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { commitAnswer } from "../../src/game/commitment-core";
import { isCorrect, isVerified } from "../src/answer-check";
import type { Puzzle } from "../src/types";

const SALT = `0x${"11".repeat(32)}` as const;

function gm(over: Partial<Puzzle> = {}): Puzzle {
  return {
    key: "gm-18",
    source: "gm",
    question: "I have cities but no houses. What am I?",
    answer: "Map",
    acceptedAnswers: ["a map"],
    day: 18,
    commitment: commitAnswer(SALT, "Map"),
    salt: SALT,
    ...over,
  };
}

describe("isCorrect (shared normalizer)", () => {
  it("ignores case, accents and punctuation", () => {
    expect(isCorrect(gm(), "  MAP!! ")).toBe(true);
    expect(isCorrect(gm({ answer: "Café" }), "cafe")).toBe(true);
  });
  it("accepts listed alternatives", () => {
    expect(isCorrect(gm(), "A map")).toBe(true);
  });
  it("rejects wrong and empty guesses", () => {
    expect(isCorrect(gm(), "globe")).toBe(false);
    expect(isCorrect(gm(), "   ")).toBe(false);
  });
});

describe("isVerified (commit-reveal)", () => {
  it("is true when keccak(salt, normalized answer) matches the commitment", () => {
    expect(isVerified(gm())).toBe(true);
  });
  it("is false when the answer was changed after committing", () => {
    expect(isVerified(gm({ answer: "Globe" }))).toBe(false);
  });
  it("is false for non-GM puzzles or missing salt", () => {
    expect(isVerified(gm({ source: "anna" }))).toBe(false);
    expect(isVerified(gm({ salt: null }))).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run anna/test/answer-check.test.ts`
Expected: FAIL, cannot resolve `../src/answer-check`.

- [ ] **Step 7: Implement types and answer-check**

Create `anna/src/types.ts`:

```ts
/** A playable riddle. GM puzzles come from /api/anna/archive; "anna"/"bank" are fallbacks. */
export interface Puzzle {
  /** Stable id used for progress: "gm-<day>", "anna-<YYYY-MM-DD>" or "bank-<YYYY-MM-DD>". */
  key: string;
  source: "gm" | "anna" | "bank";
  question: string;
  answer: string;
  acceptedAnswers: string[];
  difficulty?: string;
  day?: number;
  commitment?: `0x${string}` | null;
  salt?: `0x${string}` | null;
}

/** One stateless LLM call: returns the reply text or throws. */
export type Complete = (req: { system: string; user: string; maxTokens?: number; temperature?: number }) => Promise<string>;

/** Minimal per-user key-value store (Anna storage.*). get() returns undefined when missing. */
export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}
```

Create `anna/src/answer-check.ts`:

```ts
import { isCorrectAnswer } from "../../src/game/answers";
import { commitAnswer } from "../../src/game/commitment-core";
import type { Puzzle } from "./types";

/** Same normalization as the paid game (shared module, not a copy). */
export function isCorrect(puzzle: Puzzle, guess: string): boolean {
  return isCorrectAnswer(guess, puzzle);
}

/** True when a GM puzzle's revealed answer matches the commitment published before it opened. */
export function isVerified(puzzle: Puzzle): boolean {
  if (puzzle.source !== "gm" || !puzzle.commitment || !puzzle.salt) return false;
  return commitAnswer(puzzle.salt, puzzle.answer).toLowerCase() === puzzle.commitment.toLowerCase();
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run anna/test/answer-check.test.ts`
Expected: PASS (6 tests).

Run: `npm run typecheck && npm test`
Expected: clean, all pass.

- [ ] **Step 9: Commit**

```bash
git add anna/manifest.json anna/app.json anna/bundle/index.html anna/bundle/style.css anna/bundle/icon.svg anna/src/types.ts anna/src/answer-check.ts anna/test/answer-check.test.ts package.json package-lock.json .gitignore
git commit -m "feat(anna): app skeleton, manifest and shared answer checking"
```

---

### Task 3: Progress rules (score, hints, streak) and persistence

**Files:**
- Create: `anna/src/progress.ts`, `anna/src/progress-store.ts`
- Test: `anna/test/progress.test.ts`, `anna/test/progress-store.test.ts`

**Interfaces:**
- Consumes: `KV` from `anna/src/types.ts`.
- Produces (`anna/src/progress.ts`):
  ```ts
  export const MAX_HINTS = 3;
  export interface PuzzleRecord { hints: string[]; wrongGuesses: number; solved: boolean; score: number }
  export interface Progress { version: 1; streak: number; lastStreakDate: string | null; totalScore: number; solvedCount: number; history: Record<string, PuzzleRecord> }
  export function emptyProgress(): Progress;
  export function recordOf(p: Progress, key: string): PuzzleRecord;
  export function scoreFor(hintsUsed: number): number;
  export function addHint(p: Progress, key: string, hint: string): Progress;
  export function addWrongGuess(p: Progress, key: string): Progress;
  export function recordSolve(p: Progress, key: string, opts: { countsForStreak: boolean; today: string }): Progress;
  export function currentStreak(p: Progress, today: string): number;
  export function previousDate(date: string): string;
  export function localDate(d?: Date): string;
  ```
  All update functions are pure and return a new object.
- Produces (`anna/src/progress-store.ts`): `PROGRESS_KEY = "progress/v1"`, `loadProgress(kv: KV): Promise<{ progress: Progress; ok: boolean }>`, `saveProgress(kv: KV, p: Progress): Promise<boolean>`.

- [ ] **Step 1: Write the failing progress tests**

Create `anna/test/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addHint,
  addWrongGuess,
  currentStreak,
  emptyProgress,
  localDate,
  MAX_HINTS,
  previousDate,
  recordOf,
  recordSolve,
  scoreFor,
} from "../src/progress";

describe("dates", () => {
  it("previousDate handles month and year boundaries", () => {
    expect(previousDate("2026-11-01")).toBe("2026-10-31");
    expect(previousDate("2027-01-01")).toBe("2026-12-31");
    expect(previousDate("2028-03-01")).toBe("2028-02-29");
  });
  it("localDate formats YYYY-MM-DD in local time", () => {
    expect(localDate(new Date(2026, 9, 5, 23, 30))).toBe("2026-10-05");
  });
});

describe("scoring", () => {
  it("is 100 minus 25 per hint", () => {
    expect([0, 1, 2, 3].map(scoreFor)).toEqual([100, 75, 50, 25]);
    expect(scoreFor(9)).toBe(25);
  });
});

describe("hints and guesses", () => {
  it("stores up to 3 hints per puzzle and ignores more", () => {
    let p = emptyProgress();
    for (let i = 1; i <= 5; i++) p = addHint(p, "gm-1", `hint ${i}`);
    expect(recordOf(p, "gm-1").hints).toEqual(["hint 1", "hint 2", "hint 3"]);
    expect(MAX_HINTS).toBe(3);
  });
  it("counts wrong guesses", () => {
    const p = addWrongGuess(addWrongGuess(emptyProgress(), "gm-1"), "gm-1");
    expect(recordOf(p, "gm-1").wrongGuesses).toBe(2);
  });
  it("does not mutate the input", () => {
    const p = emptyProgress();
    addHint(p, "gm-1", "x");
    expect(p.history).toEqual({});
  });
});

describe("solving and streaks", () => {
  it("scores a solve with the hints used and counts it once", () => {
    let p = addHint(emptyProgress(), "gm-1", "h");
    p = recordSolve(p, "gm-1", { countsForStreak: true, today: "2026-10-29" });
    p = recordSolve(p, "gm-1", { countsForStreak: true, today: "2026-10-29" });
    expect(recordOf(p, "gm-1")).toMatchObject({ solved: true, score: 75 });
    expect(p.totalScore).toBe(75);
    expect(p.solvedCount).toBe(1);
    expect(p.streak).toBe(1);
  });
  it("grows the streak on consecutive days and keeps it within the same day", () => {
    let p = recordSolve(emptyProgress(), "gm-1", { countsForStreak: true, today: "2026-10-28" });
    p = recordSolve(p, "gm-2", { countsForStreak: true, today: "2026-10-29" });
    expect(p.streak).toBe(2);
    p = recordSolve(p, "anna-2026-10-29", { countsForStreak: true, today: "2026-10-29" });
    expect(p.streak).toBe(2);
  });
  it("restarts the streak after a missed day", () => {
    let p = recordSolve(emptyProgress(), "gm-1", { countsForStreak: true, today: "2026-10-26" });
    p = recordSolve(p, "gm-2", { countsForStreak: true, today: "2026-10-29" });
    expect(p.streak).toBe(1);
  });
  it("archive solves add score but not streak", () => {
    const p = recordSolve(emptyProgress(), "gm-5", { countsForStreak: false, today: "2026-10-29" });
    expect(p.totalScore).toBe(100);
    expect(p.streak).toBe(0);
    expect(p.lastStreakDate).toBeNull();
  });
  it("currentStreak shows 0 once a full day was missed", () => {
    const p = recordSolve(emptyProgress(), "gm-1", { countsForStreak: true, today: "2026-10-27" });
    expect(currentStreak(p, "2026-10-27")).toBe(1);
    expect(currentStreak(p, "2026-10-28")).toBe(1);
    expect(currentStreak(p, "2026-10-29")).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run anna/test/progress.test.ts`
Expected: FAIL, cannot resolve `../src/progress`.

- [ ] **Step 3: Implement progress**

Create `anna/src/progress.ts`:

```ts
export const MAX_HINTS = 3;

export interface PuzzleRecord {
  hints: string[];
  wrongGuesses: number;
  solved: boolean;
  score: number;
}

export interface Progress {
  version: 1;
  streak: number;
  /** Local calendar date (YYYY-MM-DD) of the last streak-counting solve. */
  lastStreakDate: string | null;
  totalScore: number;
  solvedCount: number;
  history: Record<string, PuzzleRecord>;
}

export function emptyProgress(): Progress {
  return { version: 1, streak: 0, lastStreakDate: null, totalScore: 0, solvedCount: 0, history: {} };
}

export function recordOf(p: Progress, key: string): PuzzleRecord {
  return p.history[key] ?? { hints: [], wrongGuesses: 0, solved: false, score: 0 };
}

export function scoreFor(hintsUsed: number): number {
  return 100 - 25 * Math.min(Math.max(hintsUsed, 0), MAX_HINTS);
}

function withRecord(p: Progress, key: string, rec: PuzzleRecord): Progress {
  return { ...p, history: { ...p.history, [key]: rec } };
}

export function addHint(p: Progress, key: string, hint: string): Progress {
  const rec = recordOf(p, key);
  if (rec.solved || rec.hints.length >= MAX_HINTS) return p;
  return withRecord(p, key, { ...rec, hints: [...rec.hints, hint] });
}

export function addWrongGuess(p: Progress, key: string): Progress {
  const rec = recordOf(p, key);
  if (rec.solved) return p;
  return withRecord(p, key, { ...rec, wrongGuesses: rec.wrongGuesses + 1 });
}

export function recordSolve(p: Progress, key: string, opts: { countsForStreak: boolean; today: string }): Progress {
  const rec = recordOf(p, key);
  if (rec.solved) return p;
  const score = scoreFor(rec.hints.length);
  const next: Progress = {
    ...withRecord(p, key, { ...rec, solved: true, score }),
    totalScore: p.totalScore + score,
    solvedCount: p.solvedCount + 1,
  };
  if (!opts.countsForStreak || p.lastStreakDate === opts.today) return next;
  const streak = p.lastStreakDate === previousDate(opts.today) ? p.streak + 1 : 1;
  return { ...next, streak, lastStreakDate: opts.today };
}

/** The streak as shown today: it survives until the end of the day after the last solve. */
export function currentStreak(p: Progress, today: string): number {
  return p.lastStreakDate === today || p.lastStreakDate === previousDate(today) ? p.streak : 0;
}

export function previousDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

- [ ] **Step 4: Run progress tests**

Run: `npx vitest run anna/test/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing store test**

Create `anna/test/progress-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyProgress, recordSolve } from "../src/progress";
import { loadProgress, PROGRESS_KEY, saveProgress } from "../src/progress-store";
import type { KV } from "../src/types";

function memoryKV(): KV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, v) };
}
const failingKV: KV = {
  get: async () => {
    throw new Error("storage down");
  },
  set: async () => {
    throw new Error("storage down");
  },
};

describe("progress store", () => {
  it("round-trips progress under progress/v1", async () => {
    const kv = memoryKV();
    const p = recordSolve(emptyProgress(), "gm-1", { countsForStreak: true, today: "2026-10-29" });
    expect(await saveProgress(kv, p)).toBe(true);
    expect(kv.data.has(PROGRESS_KEY)).toBe(true);
    expect(await loadProgress(kv)).toEqual({ progress: p, ok: true });
  });
  it("starts empty when nothing (or garbage) is stored", async () => {
    const kv = memoryKV();
    expect(await loadProgress(kv)).toEqual({ progress: emptyProgress(), ok: true });
    kv.data.set(PROGRESS_KEY, { version: 99 });
    expect((await loadProgress(kv)).progress).toEqual(emptyProgress());
  });
  it("reports failure instead of throwing when storage is down", async () => {
    expect(await loadProgress(failingKV)).toEqual({ progress: emptyProgress(), ok: false });
    expect(await saveProgress(failingKV, emptyProgress())).toBe(false);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run anna/test/progress-store.test.ts`
Expected: FAIL, cannot resolve `../src/progress-store`.

- [ ] **Step 7: Implement the store**

Create `anna/src/progress-store.ts`:

```ts
import { emptyProgress, type Progress } from "./progress";
import type { KV } from "./types";

export const PROGRESS_KEY = "progress/v1";

function isProgress(v: unknown): v is Progress {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Partial<Progress>;
  return (
    p.version === 1 &&
    typeof p.streak === "number" &&
    typeof p.totalScore === "number" &&
    typeof p.solvedCount === "number" &&
    typeof p.history === "object" &&
    p.history !== null
  );
}

/** Never throws: ok=false means storage is unavailable and progress won't persist. */
export async function loadProgress(kv: KV): Promise<{ progress: Progress; ok: boolean }> {
  try {
    const v = await kv.get(PROGRESS_KEY);
    return { progress: isProgress(v) ? v : emptyProgress(), ok: true };
  } catch {
    return { progress: emptyProgress(), ok: false };
  }
}

export async function saveProgress(kv: KV, p: Progress): Promise<boolean> {
  try {
    await kv.set(PROGRESS_KEY, p);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run anna/test && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add anna/src/progress.ts anna/src/progress-store.ts anna/test/progress.test.ts anna/test/progress-store.test.ts
git commit -m "feat(anna): scoring, streak and progress persistence"
```

---

### Task 4: Anna SDK adapters (LLM + storage)

**Files:**
- Create: `anna/src/anna-host.ts`
- Test: `anna/test/anna-host.test.ts`

**Interfaces:**
- Consumes: `Complete`, `KV` from `anna/src/types.ts`.
- Produces:
  ```ts
  export interface AnnaRuntimeLike {
    llm: { complete(args: unknown): Promise<unknown> };
    storage: { get(args: { key: string }): Promise<unknown>; set(args: { key: string; value: unknown }): Promise<unknown> };
  }
  export function unwrap<T>(res: unknown): T; // handles both `{ok,result}` and bare results
  export function makeComplete(anna: AnnaRuntimeLike): Complete;
  export function makeKV(anna: AnnaRuntimeLike): KV;
  ```
  Context: the Anna docs show both a bare result (`{role, content:{text}}`, `{value, exists}`) and an `{ok, result}` / `{ok:false, error}` wrapper, so the adapters accept both.

- [ ] **Step 1: Write the failing test**

Create `anna/test/anna-host.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { makeComplete, makeKV, unwrap } from "../src/anna-host";

describe("unwrap", () => {
  it("passes bare results through and opens {ok,result}", () => {
    expect(unwrap({ a: 1 })).toEqual({ a: 1 });
    expect(unwrap({ ok: true, result: { a: 2 } })).toEqual({ a: 2 });
  });
  it("throws on {ok:false}", () => {
    expect(() => unwrap({ ok: false, error: { code: "permission_denied", message: "nope" } })).toThrow(
      "permission_denied: nope",
    );
  });
});

describe("makeComplete", () => {
  it("sends systemPrompt + a user message and returns the text", async () => {
    const complete = vi.fn(async () => ({ role: "assistant", content: { type: "text", text: "  Hello  " } }));
    const llm = makeComplete({ llm: { complete }, storage: { get: vi.fn(), set: vi.fn() } });
    expect(await llm({ system: "S", user: "U", maxTokens: 50 })).toBe("Hello");
    expect(complete).toHaveBeenCalledWith({
      systemPrompt: "S",
      messages: [{ role: "user", content: "U" }],
      maxTokens: 50,
      temperature: 0.7,
    });
  });
  it("works with the wrapped shape and rejects empty text", async () => {
    const wrapped = makeComplete({
      llm: { complete: async () => ({ ok: true, result: { content: { type: "text", text: "Hi" } } }) },
      storage: { get: vi.fn(), set: vi.fn() },
    });
    expect(await wrapped({ system: "S", user: "U" })).toBe("Hi");
    const empty = makeComplete({
      llm: { complete: async () => ({ content: { type: "text", text: " " } }) },
      storage: { get: vi.fn(), set: vi.fn() },
    });
    await expect(empty({ system: "S", user: "U" })).rejects.toThrow("empty");
  });
});

describe("makeKV", () => {
  it("returns the value on a hit and undefined on a miss", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ value: { n: 1 }, exists: true })
      .mockResolvedValueOnce({ value: null, exists: false })
      .mockResolvedValueOnce({ ok: true, result: { value: 7, exists: true } });
    const set = vi.fn(async () => ({ etag: "x" }));
    const kv = makeKV({ llm: { complete: vi.fn() }, storage: { get, set } });
    expect(await kv.get("a")).toEqual({ n: 1 });
    expect(await kv.get("b")).toBeUndefined();
    expect(await kv.get("c")).toBe(7);
    await kv.set("k", { v: 1 });
    expect(set).toHaveBeenCalledWith({ key: "k", value: { v: 1 } });
  });
  it("propagates storage errors", async () => {
    const kv = makeKV({
      llm: { complete: vi.fn() },
      storage: { get: async () => ({ ok: false, error: { code: "rate_limited", message: "slow down" } }), set: vi.fn() },
    });
    await expect(kv.get("a")).rejects.toThrow("rate_limited");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run anna/test/anna-host.test.ts`
Expected: FAIL, cannot resolve `../src/anna-host`.

- [ ] **Step 3: Implement the adapters**

Create `anna/src/anna-host.ts`:

```ts
import type { Complete, KV } from "./types";

/** The slice of AnnaAppRuntime this app uses (see Anna "App UI SDK" docs). */
export interface AnnaRuntimeLike {
  llm: { complete(args: unknown): Promise<unknown> };
  storage: {
    get(args: { key: string }): Promise<unknown>;
    set(args: { key: string; value: unknown }): Promise<unknown>;
  };
}

/** Anna RPCs resolve either to the bare result or to {ok,result}/{ok:false,error}; accept both. */
export function unwrap<T>(res: unknown): T {
  if (res && typeof res === "object" && "ok" in res) {
    const r = res as { ok: boolean; result?: unknown; error?: { code?: string; message?: string } };
    if (r.ok) return r.result as T;
    throw new Error(`${r.error?.code ?? "error"}: ${r.error?.message ?? "Anna RPC failed"}`);
  }
  return res as T;
}

export function makeComplete(anna: AnnaRuntimeLike): Complete {
  return async ({ system, user, maxTokens = 300, temperature = 0.7 }) => {
    const res = unwrap<{ content?: { text?: string } }>(
      await anna.llm.complete({ systemPrompt: system, messages: [{ role: "user", content: user }], maxTokens, temperature }),
    );
    const text = res?.content?.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("empty LLM response");
    return text.trim();
  };
}

export function makeKV(anna: AnnaRuntimeLike): KV {
  return {
    async get(key) {
      const res = unwrap<{ value?: unknown; exists?: boolean } | null>(await anna.storage.get({ key }));
      if (!res || res.exists === false) return undefined;
      return res.value ?? undefined;
    },
    async set(key, value) {
      unwrap(await anna.storage.set({ key, value }));
    },
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run anna/test/anna-host.test.ts && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add anna/src/anna-host.ts anna/test/anna-host.test.ts
git commit -m "feat(anna): adapters for Anna llm.complete and storage"
```

---

### Task 5: Hints, "Why was I wrong?" and the answer-leak filter

**Files:**
- Create: `anna/src/leak-filter.ts`, `anna/src/hints.ts`
- Test: `anna/test/leak-filter.test.ts`, `anna/test/hints.test.ts`

**Interfaces:**
- Consumes: `normalizeAnswer` (`src/game/answers.ts`), `Puzzle`, `Complete`.
- Produces:
  ```ts
  // leak-filter.ts
  export function leaksAnswer(text: string, puzzle: Pick<Puzzle, "answer" | "acceptedAnswers">): boolean;
  // hints.ts
  export const GENERIC_HINTS: readonly [string, string, string];
  export const GENERIC_WHY_WRONG: string;
  export class GmBusyError extends Error {}
  export function getHint(complete: Complete, puzzle: Puzzle, previous: string[]): Promise<string>; // throws GmBusyError when the LLM fails
  export function whyWrong(complete: Complete, puzzle: Puzzle, guess: string): Promise<string>; // throws GmBusyError when the LLM fails
  ```

- [ ] **Step 1: Write the failing leak-filter test**

Create `anna/test/leak-filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { leaksAnswer } from "../src/leak-filter";

const p = { answer: "Ice cream", acceptedAnswers: ["icecream"] };

describe("leaksAnswer", () => {
  it("catches the answer in any case or punctuation", () => {
    expect(leaksAnswer("It's ICE-CREAM, obviously!", p)).toBe(true);
    expect(leaksAnswer("maybe icecream?", p)).toBe(true);
  });
  it("matches whole words only", () => {
    expect(leaksAnswer("Think of something nice and creamy", p)).toBe(false);
    expect(leaksAnswer("A slice of ice", { answer: "ice", acceptedAnswers: [] })).toBe(true);
    expect(leaksAnswer("Some device", { answer: "ice", acceptedAnswers: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run anna/test/leak-filter.test.ts`
Expected: FAIL, cannot resolve `../src/leak-filter`.

- [ ] **Step 3: Implement the leak filter**

Create `anna/src/leak-filter.ts`:

```ts
import { normalizeAnswer } from "../../src/game/answers";
import type { Puzzle } from "./types";

/** True if the text contains the answer (or an accepted form) as whole words, after normalization. */
export function leaksAnswer(text: string, puzzle: Pick<Puzzle, "answer" | "acceptedAnswers">): boolean {
  const haystack = ` ${normalizeAnswer(text)} `;
  return [puzzle.answer, ...puzzle.acceptedAnswers]
    .map(normalizeAnswer)
    .filter(Boolean)
    .some((a) => haystack.includes(` ${a} `));
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run anna/test/leak-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing hints test**

Create `anna/test/hints.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { GENERIC_HINTS, GENERIC_WHY_WRONG, getHint, GmBusyError, whyWrong } from "../src/hints";
import type { Complete, Puzzle } from "../src/types";

const puzzle: Puzzle = {
  key: "gm-7",
  source: "gm",
  question: "What has hands but can't clap?",
  answer: "Clock",
  acceptedAnswers: ["a clock"],
};

describe("getHint", () => {
  it("asks for the next hint level with the answer and previous hints, returns one line", async () => {
    const complete = vi.fn<Complete>(async () => "\"It ticks all day.\"\nExtra line");
    const hint = await getHint(complete, puzzle, ["It lives on a wall."]);
    expect(hint).toBe("It ticks all day.");
    const req = complete.mock.calls[0][0];
    expect(req.user).toContain("Hint number: 2 of 3");
    expect(req.user).toContain("Clock");
    expect(req.user).toContain("It lives on a wall.");
    expect(req.system).toMatch(/never/i);
  });
  it("replaces a leaking hint with the generic hint for that level", async () => {
    const hint = await getHint(async () => "It's a CLOCK!", puzzle, []);
    expect(hint).toBe(GENERIC_HINTS[0]);
  });
  it("throws GmBusyError when the LLM fails", async () => {
    await expect(
      getHint(async () => {
        throw new Error("quota");
      }, puzzle, []),
    ).rejects.toBeInstanceOf(GmBusyError);
  });
});

describe("whyWrong", () => {
  it("comments on the guess without leaking", async () => {
    const complete = vi.fn<Complete>(async () => "A glove has hands of a sort, but it never keeps time.");
    expect(await whyWrong(complete, puzzle, "glove")).toBe("A glove has hands of a sort, but it never keeps time.");
    expect(complete.mock.calls[0][0].user).toContain("glove");
  });
  it("falls back to a generic comment if the answer leaks", async () => {
    expect(await whyWrong(async () => "Wrong, the answer is a clock.", puzzle, "glove")).toBe(GENERIC_WHY_WRONG);
  });
  it("throws GmBusyError when the LLM fails", async () => {
    await expect(
      whyWrong(async () => {
        throw new Error("down");
      }, puzzle, "glove"),
    ).rejects.toBeInstanceOf(GmBusyError);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run anna/test/hints.test.ts`
Expected: FAIL, cannot resolve `../src/hints`.

- [ ] **Step 7: Implement hints**

Create `anna/src/hints.ts`:

```ts
import { leaksAnswer } from "./leak-filter";
import { MAX_HINTS } from "./progress";
import type { Complete, Puzzle } from "./types";

export const GENERIC_HINTS = [
  "Read every line again: they all describe the same everyday thing.",
  "Take the strangest line literally; that's where the trick is.",
  "It's something you have probably seen or used today.",
] as const;

export const GENERIC_WHY_WRONG = "Close, but that doesn't fit every line of the riddle. Try another angle.";

export class GmBusyError extends Error {
  constructor() {
    super("The GM is busy, try again later.");
  }
}

const HINT_SYSTEM =
  "You are GM, the witty game master of a daily riddle game. Give exactly one short hint sentence. " +
  "Hints get more specific as the hint number grows. Never write the answer, any accepted form of it, " +
  "or an obvious synonym. Reply with the hint only.";

const WHY_WRONG_SYSTEM =
  "You are GM, the witty game master of a daily riddle game. A player guessed wrong. In one or two short " +
  "sentences, explain which part of the riddle their guess does not fit. Never write the answer, any accepted " +
  "form of it, or an obvious synonym. Reply with the explanation only.";

function oneLine(text: string, maxLen = 240): string {
  const line =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return line.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, maxLen).trim();
}

export async function getHint(complete: Complete, puzzle: Puzzle, previous: string[]): Promise<string> {
  const n = Math.min(previous.length + 1, MAX_HINTS);
  let text: string;
  try {
    text = await complete({
      system: HINT_SYSTEM,
      user: [
        `Riddle: ${puzzle.question}`,
        `Secret answer (do not reveal): ${puzzle.answer}`,
        `Hint number: ${n} of ${MAX_HINTS}`,
        previous.length ? `Hints already given:\n- ${previous.join("\n- ")}` : "No hints given yet.",
      ].join("\n"),
      maxTokens: 120,
    });
  } catch {
    throw new GmBusyError();
  }
  const hint = oneLine(text);
  return !hint || leaksAnswer(hint, puzzle) ? GENERIC_HINTS[n - 1] : hint;
}

export async function whyWrong(complete: Complete, puzzle: Puzzle, guess: string): Promise<string> {
  let text: string;
  try {
    text = await complete({
      system: WHY_WRONG_SYSTEM,
      user: [`Riddle: ${puzzle.question}`, `Secret answer (do not reveal): ${puzzle.answer}`, `Player's guess: ${guess}`].join(
        "\n",
      ),
      maxTokens: 160,
    });
  } catch {
    throw new GmBusyError();
  }
  const comment = text.trim().slice(0, 400);
  return !comment || leaksAnswer(comment, puzzle) ? GENERIC_WHY_WRONG : comment;
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run anna/test && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add anna/src/leak-filter.ts anna/src/hints.ts anna/test/leak-filter.test.ts anna/test/hints.test.ts
git commit -m "feat(anna): GM hints and why-wrong with answer-leak filter"
```

---

### Task 6: Puzzle source (archive → Anna fallback → built-in bank)

**Files:**
- Create: `anna/src/bank.ts`, `anna/src/puzzle-source.ts`
- Test: `anna/test/puzzle-source.test.ts`

**Interfaces:**
- Consumes: `Puzzle`, `Complete`, `KV`; `GET /api/anna/archive` from Task 1.
- Produces:
  ```ts
  // bank.ts
  export const BANK: readonly { question: string; answer: string; acceptedAnswers: string[] }[];
  export function bankPuzzle(date: string): Puzzle; // deterministic per date, key "bank-<date>"
  // puzzle-source.ts
  export const ARCHIVE_URL = "https://gm-agent-lime.vercel.app/api/anna/archive";
  export function parseArchive(json: unknown): Puzzle[]; // invalid rows dropped
  export function fetchArchive(fetchImpl: typeof fetch, opts?: { url?: string; timeoutMs?: number }): Promise<Puzzle[]>;
  export function parsePuzzleJson(text: string): { question: string; answer: string; acceptedAnswers: string[] } | null;
  export function generateFallback(complete: Complete, date: string): Promise<Puzzle>; // anna (1 retry) → bank
  export interface LoadedPuzzles { today: Puzzle; archive: Puzzle[]; offline: boolean }
  export function loadPuzzles(deps: { fetchImpl: typeof fetch; complete: Complete; kv: KV; today: string; timeoutMs?: number }): Promise<LoadedPuzzles>;
  ```
  `loadPuzzles` caches the fallback puzzle under `fallback/<date>`, so reopening the app the same day shows the same puzzle.

- [ ] **Step 1: Write the failing test**

Create `anna/test/puzzle-source.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { BANK, bankPuzzle } from "../src/bank";
import { fetchArchive, generateFallback, loadPuzzles, parseArchive, parsePuzzleJson } from "../src/puzzle-source";
import type { Complete, KV } from "../src/types";

const archiveJson = {
  puzzles: [
    { day: 20, difficulty: "medium", question: "Q20?", answer: "Eraser", acceptedAnswers: [], commitment: "0xaa", salt: "0xbb" },
    { day: 19, difficulty: "medium", question: "Q19?", answer: "Cards", acceptedAnswers: ["deck"], commitment: null, salt: null },
    { day: "x", question: 5 },
  ],
};

function okFetch(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}
const downFetch = vi.fn(async () => {
  throw new TypeError("network down");
}) as unknown as typeof fetch;
function memoryKV(): KV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, v) };
}
const goodJson = JSON.stringify({ question: "What runs but never walks?", answer: "River", acceptedAnswers: ["a river"] });

describe("parseArchive / fetchArchive", () => {
  it("maps rows to GM puzzles and drops invalid ones", () => {
    const list = parseArchive(archiveJson);
    expect(list.map((p) => p.key)).toEqual(["gm-20", "gm-19"]);
    expect(list[1]).toMatchObject({ source: "gm", day: 19, answer: "Cards", acceptedAnswers: ["deck"], salt: null });
  });
  it("throws on HTTP errors", async () => {
    const bad = vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchArchive(bad)).rejects.toThrow("500");
  });
  it("aborts after the timeout", async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    ) as unknown as typeof fetch;
    await expect(fetchArchive(hang, { timeoutMs: 20 })).rejects.toThrow();
  });
});

describe("parsePuzzleJson", () => {
  it("reads plain or fenced JSON", () => {
    expect(parsePuzzleJson(goodJson)).toEqual({ question: "What runs but never walks?", answer: "River", acceptedAnswers: ["a river"] });
    expect(parsePuzzleJson("```json\n" + goodJson + "\n```")?.answer).toBe("River");
  });
  it("rejects malformed output", () => {
    expect(parsePuzzleJson("Here's a riddle!")).toBeNull();
    expect(parsePuzzleJson(JSON.stringify({ question: "Q" }))).toBeNull();
  });
});

describe("generateFallback", () => {
  it("retries once on bad JSON, then succeeds", async () => {
    const complete = vi.fn<Complete>().mockResolvedValueOnce("oops").mockResolvedValueOnce(goodJson);
    const p = await generateFallback(complete, "2026-10-29");
    expect(p).toMatchObject({ key: "anna-2026-10-29", source: "anna", answer: "River" });
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it("uses the bank after two failures or when the LLM throws", async () => {
    const bad = vi.fn<Complete>(async () => "nope");
    expect((await generateFallback(bad, "2026-10-29")).source).toBe("bank");
    const throwing: Complete = async () => {
      throw new Error("quota");
    };
    expect(await generateFallback(throwing, "2026-10-29")).toEqual(bankPuzzle("2026-10-29"));
  });
});

describe("bankPuzzle", () => {
  it("is deterministic per date and keyed by date", () => {
    expect(bankPuzzle("2026-10-29")).toEqual(bankPuzzle("2026-10-29"));
    expect(bankPuzzle("2026-10-29").key).toBe("bank-2026-10-29");
    expect(BANK.length).toBeGreaterThanOrEqual(7);
  });
});

describe("loadPuzzles", () => {
  it("uses the newest closed GM puzzle as today's and the rest as archive", async () => {
    const r = await loadPuzzles({ fetchImpl: okFetch(archiveJson), complete: vi.fn(), kv: memoryKV(), today: "2026-10-29" });
    expect(r.offline).toBe(false);
    expect(r.today.key).toBe("gm-20");
    expect(r.archive.map((p) => p.key)).toEqual(["gm-19"]);
  });
  it("falls back to an Anna puzzle when the API is down, and caches it for the day", async () => {
    const kv = memoryKV();
    const complete = vi.fn<Complete>(async () => goodJson);
    const first = await loadPuzzles({ fetchImpl: downFetch, complete, kv, today: "2026-10-29" });
    expect(first).toMatchObject({ offline: true, archive: [] });
    expect(first.today.source).toBe("anna");
    const second = await loadPuzzles({ fetchImpl: downFetch, complete, kv, today: "2026-10-29" });
    expect(second.today).toEqual(first.today);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("treats an empty archive like an outage", async () => {
    const r = await loadPuzzles({
      fetchImpl: okFetch({ puzzles: [] }),
      complete: async () => goodJson,
      kv: memoryKV(),
      today: "2026-10-29",
    });
    expect(r.offline).toBe(true);
  });
  it("still returns a puzzle when storage is down too", async () => {
    const broken: KV = {
      get: async () => {
        throw new Error("x");
      },
      set: async () => {
        throw new Error("x");
      },
    };
    const r = await loadPuzzles({ fetchImpl: downFetch, complete: async () => goodJson, kv: broken, today: "2026-10-29" });
    expect(r.today.answer).toBe("River");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run anna/test/puzzle-source.test.ts`
Expected: FAIL, cannot resolve `../src/bank`.

- [ ] **Step 3: Implement the bank**

Create `anna/src/bank.ts`:

```ts
import type { Puzzle } from "./types";

/** Last-resort riddles bundled with the app (classic, public-domain style). */
export const BANK = [
  { question: "I have keys but open no locks. I have space but no room. You can enter, but you can't go inside. What am I?", answer: "Keyboard", acceptedAnswers: ["a keyboard", "computer keyboard"] },
  { question: "What has to be broken before you can use it?", answer: "Egg", acceptedAnswers: ["an egg"] },
  { question: "I'm tall when I'm young and short when I'm old. What am I?", answer: "Candle", acceptedAnswers: ["a candle"] },
  { question: "What has hands but can't clap?", answer: "Clock", acceptedAnswers: ["a clock", "watch", "a watch"] },
  { question: "What gets wetter the more it dries?", answer: "Towel", acceptedAnswers: ["a towel"] },
  { question: "What has a neck but no head?", answer: "Bottle", acceptedAnswers: ["a bottle"] },
  { question: "What can you catch but not throw?", answer: "Cold", acceptedAnswers: ["a cold"] },
] as const satisfies readonly { question: string; answer: string; acceptedAnswers: string[] }[];

export function bankPuzzle(date: string): Puzzle {
  let h = 0;
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const b = BANK[h % BANK.length];
  return { key: `bank-${date}`, source: "bank", question: b.question, answer: b.answer, acceptedAnswers: [...b.acceptedAnswers] };
}
```

- [ ] **Step 4: Implement the puzzle source**

Create `anna/src/puzzle-source.ts`:

```ts
import { bankPuzzle } from "./bank";
import type { Complete, KV, Puzzle } from "./types";

export const ARCHIVE_URL = "https://gm-agent-lime.vercel.app/api/anna/archive";
const FALLBACK_PREFIX = "fallback/";

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isHex = (v: unknown): v is `0x${string}` => typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v);

export function parseArchive(json: unknown): Puzzle[] {
  const rows = (json as { puzzles?: unknown })?.puzzles;
  if (!Array.isArray(rows)) return [];
  const out: Puzzle[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (typeof r?.day !== "number" || !isStr(r.question) || !isStr(r.answer)) continue;
    out.push({
      key: `gm-${r.day}`,
      source: "gm",
      day: r.day,
      difficulty: isStr(r.difficulty) ? r.difficulty : undefined,
      question: r.question,
      answer: r.answer,
      acceptedAnswers: Array.isArray(r.acceptedAnswers) ? r.acceptedAnswers.filter(isStr) : [],
      commitment: isHex(r.commitment) ? r.commitment : null,
      salt: isHex(r.salt) ? r.salt : null,
    });
  }
  return out;
}

export async function fetchArchive(
  fetchImpl: typeof fetch,
  opts: { url?: string; timeoutMs?: number } = {},
): Promise<Puzzle[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetchImpl(opts.url ?? ARCHIVE_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`archive HTTP ${res.status}`);
    return parseArchive(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export function parsePuzzleJson(text: string): { question: string; answer: string; acceptedAnswers: string[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (!isStr(o.question) || !isStr(o.answer)) return null;
    const accepted = Array.isArray(o.acceptedAnswers) ? o.acceptedAnswers.filter(isStr).map((a) => a.trim()) : [];
    return { question: o.question.trim(), answer: o.answer.trim(), acceptedAnswers: accepted };
  } catch {
    return null;
  }
}

const FALLBACK_SYSTEM =
  "You write short, original riddles for a daily puzzle game. Reply with JSON only, no prose: " +
  '{"question": string, "answer": string, "acceptedAnswers": string[]}. ' +
  "The answer is one or two common English words; acceptedAnswers lists other correct forms (e.g. with 'a').";

export async function generateFallback(complete: Complete, date: string): Promise<Puzzle> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = parsePuzzleJson(
        await complete({
          system: FALLBACK_SYSTEM,
          user: `Write the riddle for ${date}. Medium difficulty, 2-4 short lines, ends with "What am I?"`,
          maxTokens: 300,
          temperature: 0.9,
        }),
      );
      if (parsed) return { key: `anna-${date}`, source: "anna", ...parsed };
    } catch {
      break; // LLM unavailable: go straight to the bank
    }
  }
  return bankPuzzle(date);
}

function isPuzzle(v: unknown): v is Puzzle {
  const p = v as Partial<Puzzle> | null;
  return !!p && isStr(p.key) && isStr(p.question) && isStr(p.answer) && Array.isArray(p.acceptedAnswers);
}

export interface LoadedPuzzles {
  today: Puzzle;
  archive: Puzzle[];
  /** True when GM's API was unreachable and today's puzzle came from Anna or the bank. */
  offline: boolean;
}

export async function loadPuzzles(deps: {
  fetchImpl: typeof fetch;
  complete: Complete;
  kv: KV;
  today: string;
  timeoutMs?: number;
}): Promise<LoadedPuzzles> {
  try {
    const list = await fetchArchive(deps.fetchImpl, { timeoutMs: deps.timeoutMs });
    if (list.length > 0) return { today: list[0], archive: list.slice(1), offline: false };
  } catch {
    // fall through to the offline path
  }
  const cacheKey = `${FALLBACK_PREFIX}${deps.today}`;
  const cached = await deps.kv.get(cacheKey).catch(() => undefined);
  if (isPuzzle(cached)) return { today: cached, archive: [], offline: true };
  const puzzle = await generateFallback(deps.complete, deps.today);
  await deps.kv.set(cacheKey, puzzle).catch(() => undefined);
  return { today: puzzle, archive: [], offline: true };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run anna/test && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add anna/src/bank.ts anna/src/puzzle-source.ts anna/test/puzzle-source.test.ts
git commit -m "feat(anna): puzzle source with archive, Anna fallback and built-in bank"
```

---

### Task 7: UI, entry point, build and Anna validation

**Files:**
- Create: `anna/src/ui.ts`, `anna/src/main.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–6 (`loadPuzzles`, `isCorrect`, `isVerified`, `getHint`, `whyWrong`, `GmBusyError`, progress functions, `loadProgress`/`saveProgress`, `makeComplete`/`makeKV`).
- Produces: `startApp(root: HTMLElement, deps: AppDeps): Promise<void>` in `ui.ts` with `AppDeps = { complete: Complete; kv: KV; fetchImpl: typeof fetch; today: () => string }`. `main.ts` connects the SDK and calls `startApp`.

`ui.ts` is DOM glue only: every rule lives in the tested modules. The check here is by hand in the Anna dev harness.

- [ ] **Step 1: Write the UI**

Create `anna/src/ui.ts`:

```ts
import { isCorrect, isVerified } from "./answer-check";
import { getHint, whyWrong } from "./hints";
import {
  addHint,
  addWrongGuess,
  currentStreak,
  MAX_HINTS,
  type Progress,
  recordOf,
  recordSolve,
} from "./progress";
import { loadProgress, saveProgress } from "./progress-store";
import { loadPuzzles, type LoadedPuzzles } from "./puzzle-source";
import type { Complete, KV, Puzzle } from "./types";

export interface AppDeps {
  complete: Complete;
  kv: KV;
  fetchImpl: typeof fetch;
  today: () => string;
}

const REPO_URL = "https://github.com/BerkeBakir/gm-agent";
const BUSY = "The GM is busy, try again later.";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export async function startApp(root: HTMLElement, deps: AppDeps): Promise<void> {
  const today = deps.today();
  const loaded = await loadProgress(deps.kv);
  let progress: Progress = loaded.progress;
  /** Show "can't save" once after a storage failure, then hide it until the next failure. */
  let storageNote = !loaded.ok;
  const puzzles: LoadedPuzzles = await loadPuzzles({ fetchImpl: deps.fetchImpl, complete: deps.complete, kv: deps.kv, today });

  let tab: "today" | "archive" = "today";
  let current: Puzzle = puzzles.today;
  let feedback: { kind: "ok" | "bad" | "note"; text: string } | null = null;
  let lastWrongGuess: string | null = null;
  let busy = false;

  async function persist() {
    if (!(await saveProgress(deps.kv, progress))) storageNote = true;
  }

  function render() {
    root.replaceChildren(header(), tabs(), tab === "today" ? puzzleCard(current) : archiveList(), footer());
    storageNote = false;
  }

  function header() {
    const streak = currentStreak(progress, today);
    return el(
      "div",
      { className: "top" },
      el("div", { className: "title" }, "GM Daily Riddle"),
      el("div", { className: "streak" }, `🔥 ${streak} day${streak === 1 ? "" : "s"} · ${progress.totalScore} pts`),
    );
  }

  function tabs() {
    const todayBtn = el("button", { className: tab === "today" ? "" : "ghost", onclick: () => switchTo(puzzles.today) }, "Today");
    const archBtn = el(
      "button",
      { className: tab === "archive" ? "" : "ghost", disabled: puzzles.archive.length === 0, onclick: () => ((tab = "archive"), render()) },
      `Archive (${puzzles.archive.length})`,
    );
    return el("div", { className: "tabs" }, todayBtn, archBtn);
  }

  function switchTo(p: Puzzle) {
    tab = "today";
    current = p;
    feedback = null;
    lastWrongGuess = null;
    render();
  }

  function puzzleCard(p: Puzzle) {
    const rec = recordOf(progress, p.key);
    const isToday = p.key === puzzles.today.key;
    const source =
      p.source === "gm" ? `GM puzzle · day ${p.day}${p.difficulty ? ` · ${p.difficulty}` : ""}` : "Puzzle from Anna";
    const card = el("div", { className: "card" }, el("div", { className: "meta" }, isToday ? `Today · ${source}` : source));
    if (isToday && puzzles.offline) card.append(el("div", { className: "note" }, "The GM is offline, so here's a puzzle from Anna."));
    if (storageNote) card.append(el("div", { className: "note" }, "Progress can't be saved right now."));
    card.append(el("div", { className: "question" }, p.question));

    if (rec.solved) {
      card.append(el("div", { className: "ok" }, `Solved! +${rec.score} points. The answer: ${p.answer}`));
      if (isVerified(p)) card.append(el("div", { className: "note" }, "verified ✓ This answer matches the commitment the GM published before the puzzle opened."));
    } else {
      const input = el("input", { placeholder: "Your answer", maxLength: 80, autocomplete: "off" });
      const form = el("form", {}, input, el("button", { type: "submit", disabled: busy }, "Guess"));
      form.onsubmit = (e) => {
        e.preventDefault();
        void guess(p, input.value);
      };
      card.append(form);
    }

    if (feedback) card.append(el("div", { className: feedback.kind }, feedback.text));

    if (rec.hints.length) card.append(el("ol", { className: "hints" }, ...rec.hints.map((h) => el("li", {}, h))));

    if (!rec.solved) {
      const hintBtn = el(
        "button",
        { className: "ghost", disabled: busy || rec.hints.length >= MAX_HINTS, onclick: () => void hint(p) },
        `Hint (${rec.hints.length}/${MAX_HINTS}, −25 pts)`,
      );
      const row = el("div", { className: "row" }, hintBtn);
      if (lastWrongGuess) {
        row.append(el("button", { className: "ghost", disabled: busy, onclick: () => void explain(p) }, "Why was I wrong?"));
      }
      card.append(row);
    }
    return card;
  }

  function archiveList() {
    const list = el("div", { className: "archive" });
    for (const p of puzzles.archive) {
      const solved = recordOf(progress, p.key).solved;
      list.append(
        el("button", { className: solved ? "done" : "", onclick: () => switchTo(p) }, `${solved ? "✓ " : ""}Day ${p.day}: ${p.question.slice(0, 60)}${p.question.length > 60 ? "…" : ""}`),
      );
    }
    return el("div", { className: "card" }, el("div", { className: "meta" }, "Older GM puzzles · score only, no streak"), list);
  }

  function footer() {
    return el(
      "div",
      { className: "footer" },
      "Want real USDC prizes? ",
      el("a", { href: REPO_URL, target: "_blank", rel: "noopener noreferrer" }, "Play GM Agent"),
    );
  }

  async function guess(p: Puzzle, value: string) {
    if (!value.trim()) return;
    if (isCorrect(p, value)) {
      progress = recordSolve(progress, p.key, { countsForStreak: p.key === puzzles.today.key, today });
      feedback = null;
      lastWrongGuess = null;
    } else {
      progress = addWrongGuess(progress, p.key);
      feedback = { kind: "bad", text: `"${value.trim()}" isn't it.` };
      lastWrongGuess = value.trim();
    }
    render();
    await persist();
  }

  async function hint(p: Puzzle) {
    busy = true;
    render();
    try {
      progress = addHint(progress, p.key, await getHint(deps.complete, p, recordOf(progress, p.key).hints));
      await persist();
    } catch {
      feedback = { kind: "note", text: BUSY };
    } finally {
      busy = false;
      render();
    }
  }

  async function explain(p: Puzzle) {
    if (!lastWrongGuess) return;
    busy = true;
    render();
    try {
      feedback = { kind: "note", text: await whyWrong(deps.complete, p, lastWrongGuess) };
    } catch {
      feedback = { kind: "note", text: BUSY };
    } finally {
      busy = false;
      render();
    }
  }

  render();
}
```

- [ ] **Step 2: Write the entry point**

Create `anna/src/main.ts`:

```ts
import { makeComplete, makeKV, type AnnaRuntimeLike } from "./anna-host";
import { localDate } from "./progress";
import { startApp } from "./ui";

// Served by the Anna host; a variable keeps esbuild from trying to bundle it.
const SDK_URL = "/static/anna-apps/_sdk/latest/index.js";

interface AnnaRuntime extends AnnaRuntimeLike {
  onThemeChange?(cb: (e: { theme: "light" | "dark" }) => void): void;
}

const root = document.getElementById("root")!;
try {
  const { AnnaAppRuntime } = (await import(SDK_URL)) as { AnnaAppRuntime: { connect(): Promise<AnnaRuntime> } };
  const anna = await AnnaAppRuntime.connect();
  anna.onThemeChange?.(({ theme }) => {
    document.documentElement.dataset.theme = theme;
  });
  await startApp(root, {
    complete: makeComplete(anna),
    kv: makeKV(anna),
    fetchImpl: (input, init) => fetch(input, init),
    today: () => localDate(),
  });
} catch (err) {
  root.textContent = "Couldn't start the GM. Please reopen the app.";
  console.error(err);
}
```

- [ ] **Step 3: Build and run the full checks**

Run: `npm run anna:build`
Expected: `anna/bundle/app.js` is written and esbuild prints no errors. A warning about the non-literal dynamic import is fine.

Run: `npm run typecheck && npm test`
Expected: clean, all pass.

- [ ] **Step 4: Validate with the Anna CLI**

Run: `npm run anna:validate`
Expected: `✓ validate passed`. If the validator rejects a manifest key, fix `anna/manifest.json` to what it asks for, keeping `host_api` to exactly `llm: ["complete"]` and `storage: ["get","set"]`, and re-run. If `--strict` reports a host API used in the bundle but not declared, declare it only if the code really uses it.

- [ ] **Step 5: Run in the local Anna harness**

Run: `npm run anna:dev`, then open the printed URL (default `http://127.0.0.1:5180/dev/...`) in the browser pane.
Expected with `--no-llm`:
- Today's card shows the newest closed GM puzzle from production (`day N · medium`). Task 1 must be deployed first (Task 8). Until then the card shows the "GM is offline" note and a **bank** puzzle, because `llm` is disabled.
- A wrong guess shows `"x" isn't it.` and a "Why was I wrong?" button, which answers "The GM is busy, try again later."
- "Hint" shows the same busy message, and play continues.
- A correct guess shows "Solved! +100 points" and, for GM puzzles, "verified ✓". The header streak becomes 1.

Take a screenshot as proof. Full LLM behavior (real hints) needs `anna-app login` with Berke's Anna account (Task 8). Note that in the report.

- [ ] **Step 6: Commit**

```bash
git add anna/src/ui.ts anna/src/main.ts
git commit -m "feat(anna): app UI and SDK entry point"
```

---

### Task 8: Ship the endpoint, docs, and the publish handoff

**Files:**
- Create: `anna/README.md`, `anna/PRIVACY.md`, `anna/LISTING.md`
- Modify: `README.md` (one "Anna Edition" line under features), `docs/handoff-week3.md` (new section)

- [ ] **Step 1: Write `anna/README.md`**

````markdown
# GM Daily Riddle — Anna Edition

A free, wallet-free version of GM Agent for the [Anna](https://anna.partners) app store. It plays the GM's most recently **closed** riddle (never the live paid one), adds up to 3 AI hints and a "Why was I wrong?" comment through Anna's `llm.complete`, and keeps a personal streak in Anna `storage`.

## Layout
- `src/`: TypeScript modules. Rules live in tested modules: `progress`, `hints`, `puzzle-source`, `answer-check`, `anna-host`. `ui.ts` / `main.ts` are DOM glue.
- `bundle/`: static files Anna serves. `app.js` is built from `src/main.ts` (git-ignored).
- `manifest.json` / `app.json`: Anna manifest and listing basics.
- Server side: `GET /api/anna/archive` in the main app (closed puzzles only).

## Commands (from the repo root)
```bash
npm run anna:build      # bundle src → bundle/app.js
npm run anna:validate   # build + anna-app validate --strict
npm run anna:dev        # build + local Anna harness (LLM disabled)
npx vitest run anna/test
```

## Publish (Berke)
```bash
cd anna
npx -y @anna-ai/cli@latest login --host https://anna.partners
npx -y @anna-ai/cli@latest apps push --bundle-dir bundle
```
Then submit the version for review in the Developer Console. Review takes 3–5 business days.
````

- [ ] **Step 2: Write `anna/PRIVACY.md`**

```markdown
# Privacy — GM Daily Riddle (Anna Edition)

- The app stores your progress (streak, score, hints you asked for) in your own Anna storage. It is not sent to GM Agent.
- The app downloads public riddles from `https://gm-agent-lime.vercel.app/api/anna/archive`. That request carries no personal data.
- Hints and "Why was I wrong?" comments are generated by your Anna LLM through Anna's `llm.complete`. Your guess and the riddle are sent to the model; nothing else is.
- No wallets, payments, ads or trackers.
```

- [ ] **Step 3: Write `anna/LISTING.md`** (store listing copy for Berke to paste)

```markdown
# Store listing

**Name:** GM Daily Riddle

**Short description (≤ 80 chars):** A new riddle every day from an AI game master. Hints, streaks, no wallet.

**Long description:**
GM Agent is an autonomous AI game master that writes a new riddle every day and runs a real-money version of the game on Base. This is its free edition for Anna.

- Play the GM's latest riddle the moment its round closes, plus an archive of older ones.
- Stuck? Ask the GM for up to 3 hints, each a little more specific (and each costs 25 points).
- Wrong guess? Ask "Why was I wrong?" and the GM tells you which line your guess doesn't fit, without spoiling the answer.
- Keep your daily streak alive and watch your score grow.
- Every GM answer is "verified ✓": it matches a cryptographic commitment the GM published before the riddle opened.

No wallet, no payments, no sign-up beyond Anna.

**Tags:** game, puzzle, riddle, daily, brain teaser

**Screenshots to capture (in the dev harness):** today's puzzle card · a hint list · solved card with "verified ✓" · archive tab.
```

- [ ] **Step 4: Update the main README and handoff**

In `README.md`, in the features list, add one line:

```markdown
- **Anna Edition** (`anna/`): a free, wallet-free daily riddle app for the Anna app store, with AI hints and streaks, fed by the GM's closed puzzles via `GET /api/anna/archive`.
```

In `docs/handoff-week3.md`, append:

```markdown
## 11. Anna Edition built (plan: docs/superpowers/plans/2026-10-29-anna-edition.md)

- Code: `anna/` + `GET /api/anna/archive` (closed puzzles only, CORS *). Tests: `npx vitest run anna/test`.
- Waiting on Berke: Anna account (Stage 1), `anna-app login`, `apps push`, review submission. Listing copy: `anna/LISTING.md`.
- Next: launch plan `docs/anna-launch.md` (goal ≥ 200 MAU in one calendar month).
```

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm test && npm run build && npm run anna:validate`
Expected: all clean. `next build` lists `/api/anna/archive`.

- [ ] **Step 6: Commit, PR and merge**

```bash
git add anna/README.md anna/PRIVACY.md anna/LISTING.md README.md docs/handoff-week3.md
git commit -m "docs(anna): readme, privacy note, listing copy and handoff"
git push -u origin feat/anna-edition
gh pr create --title "Anna Edition: daily riddle app + closed-puzzle archive API" --body "Adds anna/ (Anna app store edition: hints, why-wrong, streaks, no wallet) and GET /api/anna/archive (closed puzzles only). Plan: docs/superpowers/plans/2026-10-29-anna-edition.md"
```

Merge after checks: `gh pr merge <N> --merge`. If the auto permission classifier blocks the merge, ask Berke in one sentence.

- [ ] **Step 7: Verify production**

Run (wait for the Vercel deploy):
```bash
curl -s -D - https://gm-agent-lime.vercel.app/api/anna/archive -o /tmp/archive.json | grep -i "access-control-allow-origin"
node -e "const j=require('/tmp/archive.json'); console.log(j.puzzles.length, j.puzzles[0].day, j.puzzles.every(p=>p.answer))"
curl -s https://gm-agent-lime.vercel.app/api/state | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const st=JSON.parse(s);const a=require('/tmp/archive.json');console.log('open day',st.challenge?.day,'in archive?',a.puzzles.some(p=>p.day===st.challenge?.day))})"
```
Expected: `access-control-allow-origin: *`, a non-zero count with the newest closed day, and `in archive? false`.

- [ ] **Step 8: Hand off to Berke (in Turkish), in chat**

Tell Berke exactly what to do, where:
1. Go to anna.partners, create an account, verify the email, and accept the Developer ToS in the Developer Console (browser).
2. In PowerShell: `cd "D:\Claude Code\gm-agent\anna"` then `npx -y @anna-ai/cli@latest login --host https://anna.partners` (it opens the browser).
3. Tell Claude when you've logged in. Claude then runs `apps push` and a full LLM test in `anna-app dev` with the real model, and captures the screenshots for the listing.
4. Paste `anna/LISTING.md` into the Developer Console listing and submit for review.

---

### Task 9: Launch and growth plan toward 200 MAU

**Files:**
- Create: `docs/anna-launch.md`
- Create: `brand/x/anna/posts.md`

This task produces copy and a schedule, not code. Its deliverable is reviewed by Berke.

- [ ] **Step 1: Write `docs/anna-launch.md`**

```markdown
# Anna Edition — launch and growth (goal: ≥ 200 real MAU in one calendar month)

Only real users who open the app inside Anna count. Own or team accounts don't, and fake usage means disqualification.

## Week 0 (review period, 3–5 business days)
- Prepare 3 X posts (brand/x/anna/posts.md) and a 20–30 s screen recording from the dev harness: riddle → hint → solve → verified ✓.
- Ask Eli whether the program's marketing package (first 20 approved developers) and any Anna store feature slot apply to us.

## Week 1 (approval day = launch day)
- X @GMAgentHQ: launch post + video, tag @riseinweb3 and Anna's account. Pin it.
- Rise In / Agentmaxxing community (Discord/Telegram): one message with the Anna link. We're a Top 5 project, so mention it.
- Anna Builder Discord / forum: "Show your app" post, ask for feedback.
- Personal reach: Berke's X, LinkedIn optional, friends who'd actually play (they count as real users if they play).

## Weeks 2–4 (habit loop)
- Daily: the riddle changes every day at 12:00 UTC. One X post per day with the riddle text and "solve it in Anna" (reuse GM's own daily post).
- Weekly: a "hardest riddle of the week" post with solve rate.
- Reply to every comment and feedback within a day.

## Monthly "meaningful update" (required by the program)
- Month 1 candidates: shared leaderboard (opt-in), weekly themes, share-your-streak card.
- Each update goes through review again (3–5 days), so submit by the 20th of the month.

## Tracking
- Developer Console MAU number, checked weekly. Record it here with the date.
- If MAU < 50 after two weeks: ask Anna about store placement and try a themed week.
```

- [ ] **Step 2: Write `brand/x/anna/posts.md`**

````markdown
# X posts for the Anna launch (≤ 280 chars; links count as 23; use the GitHub link, not vercel.app)

## Launch day
```
GM Agent now has a free edition on @AnnaOS 🎲

A new riddle from the AI game master every day: ask for hints, learn why a guess was wrong, keep your streak. No wallet needed.

Every answer is verified ✓ against a commitment made before the riddle opened.

<ANNA_APP_LINK>
```

## Day 2
```
Today's GM riddle is live in Anna.

Stuck? The GM gives up to 3 hints, but each one costs you 25 points. How many will you need?

<ANNA_APP_LINK>
```

## Day 4
```
Built with @riseinweb3 #Agentmaxxing (Top 5), now playable by anyone on Anna.

The paid version pays USDC on Base under a smart-account spending limit. The Anna version is free: same GM, same riddles.

https://github.com/BerkeBakir/gm-agent
```
````

Before posting, Berke replaces `<ANNA_APP_LINK>` with the store link and checks Anna's real X handle (`@AnnaOS` is a placeholder, so look it up on anna.partners).

- [ ] **Step 3: Commit**

```bash
git add docs/anna-launch.md brand/x/anna/posts.md
git commit -m "docs(anna): launch and growth plan toward 200 MAU"
git push
```

---

## Self-review notes

- Spec §4.1 archive endpoint → Task 1 (closed-only, fields, cache). CORS deviates on purpose and is documented in Global Constraints.
- Spec §4.2 units: puzzle-source → Task 6, answer-check → Task 2, hints / why-wrong → Task 5, progress → Task 3, ui → Task 7. Scoring and streak rules are in Task 3 tests.
- Spec §4.3 data flow → Task 7 `ui.ts`: archive counts for score, not streak.
- Spec §5 error handling: archive down → fallback (Task 6). LLM fails → busy message (Tasks 5, 7). Bad JSON → 1 retry → bank (Task 6). Storage fails → note (Tasks 3, 7).
- Spec §6 testing: Vitest for the route and every rule module. `anna-app dev` and `validate` happen in Task 7.
- Spec §8 after build → Tasks 8–9. Spec §9 verified during planning from anna.partners/developers: `llm.complete` request/response shape, `storage.get/set` shapes, `ui.bundle.external_origins`, sandboxed iframe with origin `null`. Keccak is bundled from viem through `src/game/commitment-core.ts`.
