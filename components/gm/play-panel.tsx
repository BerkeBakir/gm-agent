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

type Eip6963Detail = { info: { name: string; rdns: string }; provider: EIP1193Provider };

/** Find a browser wallet. EIP-6963 avoids the window.ethereum clash when several extensions are installed. */
async function findWallet(): Promise<{ name: string; provider: EIP1193Provider } | null> {
  const found: Eip6963Detail[] = [];
  const onAnnounce = (e: Event) => found.push((e as CustomEvent<Eip6963Detail>).detail);
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((r) => setTimeout(r, 200));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);
  const preferred = found.find((w) => /coinbase|metamask/i.test(w.info.rdns)) ?? found[0];
  if (preferred) return { name: preferred.info.name, provider: preferred.provider };
  return window.ethereum ? { name: "Browser wallet", provider: window.ethereum } : null;
}

const errorCode = (err: unknown) => (err as { code?: number })?.code;

function walletError(err: unknown): string {
  const code = errorCode(err);
  if (code === 4001) return "You rejected the request in your wallet. Try again and approve it.";
  if (code === -32002) return "Your wallet already has a pending request. Open the wallet extension and approve it there.";
  return err instanceof Error ? err.message.split("\n")[0]! : String(err);
}

async function ensureBaseSepolia(eth: EIP1193Provider) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    // 4902 = chain not added yet (some wallets report it wrapped as -32603).
    const code = errorCode(err);
    if (code !== 4902 && code !== -32603) throw err;
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
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function connect() {
    setResult(null);
    setConnecting(true);
    try {
      const wallet = await findWallet();
      if (!wallet) {
        setResult({
          ok: false,
          error: "No browser wallet found. Install the Coinbase Wallet or MetaMask extension, or on mobile open this page inside the wallet app's browser.",
        });
        return;
      }
      const [addr] = (await wallet.provider.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
      if (!addr) throw new Error("Your wallet returned no account. Unlock it and try again.");
      setProvider(wallet.provider);
      setAccount(addr);
      try {
        await ensureBaseSepolia(wallet.provider);
      } catch (err) {
        setResult({
          ok: false,
          error: `Connected, but your wallet is not on Base Sepolia yet (${walletError(err)}). "Pay & submit" will ask to switch again.`,
        });
      }
    } catch (err) {
      setResult({ ok: false, error: walletError(err) });
    } finally {
      setConnecting(false);
    }
  }

  async function submit() {
    if (!account || !answer.trim() || !provider) return;
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
      await ensureBaseSepolia(provider);
      const client = createWalletClient({ account, chain: baseSepolia, transport: custom(provider) });
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
      setResult({ ok: false, error: walletError(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {!account ? (
        <>
          <Button onClick={connect} disabled={disabled || connecting} className="w-fit font-mono tracking-wider uppercase">
            <Wallet /> {connecting ? "Check your wallet…" : "Connect wallet to play"}
          </Button>
          <HowToPlay entryFee={entryFee} />
        </>
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

function HowToPlay({ entryFee }: { entryFee?: string }) {
  const link = "text-primary underline underline-offset-4";
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer font-mono text-xs uppercase">How to play (2 minutes)</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Install a browser wallet:{" "}
          <a className={link} href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noreferrer">Coinbase Wallet</a> or{" "}
          <a className={link} href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a>. On a phone, open this page in the wallet app&apos;s built-in browser.
        </li>
        <li>
          Get free test USDC on <b>Base Sepolia</b> from the{" "}
          <a className={link} href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a>. You don&apos;t need ETH: paying the entry fee is gasless.
        </li>
        <li>Click &quot;Connect wallet to play&quot; and approve the connection and the switch to Base Sepolia.</li>
        <li>Type your answer and click &quot;Pay &amp; submit&quot;. Sign the {fmtUsdc(entryFee)} entry fee in your wallet (a signature, not a transaction).</li>
        <li>When the GM closes the day, correct answers share the reward, sent in USDC to your wallet. One answer per wallet per day.</li>
      </ol>
    </details>
  );
}
