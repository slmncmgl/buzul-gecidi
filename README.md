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
| Boşluk (J / Z), fare tıkı | ateş; basılı tutunca şarj olur, bırakınca yaylım atışı |
| C | altınla kaldığın etaptan devam |
| P / Esc | duraklat |
| M | ses aç / kapat |

Oyun koluyla (Xbox dizilimi; PlayStation ve benzerleri aynı yerdeki tuşlarla): sol çubuk ya da yön tuşları yön ve
hız, RT / LT hızlan / yavaşla, A ateş (basılı tut: yaylım), X, B ya da RB nükleer, Y altınla devam, Start başlat /
duraklat, Back ses. Çarpınca ve nükleerde kol titrer. Kolu oynatınca fare devreden çıkar, tıklayınca geri gelir.

Fareyle: oyunu tıklayarak başlat. Farenin o andaki konumu sıfır noktası olur; sağa / sola götürürsen
kızak o yöne gider, ileri itersen hızlanır, geri çekersen yavaşlar, sıfır noktası civarında seyir hızında
kalır. Tık ateş eder; basılı tutunca yaylım atışı şarj olur (yaylım kapalıyken basılı tutmak seri ateş eder). Oyun sırasında imleç gizlenir; Esc imleci geri getirir ve
oyunu duraklatır, tıklayınca devam eder. Klavyeyle oynarken de herhangi bir anda tıklayıp fareye geçebilirsin.

Hareket hassasiyeti (fare, klavye ve oyun kolu için ortak): klavyedeki 1 – 9 tuşlarıyla seçilir (1 en düşük ve varsayılan, 9 en yüksek), oyun sırasında
da duraklatılmışken de. Duraklatma ekranındaki − / + düğmeleri ve ← / → de kademe değiştirir. Ayar tarayıcıda saklanır.

Telefonda: parmağını sürükle (yön), yukarı / aşağı kaydır (hız); tekli ateş hep otomatiktir. Sağ alttaki YAYLIM
düğmesine dokununca yaylım hemen gider, basılı tutunca şarj olur ve bırakınca atılır; sol alttaki NÜKLEER düğmesi
ekranı temizler. Düğmelerin çevresindeki halka bekleme süresini gösterir.

- **Isı** sürekli azalır. **Sıcak kaynakların** üstünden geçince dolar; ne kadar yavaş geçersen o kadar çok.
- **Yaylım atışı:** ateşi basılı tut, kızağın çevresindeki halka dolsun, bırak. Şarja göre 5–11 fişek yelpaze
  şeklinde çıkar; tam şarjda fişekler çift hasar verir. Kullandıktan sonra 10 sn kapanır (alttaki YAYLIM çubuğu
  dolunca yeniden hazır). Kapalıyken basılı tutmak eskisi gibi seri tekli atış yapar.
- **Nükleer patlama:** X tuşu ya da sağ tık (telefonda ekrandaki NÜKLEER düğmesi). Ekrandaki düşmanları ve mermileri siler,
  bekçiye 8 hasar verir; girdap ve ışık çiti kalır. Oyun başında hazırdır, kullanınca 60 sn bekler; bekleme can
  kaybedince sıfırlanmaz.
- **Silah güçlendirmesi:** vurduğun düşmanlardan %20 şansla turuncu bir güçlendirme düşer; her biri silahı +%25
  güçlendirir, en fazla +%250. Atış hızlanır; +%50'de çift, +%100'de üçlü, +%200'de dörtlü atış; +%125'te çift,
  +%250'de üç kat hasar. Yaylım daha çok fişek atar ve daha çabuk dolar, +%125'te çift, +%250'de üçlü gider;
  nükleer daha çabuk dolar. Güç, yolculuk bitince sıfırlanır.
- **Kalkan:** silah tam güce (+%250) ulaşınca güçlendirmelerin yerine mavi kalkan düşer (en çok 2). Bir düşman
  çarpmasını, mermiyi ya da ışık çitini emer; kıyıya çarpmayı ve girdabı emmez.
- **Kanat yardımcıları:** vurduğun düşmanlardan %5 şansla yeşil bir kutu düşer. İki yanında uçan yardımcılar
  ekrandaki en yakın düşmanlara güdümlü misil atar; can kaybedince giderler.
- Kıyıya, adalara ve düşmanlara çarpma.
- Her etabın sonundaki **fener** kayıt noktasıdır: can kaybedince oradan devam edersin, kalan ısın kadar bonus alırsın.
- 20 etap bir tur. Her etapta akış biraz daha hızlanır ve etapların kendi tehlikesi vardır: buz bariyerleri
  (ateşle kırılır), peşine düşen avcılar, girdaplar (içine çeker), ışık çitleri (sönünce geçilir), hızlı akıntı
  (yavaşlanamaz), sisli ve rüzgârlı etaplar.
- **Bekçi:** her 10. etabın sonunda geniş bir alanda karşına çıkar; ateş eder, avcı salar. Geçilen her 10 etapta
  bir kademe zorlaşır: düşmanlar sıklaşır ve ikili, üçlü gruplar halinde gelir, etaplara yeni türler karışır, kuleler
  ikili ve üçlü yaylım atar, botlar da ateş etmeye başlar, bekçinin canı artar. İndirirsen 2500 puan
  ve önüne saçılan altınlar senin. Alan bitene kadar indiremezsen kaçar; yol yine açılır.
- **Turlar birbirinin aynısı değil:** tur bitince etapların sırası karışır, adları ve günün saati değişir, sis ve
  rüzgâr başka etaplara geçer, her etaba avcı, buz bariyeri, girdap ve ışık çiti de eklenir; düşmanlar hızlanır.
- **Gece ve gündüz:** etaplar gündüz, akşamüstü, gece ve şafak diye döner. Gece uzaklar kararır; kızağın farı,
  sıcak kaynaklar, fenerler, altınlar ve düşmanların ışıkları karanlıkta seçilir.
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
| Bekçi | 2500 |
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
