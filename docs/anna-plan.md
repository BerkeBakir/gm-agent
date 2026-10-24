# GM Agent — Anna Edition planı

> **24 Eki:** Berke planlamayı Demo Day öncesi başlattı; brainstorming 1. soruda durdu: bulmaca kaynağı A (bizim API) / B (Anna llm.complete) / C (karma; öneri). Devam edince oradan sür.
>
> Güncel durum (23 Eki 2026): Eli (eli@anna.partners) 4 sorumuzu cevapladı (bölüm 3). Karar: **Anna, Demo Day (30 Eki) sonrasına bırakıldı**; final haftası (24-25 Eki) ve Demo Day önce. Diğer yan iş: Najmi/Wasit geri bildirimi (`docs/wasit-feedback.md`).

## 1. Model: ne bizde, ne onlarda

| | Kimde |
|---|---|
| GM Agent (kod, marka, kasa, gm-agent-lime.vercel.app, X) | **Bizde, değişmiyor.** Münhasırlık yok, IP bizde. |
| Anna Edition (Anna mağazasında ek uygulama) | Kodu ve bakımı bizde (ayda ≥1 anlamlı güncelleme şart). |
| Çalıştığı altyapı (pencere, kullanıcı girişi, LLM, depolama) | Anna |
| Kullanıcı bulmak | Biz |
| Hibe | Anna; sadece **Anna içinden** giriş yapıp uygulamayı gerçekten çalıştıranlar sayılır. |

Hibe kademeleri (aylık): 200 MAU → $50 · 500 → $100 · 1.000 → $200 · 4.000 → $1.000 · 10.000 → $2.500 · 20.000 → $5.000. Ek olarak Anna'nın kendi ödeme sistemi (abonelik + Token) üzerinden %70 gelir payı.

## 2. Teknik kısıtlar (Anna Developer Hub)

- Anna App = manifest (schema 3) + statik SPA; Anna panelinde **sandbox iframe**'de açılır, CSP ile kısıtlı.
- **MetaMask iframe'e erişemez → x402 ücretli giriş Anna'da çalışmaz.** Ücretli giriş + para ödülü incelemede "kumar" sayılabilir.
- `ui.bundle.external_origins` ile kendi API'mizi çağırabiliriz (inceleme bunu ayrıca değerlendiriyor).
- Host API: `llm.complete` (anahtarsız LLM), `storage.*` (kullanıcı başına KV), `chat.append_artifact`.
- Yayın için Verified Developer (kendin aktive edersin: e-posta doğrula + Developer ToS kabul).
- Her uygulama ve **her güncelleme** inceleme (3-5 iş günü) + güvenlik denetiminden geçer.

## 3. Eli'nin cevapları (22 Eki) ve sonuçları

| Soru | Cevap | Bizim için anlamı |
|---|---|---|
| Kripto/cüzdan App içinde? | Belgelenmiş cevap yok; Developer Forum'a sor. Anna'nın kendi ödeme mantığı var. | **Cüzdansız ücretsiz sürüm** — plan değişmez. |
| Kendi API'mizden veri? | Spesifik söz yok; Developer Hub'a bak, her şey incelemeden geçer. | Net onay yok → forumda sor. |
| 30 Kasım kesin mi? | Hayır; muhtemelen uzatılacak veya daha büyük teşvik gelecek. | Zaman baskısı yok. |
| Türkiye'ye ödeme? | Passionfroot üzerinden, "duruma göre"; banka havalesi garanti değil, hak kazanınca birebir ayarlanır. | **En büyük risk: emek verip parayı alamamak.** |

## 4. Adımlar (Demo Day sonrası)

### Aşama 0 — Ucuz doğrulama (31 Eki – 2 Kas, ~1 saat)
Geliştirmeye başlamadan önce iki "go/no-go" kontrolü:
1. **Passionfroot Türkiye'ye ödeme yapıyor mu?** Passionfroot'un ödeme altyapısını (hangi ülkeler, hangi yöntem) araştır. Claude araştırır, Berke'ye özet verir.
2. **Developer Forum'a soru:** Claude metni yazar, Berke kendi hesabından gönderir. İçerik: (a) cüzdan/on-chain ödeme App içinde mümkün mü, (b) günlük bulmacayı kendi backend'imizden (`external_origins`) çekmek incelemede sorun mu.

**Karar:** İkisi de olumlu/kabul edilebilir → Aşama 1. Ödeme Türkiye'ye net değilse → beklet, Eli'ye sadece "uygulama hak kazanırsa ödeme nasıl olur" teyidini iste; geliştirme yapma.

### Aşama 1 — Hesap (Berke, ~15 dk)
- anna.partners'ta hesap aç, e-postayı doğrula, Developer Console'da Developer ToS'u kabul edip developer erişimini aktive et. (Hesap açma ve sözleşme kabulü Berke'nin işi.)

### Aşama 2 — Geliştirme (Claude, ~4 gün)
**Anna Edition kapsamı: ücretsiz "Daily Puzzle" — USDC yok, cüzdan yok.**
1. Pencere açılınca bugünün bulmacası `GET /api/challenge`'tan gelir (bulmacayı yine bizim Gemini ajanımız üretir).
2. Cevap → yeni uç nokta `POST /api/anna/submit` (x402'siz, `source = "anna"`, USDC ödülüne girmez, kullanıcı başına günde 1 cevap) → puan döner. Bu bir "Qualified App Run".
3. **"GM'den ipucu iste"** ve **"Neden yanlış?"** → Anna `llm.complete` (AI-native şartı + Token gelir payı).
4. Seri (streak) ve geçmiş `storage.*`'ta; ayrı "Anna liderlik tablosu" (puan, para değil).
5. Ana siteye link: "Gerçek USDC ödüllü sürüm → gm-agent-lime.vercel.app".

GM Agent tarafı: `/api/anna/submit` + Anna origin'i için CORS. Ana oyunun kasası, SpendingGuard ve delegation **değişmez**.
Akış: `anna-app init` → focus-flow örneğini incele → `anna-app dev` ile yerel → testler → `anna-app validate`.

### Aşama 3 — İnceleme (~1 hafta)
- Listing metni + görseller (Claude hazırlar), Berke Developer Console'dan incelemeye gönderir. 3-5 iş günü.

### Aşama 4 — Büyüme
- Tanıtım: X @GMAgentHQ, Builder Discord, Rise In topluluğu, $70 pazarlama paketi (ilk 20 onaylı geliştirici).
- Hedef: bir takvim ayında ≥200 MAU (kendi/ekip hesapları sayılmaz; sahte kullanım = diskalifiye).
- Her ay ≥1 anlamlı güncelleme (her güncelleme yine incelemeden geçer).

## 5. Riskler

- **Ödeme Türkiye'ye ulaşmayabilir** (Aşama 0 bunun için).
- 200 gerçek kullanıcıya ulaşmak zor olabilir.
- Uygulama bizim Vercel API'mize bağlı; o çökerse uygulama çalışmaz ("broken external dependency" incelemede istenmiyor).
- İnceleme dış API'yi reddederse bulmacayı Anna tarafında üretmek gerekir (`llm.complete` ile) — daha büyük iş.
