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
