"use client";

import { useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { baseSepolia } from "viem/chains";
import { ExternalLink, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPaymentHeader, type PaymentRequirements } from "@/src/x402/exact";
import { fmtUsdc, short, txUrl } from "./format";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const CHAIN_HEX = "0x14a34"; // 84532

async function ensureBaseSepolia(eth: EIP1193Provider) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: "Base Sepolia",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia.base.org"],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        },
      ],
    });
  }
}

type Result = { ok: true; feeTx: string } | { ok: false; error: string };

/** Connect a wallet and submit today's answer, paying the entry fee with x402 (gasless EIP-3009 signature). */
export function PlayPanel({ entryFee, disabled, onSubmitted }: { entryFee?: string; disabled?: boolean; onSubmitted?: () => void }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function connect() {
    const eth = window.ethereum;
    if (!eth) {
      setResult({ ok: false, error: "No browser wallet found. Install Coinbase Wallet or MetaMask." });
      return;
    }
    const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
    await ensureBaseSepolia(eth);
    setAccount(addr ?? null);
    setResult(null);
  }

  async function submit() {
    if (!account || !answer.trim() || !window.ethereum) return;
    setResult(null);
    try {
      setBusy("Requesting price…");
      const first = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer }) });
      if (first.status !== 402) {
        const data = await first.json();
        throw new Error(data.error ?? `Unexpected status ${first.status}`);
      }
      const { accepts } = (await first.json()) as { accepts: PaymentRequirements[] };
      const reqs = accepts[0]!;

      setBusy("Sign the entry fee in your wallet…");
      await ensureBaseSepolia(window.ethereum);
      const client = createWalletClient({ account, chain: baseSepolia, transport: custom(window.ethereum) });
      const header = await createPaymentHeader({ address: account, signTypedData: (args) => client.signTypedData({ account, ...args }) }, reqs);

      setBusy("Settling payment on Base Sepolia…");
      const paid = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-PAYMENT": header },
        body: JSON.stringify({ answer }),
      });
      const data = await paid.json();
      if (!paid.ok) throw new Error(data.error ?? `Payment failed (${paid.status})`);
      setResult({ ok: true, feeTx: data.feeTx });
      setAnswer("");
      onSubmitted?.();
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message.split("\n")[0]! : String(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {!account ? (
        <Button onClick={connect} disabled={disabled} className="w-fit font-mono tracking-wider uppercase">
          <Wallet /> Connect wallet to play
        </Button>
      ) : (
        <>
          <p className="font-mono text-xs text-muted-foreground uppercase">
            Playing as <span className="text-primary">{short(account)}</span> · entry fee {fmtUsdc(entryFee)} (x402, gasless)
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="your answer" disabled={Boolean(busy) || disabled} className="font-mono" />
            <Button type="submit" disabled={Boolean(busy) || disabled || !answer.trim()} className="font-mono uppercase">
              Pay & submit
            </Button>
          </form>
        </>
      )}
      {busy && <p className="font-mono text-xs text-muted-foreground">{busy}</p>}
      {result?.ok && (
        <p className="text-sm">
          Answer submitted — entry fee settled on-chain.{" "}
          <a className="inline-flex items-center gap-1 text-primary underline underline-offset-4" href={txUrl(result.feeTx)} target="_blank" rel="noreferrer">
            View tx <ExternalLink className="size-3" />
          </a>{" "}
          Results are announced when the GM closes the day.
        </p>
      )}
      {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
    </div>
  );
}
