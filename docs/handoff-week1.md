# Devir dosyası: Agentmaxxing 1. hafta (GM Agent v1)

Son güncelleme: 9 Ekim 2026. Bu dosya 1. haftada yapılan her şeyi, projenin şu anki durumunu ve
2. haftaya nereden devam edileceğini anlatır. Yeni bir oturuma (insan ya da yapay zekâ) başlarken
önce bunu oku.

---

## 1. Durum özeti

| Teslim kalemi | Durum |
|---|---|
| En az 5 yerleşik araçlı AI ajanı | ✅ 5 sohbet aracı ve otonom günlük döngü |
| README: logo, isim, açıklama, problem, sürümlü teknoloji yığını, araçlar, modeller, özellikler, demo videosu, demo linkleri, gelecek planları, sosyal medya | ✅ Hepsi `README.md`'de, içinde hiç TODO yok |
| Demo videosu | ✅ https://youtu.be/1hf2Hj-q76E (liste dışı) |
| X ürün sayfası | ✅ https://x.com/GMAgentHQ |
| Haftada 3 gönderi, @riseinweb3 etiketli | ✅ Paylaşıldı |
| Rise In teslimi | ✅ Teslim edildi (son tarih: 11 Ekim 2026, 23:59 IST) |

**Linkler:**
- **Repo:** https://github.com/BerkeBakir/gm-agent
- **Canlı site:** https://gm-agent-lime.vercel.app (Vercel, `main` dalından otomatik yayın)
- **Ağ:** Base Sepolia test ağı. Ajan kasası `0x5cb007cB053ce248529D84651ce53750666A799D`.

---

## 2. Proje kısaca

GM Agent otonom bir yapay zekâ oyun yöneticisidir. Her gün Gemini ile bir bulmaca yazar. Oyuncular
cevap verirken x402 üzerinden 0.10 USDC giriş ücreti öder; bu, gassız bir EIP-3009 imzasıdır ve
sunucu onu zincirde işler. Gün sonunda ajan:
1. **Puanlar:** Cevapları kayıtlı cevap anahtarıyla kesin biçimde puanlar.
2. **Karar verir:** Gemini ödülü ve ertesi günün zorluğunu, gerekçesiyle birlikte önerir.
3. **Sınırlar:** `SpendingGuard` öneriyi koddaki limitlerle kırpar: kazanan başına en fazla 2 USDC, günde kasanın en fazla %10'u.
4. **Öder:** Kazananlara gerçek USDC gönderir.
5. **Kaydeder:** Kararı herkese açık karar kaydına yazar.

Mimarinin ayrıntıları README'de (Architecture, Crypto integration, Experiments).

**Sohbet araçları** (`agent/tools.ts`; parayla ilgili hepsi salt okunur):
1. `create_challenge`: sadece açık bir gün yoksa çalışır.
2. `get_today_challenge`
3. `get_treasury_balance`
4. `get_decision_log`
5. `get_game_rules`

**Modeller** (`src/llm/gemini.ts`): Önce `gemini-flash-latest` denenir, olmazsa `gemini-2.5-flash`,
o da olmazsa `gemini-flash-lite-latest`. API anahtarı yoksa kural tabanlı strateji ve hazır bulmaca bankası devreye girer.

---

## 3. Bu hafta yapılan değişiklikler

Hepsi `main`'de. Başlangıç noktası `8317dbd` (Gemini persona deneyleri) commit'iydi.

| PR | Commit | Ne değişti |
|---|---|---|
| [#1](https://github.com/BerkeBakir/gm-agent/pull/1) | `f8d37fb` | **README yeniden yapılandırıldı.** Logo, problem, sürümlü teknoloji yığını tablosu (sürümler `package-lock.json`'dan), 5 araç ve döngü eylemleri, modeller, özellikler, demo, gelecek planları ve sosyal medya bölümleri eklendi. Node gereksinimi 20+'dan 22+'ya düzeltildi. |
| #1 | `482f848` | **Marka kiti:** `public/gm-agent-logo.svg` ve `brand/x/` altında `avatar.png` (400×400), `header.png` (1500×500), `post1-3.png` (1600×900) ve `logo.svg`. |
| #1 | `159bc99` | **Cüzdan bağlama hatası düzeltildi** (`components/gm/play-panel.tsx`). `connect()` içinde hata yakalama yoktu; reddedilen ya da bekleyen istekler ve ağ değiştirme hataları sessizce yutuluyordu. Artık her hata ekranda gösteriliyor. Cüzdan EIP-6963 ile bulunuyor (birden fazla eklentide `window.ethereum` çakışmasın diye). Ağ değiştirme reddedilse de hesap bağlı kalıyor. Butonun altına "How to play" rehberi eklendi. |
| #1 | `1a15a2d` | `.gitignore`'a `next dev`'in kendiliğinden oluşturduğu `AGENTS.md` ve `CLAUDE.md` eklendi. |
| [#2](https://github.com/BerkeBakir/gm-agent/pull/2) | `a35e7e2` | README'ye @GMAgentHQ eklendi. |
| #2 | `f6735da` | **Hydration hatası düzeltildi** (`components/gm/dashboard.tsx`, `AdminPanel`). Kayıtlı token `useState` başlangıcında `localStorage`'dan okunuyordu; artık `useEffect` içinde okunuyor. Geliştirme modundaki "1 Issue" uyarısı bundan kaynaklanıyordu. |
| [#3](https://github.com/BerkeBakir/gm-agent/pull/3) | `a1f6b4b`, `8607347` | Demo videosu README'ye eklendi (küçük resim ve linkler). |

**Doğrulama:** `npm run typecheck`, `npm test` (56/56) ve `npm run build` temiz geçti. Oyun paneli
headless Chromium'da sahte cüzdanla 4 senaryoda denendi: cüzdan yok, istek reddedildi, EIP-6963 ile
bağlandı, ağ değiştirme reddedildi. Hydration düzeltmesi tarayıcıda 0 hatayla doğrulandı.

---

## 4. Bilinen sorunlar ve dikkat edilecekler

- **Coinbase Wallet canlı siteyi "tehlikeli" olarak işaretliyor** (`gm-agent-lime.vercel.app`).
  Muhtemel neden: yeni bir `*.vercel.app` adresi ve USDC `TransferWithAuthorization` imzası
  istenmesi; dolandırıcı siteler de aynı tür imzayı kullanıyor. Hangi listeden işaretlendiği doğrulanmadı.
  Sorunu kod çözmez. Seçenekler:
  - (a) MetaMask kullanmak,
  - (b) `localhost`'ta çalıştırmak (demo böyle çekildi),
  - (c) kendi alan adını bağlamak,
  - (d) hatalı işaretlemeyi bildirmek.
- **Uyarı sonrası bağlantı:** Uyarı ekranı geçildikten sonra ilk bağlantı isteği düşüyor; "Connect wallet to play"e bir kez daha basmak gerekiyor.
- **`npm run dev:memory` verileri bellekte tutar.** Sunucu yeniden başlarsa bulmacalar ve karar kaydı
  sıfırlanır; zincirdeki USDC ve işlemler kalıcıdır. Yeniden başlattıktan sonra Operator → **Close day** ile ilk günü aç.
- **`npm run dev` ve `DATABASE_URL`:** `DATABASE_URL` tanımlıyken `npm run dev` canlı Neon veritabanına bağlanır. Yerel denemelerde `dev:memory` kullan.
- **`demo:players` kasadan para harcar.** Her bot hazineden fonlanıyor. Bot cüzdanları `.demo-players.json`'da tutuluyor (gitignore'da).
- **Cevap hakkı:** Her cüzdan günde bir cevap verebilir. Aynı gün ikinci kez oynamak için Close day ile yeni güne geç.
- **`npm audit fix --force` çalıştırma.** Kilitli sürümleri bozar.
- **`npm run dev:memory` uyarısı:** Windows'ta `DEP0190` uyarısı çıkar; zararsız.

---

## 5. Yerelde çalıştırma (Windows, kullanıcının makinesi)

Proje `C:\Users\Monster\Desktop\gm-agent` klasöründe. Node v24.12.0 ve Git 2.54 kurulu.

```powershell
cd $HOME\Desktop\gm-agent
git pull
npm ci                 # sadece paketler değiştiyse
npm run dev:memory     # http://localhost:3000
```

`.env` dosyasında bulunması gerekenler (değerler asla commit edilmez ve kimseyle paylaşılmaz):

| Değişken | Not |
|---|---|
| `GEMINI_API_KEY` | Vercel env'deki ile aynı ya da https://aistudio.google.com/apikey adresinden yeni |
| `WALLET_PRIVATE_KEY` | Vercel'deki ajan kasası anahtarı. Boşsa sayfada "Create wallet" çıkar; basma, içi boş yeni bir kasa oluşturur. |
| `CRON_SECRET` | Operator panelindeki "admin token". `.env` değişirse sunucuyu yeniden başlat. |

**Bot oyuncular** (ikinci PowerShell penceresinde, önce `cd` ile proje klasörüne geç):
```powershell
npm run demo:players -- --url http://localhost:3000 --answers "dogru,dogru,yanlis"
```

---

## 6. Sosyal medya ve marka

- **X:** https://x.com/GMAgentHQ. Görünen ad "GM Agent 🎲". Bio, website ve konum metinleri 1. hafta sohbetinde hazırlandı.
- **Görseller:** `brand/x/`. Görseller tek bir HTML sayfasından Playwright ile render edildi; tasarım
  siyah zemin üzerinde mor `#8427FD`, turkuaz `#41DABE`, açık yeşil `#B4FF24` ve pembe `#CC45FF` kullanıyor.
  `post3.png`'deki karar kaydı **örnek** veridir ve görselde "example entry" diye etiketlidir.
- **Gönderi uzunluğu:** X'te gönderi sınırı 280 karakter; linkler 23, emojiler 2 karakter sayılır. 1. haftanın ilk taslakları bu sınırı aşmıştı ve kısaltıldı.
- **Haftalık gereklilik:** 3 gönderi, hepsinde @riseinweb3 etiketi.

---

## 7. Demo videosu

- **Link:** https://youtu.be/1hf2Hj-q76E (liste dışı). `localhost`'ta, İngilizce seslendirmeyle çekildi.
- **Akış (10 sahne):**
  1. Açılış
  2. Problem
  3. Bulmaca ve kasa
  4. Cüzdanla x402 ödemesi
  5. Bot oyuncular
  6. Sohbet ve 5 araç
  7. Close day ve karar kaydı
  8. Ajanın kararını açıklaması
  9. Deney tablosu
  10. Kapanış

Sonraki haftaların videolarında da aynı iskelet kullanılabilir.

---

## 8. Sonraki adımlar (2. hafta önerileri)

README'deki "Future scope" ile uyumlu:
1. **x402 üzerinden oynayan ajanlar:** Bir x402 istemci SDK'sı ve `get_puzzle` / `submit_answer` sunan bir MCP sunucusu. Başlangıç noktası `scripts/demo-players.ts`; botların akışı zaten bu.
2. **Arayüzde model değiştirme:** Sohbet, bulmaca yazarı ve hazine kararları için ayrı ayrı model seçimi; Claude ve OpenAI sağlayıcılarının eklenmesi. İlgili dosya `src/llm/gemini.ts` → `modelChain()`.
3. **Liderlik tablosu ve seriler:** Seri bonusları, yine limitler içinde kalacak.
4. **Mainnet'e hazır kasa:** Anahtarı ortam değişkeninden çıkarıp smart account ya da KMS imzacısına taşımak.
5. **Alan adı:** Coinbase uyarısını azaltmak için kendi alan adını bağlamak.

3. hafta için: ZK cevap taahhüdü, sponsorlu ödül havuzu, yeni oyun modları ve karar kaydının zincire sabitlenmesi.

**Her hafta yapılacaklar:**
- README'deki `Week N (gmagent.vN)` satırını yeni video linkiyle güncelle.
- 3 X gönderisi paylaş.
- Rise In'e teslim et.

---

## 9. Çalışma kuralları (bu repo için)

- **Dal:** Geliştirme `claude/determined-pasteur-9qv6yg` dalında yapılıyor. Her iş PR olarak açılıp `main`'e birleştiriliyor; PR birleştikten sonra dal yeni `main`'den baştan oluşturuluyor.
- **Yayın:** Vercel `main`'e gelen her değişikliği 1–3 dakikada yayınlıyor.
- **Push öncesi kontrol:** `npm run typecheck && npm test && npm run build`
- **Next.js 16:** Bu sürümde API'ler değişmiş olabilir; kod yazmadan önce `node_modules/next/dist/docs/` altındaki rehberlere bak.
- **Gizli bilgiler:** `.env`, `.agent-wallet.json` ve `.demo-players.json` asla commit edilmez.
