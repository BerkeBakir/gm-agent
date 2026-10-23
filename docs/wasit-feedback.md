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
against a local copy of GM Agent (in-memory store, no on-chain anchoring), from an empty folder in cmd.exe on Windows 11. Before the run I opened a puzzle in the local app, so the endpoint had something to charge for. I ran it read-only and did not run the payment checks.

## What happened?
```text
npm warn deprecated @stellar/stellar-base@15.0.0: This package is now rolled into @stellar/stellar-sdk. Please use @stellar/stellar-sdk to continue receiving updates and support.
(--read-only set: skipping payment checks)

PASS  X402-01  402 Response Status
      Server responded with 402 as required.

FAIL  X402-02  Payment Header Present
      Neither PAYMENT-REQUIRED nor X-Payment header was present. The response body carries an x402 v1 challenge instead; x402 v2 signals payment in the PAYMENT-REQUIRED header, and the `exact` scheme on Stellar is defined for v2 only.
      Fix: Move to x402 v2: send the challenge base64-encoded in a PAYMENT-REQUIRED response header instead of the body, with x402Version 2 and v2 field names.
      Docs: https://usewasit.dev/docs/checks/x402

PASS  X402-03  Header Payload Decodable
      No header to decode; the x402 v1 challenge in the response body decoded to valid JSON.

PASS  X402-04  Required Fields Present
      All required v1 fields present.

FAIL  X402-05  Network Identifier Valid
      "base-sepolia" is not a CAIP-2 identifier (namespace:reference, e.g. stellar:testnet or eip155:84532), which x402 v2 requires. x402 v1 used plain names; v2 requires CAIP-2.
      Fix: Use the network's CAIP-2 id, namespace:reference, such as stellar:testnet, eip155:84532 (Base Sepolia) or solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 (Solana devnet).
      Docs: https://usewasit.dev/docs/checks/x402

3 passed, 2 failed.
```
This is what I expected from the guide: GM Agent speaks x402 v1 (challenge in the response body, network "base-sepolia"), so X402-02 and X402-05 fail. The run took about a minute, mostly the first `npx` download.

## Payment proof (if you ran Step 3)
Not run. I used `--read-only` only.

## What was confusing or slow?
- **X402-02 mentions Stellar on an EVM target.** I passed `--network eip155:84532` and the server says "base-sepolia", but the message explains that "the `exact` scheme on Stellar is defined for v2 only". For a Base app this sentence made me stop and wonder whether Wasit thought I was on Stellar.
- **X402-03's name vs. its result.** The check is called "Header Payload Decodable", but it passes with "No header to decode". The result is right, but the name reads like it tested something it did not.
- **Skipped checks disappear.** With `--read-only` the summary says "3 passed, 2 failed", and X402-06..10 are not listed at all. Something like "5 skipped (read-only)" would make it clear the run covered 5 of 10 checks.
- **v1 FAILs read like bugs.** The text says v1 is the older version, but the label is still FAIL. A v1 app that works fine with v1 clients gets two red lines. A "WARN (v1)" or a short "your server is v1; these are v2 conformance checks" line at the top would soften that.
- **Deprecation warning on first run.** `npm warn deprecated @stellar/stellar-base@15.0.0` shows before anything else. It is harmless, but a first-time user may think the install is broken.
- **Shell quoting.** The escaped `--body "{\"answer\":\"test\"}"` worked in cmd.exe. I avoided PowerShell 5.1 because it is known to strip inner quotes when passing JSON to native commands. A note in the guide (or a `--body-file` option) would help Windows users.

## What worked well?
- Read-only mode needs no wallet or key, so it was safe to run against a local copy.
- Every FAIL has a concrete Fix: line and a docs link, and the fixes were correct for my case (base64 PAYMENT-REQUIRED header, `eip155:84532`).
- It recognised the v1 challenge in the body and still validated it (X402-03/04 pass). That told me my v1 fields are complete.
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

## 4. Najmi'ye mesaj (issue açıldıktan sonra; <link> yerine issue linki)

Najmi'nin ilk mesajı: kendi kaydettiğin, yalnız, sesli düşünmeli 20–30 dk UX oturumu istiyor; seçenekler solo kayıt / rehberli görüşme / önce demo sonra solo. Kayıt sadece onayla, alıntı izinle.

Kayıt sözü verilmedi (Berke'nin kararı); tekrar sorarsa o zaman bakılır. Kayıt gerekirse Berke kendisi yapar (sesli değilse yazarak düşünür ve bunu açıkça söyler) — başkası adına kayıt/bahane yok.

> Hi Najmi! I read the guide and ran the read-only test against a local copy of GM Agent: 3 passed, 2 failed (X402-02 and X402-05), both because of v1, as you warned. I wrote it all up as an issue: https://github.com/wasit-dev/Wasit/issues/15
>
> To be transparent: I didn't record the solo think-aloud session. My AI coding assistant helped me set up the run and read the output, so this is "a builder working with an agent" rather than a pure solo session. The issue lists what confused me anyway.
>
> One question: what exactly is the "referee session"? What would I do, how long does it take, and would it need a wallet or funds?

## 5. Sonuç (23 Eki)

Test yapıldı (cmd.exe, read-only): **3 PASS (01, 03, 04), 2 FAIL (02, 05)**, 06–10 listelenmedi. Tahminle birebir aynı. Issue açıldı: https://github.com/wasit-dev/Wasit/issues/15 (BerkeBakir hesabından, `gh`; onay kutuları işaretsiz). Sırada: Berke mesajı atar → referee session cevabını bekleriz (para/anahtar/cüzdan isterse dur).

## 6. B seçeneği — Berke'nin kendi kaydı (Najmi'nin 2. mesajından sonra)

Najmi: "wasit" = "hakem"; oturum = Wasit'i denemek. Cüzdan/fon gerekmez. B = sadece UX kısmı, kendi ekran+ses kaydın, 15–20 dk, link gönder; asistan yardım ederse sesli söyle; .env/anahtar ekranda olmasın. Onay kutuları 23 Eki'de işaretlendi.

**Kural:** Kaydı Berke yapar ve kendi düşüncesini söyler (ezber metin yok). Claude yalnız ölü süreyi (npx indirme bekleyişi, uzun sessizlik) keser; takıldığı/kafasının karıştığı anlar kesilmez (Najmi'nin istediği o). Altyazı = Berke'nin gerçekten söylediklerinin transkripti (Whisper); Türkçe konuşursa İngilizce çeviri altyazı ve bu Najmi'ye söylenir.

Kayıt dışı hazırlık: sunucuyu başlat (1. bölüm 1. adım) → Operator'dan gün aç (CRON_SECRET girilen kısım kayda girmez) → cmd'de `C:\wasit-test` → rehber sekmesi açık → editör/.env/diğer pencereler kapalı, Windows bildirimleri kapalı.

Kayıt (NVIDIA Alt+F9, mikrofon açık): kısa tanıtım (kim, proje, daha önce asistanla bir kez çalıştırdığın, yerel kopya) → rehberde ilk neye baktığın → komutu çalıştır → her satırı okuyup beklentini/kafa karışıklığını söyle → Fix/Docs linkini aç → kapanış (tekrar kullanır mısın, neyi değiştirirdin). Bitince dosya adı Claude'a → kes + altyazı → YouTube "liste dışı" → link Najmi'ye.
