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
| `brand/x/week2/` | X görselleri (`make.py`), video senaryosu/SRT (`video.py`), kesim (`cut.py`) ve altyazı gömme (`burn.py`). H3'te aynı araçlar yeniden kullanılabilir. |

Testler: 79 test (13 dosya), hepsi yeşil. Canlıda 9. gün açık (medium).

**H2'de yaşanan prod olayı:** 13-14 Ekim'de `/api/gm/run-day` Vercel'in 300 sn sınırında zaman aşımına uğradı; gün kapandı ama yenisi açılmadı. Zaman bütçeleri ve recovery ile düzeltildi, elle bir kez tetiklenerek kurtarıldı. Prod'da bir gün takılırsa: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://gm-agent-lime.vercel.app/api/gm/run-day` (CRON_SECRET `.env`'de).

## 5. Ortam notları

- Yerel deneme: `npm run dev:memory` (port 3005, `.claude/launch.json` "gm-agent"; prod DB'ye dokunmaz ama x402 settle ve ödemeler **gerçek Base Sepolia** işlemleri).
- `.env` / `.env.local`: `GEMINI_API_KEY`, `WALLET_PRIVATE_KEY` (kasa), `CRON_SECRET`, `DATABASE_URL`. **Asla commit edilmez.**
- MCP, kullanıcının Claude Code'una **user** kapsamında ekli:
  `claude mcp add -s user gm-agent -- node "D:/Claude Code/gm-agent/node_modules/tsx/dist/cli.mjs" "D:/Claude Code/gm-agent/mcp/server.ts"`
- 14 Ekim'de kullanıcının `~/.claude/settings.json` dosyasından üçüncü taraf proxy (`ANTHROPIC_BASE_URL` = ohmycdn), `ANTHROPIC_API_KEY` ve `apiKeyHelper` kaldırıldı; terminaldeki Claude Code artık Pro aboneliğiyle çalışıyor. Yedek: `~/.claude/settings.backup-2026-10-14.json`. Geri ekleme önerme.
- ffmpeg `D:\ffmpeg\bin`'de. Ekran kayıtları NVIDIA ile `C:\Users\Monster\Videos\NVIDIA\Desktop` klasörüne düşüyor (2560x1440 veya 1080p, 120 fps). Altyazıyı drawtext ile göm (fontconfig yok, `C:/Windows/Fonts/segoeuib.ttf`).
- Bilinen sorun: Coinbase Wallet canlı siteyi "tehlikeli" işaretliyor (yeni vercel.app domaini + TransferWithAuthorization imzası). Demolar MetaMask veya localhost ile çekilebilir.
- GitHub MCP eklentisi bu makinede bağlanamıyor; `gh` CLI çalışıyor.

## 6. 3. hafta: aday işler (kapsam eğitim izlendikten sonra kullanıcıyla netleşecek)

H3 teması "agent'ına cüzdan ver, ödemeyi öğrensin": x402, fon devretme, smart wallet harcama limitleri. GM Agent'ta cüzdan ve x402 zaten var, bu yüzden en doğal ilerleme:

1. **Smart-account kasa + zincir üstü harcama limiti (öneri, tema ile birebir).** Kasa anahtarını env'deki EOA'dan, günlük limitli bir smart account'a ya da delegation'a taşı (ör. MetaMask Delegation Toolkit, Coinbase Smart Wallet / spend permissions). Böylece "günde kasanın %10'u" kuralı kodun dışında, zincirde de geçerli olur. Eğitimdeki "smart wallet: spend limits & rules" ve "delegate $10" örneğiyle aynı fikir.
2. **Karar logunu zincire sabitleme:** Her günün karar hash'ini Base Sepolia'ya yaz; değiştirilemez muhasebe olur.
3. **Sponsorlu ödül havuzu:** Herkes x402 ile kasaya katkı yapabilir; GM bunu gelir olarak hesaba katar.
4. **ZK / commit-reveal cevap taahhüdü:** Bilmece açılırken cevabın hash'i yayınlanır, kapanışta açılır.

README "Future scope" bölümünde bunlar Week 3 olarak listeli; hafta bitince "Done in Week 3" olarak güncelle.

## 7. Yeni sohbette ilk adımlar

1. `cd "D:\Claude Code\gm-agent" && git fetch && git merge --ff-only origin/main`
2. Canlıyı kontrol et: `curl -s https://gm-agent-lime.vercel.app/api/state` (açık bilmece var mı, son karar ne zaman?). Vercel'de son 24 saatin hatalarına bak (`get_runtime_errors`).
3. Kullanıcıdan H3 eğitim videosunu (ekran görüntüleri veya transkript) iste ya da bekle. İnceledikten sonra kapsamı yukarıdaki adaylardan önerip planla.
4. Hafta sonunda: README `Week 3 (gmagent.v3): <video>`, 3 X gönderisi (görsel + metin), altyazılı video (senaryo → kullanıcı çeker → sen keser, altyazıyı gömersin).
