"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addrUrl, type Decision, fmtUsdc, type GameStateResponse, short, txUrl } from "./format";

export function TreasuryStats({ state }: { state: GameStateResponse | null }) {
  const t = state?.treasury;
  const last = state?.decisions.find((d) => d.day > 0);
  const items = [
    { label: "Treasury", value: t?.usdc != null ? fmtUsdc(t.usdc) : "—" },
    { label: "Gas", value: t?.eth != null ? `${Number(t.eth).toFixed(4)} ETH` : "—" },
    { label: "Entry fee", value: fmtUsdc(state?.rules.entryFee) },
    { label: "Last reward", value: last ? fmtUsdc(last.rewardPerWinner) : "—" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-px border bg-border">
        {items.map((i) => (
          <div key={i.label} className="bg-card p-3">
            <p className="font-mono text-[11px] text-muted-foreground uppercase">{i.label}</p>
            <p className="mt-1 font-mono text-base font-bold">{i.value}</p>
          </div>
        ))}
      </div>
      {t?.address && (
        <a className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground uppercase hover:text-primary" href={addrUrl(t.address)} target="_blank" rel="noreferrer">
          Agent wallet {short(t.address)} <ExternalLink className="size-3" />
        </a>
      )}
      {state && (
        <p className="text-xs text-muted-foreground">
          Hard limits (enforced in code): max {fmtUsdc(state.rules.maxPerTx)} per winner, at most {state.rules.maxDailyFractionBps / 100}% of the treasury per day.
        </p>
      )}
    </div>
  );
}

export function DecisionLogList({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return <p className="text-muted-foreground">No decisions yet. The log fills up every time the GM closes a day.</p>;
  return (
    <div className="flex flex-col gap-4">
      {decisions.map((d) => (
        <article key={d.id} className="border p-4">
          <header className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase">
            <span className="font-bold text-primary">{d.day === 0 ? "Game start" : `Day ${d.day} closed`}</span>
            <Badge variant="outline" className="font-mono uppercase">by {d.decidedBy}</Badge>
            <span className="ml-auto text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</span>
          </header>
          {d.day > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-4">
              <Stat k="Players" v={String(d.participants)} />
              <Stat k="Winners" v={`${d.winners}${d.winRate !== null ? ` (${Math.round(d.winRate * 100)}%)` : ""}`} />
              <Stat k="Income" v={fmtUsdc(d.income)} />
              <Stat k="Paid" v={`${fmtUsdc(d.totalPaid)}`} />
              <Stat k="Per winner" v={fmtUsdc(d.rewardPerWinner)} />
              <Stat k="Treasury" v={`${fmtUsdc(d.treasuryBefore, false)} → ${fmtUsdc(d.treasuryAfter)}`} />
              <Stat k="Next" v={d.nextDifficulty} />
            </dl>
          )}
          <p className="mt-3 border-l-2 border-primary pl-3 text-sm">{d.reasoning}</p>
          {d.adjustments.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
              {d.adjustments.map((a, i) => (
                <li key={i}>Guardrail: {a}</li>
              ))}
            </ul>
          )}
          {d.payouts.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
              {d.payouts.map((p, i) => (
                <li key={i} className="flex flex-wrap gap-2">
                  <span>→ {short(p.player)}</span>
                  <span>{fmtUsdc(p.amount)}</span>
                  {p.txHash && (
                    <a className="inline-flex items-center gap-1 text-primary" href={txUrl(p.txHash)} target="_blank" rel="noreferrer">
                      tx <ExternalLink className="size-3" />
                    </a>
                  )}
                  {p.error && <span className="text-destructive">failed: {p.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground uppercase">{k}</dt>
      <dd className="font-bold">{v}</dd>
    </div>
  );
}

export function Leaderboard({ rows }: { rows: GameStateResponse["leaderboard"] }) {
  if (rows.length === 0) return <p className="text-muted-foreground">No winners yet.</p>;
  return (
    <ol className="flex flex-col gap-1 font-mono text-sm">
      {rows.map((r, i) => (
        <li key={r.player} className="flex justify-between gap-2">
          <a href={addrUrl(r.player)} target="_blank" rel="noreferrer" className="hover:text-primary">
            <span className="text-primary">{i + 1}.</span> {short(r.player)}
          </a>
          <span>
            {r.wins}× · {fmtUsdc(r.earned)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function PastChallenges({ rows }: { rows: GameStateResponse["pastChallenges"] }) {
  if (rows.length === 0) return <p className="text-muted-foreground">Answers are revealed here after each day closes.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((c) => (
        <li key={c.day} className="text-sm">
          <p className="font-mono text-xs text-muted-foreground uppercase">
            Day {c.day} · {c.difficulty}
          </p>
          <p>{c.question}</p>
          <p className="font-mono text-xs">
            Answer: <span className="text-primary">{c.answer}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Lets the operator close the day on demand (same endpoint the daily cron calls). */
export function AdminPanel({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState("");
  // Read the saved token after mount so the server and client render the same HTML (no hydration mismatch).
  useEffect(() => {
    setToken(localStorage.getItem("gm-admin-token") ?? "");
  }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    localStorage.setItem("gm-admin-token", token);
    try {
      const res = await fetch("/api/gm/run-day", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setMsg(res.ok ? `Day closed. Day ${data.newChallengeDay} is open.` : data.error);
      onDone();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Runs the GM's end-of-day loop now (normally a daily cron): grade, decide, pay winners on-chain, open the next puzzle.</p>
      <div className="flex gap-2">
        <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="admin token" className="font-mono" />
        <Button onClick={run} disabled={busy || !token} className="font-mono uppercase">
          <Play /> {busy ? "Running…" : "Close day"}
        </Button>
      </div>
      {msg && <p className="font-mono text-xs">{msg}</p>}
    </div>
  );
}
