/* Buzul Geçidi — bölüm (etap) üreticisi.
 * Her etap sabit bir tohumdan üretilir: aynı etap her seferinde aynıdır.
 * Hem tarayıcıda (window.Level) hem Node'da (require) çalışır.
 */
(function (root) {
  'use strict';

  var W = 360;          // mantıksal ekran genişliği
  var ROW = 8;          // bir arazi satırının dünya yüksekliği (px)
  var CP = 24;          // iki kontrol noktası arası satır sayısı
  var GATE_HALF = 58;   // fener kapısındaki kanalın yarı genişliği
  var MARGIN = 12;      // kıyının ekran kenarına en yakın olabileceği yer
  var MIN_PASS = 46;    // ada yanındaki geçitlerin en dar hali

  /* Etap tanımları.
   * cps: uzunluk (kontrol noktası sayısı), minHalf/maxHalf: kanal yarı genişliği,
   * shift: iki kontrol noktası arasında kanalın en fazla kayabileceği mesafe,
   * gap: düşmanlar arası mesafe aralığı, mix: düşman türü ağırlıkları,
   * ventGap: sıcak kaynaklar arası ortalama mesafe, drain: ısı kaybı çarpanı.
   */
  var DEFS = [
    { name: 'Sakin Körfez',   pal: 0, cps: 16, minHalf: 84,  maxHalf: 140, shift: 46,  islands: 0, gap: [300, 420], mix: { mine: 1 }, ventGap: 820, drain: 0.85 },
    { name: 'Çam Kıyısı',     pal: 0, cps: 18, minHalf: 72,  maxHalf: 138, shift: 58,  islands: 1, gap: [250, 360], mix: { mine: 3, boat: 2 }, ventGap: 900, drain: 0.95 },
    { name: 'İkiz Adalar',    pal: 0, cps: 20, minHalf: 66,  maxHalf: 150, shift: 66,  islands: 3, gap: [220, 330], mix: { mine: 3, boat: 3, skim: 1 }, ventGap: 950, drain: 1 },
    { name: 'Sisli Boğaz',    pal: 1, cps: 20, minHalf: 54,  maxHalf: 112, shift: 76,  islands: 1, gap: [200, 310], mix: { mine: 3, boat: 3, skim: 2, turret: 1 }, ventGap: 1000, drain: 1 },
    { name: 'Kırık Buzullar', pal: 1, cps: 22, minHalf: 58,  maxHalf: 150, shift: 70,  islands: 4, gap: [190, 290], mix: { mine: 4, boat: 3, skim: 2, turret: 1 }, ventGap: 1050, drain: 1.05 },
    { name: 'Kurt Geçidi',    pal: 1, cps: 20, minHalf: 44,  maxHalf: 88,  shift: 72,  islands: 0, gap: [200, 300], mix: { mine: 2, boat: 3, skim: 3 }, ventGap: 1050, drain: 1.05 },
    { name: 'Aurora Düzlüğü', pal: 2, cps: 22, minHalf: 104, maxHalf: 160, shift: 40,  islands: 3, gap: [130, 220], mix: { mine: 3, boat: 3, skim: 3, turret: 3 }, ventGap: 1100, drain: 1.1 },
    { name: 'Yılan Kanal',    pal: 2, cps: 22, minHalf: 46,  maxHalf: 78,  shift: 104, islands: 0, gap: [210, 310], mix: { mine: 3, boat: 2, skim: 2 }, ventGap: 1100, drain: 1.1 },
    { name: 'Fener Adaları',  pal: 2, cps: 24, minHalf: 62,  maxHalf: 156, shift: 70,  islands: 6, gap: [170, 260], mix: { mine: 3, boat: 4, skim: 2, turret: 2 }, ventGap: 1150, drain: 1.15 },
    { name: 'Fırtına Hattı',  pal: 3, cps: 22, minHalf: 70,  maxHalf: 140, shift: 80,  islands: 2, gap: [130, 210], mix: { mine: 1, boat: 2, skim: 6, turret: 1 }, ventGap: 1150, drain: 1.2 },
    { name: 'Dar Boğaz',      pal: 3, cps: 22, minHalf: 40,  maxHalf: 72,  shift: 88,  islands: 0, gap: [180, 270], mix: { mine: 4, boat: 2, skim: 2, turret: 2 }, ventGap: 1200, drain: 1.2 },
    { name: 'Kuzey Kapısı',   pal: 3, cps: 28, minHalf: 50,  maxHalf: 156, shift: 90,  islands: 5, gap: [130, 220], mix: { mine: 3, boat: 3, skim: 3, turret: 3 }, ventGap: 1200, drain: 1.25 }
  ];

  // Etapların tur içindeki başlangıç satırları
  var PREFIX = [0];
  for (var d = 0; d < DEFS.length; d++) PREFIX.push(PREFIX[d] + DEFS[d].cps * CP);
  var LOOP_ROWS = PREFIX[DEFS.length];

  function startRow(k) {
    var n = DEFS.length;
    return Math.floor(k / n) * LOOP_ROWS + PREFIX[k % n];
  }

  function sectionAtRow(g) {
    if (g < 0) return 0;
    var loop = Math.floor(g / LOOP_ROWS), rem = g - loop * LOOP_ROWS, i = 0;
    while (i < DEFS.length - 1 && rem >= PREFIX[i + 1]) i++;
    return loop * DEFS.length + i;
  }

  // mulberry32
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Yumuşak 1B gürültü: kıyı çizgisine doğal pürüz verir
  function noise(r, n) {
    var step = 5, m = Math.ceil(n / step) + 2, pts = [], out = new Float32Array(n), i;
    for (i = 0; i < m; i++) pts.push(r() * 2 - 1);
    for (i = 0; i < n; i++) {
      var t = i / step, a = Math.floor(t), f = t - a, s = f * f * (3 - 2 * f);
      out[i] = pts[a] + (pts[a + 1] - pts[a]) * s;
    }
    return out;
  }

  function generate(k) {
    var def = DEFS[k % DEFS.length];
    var loop = Math.floor(k / DEFS.length);
    var r = rng((k + 1) * 7919 + loop * 1013 + 12345);
    var nc = def.cps, N = nc * CP, i, j;
    var y0 = startRow(k) * ROW;
    var hard = 1 + 0.15 * loop;      // tur attıkça düşmanlar hızlanır

    // --- kontrol noktaları: yarı genişlik
    var h = [], c = [];
    for (i = 0; i <= nc; i++) {
      h[i] = (i <= 1 || i >= nc - 1) ? GATE_HALF : def.minHalf + r() * (def.maxHalf - def.minHalf);
    }

    // --- adalar: bulundukları yerde kanal genişler
    var isl = [], tries = 0;
    while (isl.length < def.islands && tries++ < 300) {
      j = 3 + Math.floor(r() * (nc - 6));          // 3 .. nc-4
      var ok = true;
      for (i = 0; i < isl.length; i++) if (Math.abs(isl[i].cp - j) < 3) ok = false;
      if (!ok) continue;
      isl.push({ cp: j, len: 22 + Math.floor(r() * 20), max: 16 + r() * 26, off: (r() * 2 - 1) * 22 });
      h[j] = Math.max(h[j], 122 + r() * 30);
      h[j - 1] = Math.max(h[j - 1], 92);
      h[j + 1] = Math.max(h[j + 1], 92);
    }

    // --- kontrol noktaları: kanal merkezi
    for (i = 0; i <= nc; i++) {
      if (i <= 1 || i >= nc - 1) { c[i] = W / 2; continue; }
      var lim = Math.max(0, W / 2 - MARGIN - 6 - h[i]);
      c[i] = clamp(W / 2 + (r() * 2 - 1) * lim, c[i - 1] - def.shift, c[i - 1] + def.shift);
    }
    for (var pass = 0; pass < 4; pass++) {
      for (i = nc - 2; i >= 2; i--) c[i] = clamp(c[i], c[i + 1] - def.shift, c[i + 1] + def.shift);
      for (i = 2; i <= nc - 2; i++) c[i] = clamp(c[i], c[i - 1] - def.shift, c[i - 1] + def.shift);
    }

    // --- satırlar
    var L = new Float32Array(N), R = new Float32Array(N);
    var IL = new Float32Array(N), IR = new Float32Array(N);
    var nl = noise(r, N), nr = noise(r, N);
    for (i = 0; i < N; i++) {
      var tt = i / CP, a = Math.floor(tt), f = tt - a, s = f * f * (3 - 2 * f);
      var cx = c[a] + (c[a + 1] - c[a]) * s;
      var hw = h[a] + (h[a + 1] - h[a]) * s;
      var env = Math.min(1, Math.min(i, N - 1 - i) / 30);   // kapı yakınında pürüz yok
      L[i] = Math.max(MARGIN - 4, cx - hw + nl[i] * 5 * env);
      R[i] = Math.min(W - MARGIN + 4, cx + hw + nr[i] * 5 * env);
    }

    for (j = 0; j < isl.length; j++) {
      var I = isl[j], start = I.cp * CP - (I.len >> 1);
      for (var u = 0; u < I.len; u++) {
        i = start + u;
        var shape = Math.pow(Math.sin(Math.PI * (u + 0.5) / I.len), 0.6) * I.max;
        var mid = (L[i] + R[i]) / 2 + I.off;
        var room = Math.min(mid - L[i], R[i] - mid) - MIN_PASS;
        var iw = Math.min(shape, room);
        if (iw >= 4) { IL[i] = mid - iw; IR[i] = mid + iw; }
      }
    }

    function rowOf(y) { return clamp(Math.round(y / ROW), 0, N - 1); }
    function segs(ri) {
      return IR[ri] > IL[ri] ? [[L[ri], IL[ri]], [IR[ri], R[ri]]] : [[L[ri], R[ri]]];
    }
    function inWater(x, y, m) {
      var sg = segs(rowOf(y));
      for (var q = 0; q < sg.length; q++) if (x >= sg[q][0] + m && x <= sg[q][1] - m) return true;
      return false;
    }

    // --- sıcak kaynaklar
    var vents = [], y = 460 + r() * 160, endY = N * ROW - 260;
    while (y < endY) {
      var placed = false;
      for (var a2 = 0; a2 < 10 && !placed; a2++) {
        var sg1 = segs(rowOf(y)), s1 = sg1[Math.floor(r() * sg1.length)];
        if (s1[1] - s1[0] < 44) continue;
        var vx = s1[0] + 20 + r() * (s1[1] - s1[0] - 40);
        if (inWater(vx, y - 40, 16) && inWater(vx, y, 16) && inWater(vx, y + 40, 16)) {
          vents.push({ x: vx, y: y0 + y, hw: 11, hl: 36 });
          placed = true;
        }
      }
      if (!placed) { y += 48; continue; }
      y += def.ventGap * (0.8 + r() * 0.4);
    }
    function nearVent(yy) {
      for (var q = 0; q < vents.length; q++) if (Math.abs(y0 + yy - vents[q].y) < 62) return true;
      return false;
    }

    // --- düşmanlar
    var spawns = [], types = Object.keys(def.mix), tot = 0;
    for (i = 0; i < types.length; i++) tot += def.mix[types[i]];
    var gscale = Math.pow(0.9, loop);
    y = (k === 0 ? 700 : 400) + r() * 100;
    endY = N * ROW - 200;
    while (y < endY) {
      var yy = y;
      if (nearVent(yy)) yy += 66;
      if (!nearVent(yy) && yy < endY) {
        var pick = r() * tot, type = types[0];
        for (i = 0; i < types.length; i++) { pick -= def.mix[types[i]]; if (pick < 0) { type = types[i]; break; } }
        var sg2 = segs(rowOf(yy)), s2 = sg2[Math.floor(r() * sg2.length)], wd = s2[1] - s2[0];
        if (type === 'turret' && wd < 104) type = 'mine';
        if (type === 'boat' && wd < 60) type = 'mine';
        var e = { type: type, y: y0 + yy };
        if (type === 'mine') {
          e.x = s2[0] + 13 + r() * (wd - 26);
        } else if (type === 'boat') {
          e.minX = s2[0] + 17; e.maxX = s2[1] - 17;
          e.x = e.minX + r() * (e.maxX - e.minX);
          e.vx = (r() < 0.5 ? -1 : 1) * (38 + r() * 34) * hard;
        } else if (type === 'skim') {
          var dir = r() < 0.5 ? -1 : 1;
          e.x = dir > 0 ? -26 : W + 26;
          e.vx = dir * (100 + r() * 55) * hard;
        } else {
          e.x = s2[0] + 40 + r() * (wd - 80);
        }
        spawns.push(e);
      }
      y += (def.gap[0] + r() * (def.gap[1] - def.gap[0])) * gscale;
    }

    // --- süsler: çamlar, kayalar, kulübeler (0: çam, 1: kaya, 2: kulübe)
    var deco = [], nd = Math.floor(N * 1.1);
    for (i = 0; i < nd; i++) {
      var ri = Math.floor(r() * N), side = r(), kr = r(), sc = 0.8 + r() * 0.5, dx, kind;
      kind = kr < 0.72 ? 0 : kr < 0.93 ? 1 : 2;
      if (side < 0.46) {
        if (L[ri] < 26) continue;
        dx = 5 + r() * (L[ri] - 17);
        if (kind === 2 && dx > L[ri] - 30) kind = 0;
      } else if (side < 0.92) {
        if (R[ri] > W - 26) continue;
        dx = R[ri] + 12 + r() * (W - R[ri] - 17);
        if (kind === 2 && dx < R[ri] + 30) kind = 0;
      } else {
        if (IR[ri] - IL[ri] < 26) continue;
        dx = IL[ri] + 9 + r() * (IR[ri] - IL[ri] - 18);
        kind = kr < 0.6 ? 0 : 1;
      }
      deco.push({ x: dx, y: y0 + ri * ROW, k: kind, s: sc });
    }
    deco.sort(function (p, q) { return q.y - p.y; });

    return {
      k: k, def: def, loop: loop, N: N, g0: startRow(k), y0: y0,
      L: L, R: R, IL: IL, IR: IR,
      vents: vents, spawns: spawns, deco: deco,
      gateY: y0 + (N - 8) * ROW
    };
  }

  var api = {
    W: W, ROW: ROW, CP: CP, GATE_HALF: GATE_HALF, MIN_PASS: MIN_PASS,
    DEFS: DEFS, LOOP_ROWS: LOOP_ROWS,
    startRow: startRow, sectionAtRow: sectionAtRow, generate: generate
  };

  root.Level = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
