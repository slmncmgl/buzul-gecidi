# Buzul Geçidi

Tarayıcıda oynanan, dikey kaydırmalı özgün bir arcade oyunu. Donmuş bir fiyortta ısı kuryesisin:
kızağının ısısı bitmeden bir sonraki fenere ulaşman gerekiyor.

Kurulum yok, derleme yok: `index.html` + üç JavaScript dosyası. Görseller canvas ile çiziliyor,
sesler Web Audio ile üretiliyor; hiçbir hazır görsel ya da ses dosyası kullanılmıyor.

## Nasıl oynanır

| Tuş | İşlev |
| --- | --- |
| ← → (A / D) | yön |
| ↑ ↓ (W / S) | hızlan / yavaşla |
| Boşluk (J / Z) | işaret fişeği |
| P / Esc | duraklat |
| M | ses aç / kapat |

Fareyle: oyunu tıklayarak başlat. Farenin o andaki konumu sıfır noktası olur; sağa / sola götürürsen
kızak o yöne gider, ileri itersen hızlanır, geri çekersen yavaşlar, sıfır noktası civarında seyir hızında
kalır. Tık (basılı tutunca sürekli) ateş eder. Oyun sırasında imleç gizlenir; Esc imleci geri getirir ve
oyunu duraklatır, tıklayınca devam eder. Klavyeyle oynarken de herhangi bir anda tıklayıp fareye geçebilirsin.

Telefonda: parmağını sürükle (yön), yukarı / aşağı kaydır (hız); dokunurken otomatik ateş eder.

- **Isı** sürekli azalır. **Sıcak kaynakların** üstünden geçince dolar; ne kadar yavaş geçersen o kadar çok.
- Kıyıya, adalara ve düşmanlara çarpma.
- Her etabın sonundaki **fener** kayıt noktasıdır: can kaybedince oradan devam edersin, kalan ısın kadar bonus alırsın.
- 12 etap bir tur. Tur bitince etaplar yeni bir düzenle, daha hızlı düşmanlarla baştan başlar.
- Her 10.000 puanda yeni bir kızak.

| Düşman | Puan |
| --- | --- |
| Buz mayını | 30 |
| Devriye botu | 60 |
| Süzülen dron | 100 |
| Gözcü kulesi (2 isabet) | 150 |
| Kule mermisi | 20 |

## Çalıştırma

Dosyaları herhangi bir statik sunucudan aç:

```bash
python3 -m http.server 8765
```

Sonra tarayıcıda `http://localhost:8765`.

## Dosyalar

- `index.html`: sayfa ve stil
- `src/level.js`: etap tanımları ve tohumlu etap üreticisi (her etap her seferinde aynı çıkar)
- `src/game.js`: oyun döngüsü, çarpışmalar, çizim, arayüz
- `src/audio.js`: ses efektleri ve müzik (Web Audio)
- `tools/check-levels.js`: etapların geçilebilir olduğunu doğrular

```bash
node tools/check-levels.js
```

Etap zorluğunu değiştirmek için `src/level.js` içindeki `DEFS` tablosuna bak
(kanal genişliği, ada sayısı, düşman sıklığı ve türleri, kaynak aralığı, ısı kaybı).

Test için: adrese `?auto` eklenirse otomatik pilot oynar, `?god` eklenirse düşmanlar zarar vermez.
