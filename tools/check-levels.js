/* Etapların oynanabilir olduğunu doğrular: node tools/check-levels.js
 * İlk 3 turun (36 etap) her satırını kontrol eder.
 */
'use strict';
const LV = require('../src/level.js');
const { W, ROW, GATE_HALF } = LV;

let errors = 0;
const fail = (k, msg) => { errors++; console.log(`  HATA etap ${k + 1}: ${msg}`); };

console.log('etap  ad                uzunluk  enDar  enDarGeçit  maksEğim  kaynak  maksKaynakArası  düşman');
for (let k = 0; k < 36; k++) {
  const s = LV.generate(k), N = s.N;
  let minW = 1e9, minPass = 1e9, maxSlope = 0;
  for (let i = 0; i < N; i++) {
    const L = s.L[i], R = s.R[i];
    if (L < 6) fail(k, `satır ${i}: sol kıyı ekran dışında (${L.toFixed(1)})`);
    if (R > W - 6) fail(k, `satır ${i}: sağ kıyı ekran dışında (${R.toFixed(1)})`);
    minW = Math.min(minW, R - L);
    if (s.IR[i] > s.IL[i]) {
      minPass = Math.min(minPass, s.IL[i] - L, R - s.IR[i]);
    }
    if (i > 0) {
      const c0 = (s.L[i - 1] + s.R[i - 1]) / 2, c1 = (L + R) / 2;
      maxSlope = Math.max(maxSlope, Math.abs(c1 - c0) / ROW);
    }
  }
  if (minW < 64) fail(k, `kanal çok dar: ${minW.toFixed(1)}`);
  if (minPass < 38) fail(k, `ada geçidi çok dar: ${minPass.toFixed(1)}`);
  if (maxSlope > 1.15) fail(k, `kanal çok sert kıvrılıyor: ${maxSlope.toFixed(2)}`);

  // kapı bölgeleri düz ve ortada olmalı (etaplar birbirine pürüzsüz bağlanır)
  for (const i of [0, 1, N - 2, N - 1]) {
    if (Math.abs(s.L[i] - (W / 2 - GATE_HALF)) > 1.5 || Math.abs(s.R[i] - (W / 2 + GATE_HALF)) > 1.5) {
      fail(k, `kapı satırı ${i} düz değil`);
    }
  }

  const inWater = (x, y, m) => {
    const i = Math.max(0, Math.min(N - 1, Math.round((y - s.y0) / ROW)));
    if (x < s.L[i] + m || x > s.R[i] - m) return false;
    if (s.IR[i] > s.IL[i] && x > s.IL[i] - m && x < s.IR[i] + m) return false;
    return true;
  };

  // kaynaklar
  if (s.vents.length < 2) fail(k, `yetersiz kaynak: ${s.vents.length}`);
  let maxVentGap = s.vents.length ? s.vents[0].y - s.y0 : N * ROW;
  s.vents.forEach((v, i) => {
    if (!inWater(v.x, v.y, 12) || !inWater(v.x, v.y - 36, 10) || !inWater(v.x, v.y + 36, 10)) fail(k, `kaynak ${i} suda değil`);
    if (i > 0) maxVentGap = Math.max(maxVentGap, v.y - s.vents[i - 1].y);
  });
  if (s.vents.length) maxVentGap = Math.max(maxVentGap, s.y0 + N * ROW - s.vents[s.vents.length - 1].y);
  if (maxVentGap > 2400) fail(k, `kaynaklar arası çok uzun: ${maxVentGap.toFixed(0)}`);

  // düşmanlar
  const counts = {};
  s.spawns.forEach((e, i) => {
    counts[e.type] = (counts[e.type] || 0) + 1;
    if (e.type === 'mine' && !inWater(e.x, e.y, 8)) fail(k, `mayın ${i} suda değil`);
    if (e.type === 'ice' && !inWater(e.x, e.y, 2)) fail(k, `buz bloğu ${i} suda değil`);
    if (e.type === 'hunter' && !inWater(e.x, e.y, 10)) fail(k, `avcı ${i} suda değil`);
    if (e.type === 'turret' && !inWater(e.x, e.y, 14)) fail(k, `kule ${i} suda değil`);
    if (e.type === 'boat') {
      if (e.maxX - e.minX < 20) fail(k, `bot ${i} için alan dar`);
      if (!inWater(e.minX, e.y, 12) || !inWater(e.maxX, e.y, 12)) fail(k, `bot ${i} sınırları suda değil`);
    }
    if (e.y - s.y0 < 380) fail(k, `düşman ${i} etap başına çok yakın`);
  });
  // altınlar suda ve toplanabilir yerde olmalı
  let coinSum = 0;
  s.coins.forEach((c, i) => { coinSum += c.v; if (!inWater(c.x, c.y, 11)) fail(k, `altın ${i} suda değil`); });
  if (coinSum < 12) fail(k, `altın az: ${coinSum}`);
  counts['altın'] = coinSum;
  // süsler karada olmalı
  s.deco.forEach((dd, i) => { if (inWater(dd.x, dd.y, -6)) fail(k, `süs ${i} suyun içinde`); });

  const cs = Object.entries(counts).map(([t, n]) => `${t}:${n}`).join(' ');
  console.log(
    String(k + 1).padStart(4) + '  ' + s.def.name.padEnd(16) + '  ' + String(N * ROW).padStart(7) + '  ' +
    minW.toFixed(0).padStart(5) + '  ' + (minPass > 1e8 ? '-' : minPass.toFixed(0)).padStart(10) + '  ' +
    maxSlope.toFixed(2).padStart(8) + '  ' + String(s.vents.length).padStart(6) + '  ' +
    maxVentGap.toFixed(0).padStart(15) + '  ' + cs
  );
}
console.log(errors ? `\n${errors} HATA` : '\nTüm etaplar geçerli.');
process.exit(errors ? 1 : 0);
