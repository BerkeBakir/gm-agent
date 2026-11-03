import { bankPuzzle } from "./bank";
import { type Progress, recordOf } from "./progress";
import type { Complete, KV, Puzzle } from "./types";

/** Tried in order; add a mirror here if the main host is unreachable from some networks. */
export const ARCHIVE_URLS = ["https://gm-agent-lime.vercel.app/api/anna/archive"];
const FALLBACK_PREFIX = "fallback/";
/** The last archive response that had puzzles, used when the GM can't be reached. */
export const ARCHIVE_CACHE_KEY = "archive/last";

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

/** One GM decision from the daily log (testnet USDC amounts are preformatted strings). */
export interface GmDecision {
  day: number;
  participants: number;
  winners: number;
  winRate: number | null;
  rewardPerWinner: string;
  totalPaid: string;
  treasuryAfter: string;
  nextDifficulty: string;
  reasoning: string;
  anchorTx: string | null;
}

export function parseDecisions(json: unknown): GmDecision[] {
  const rows = (json as { decisions?: unknown })?.decisions;
  if (!Array.isArray(rows)) return [];
  const out: GmDecision[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (typeof r?.day !== "number" || !isStr(r.reasoning)) continue;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    out.push({
      day: r.day,
      participants: num(r.participants),
      winners: num(r.winners),
      winRate: typeof r.winRate === "number" ? r.winRate : null,
      rewardPerWinner: isStr(r.rewardPerWinner) ? r.rewardPerWinner : "",
      totalPaid: isStr(r.totalPaid) ? r.totalPaid : "",
      treasuryAfter: isStr(r.treasuryAfter) ? r.treasuryAfter : "",
      nextDifficulty: isStr(r.nextDifficulty) ? r.nextDifficulty : "",
      reasoning: r.reasoning,
      anchorTx: isHex(r.anchorTx) ? r.anchorTx : null,
    });
  }
  return out;
}

/** Raw archive JSON from the first URL that answers; throws the last error if none does. */
export async function fetchArchiveJson(
  fetchImpl: typeof fetch,
  opts: { urls?: string[]; timeoutMs?: number } = {},
): Promise<unknown> {
  let lastErr: unknown = new Error("no archive URL");
  for (const url of opts.urls ?? ARCHIVE_URLS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`archive HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function fetchArchive(
  fetchImpl: typeof fetch,
  opts: { urls?: string[]; timeoutMs?: number } = {},
): Promise<Puzzle[]> {
  return parseArchive(await fetchArchiveJson(fetchImpl, opts));
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

export const FALLBACK_TIMEOUT_MS = 15000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("llm timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function generateFallback(
  complete: Complete,
  date: string,
  opts: { timeoutMs?: number } = {},
): Promise<Puzzle> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = parsePuzzleJson(
        await withTimeout(
          complete({
            system: FALLBACK_SYSTEM,
            user: `Write the riddle for ${date}. Medium difficulty, 2-4 short lines, ends with "What am I?"`,
            maxTokens: 300,
            temperature: 0.9,
          }),
          opts.timeoutMs ?? FALLBACK_TIMEOUT_MS,
        ),
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
  /** The GM's latest decisions, newest first (may be empty). */
  decisions: GmDecision[];
  /** True when GM's API was unreachable and today's puzzle came from Anna or the bank. */
  offline: boolean;
  /** True when GM's API was unreachable and the GM puzzles come from the last saved copy. */
  stale: boolean;
  /** True when the newest GM puzzle was already solved on an earlier day, so today's is a bonus from Anna. */
  bonus: boolean;
}

interface LoadDeps {
  fetchImpl: typeof fetch;
  complete: Complete;
  kv: KV;
  today: string;
  timeoutMs?: number;
  urls?: string[];
  progress?: Progress;
}

async function cachedFallback(deps: LoadDeps): Promise<Puzzle | null> {
  const cached = await deps.kv.get(`${FALLBACK_PREFIX}${deps.today}`).catch(() => undefined);
  return isPuzzle(cached) ? cached : null;
}

/** A new Anna/bank puzzle for today, cached so it stays the same all day. */
async function newFallback(deps: LoadDeps): Promise<Puzzle> {
  const puzzle = await generateFallback(deps.complete, deps.today);
  await deps.kv.set(`${FALLBACK_PREFIX}${deps.today}`, puzzle).catch(() => undefined);
  return puzzle;
}

/** Live archive if reachable (and saved for later), else the last saved copy. */
async function archiveData(deps: LoadDeps): Promise<{ list: Puzzle[]; decisions: GmDecision[]; stale: boolean }> {
  try {
    const json = await fetchArchiveJson(deps.fetchImpl, { urls: deps.urls, timeoutMs: deps.timeoutMs });
    const list = parseArchive(json);
    if (list.length > 0) {
      await deps.kv.set(ARCHIVE_CACHE_KEY, json).catch(() => undefined);
      return { list, decisions: parseDecisions(json), stale: false };
    }
  } catch {
    // fall through to the saved copy
  }
  const saved = await deps.kv.get(ARCHIVE_CACHE_KEY).catch(() => undefined);
  return { list: parseArchive(saved), decisions: parseDecisions(saved), stale: true };
}

export async function loadPuzzles(deps: LoadDeps): Promise<LoadedPuzzles> {
  const { list, decisions, stale } = await archiveData(deps);
  if (list.length === 0) {
    const today = (await cachedFallback(deps)) ?? (await newFallback(deps));
    return { today, archive: [], decisions, offline: true, stale: false, bonus: false };
  }

  const [latest, ...older] = list;
  if (deps.progress && recordOf(deps.progress, latest.key).solved) {
    // Solved with no streak today yet means it was solved on an earlier day. A solved
    // cached fallback means today's bonus was already played, so keep showing it.
    const cached = await cachedFallback(deps);
    if (deps.progress.lastStreakDate !== deps.today || (cached && recordOf(deps.progress, cached.key).solved)) {
      return { today: cached ?? (await newFallback(deps)), archive: list, decisions, offline: false, stale, bonus: true };
    }
  }
  return { today: latest, archive: older, decisions, offline: false, stale, bonus: false };
}
