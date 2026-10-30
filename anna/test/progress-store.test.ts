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
