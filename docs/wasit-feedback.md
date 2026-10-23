# Wasit geri bildirimi — hazırlık (Najmi / Wasit 0.7.0)

> Durum (23 Eki 2026): Berke yardım etmeye karar verdi (önce vazgeçmişti). Her şey hazır; **tek eksik Berke'nin testi çalıştırıp çıktıyı yapıştırması**. Najmi ayrıca bir "referee session" istiyor; ne olduğunu açıklayacak — netleşmeden kabul etme.
> Wasit paketi doğrulandı: npm `@wasit-dev/cli` (bakımcı `najmiimut`), repo github.com/wasit-dev/Wasit (Stellar Community Fund, SOW 2), postinstall yok.
> Dikkat: paket `dotenv` kullanıyor → komutu **boş bir klasörde** çalıştır, gm-agent klasöründe asla. Dış paket çalıştırmayı izin sınıflandırıcısı Claude'a vermiyor → komutu Berke çalıştırır.

## 1. Berke'nin yapacağı (5 dk)

1. PowerShell, gm-agent klasöründe: `$env:ANCHOR_DECISIONS="off"; npm run dev:memory`
   (anchor kapalı → zincire işlem gitmez; hafıza modu → prod DB'ye dokunmaz)
2. http://localhost:3000 → Operator paneli → yeni gün aç (oyuncu yok → ödeme yok).
3. Yeni PowerShell, boş klasörde:
   ```
   mkdir C:\wasit-test; cd C:\wasit-test
   npx -y @wasit-dev/cli@0.7.0 test --target http://localhost:3000/api/submit --method POST --body "{\"answer\":\"test\"}" --network eip155:84532 --read-only
   ```
4. Sadece Wasit çıktısını Claude'a yapıştır (.env / loglar değil).

## 2. Beklenen sonuç (koddan tahmin, çalıştırılmadı)

Kaynak: `src/x402/exact.ts` (`X402_VERSION = 1`, `NETWORK = "base-sepolia"`), `app/api/submit/route.ts` (X-PAYMENT yoksa 402 + gövdede `{ x402Version, error, accepts: [requirements] }`).

| Kontrol | Tahmin | Neden |
|---|---|---|
| X402-01 | PASS | Açık bulmaca + `{"answer":"test"}` → ödemesiz istek 402 alır |
| X402-02 | FAIL | v1: ödeme isteği gövdede, `PAYMENT-REQUIRED` başlığı yok |
| X402-03 | PASS | Gövde geçerli JSON |
| X402-04 | PASS (muhtemel) | v1 alanları tam: scheme, network, maxAmountRequired, resource, description, mimeType, payTo, maxTimeoutSeconds, asset, extra |
| X402-05 | FAIL | `"base-sepolia"` CAIP-2 değil (v2 `eip155:84532` ister) |
| X402-06…10 | SKIP | Wasit yalnız v2 ile ödüyor |

Olası sapmalar: 409 → bulmaca açık değil; 400 → body tırnakları PowerShell'de bozulmuş.

## 3. GitHub issue taslağı (İngilizce — Berke kendi hesabından açar, kendi sözleriyle düzenler)

Örnek şablon: github.com/wasit-dev/Wasit/issues/13.

```markdown
## What did you try?
Ran `npx -y @wasit-dev/cli@0.7.0 test --target http://localhost:3000/api/submit --method POST --body "{\"answer\":\"test\"}" --network eip155:84532 --read-only`
against a local copy of GM Agent (in-memory store, no on-chain anchoring), from an empty folder in PowerShell. Read-only only; I did not run the payment checks.

## What happened?
<!-- paste the Wasit output here -->
```text
(output)
```
As the guide warned, GM Agent speaks x402 v1 (challenge in the response body, network "base-sepolia"), so X402-02 and X402-05 fail and X402-06..10 are skipped.

## Payment proof (if you ran Step 3)
not run (skipped, see above)

## What was confusing or slow?
<!-- after the run: anything unclear in the output / Fix: lines -->
- Opening a challenge first is specific to my app; the 409 hint in the guide covered it.
- PowerShell quoting of `--body` (the escaped form in the guide worked / did not work).

## What worked well?
- Read-only mode needs no wallet or key, so it is safe to run against a local copy.
- The guide warned about the v1 limit up front, so the FAILs did not feel like a verdict.

## Why x402 v1, written by hand?
I built it during Agentmaxxing to understand the protocol end to end: verify the EIP-3009 signature myself,
check everything that could reject the answer (no open challenge, duplicate submission, balance, nonce)
BEFORE settling, then settle on-chain into the treasury. Later the treasury became a MetaMask smart account,
so settlement is sent by a delegated agent EOA, not by the payTo address. Writing it myself kept those steps explicit.

## What would I need to move to v2 (@x402/*)?
- A hook between verify and settle, so the app can reject a paid request without taking the money.
- Settlement where the transaction sender is not the payTo (delegated smart-account treasury).
- A way to keep existing v1 clients (my MCP agent players) working during the switch.

## Goal: sell a paid endpoint, have an agent that pays, or both?
Both: players (humans and AI agents via an MCP server) pay a 0.10 USDC entry fee per answer, and the agent pays rewards out of its own treasury.

## Would you run it again before a release? What would make that easier?
Yes, if it understood v1 too (or a clear "v1 mode" for the free checks), and as a GitHub Action / CI step.

## What would you like Wasit to do next?
- v1 support for X402-02/05 (accept body challenge + legacy network names, with a warning instead of FAIL).
- A check that a rejected request (e.g. duplicate submission) does not settle the payment.

## Links
- Your project (required): https://github.com/BerkeBakir/gm-agent
- Recording of our session: (leave empty)

## Consent (tick what you agree to)
- [ ] You may quote this issue in Wasit's reports and documentation.
- [ ] You may link this issue as evidence of user feedback.
```

## 4. Najmi'ye not (kaydı Berke yapmazsa — şeffaf)

> Hi Najmi, I ran the read-only check against a local copy of GM Agent and wrote the feedback as an issue: <link>.
> To be transparent: I didn't record a think-aloud session. I used my AI coding assistant to set up the run and help me read the output,
> so this is closer to "a builder working with an agent" than a solo UX session. Happy to do a short recorded session after Oct 30 if you still need one.
