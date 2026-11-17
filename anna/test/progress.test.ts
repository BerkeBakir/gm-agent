import { describe, expect, it } from "vitest";
import {
  addHint,
  addWrongGuess,
  currentStreak,
  emptyProgress,
  guessesLeft,
  isOver,
  localDate,
  MAX_GUESSES,
  MAX_HINTS,
  previousDate,
  recordOf,
  recordSolve,
  revealAnswer,
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

describe("end of round", () => {
  const today = "2026-11-17";
  it("ends the round after 3 wrong guesses and then ignores guesses, hints and solves", () => {
    let p = emptyProgress();
    expect(MAX_GUESSES).toBe(3);
    expect(guessesLeft(recordOf(p, "gm-1"))).toBe(3);
    for (let i = 0; i < 5; i++) p = addWrongGuess(p, "gm-1");
    const rec = recordOf(p, "gm-1");
    expect(rec.wrongGuesses).toBe(3);
    expect(guessesLeft(rec)).toBe(0);
    expect(isOver(rec)).toBe(true);
    expect(addHint(p, "gm-1", "late")).toBe(p);
    const after = recordSolve(p, "gm-1", { countsForStreak: true, today });
    expect(after).toBe(p);
    expect(after.totalScore).toBe(0);
  });
  it("reveals the answer with no points and no streak", () => {
    let p = addWrongGuess(emptyProgress(), "gm-2");
    p = revealAnswer(p, "gm-2");
    expect(recordOf(p, "gm-2")).toMatchObject({ revealed: true, solved: false, score: 0, wrongGuesses: 1 });
    expect(isOver(recordOf(p, "gm-2"))).toBe(true);
    expect(recordSolve(p, "gm-2", { countsForStreak: true, today })).toBe(p);
    expect(p.streak).toBe(0);
  });
  it("does not reveal a solved puzzle", () => {
    const solved = recordSolve(emptyProgress(), "gm-3", { countsForStreak: false, today });
    expect(revealAnswer(solved, "gm-3")).toBe(solved);
  });
  it("treats old records without the revealed field as still open", () => {
    expect(isOver({ hints: [], wrongGuesses: 2, solved: false, score: 0 })).toBe(false);
  });
});
