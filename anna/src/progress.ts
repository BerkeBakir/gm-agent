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
