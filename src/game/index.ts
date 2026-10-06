import { PostgresGameStore } from "./postgres-store";
import { type GameStore, MemoryGameStore } from "./store";

const globalForStore = globalThis as unknown as { gameStore?: GameStore };

/**
 * Postgres when DATABASE_URL is set (deployed), otherwise in-memory (local dev).
 * Cached on globalThis so Next.js hot reloads don't wipe the memory store.
 */
export function getGameStore(): GameStore {
  const forceMemory = process.env.GAME_STORE === "memory";
  globalForStore.gameStore ??=
    process.env.DATABASE_URL && !forceMemory ? new PostgresGameStore(process.env.DATABASE_URL) : new MemoryGameStore();
  return globalForStore.gameStore;
}

export * from "./answers";
export * from "./types";
export { DuplicateSubmissionError, type GameStore } from "./store";
