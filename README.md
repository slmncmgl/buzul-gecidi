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
| C | altınla kaldığın etaptan devam |
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
- 12 etap bir tur. Her etapta akış biraz daha hızlanır ve yeni bir tehlike eklenir: buz bariyerleri
  (ateşle kırılır), peşine düşen avcılar, sisli etaplar (ileriyi göremezsin), rüzgârlı etaplar (kızağı yana iter).
  Tur bitince etaplar yeni bir düzenle, daha hızlı düşmanlarla baştan başlar.
- **Altın** topla. Altınların ve ulaştığın en uzak etap bu tarayıcıda saklanır (`localStorage`).
  Yolculuk bitince, ya da daha sonra başlık ekranından, altın harcayıp kaldığın etabın başından
  devam edebilirsin (C tuşu ya da düğme). Bedel etapla artar: 2. etap 30 altın, her etap +10.
  Devam edince puan sıfırlanır.
- Her 10.000 puanda yeni bir kızak.

| Düşman | Puan |
| --- | --- |
| Buz bloğu | 10 |
| Buz mayını | 30 |
| Devriye botu | 60 |
| Süzülen dron | 100 |
| Avcı | 120 |
| Gözcü kulesi (2 isabet) | 150 |
| Altın | 10 (büyük altın 50) |
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
(kanal genişliği, ada sayısı, düşman sıklığı ve türleri, kaynak aralığı, ısı kaybı, sis, rüzgâr).
Hız artışı ve devam bedeli `src/game.js` başındaki `speedMul` ve `contCost` satırlarında.

Test için: adrese `?auto` eklenirse otomatik pilot oynar, `?god` eklenirse düşmanlar zarar vermez.
