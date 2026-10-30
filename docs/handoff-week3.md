# Devir: GM Agent → Agentmaxxing 3. hafta

Bu dosya yeni sohbetin tek başlangıç noktası. 15 Ekim 2026'da yazıldı. Önceki ayrıntılar: [handoff-week1.md](handoff-week1.md), [handoff-week2.md](handoff-week2.md), deneyler: [experiments.md](experiments.md).

## 1. Proje bir bakışta

GM Agent, kendi USDC hazinesini yöneten otonom bir AI oyun yöneticisi. Rise In'in **Agentmaxxing** programı için yapılıyor (kullanıcı: Berke).

Döngü şöyle:
1. Gemini her gün bir bilmece yazar; ikinci, kör bir Gemini çağrısı çözemezse bilmece yeniden yazılır.
2. Oyuncular **x402** ile (EIP-3009, gassız, zincirde settle) 0.10 USDC giriş ücreti öder.
3. Gün sonunda Gemini ödülü ve zorluğu önerir; **kod içi guardrail'ler** kırpar.
4. Base Sepolia'da gerçek USDC ödenir; herkese açık karar loguna gerekçe yazılır.

| | |
|---|---|
| Canlı | https://gm-agent-lime.vercel.app (Vercel, `main`'e push → otomatik yayın, cron her gün 12:00 UTC) |
| Repo | https://github.com/BerkeBakir/gm-agent · yerel kopya `D:\Claude Code\gm-agent` (ayrıca `C:\Users\Monster\Desktop\gm-agent`) |
| X | @GMAgentHQ (https://x.com/GMAgentHQ) |
| Videolar | H1 https://youtu.be/1hf2Hj-q76E · H2 https://youtu.be/eltZ4UOp-ls |
| Agent kasası | `0x5cb007cB053ce248529D84651ce53750666A799D` (15 Eki: 44.25 USDC, 0.0084 ETH gas) |
| Kullanıcının test cüzdanı | `0xd4423391f1bBa7f3da0B004d22d274E6EdF2b10F` |
| MCP oyuncu cüzdanı | `0xC4FDa997b90417c8A293cBCfced9954fD86F6D25` (1.40 USDC; anahtar `.mcp-player.json`, gitignore'lu) |
| Vercel | proje `prj_8GPPgGhzVXlxdRLLu6aisEot72MB`, team `team_AhHasLamoxKs15JiXS1X2l4n` (Hobby: runtime log sadece 1 saat tutuluyor; `get_runtime_errors` 7 gün) |

Stack: Next.js 16 · React 19 · TypeScript · `@google/genai` (gemini-flash-latest + fallback'ler) · viem · Neon Postgres · x402 v1 `exact` · `@modelcontextprotocol/sdk` 1.32 · Vitest.

## 2. Program takvimi ve kurallar

- **H1** (5-11 Eki) ✅ teslim edildi. **H2** (12-16 Eki) ✅ kod, video ve README tamam. Kullanıcı X gönderilerini atıp teslim ediyor (teslim linki için 2. gönderi seçildi).
- **H3: 19-23 Ekim** ("Give it a wallet / your agent learns to pay": x402, ajana fon devretme/delegation, smart wallet harcama limitleri). Teslimde kripto odaklı video isteniyor.
- **Final:** 24-25 Ekim (tweet + video). **Demo Day:** 30 Ekim.
- Her hafta README'de `Week N (gmagent.vN): <video>` satırı. X'te haftada 3 gönderi, @riseinweb3 etiketli, ≤280 karakter (link 23 sayılır).
- README'de olması gerekenler: logo, isim, problem, sürümlü tech stack, en az 5 araç, modeller ve sürümleri, özellikler, demo videosu, future scope, sosyal linkler.
- Rise In H2 eğitiminde katılımcılardan cüzdan adresi için bir Google formu doldurmaları istendi (testnet fonu). Link henüz paylaşılmadı; gelirse kullanıcının test cüzdanı yazılır, kasa adresi değil.

## 3. Kullanıcıyla çalışma kuralları (önemli)

- **Türkçe** konuş; kod, commit, README ve X metinleri **İngilizce**.
- **Onay sorma** (commit, test, deploy, paket kurma serbest), **ama kapsamı o haftayla sınırla.** İleri haftaların işini kendiliğinden yapma. Hafta kapsamı, o haftanın Rise In eğitimi izlendikten sonra netleşir; kullanıcı genelde ekran görüntüsü veya transkript atar. Önce onları incele, sonra planla.
- Plan uygulamasında subagent-driven yaklaşımı tercih eder; mod sorma.
- Kullanıcı teknik olarak her adımı bilmiyor: komutları **nerede** çalıştıracağını (PowerShell, Claude Code içi, tarayıcı) açıkça yaz. "Beni uğraştırma" tercihi var: video kesme, altyazı gömme gibi işleri sen bitir, ona sadece yükleme kalsın.
- Sohbet uzayınca devir dosyasını ve hafızayı güncelle, "yeni sohbete geç" de.
- **Main'e merge:** Otomatik izin sınıflandırıcısı bazen PR merge'ünü "merge without review" diye engelliyor. Engellenirse kullanıcıya tek cümleyle sor; onay verince `gh pr merge N --merge`. Kod içeren PR'larda önce `npm run typecheck && npm test && npm run build`.

## 4. Kod haritası ve son durum (H2 sonrası)

| Yer | Ne |
|---|---|
| `src/gm/run-day.ts` | Günlük döngü: state → karar → guardrail → ödeme → yeni bilmece → log. Karar için 90 sn, bilmece için 120 sn bütçe (`withTimeout`); aşılırsa kural tabanlı karar veya bilmece bankası devreye girer. Açık bilmece yok ama geçmiş varsa **recovery** ile oyun yeniden açılır. |
| `src/gm/policy.ts` | `applyGuardrails`: kişi başı 2 USDC, günde kasanın %10'u + **`applyDifficultyHysteresis`** (banttan 0.15'ten fazla sapma ya da aynı tarafta 2 gün; tek adım, doğru yöne). |
| `src/llm/gemini.ts` | Model zinciri + yeniden deneme; çağrı başına 40 sn abort (`GEMINI_CALL_TIMEOUT_MS`). |
| `src/x402/exact.ts` · `src/x402/client.ts` | Sunucu tarafı (verify + on-chain settle) · istemci `payAndSubmit` (ağ, varlık ve ücret tavanı kontrolü). |
| `mcp/server.ts` · `src/mcp/tools.ts` | Başka ajanlar için MCP sunucusu: `get_puzzle`, `submit_answer`, `get_results`, `get_my_wallet`. |
| `src/wallet/spending-guard.ts` | Zincir üstü transferlerin önündeki harcama koruması. |
| `scripts/` | `simulate.ts` (`--llm`, `--llm-all`), `demo-players.ts`, `setup-mcp-player.ts` (`npm run mcp:setup`), `balance.ts`. |
| `src/wallet/delegated.ts` | `DelegatedWallet`: `transfer` redeems the owner-signed delegation (`redeemDelegations`) from the smart account. |
| `src/wallet/treasury-config.ts` | Reads `treasury/delegation.json` (`TREASURY_CONFIG`), chooses `eoa`/`delegated` (`TREASURY_MODE`). |
| `src/chain/anchor.ts` | Daily decision anchor tx: calldata `"GMV3" ‖ keccak256(decision) ‖ next commitment`. |
| `src/game/commitment.ts` | Answer commit-reveal (`keccak256(salt, normalizedAnswer)`). |
| `scripts/setup-treasury.ts` · `scripts/limit-demo.ts` | `npm run treasury:setup` · `npm run treasury:demo`. |
| `treasury/delegation.json` | Smart account `0xD020dD00a99A8cB0FDDDF2977D365088cb320C8b` + signed delegation (5 USDC/24 h). |
| `brand/x/week2/` | X görselleri (`make.py`), video senaryosu/SRT (`video.py`), kesim (`cut.py`) ve altyazı gömme (`burn.py`). H3'te aynı araçlar yeniden kullanılabilir. |

**v3:** treasury is a MetaMask smart account (see `treasury/delegation.json`); owner key (`0xAaF7…5478`) in `.treasury-owner.json` on Berke's machine only. Agent EOA (`0x5cb0…799D`) holds gas and redeems the delegation.

Testler (H2 sonu): 79 test (13 dosya), hepsi yeşil. Canlıda 9. gün açık (medium).

**H2'de yaşanan prod olayı:** 13-14 Ekim'de `/api/gm/run-day` Vercel'in 300 sn sınırında zaman aşımına uğradı; gün kapandı ama yenisi açılmadı. Zaman bütçeleri ve recovery ile düzeltildi, elle bir kez tetiklenerek kurtarıldı. Prod'da bir gün takılırsa: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://gm-agent-lime.vercel.app/api/gm/run-day` (CRON_SECRET `.env`'de).

## 5. Ortam notları

- Yerel deneme: `npm run dev:memory` (port 3005, `.claude/launch.json` "gm-agent"; prod DB'ye dokunmaz ama x402 settle ve ödemeler **gerçek Base Sepolia** işlemleri).
- `ANCHOR_DECISIONS=off` günlük zincir üstü karar çıpasını kapatır; `TREASURY_MODE=eoa` eski EOA kasasını zorlar (`delegated` ya da boş = dosyaya göre otomatik). `TREASURY_CONFIG` delegation dosyasının yolu.
- `.env` / `.env.local`: `GEMINI_API_KEY`, `WALLET_PRIVATE_KEY` (kasa), `CRON_SECRET`, `DATABASE_URL`. **Asla commit edilmez.**
- MCP, kullanıcının Claude Code'una **user** kapsamında ekli:
  `claude mcp add -s user gm-agent -- node "D:/Claude Code/gm-agent/node_modules/tsx/dist/cli.mjs" "D:/Claude Code/gm-agent/mcp/server.ts"`
- 14 Ekim'de kullanıcının `~/.claude/settings.json` dosyasından üçüncü taraf proxy (`ANTHROPIC_BASE_URL` = ohmycdn), `ANTHROPIC_API_KEY` ve `apiKeyHelper` kaldırıldı; terminaldeki Claude Code artık Pro aboneliğiyle çalışıyor. Yedek: `~/.claude/settings.backup-2026-10-14.json`. Geri ekleme önerme.
- ffmpeg `D:\ffmpeg\bin`'de. Ekran kayıtları NVIDIA ile `C:\Users\Monster\Videos\NVIDIA\Desktop` klasörüne düşüyor (2560x1440 veya 1080p, 120 fps). Altyazıyı drawtext ile göm (fontconfig yok, `C:/Windows/Fonts/segoeuib.ttf`).
- Bilinen sorun: Coinbase Wallet canlı siteyi "tehlikeli" işaretliyor (yeni vercel.app domaini + TransferWithAuthorization imzası). Demolar MetaMask veya localhost ile çekilebilir.
- GitHub MCP eklentisi bu makinede bağlanamıyor; `gh` CLI çalışıyor.

## 6. 3. hafta durumu (16 Ekim): KOD PROD'DA, sırada video + X + teslim

Kullanıcı eğitim videosunu beklemeden önerilen kapsamı onayladı. PR #8 merge edildi, prod `mode: delegated`.
Spec: `docs/superpowers/specs/2026-10-16-delegated-treasury-design.md` · plan: `docs/superpowers/plans/2026-10-16-delegated-treasury.md`.

Yapılanlar:
1. **Smart-account kasa:** MetaMask Hybrid hesap `0xD020dD00a99A8cB0FDDDF2977D365088cb320C8b` (owner `0xAaF7…5478`, anahtar sadece `.treasury-owner.json`'da, Berke'nin makinesinde; Vercel'e asla gitmez). Ajan EOA'sı sadece gas öder; `erc20PeriodTransfer` delegation'ı ile günde en fazla 5 USDC harcar (dönem her gün 11:30 UTC başlar). `treasury/delegation.json` repo'da (herkese açık, güvenli). Vercel prod env: `TREASURY_MODE=delegated`. x402 ücretleri doğrudan akıllı hesaba gider. SpendingGuard zincirdeki kalan limiti de hesaba katar.
2. **Cevap taahhüdü:** her bilmecede `keccak256(salt, normalize(answer))`; salt kapanışta açılır, sayfada "verified ✓".
3. **Zincire sabitleme:** her gün sonunda `GMV3 ‖ kararHash ‖ sonrakiTaahhüt` calldata'lı 0-ETH self-tx.
4. Script'ler: `npm run treasury:setup` · `treasury:demo [-- --send]` (limit aşımı reddi, videonun ana sahnesi) · `treasury:withdraw -- --amount X` (owner acil çekim; ajan gas öder).

Canlı kanıt tx'leri: delegation ödemesi `0x1ad1fdc8…`, limit reddi `0x4a1c73b3…` (`ERC20PeriodTransferEnforcer:transfer-amount-exceeded`), owner çekimi `0xf5697188…`, fon taşıma (43.75 USDC) `0x3de237a6…`, ilk anchor `0x0dac09b6…` (yerel).

Notlar: 11. gün yeni kod öncesi açıldı (taahhüt yok); 12. günden itibaren taahhüt + anchor prod'da olmalı, 17 Eki 12:00 UTC cron'undan sonra kontrol et. Public RPC okumaları tx'ten hemen sonra eski değer gösterebiliyor (birkaç sn bekle). Otomatik izin sınıflandırıcısı para hareket ettiren script'leri kullanıcı açık onayı olmadan engelliyor.

**18 Eki güncel durum:** Video çekildi, kesildi ve yüklendi: https://youtu.be/ppPxUWb2WMA (README'de, PR #11). Kesim: `brand/x/week3/cut.py`. X görselleri: `brand/x/week3/make.py`. Masaüstü `gm-agent-week3-x/` klasöründe: video, 3 PNG, `x-gonderileri.md` (19 / 20-21 / 22 Eki), `teslim-metni.md`. **Kalan tek şey kullanıcıda:** X gönderilerini atmak ve Rise In'e teslim etmek (tweet alanına 2. gönderinin linki). Sonraki iş: final haftası (24-25 Eki, tweet + video) ve Demo Day (30 Eki); kapsamı kullanıcıyla.

Eski not — kalan H3 işleri (17 Eki): video senaryosu HAZIR → `brand/x/week3/video.py` (çıktı: Masaüstü `gm-agent-week3-x/week3-video-senaryo.md` + `week3-subtitles.srt`). Kullanıcı **18 Eki TR 15:00 sonrası** çekecek (ilk "verified ✓" o kapanışta oluşur). Kayıt `C:\Users\Monster\Videos\NVIDIA\Desktop`'a düşer → kes (`brand/x/week2/cut.py` gibi) + SRT'yi drawtext ile göm (`burn.py`) → Masaüstü `gm-agent-week3-x/gm-agent-week3.mp4`. Önce 18 Eki prod kontrolü: 12. gün kapanışında `anchorTx` ve `commitmentValid` var mı.
- **Kripto odaklı demo videosu** (senaryo yaz → kullanıcı çeker → sen kes + altyazı göm; `brand/x/week2/` araçları). Ana sahne: `npm run treasury:demo -- --send` + BaseScan'de revert, kasa kartındaki limit çubuğu, taahhüt doğrulama, anchor linki.
- README `Week 3 (gmagent.v3): <video>` satırı.
- 3 X gönderisi (@riseinweb3 etiketli, görsel + ≤280 karakter).
- Sonra (kapsam dışı bırakıldı): eski delegation iptal script'i, sponsorlu havuz, gerçek ZK.

## 6b. 23 Ekim durumu: H3 TESLİM EDİLDİ, sırada final haftası

- H3: 19 Eki'de 3 X gönderisi atıldı ve Rise In'e teslim edildi. Kodda bekleyen iş yok.
- **Final haftası 24-25 Eki (tweet + video), Demo Day 30 Eki.** Kapsamı kullanıcıyla konuş (bkz. 3. bölüm; ileri işleri kendiliğinden yapma).
- **Yan iş — Anna Founding Builder Program:** Plan `docs/anna-plan.md` (tek kaynak). Eli'nin 4 cevabı işlendi; **Demo Day'den önce dokunma.** 31 Eki'den itibaren Aşama 0 (Passionfroot TR ödeme kontrolü + Developer Forum sorusu) ile başla.
- **Yan iş — Najmi/Wasit: BİTTİ (23 Eki).** Issue https://github.com/wasit-dev/Wasit/issues/15, kayıt https://youtu.be/RExehgkLQB4 (liste dışı), X https://x.com/GMAgentHQ/status/2113604543871070321. Najmi videoyu kendi playlist'ine **unlisted** yükleyecek, metni onaya gönderecek → gelince kontrol et. Ayrıntı: `docs/wasit-feedback.md`.
- X, gm-agent-lime.vercel.app linkini "zararlı" diye engelliyor → X gönderilerinde GitHub linki kullan.

## 7. Yeni sohbette ilk adımlar

1. `cd "D:\Claude Code\gm-agent" && git fetch && git merge --ff-only origin/main`
2. Canlıyı kontrol et: `curl -s https://gm-agent-lime.vercel.app/api/state` → `treasury.mode` "delegated" mı, açık bilmecede `commitment` var mı, son kararda `anchorTx` var mı. Vercel hataları: `get_runtime_errors`.
3. Final haftası teslimi (24-25 Eki): Rise In görev metnini kullanıcıdan al, kapsamı birlikte belirle (bkz. 6b). Anna işi Demo Day sonrası, `docs/anna-plan.md`.

## 8. 24 Ekim: Wasit MCP bitti, Anna kararları verildi

- Wasit: MCP read-only testi yapıldı, video https://youtu.be/ehdTSoRqbj0, yorum https://github.com/wasit-dev/Wasit/issues/15#issuecomment-6384331729. Bekleyen iş yok.
- **Anna Edition tasarımı onaylandı:** `docs/superpowers/specs/2026-10-24-anna-edition-design.md`. Özet: dünkü kapanmış GM bulmacası (canlı ücretli bulmaca asla), API yoksa Anna llm yedek bulmaca, ipucu (≤3) + "Neden yanlış?", sadece kişisel seri, kod `anna/` klasöründe.
- **Yeni sohbette Anna için sıra:** (1) Aşama 0: Passionfroot Türkiye ödemesi araştır + Developer Forum sorusunu yaz (Berke gönderir); (2) kullanıcı spec'i okuyup onaylarsa `superpowers:writing-plans` ile uygulama planı; (3) kod Demo Day (30 Eki) sonrası, Aşama 0 olumluysa.
- Final haftası (24-25 Eki) görev metni hâlâ kullanıcıdan bekleniyor — gelirse öncelik o.

## 9. 24 Ekim (GM Agent #7): Aşama 0 yazıldı

- **Eli e-postası 24 Eki'de gönderildi** (doğrudan havale / Passionfroot / kripto ödeme / belgeler). Forum sorusu henüz gönderilmedi.
- `docs/anna-stage0.md`: Passionfroot sonucu (Stripe Türkiye'de yok → tek yol USD SWIFT banka havalesi, "seçili üreticilere" açılıyor, garanti yok → **beklet**), Eli'ye e-posta taslağı ve Developer Forum sorusu (İngilizce). İkisini de Berke gönderecek.
- Sıra: Eli + forum cevapları gelince go/no-go kararı ver. Olumluysa spec onayı → `superpowers:writing-plans`. Kod Demo Day (30 Eki) sonrası.
- Final haftası görev metni hâlâ bekleniyor; gelirse öncelik o.

## 10. 26 Ekim: final teslim edildi

- Final haftası teslim edildi ve kabul aldı. Prod sağlıklı: 20. gün açık, `delegated`, kasa 44.22 USDC.
- Sırada Demo Day (30 Eki); formatı Rise In'den öğrenilecek.
- Bekleyenler: Eli cevabı (24 Eki gönderildi), Anna forum sorusu (Berke gönderecek), Wasit#15 v1 görüşü (acil değil, `memory/wasit-najmi-followup`).

## 11. 29 Ekim: Anna Edition'a GO, uygulama planı hazır

- Eli'nin cevabı (29 Eki): hibeler Passionfroot üzerinden, kanal (havale/kripto) önceden taahhüt edilmiyor, uygulama hak kazanınca birebir ayarlanıyor. Berke "direkt başlayalım" dedi.
- **Plan:** `docs/superpowers/plans/2026-10-29-anna-edition.md` (9 görev). Tasarım: `docs/superpowers/specs/2026-10-24-anna-edition-design.md`.
- **Yeni sohbette:** `superpowers:subagent-driven-development` ile planı Task 1'den başlayarak uygula (mod sorma). Dal: `feat/anna-edition`.
- Planlama sırasında doğrulananlar (anna.partners/developers): `llm.complete` = `{systemPrompt, messages, maxTokens}` → `{content:{text}}`; `storage.get/set` = `{key[,value]}` → `{value, exists}`; RPC'ler hem çıplak sonuç hem `{ok,result}` dönebiliyor; uygulama `allow-same-origin`'siz sandbox iframe'de çalışıyor (origin `null`), bu yüzden `/api/anna/archive` CORS `*`. CLI: `npx @anna-ai/cli` (`init`, `validate --strict`, `dev --no-llm`, `apps push`).
- Berke'nin işleri: forum sorusunu göndermek (metin `docs/anna-stage0.md` §2), Anna hesabı + Developer ToS, `anna-app login` (Task 8).
- Kapanan konular: Wasit v1 cevabı yazılmayacak; Demo Day boşverildi; Devcon'a gidilmiyor (bilet iade edildi); Top 5 X gönderisi atıldı.

## 12. Anna Edition built (plan: docs/superpowers/plans/2026-10-29-anna-edition.md)

- Code: `anna/` + `GET /api/anna/archive` (closed puzzles only, CORS *). Tests: `npx vitest run anna/test`.
- Waiting on Berke: Anna account (Stage 1), `anna-app login`, `apps push`, review submission. Listing copy: `anna/LISTING.md`.
- Next: launch plan `docs/anna-launch.md` (goal ≥ 200 MAU in one calendar month).

### 12b. 30 Oct status: merged to main (PR #16, merge 9d32569)

- All 9 plan tasks done with subagent-driven development; per-task reviews + final whole-branch review (Opus) + 2 fix rounds. 168 tests, `next build` OK, `anna validate --strict` OK.
- Local harness: `npm run anna:dev` (needs `uv`; installed 30 Oct with `pip install --user uv`). Port 5180. `--no-llm`, so hints show the "GM is busy" message there. Root `D:\Claude Code\.claude\launch.json` has an `anna-dev` entry.
- Progress ledger (all deferred Minor findings): `.superpowers/sdd/progress.md` (git-ignored, local only).
- **Open product decision (Berke):** "Today" = newest closed GM puzzle. A user who already solved it and returns the next local day before the 12:00 UTC close has nothing to solve for the streak. Option: if today's GM puzzle was solved on an earlier day, offer the Anna/bank puzzle as the streak puzzle.
- Deferred minors: Today tab stays highlighted while an archive puzzle is open; `isProgress` guard is shallow; `@anna-ai/cli@latest` is unpinned; bank puzzle is labelled "Puzzle from Anna".
- **Berke's next steps:** (1) anna.partners account + email verification + Developer ToS (browser). (2) PowerShell: `cd "D:\Claude Code\gm-agent"`, `npm run anna:validate`, `cd anna`, `npx -y @anna-ai/cli@latest login --host https://anna.partners`. (3) Tell Claude → Claude runs `apps push`, a real-LLM test in `anna dev`, and takes listing screenshots. (4) Paste `anna/LISTING.md` into the Developer Console and submit for review. Also: forum question (`docs/anna-stage0.md` §2). Before posting X drafts (`brand/x/anna/posts.md`), check the `@AnnaOS` handle.

### 12c. 30 Oct: Anna draft pushed and tested with the real LLM

- Developer handle `gm-agent`; app `gm-daily-riddle` (app_id 764), working draft rev 1 pushed (category `entertainment`; Anna has no `games`). CLI login PAT in `~/.config/anna/credentials.json` (~90 days).
- Real-LLM harness: `npm run anna:dev:llm` (port 5180). Verified: day 23 GM puzzle from prod, 3 hints with no leak, why-wrong, correct answer → "verified ✓", streak 1, archive 22.
- Listing screenshots: Desktop `gm-agent-anna-listing/` (1-today, 2-hints, 3-solved-verified, 4-archive).
- Berke's remaining steps: `apps cut 0.1.0` (the auto classifier blocked Claude from running it), then submit for review (`apps submit-review gm-daily-riddle` or the Console), paste `anna/LISTING.md` into the listing, upload the screenshots.
