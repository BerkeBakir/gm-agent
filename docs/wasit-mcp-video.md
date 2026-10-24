# Wasit MCP videosu: çekim rehberi (24 Eki 2026)

Amaç: Najmi'nin istediği ayrı ve kısa kayıt. Claude Code içinden Wasit MCP sunucusu (`@wasit-dev/server`) ile GM Agent'ın yerel kopyasına salt okunur `wasit_x402_test` çalıştırılıyor. Anahtar yok, cüzdan yok, ödeme yok (Najmi onayladı).

Beklenen sonuç: X402-01, 03 ve 04 PASS; 02 ve 05 FAIL (v1). Ödeme kontrolleri v1'de atlanır.

## A. Hazırlık (KAYIT KAPALIYKEN)

1. Ekranda gizli bir şey kalmasın: `.env` dosyası, şifreler, e-posta ya da cüzdan pencereleri açıksa kapat. Windows bildirimlerini kapat (Odak / Rahatsız Etmeyin).
2. **PowerShell 1** (gm-agent klasöründe), yerel uygulamayı başlat:
   ```
   cd "D:\Claude Code\gm-agent"; $env:ANCHOR_DECISIONS="off"; npm run dev:memory
   ```
   "Ready" yazısını bekle. Bu pencere açık kalsın ama kayıtta görünmesin (simge durumuna küçült).
3. Tarayıcıda http://localhost:3000 adresini aç. Aşağıdaki **07 Operator** kartında admin token alanına `.env` içindeki `CRON_SECRET` değerini yapıştır (alan şifre gibi gizli görünür) → **CLOSE DAY**. "Day N is open." yazısı çıkınca sayfanın başına kaydır, açık bulmaca görünsün.
   - Hafıza modunda oyuncu yok, ödeme yok, zincire işlem yok.
4. **PowerShell 2**'yi aç, yazıyı büyüt (Ctrl + fare tekerleği, rahat okunacak kadar), ekranın büyük kısmını kaplasın.
5. Tek seferlik deneme (isteğe bağlı ama önerilir): npx paketi ilk açılışta indirildiği için kayıtta uzun bekleme olmasın diye önceden bir kez çalıştır:
   ```
   mkdir C:\wasit-test -Force; cd C:\wasit-test; npx -y @wasit-dev/server
   ```
   İndirme bitince sunucu sessizce bekler (normal). Ctrl+C ile kapat, sonra `cd ~` ile klasörden çık ve `cls` ile ekranı temizle.

## B. Kayıt (NVIDIA: Alt+F9 başlat / durdur)

**Sahne 1, yaklaşık 10 sn: oyun açık.**
Tarayıcıda localhost:3000, açık bulmaca ekranda. Yavaşça biraz aşağı kaydır, sonra PowerShell 2'ye geç.

**Sahne 2, yaklaşık 20 sn: MCP'yi anahtarsız ekle.**
PowerShell 2'de satır satır yaz (her satırdan sonra Enter):
```
mkdir C:\wasit-test -Force
cd C:\wasit-test
claude mcp add --transport stdio wasit '--' cmd /c npx -y @wasit-dev/server
claude mcp list
```
`wasit ... ✓ Connected` satırını gör ve 2-3 sn bekle. Komutta hiçbir `--env` / anahtar yok; görüntüde de bu belli olsun.
- "Connecting" ya da hata görürsen birkaç saniye bekleyip `claude mcp list` komutunu tekrar yaz.

**Sahne 3, yaklaşık 30-60 sn: Claude Code'dan testi çalıştır.**
```
claude
```
- "Bu klasöre güveniyor musun?" diye sorarsa → **Yes**.
- Açılış ekranında e-posta veya hesap bilgisi görünürse sorun değil, kurguda o kısmı keserim ya da bulanıklaştırırım.
Şu istemi yapıştır, Enter:
```
Run wasit_x402_test against http://localhost:3000/api/submit with method POST, body {"answer":"test"}, network eip155:84532. Read-only checks only, do not pay anything.
```
- Araç izni sorarsa (`wasit_x402_test`) → **Yes** (bir kez izin ver).

**Sahne 4, yaklaşık 15 sn: sonuç.**
Sonuç gelince yavaşça yukarı kaydır, PASS/FAIL satırları okunabilsin; sonunda 3-4 sn hareketsiz bekle.

**Kaydı durdur (Alt+F9).**

## C. Kayıttan sonra

1. Claude Code'dan çık (`/exit`), sonra PowerShell 2'de MCP'yi kaldır:
   ```
   claude mcp remove wasit
   ```
2. PowerShell 1'de uygulamayı Ctrl+C ile durdur.
3. Bana "çektim" de. Sonuç metnini de Claude Code ekranından kopyalayıp yapıştırırsan iyi olur, issue yorumunda kullanacağım.

Claude'un yapacakları: kaydı bulur (`C:\Users\Monster\Videos\NVIDIA\Desktop`), boşlukları keser, İngilizce altyazıyı gömer → Masaüstü `wasit-mcp-test.mp4`. Berke YouTube'a **liste dışı** yükler, linki verir. Claude issue #15'e MCP sonucunu ve video linkini yorum olarak ekler (onayla).

## Sorun çıkarsa

| Belirti | Çözüm |
|---|---|
| X402-01 402 değil 409 dönüyor | Açık bulmaca yok → A.3'ü tekrarla |
| `claude mcp list`'te wasit yok | Yanlış klasördesin; `cd C:\wasit-test` yapıp tekrar dene |
| Claude aracı göremiyor | Claude Code'dan çık, `claude mcp list` ile bağlantıyı kontrol et, yeniden `claude` |
| Uygulama açılmıyor (port dolu) | Başka bir `npm run dev` açık; kapat ya da onu kullan |
