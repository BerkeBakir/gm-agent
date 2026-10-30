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
