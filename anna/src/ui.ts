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
import { type GmDecision, loadPuzzles, type LoadedPuzzles } from "./puzzle-source";
import type { Complete, KV, Puzzle } from "./types";

export interface AppDeps {
  complete: Complete;
  kv: KV;
  fetchImpl: typeof fetch;
  today: () => string;
}

type Tab = "today" | "archive" | "gm";

/** Which tab looks selected: an open archive puzzle belongs to Archive, not Today. */
export function activeTab(tab: Tab, currentKey: string, todayKey: string): Tab {
  return tab === "today" && currentKey !== todayKey ? "archive" : tab;
}

const REPO_URL ="https://github.com/BerkeBakir/gm-agent";
const BUSY = "The GM is busy, try again later.";
const TX_URL = "https://sepolia.basescan.org/tx/";

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
  const load = () => loadPuzzles({ fetchImpl: deps.fetchImpl, complete: deps.complete, kv: deps.kv, today, progress });
  let puzzles: LoadedPuzzles = await load();

  let tab: Tab = "today";
  let current: Puzzle = puzzles.today;
  let feedback: { kind: "ok" | "bad" | "note"; text: string } | null = null;
  let lastWrongGuess: string | null = null;
  let busy = false;
  let draft = "";
  let inputEl: HTMLInputElement | null = null;
  let refocus = false;

  async function persist() {
    if (!(await saveProgress(deps.kv, progress))) storageNote = true;
  }

  function render() {
    inputEl = null;
    const parts: Node[] = [header()];
    if (storageNote) parts.push(el("div", { className: "note" }, "Progress can't be saved right now."));
    parts.push(tabs(), tab === "today" ? puzzleCard(current) : tab === "archive" ? archiveList() : gmLog());
    storageNote = false; // shown once, on whichever tab is visible
    root.replaceChildren(...parts);
    if (refocus && inputEl) (inputEl as HTMLInputElement).focus();
    refocus = false;
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
    const active = activeTab(tab, current.key, puzzles.today.key);
    const todayBtn = el("button", { className: active === "today" ? "" : "ghost", onclick: () => switchTo(puzzles.today) }, "Today");
    const archBtn = el(
      "button",
      { className: active === "archive" ? "" : "ghost", disabled: puzzles.archive.length === 0, onclick: () => ((tab = "archive"), render()) },
      `Archive (${puzzles.archive.length})`,
    );
    const gmBtn = el("button", { className: active === "gm" ? "" : "ghost", onclick: () => ((tab = "gm"), render()) }, "GM's log");
    return el("div", { className: "tabs" }, todayBtn, archBtn, gmBtn);
  }

  function switchTo(p: Puzzle) {
    tab = "today";
    current = p;
    feedback = null;
    lastWrongGuess = null;
    draft = "";
    render();
  }

  function puzzleCard(p: Puzzle) {
    const rec = recordOf(progress, p.key);
    const isToday = p.key === puzzles.today.key;
    const source =
      p.source === "gm" ? `GM puzzle · day ${p.day}${p.difficulty ? ` · ${p.difficulty}` : ""}` : "Puzzle from Anna";
    const card = el("div", { className: "card" }, el("div", { className: "meta" }, isToday ? `Today · ${source}` : source));
    if (isToday && puzzles.offline) {
      card.append(connectionNote("Couldn't reach the GM's server just now, so today's riddle comes from Anna. It still counts for your streak."));
    } else if (isToday && puzzles.stale) {
      card.append(connectionNote("Couldn't reach the GM's server just now, so these are the GM's puzzles from your last visit."));
    }
    if (isToday && puzzles.bonus) {
      card.append(
        el("div", { className: "note" }, "You already solved the GM's latest puzzle. Here's a bonus from Anna to keep your streak; the next GM puzzle opens at 12:00 UTC."),
      );
    }
    card.append(el("div", { className: "question" }, p.question));

    if (rec.solved) {
      card.append(el("div", { className: "ok" }, `Solved! +${rec.score} points. The answer: ${p.answer}`));
      if (isVerified(p)) card.append(el("div", { className: "note" }, "verified ✓ This answer matches the commitment the GM published before the puzzle opened."));
    } else {
      const input = el("input", { placeholder: "Your answer", maxLength: 80, autocomplete: "off", value: draft });
      input.oninput = () => {
        draft = input.value;
      };
      inputEl = input;
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

  function connectionNote(text: string) {
    return el("div", { className: "note row" }, text, el("button", { className: "ghost small", disabled: busy, onclick: () => void retry() }, "Retry"));
  }

  function gmLog() {
    const card = el(
      "div",
      { className: "card" },
      el("div", { className: "meta" }, "How the GM works"),
      el(
        "div",
        { className: "about" },
        "GM Agent is an autonomous AI game master. Every day it writes a new riddle, publishes a cryptographic commitment to the answer before the riddle opens, " +
          "and closes the round at 12:00 UTC. Then it looks at how many players solved it, decides the reward and the next day's difficulty to keep about " +
          "30–50% of players winning, and logs its reasoning. Its paid version runs on the Base Sepolia testnet (test USDC, no real money); this Anna edition is free.",
      ),
    );
    if (puzzles.decisions.length === 0) {
      card.append(el("div", { className: "note" }, "The GM's log isn't available right now."));
    } else {
      card.append(el("div", { className: "meta" }, "The GM's latest decisions"), ...puzzles.decisions.map(decisionItem));
    }
    card.append(el("div", { className: "note" }, el("a", { href: REPO_URL, target: "_blank", rel: "noopener noreferrer" }, "Source code on GitHub")));
    return card;
  }

  function decisionItem(d: GmDecision) {
    const rate = d.winRate === null ? "no players" : `${d.winners} of ${d.participants} solved (${Math.round(d.winRate * 100)}%)`;
    const money = [
      d.winners > 0 && d.rewardPerWinner && `${d.rewardPerWinner} per winner`,
      d.treasuryAfter && `treasury ${d.treasuryAfter} (testnet)`,
    ]
      .filter(Boolean)
      .join(" · ");
    const item = el(
      "div",
      { className: "decision" },
      el("div", { className: "decision-head" }, `Day ${d.day} · ${rate}`),
      el("div", { className: "note" }, [money, d.nextDifficulty && `next: ${d.nextDifficulty}`].filter(Boolean).join(" · ")),
      el("div", {}, d.reasoning),
    );
    if (d.anchorTx) {
      item.append(el("a", { className: "note", href: TX_URL + d.anchorTx, target: "_blank", rel: "noopener noreferrer" }, "Decision logged on-chain ↗"));
    }
    return item;
  }

  async function retry() {
    busy = true;
    render();
    try {
      puzzles = await load();
      current = puzzles.today;
      feedback = null;
      lastWrongGuess = null;
    } finally {
      busy = false;
      render();
    }
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
    draft = "";
    refocus = true;
    render();
    await persist();
    if (storageNote) render(); // save failed: show the note (once)
  }

  async function hint(p: Puzzle) {
    busy = true;
    render();
    try {
      const text = await getHint(deps.complete, p, recordOf(progress, p.key).hints);
      progress = addHint(progress, p.key, text);
      feedback = null;
      await persist();
    } catch {
      feedback = { kind: "note", text: BUSY };
    } finally {
      busy = false;
      refocus = true;
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
      refocus = true;
      render();
    }
  }

  render();
}
