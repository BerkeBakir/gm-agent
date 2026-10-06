// Runs `next dev` with an in-memory game store, so local experiments never touch the production database.
// Usage: npm run dev:memory -- -p 3005
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, GAME_STORE: "memory" },
});
child.on("exit", (code) => process.exit(code ?? 0));
