// Compare reward strategies over a simulated 30-day game.
// Usage:
//   npm run simulate                 # rule-based strategies only (free, instant)
//   npm run simulate -- --llm        # + Gemini personas (needs GEMINI_API_KEY; ~30 calls each)
// Writes docs/sim/results.json, docs/sim/*.csv and docs/sim/*.svg.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { GeminiDecisionMaker, type Persona } from "../src/gm/gemini";
import { RuleBasedDecisionMaker, STRATEGIES } from "../src/gm/strategies";
import type { DecisionMaker } from "../src/gm/types";
import { DEFAULT_SIM, simulate, type SimResult } from "../src/sim/simulate";

// Load GEMINI_API_KEY etc. from .env / .env.local when run locally.
for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

const withLlm = process.argv.includes("--llm");
const SEEDS = [1, 2, 3, 4, 5];
const OUT = "docs/sim";
mkdirSync(OUT, { recursive: true });

type Run = { make: () => DecisionMaker; label?: string; cfg?: Partial<typeof DEFAULT_SIM> };
const runs: Run[] = STRATEGIES.map((s) => ({ make: () => new RuleBasedDecisionMaker(s) }));
// Ablation: what the daily 10% cap is worth. Same generous strategy, cap lifted to 100%.
runs.push({ make: () => new RuleBasedDecisionMaker("generous"), label: "rule:generous-no-cap", cfg: { maxDailyFractionBps: 10_000, maxPerTx: 1_000_000_000n } });
if (withLlm) {
  if (!process.env.GEMINI_API_KEY) throw new Error("--llm needs GEMINI_API_KEY");
  // Space out calls to stay under the free tier's requests-per-minute limit.
  const throttled = (inner: DecisionMaker): DecisionMaker => ({
    name: inner.name,
    decide: async (s) => {
      await new Promise((r) => setTimeout(r, Number(process.env.LLM_DELAY_MS ?? 4000)));
      return inner.decide(s);
    },
  });
  for (const version of [1, 2] as const) {
    for (const p of ["balanced", "treasurer", "entertainer"] as Persona[]) runs.push({ make: () => throttled(new GeminiDecisionMaker(p, version)) });
  }
}

const results: { name: string; perSeed: SimResult[] }[] = [];
for (const run of runs) {
  const name = run.label ?? run.make().name;
  const isLlm = name.startsWith("gemini");
  // LLM runs are slow and cost API calls: one seed. Rule-based: average over 5 seeds.
  const seeds = isLlm ? [SEEDS[0]!] : SEEDS;
  const perSeed: SimResult[] = [];
  for (const seed of seeds) {
    process.stdout.write(`${name} seed ${seed}… `);
    perSeed.push(await simulate(run.make(), { ...DEFAULT_SIM, ...run.cfg, seed }));
    console.log("done");
  }
  results.push({ name, perSeed });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const table = results.map(({ name, perSeed }) => {
  const s = perSeed.map((r) => r.summary);
  const bankrupt = s.filter((x) => x.bankruptDay !== null);
  return {
    strategy: name,
    seeds: perSeed.length,
    finalTreasury: mean(s.map((x) => x.finalTreasury)),
    minTreasury: mean(s.map((x) => x.minTreasury)),
    bankruptRuns: `${bankrupt.length}/${s.length}`,
    avgParticipants: mean(s.map((x) => x.avgParticipants)),
    lastWeekParticipants: mean(s.map((x) => x.lastWeekParticipants)),
    totalPaid: mean(s.map((x) => x.totalPaid)),
    totalIncome: mean(s.map((x) => x.totalIncome)),
    daysInTargetBand: mean(s.map((x) => x.daysInTargetBand)),
    guardrailInterventions: mean(s.map((x) => x.guardrailInterventions)),
    difficultySwitches: mean(s.map((x) => x.difficultySwitches)),
    fallbacks: mean(s.map((x) => x.fallbacks)),
  };
});

writeFileSync(`${OUT}/results.json`, JSON.stringify({ config: { ...DEFAULT_SIM, startTreasury: "50 USDC", entryFee: "0.10 USDC", maxPerTx: "2 USDC" }, table, runs: results.map((r) => ({ name: r.name, seed1: r.perSeed[0] })) }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

for (const { name, perSeed } of results) {
  const rows = perSeed[0]!.days.map((d) =>
    [d.day, d.difficulty, d.participants, d.winners, d.winRate?.toFixed(2) ?? "", d.income.toFixed(2), d.paid.toFixed(2), d.rewardPerWinner.toFixed(2), d.treasury.toFixed(2), d.avgInterest.toFixed(3), JSON.stringify(d.reasoning)].join(","),
  );
  writeFileSync(`${OUT}/${name.replace(":", "-")}.csv`, ["day,difficulty,participants,winners,win_rate,income,paid,reward_per_winner,treasury,avg_interest,reasoning", ...rows].join("\n"));
}

// Tiny dependency-free SVG line charts (seed 1).
function chart(title: string, pick: (d: SimResult["days"][number]) => number, file: string) {
  const W = 720, H = 320, P = 44;
  const series = results.map((r) => ({ name: r.name, ys: r.perSeed[0]!.days.map(pick) }));
  const maxY = Math.max(1, ...series.flatMap((s) => s.ys)) * 1.1;
  const n = series[0]!.ys.length;
  const x = (i: number) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / maxY) * (H - 2 * P);
  const colors = ["#2a78d6", "#d64f2a", "#8a8a8a", "#1f9d55", "#9b4dca", "#c9a227", "#e0559b"];
  const lines = series.map((s, k) => `<polyline fill="none" stroke="${colors[k % colors.length]}" stroke-width="2" points="${s.ys.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`);
  const legend = series.map((s, k) => `<g transform="translate(${P + k * 120},${H - 10})"><rect width="10" height="10" y="-9" fill="${colors[k % colors.length]}"/><text x="14" font-size="11">${s.name}</text></g>`);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<g><line x1="${P}" x2="${W - P}" y1="${y(maxY * f)}" y2="${y(maxY * f)}" stroke="#ddd"/><text x="${P - 6}" y="${y(maxY * f) + 4}" font-size="10" text-anchor="end">${(maxY * f).toFixed(maxY > 10 ? 0 : 1)}</text></g>`);
  writeFileSync(
    `${OUT}/${file}`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui,sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="${P}" y="22" font-size="14" font-weight="bold">${title}</text>${ticks.join("")}${lines.join("")}<text x="${W / 2}" y="${H - 26}" font-size="10" text-anchor="middle">day</text>${legend.join("")}</svg>`,
  );
}
chart("Treasury (USDC) over 30 days", (d) => d.treasury, "treasury.svg");
chart("Daily participants over 30 days", (d) => d.participants, "participants.svg");

console.table(
  table.map((t) => ({
    strategy: t.strategy,
    "final treasury": t.finalTreasury.toFixed(2),
    "min treasury": t.minTreasury.toFixed(2),
    "bankrupt runs": t.bankruptRuns,
    "avg players": t.avgParticipants.toFixed(1),
    "last-week players": t.lastWeekParticipants.toFixed(1),
    paid: t.totalPaid.toFixed(2),
    income: t.totalIncome.toFixed(2),
    "days in 30-50% band": t.daysInTargetBand.toFixed(1),
    "difficulty switches": t.difficultySwitches.toFixed(1),
    "LLM fallbacks": t.fallbacks.toFixed(0),
  })),
);
