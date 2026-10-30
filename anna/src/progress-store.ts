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
