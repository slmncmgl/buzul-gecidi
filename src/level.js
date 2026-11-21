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
   * pal: günün saati (0 gündüz, 1 akşamüstü, 2 gece, 3 aurora gecesi, 4 şafak),
   * name2: tek sayılı sonraki turlarda kullanılan ad; rapids: hızlı akıntı bölgesi sayısı;
   * boss: etabın sonunda bekçi ve onun için geniş bir alan var;
   * cps: uzunluk (kontrol noktası sayısı), minHalf/maxHalf: kanal yarı genişliği,
   * shift: iki kontrol noktası arasında kanalın en fazla kayabileceği mesafe,
   * gap: düşmanlar arası mesafe aralığı, mix: düşman türü ağırlıkları,
   * form: düşmanın ikili gelme olasılığı, fog: sis yoğunluğu, wind: rüzgâr gücü (px/sn),
   * ventGap: sıcak kaynaklar arası ortalama mesafe, drain: ısı kaybı çarpanı.
   */
  var DEFS = [
    { name: 'Sakin Körfez',    name2: 'Durgun Koy',        pal: 0, cps: 12, minHalf: 78,  maxHalf: 135, shift: 50,  islands: 1, gap: [200, 300], form: 0.10, mix: { mine: 3, boat: 1 }, ventGap: 800, drain: 0.9 },
    { name: 'Çam Kıyısı',      name2: 'Ladin Sahili',      pal: 1, cps: 16, minHalf: 66,  maxHalf: 135, shift: 62,  islands: 2, gap: [170, 260], form: 0.20, mix: { mine: 3, boat: 3, skim: 1, ice: 1 }, ventGap: 900, drain: 1 },
    { name: 'İkiz Adalar',     name2: 'Kardeş Kayalar',    pal: 2, cps: 18, minHalf: 60,  maxHalf: 150, shift: 70,  islands: 4, gap: [150, 240], form: 0.25, mix: { mine: 3, boat: 3, skim: 2, turret: 1, ice: 1 }, ventGap: 950, drain: 1 },
    { name: 'Girdap Koyu',     name2: 'Burgaç Körfezi',    pal: 4, cps: 16, minHalf: 70,  maxHalf: 140, shift: 60,  islands: 2, gap: [160, 240], form: 0.20, mix: { whirl: 4, mine: 3, boat: 2, skim: 1 }, ventGap: 950, drain: 1 },
    { name: 'Sisli Boğaz',     name2: 'Puslu Geçit',       pal: 0, cps: 18, minHalf: 54,  maxHalf: 112, shift: 76,  islands: 2, gap: [150, 230], form: 0.25, mix: { mine: 3, boat: 3, skim: 2, turret: 1, hunter: 1 }, ventGap: 1000, drain: 1, fog: 0.9 },
    { name: 'Kırık Buzullar',  name2: 'Çatlak Buzul',      pal: 1, cps: 20, minHalf: 56,  maxHalf: 150, shift: 70,  islands: 5, gap: [140, 220], form: 0.30, mix: { ice: 4, mine: 3, boat: 2, skim: 2, turret: 1, hunter: 1 }, ventGap: 1050, drain: 1.05 },
    { name: 'Kurt Geçidi',     name2: 'Avcı Vadisi',       pal: 2, cps: 20, minHalf: 44,  maxHalf: 88,  shift: 74,  islands: 0, gap: [140, 220], form: 0.30, mix: { hunter: 4, boat: 2, skim: 2, mine: 2 }, ventGap: 1050, drain: 1.05 },
    { name: 'Işık Çitleri',    name2: 'Kızıl Bariyer',     pal: 3, cps: 18, minHalf: 60,  maxHalf: 120, shift: 60,  islands: 2, gap: [150, 230], form: 0.30, mix: { beam: 4, mine: 2, boat: 3, skim: 2, turret: 1 }, ventGap: 1050, drain: 1.05 },
    { name: 'Aurora Düzlüğü',  name2: 'Yeşil Ova',         pal: 3, cps: 20, minHalf: 100, maxHalf: 160, shift: 40,  islands: 4, gap: [100, 170], form: 0.35, mix: { turret: 4, boat: 3, skim: 3, mine: 2, hunter: 2 }, ventGap: 1100, drain: 1.1 },
    { name: 'Gözcünün Koyu',   name2: 'Gözcünün Pususu',   pal: 2, cps: 30, minHalf: 62,  maxHalf: 130, shift: 56,  islands: 1, gap: [130, 200], form: 0.30, mix: { mine: 3, boat: 2, skim: 2, turret: 1, hunter: 1, ice: 1 }, ventGap: 1000, drain: 1.1, boss: true },
    { name: 'Hızlı Akıntı',    name2: 'Çağlayan Hattı',    pal: 4, cps: 20, minHalf: 80,  maxHalf: 140, shift: 44,  islands: 1, gap: [150, 230], form: 0.30, mix: { mine: 3, ice: 2, skim: 2, boat: 2, hunter: 1 }, ventGap: 1100, drain: 1.1, rapids: 3 },
    { name: 'Yılan Kanal',     name2: 'Kıvrım Boğazı',     pal: 0, cps: 20, minHalf: 46,  maxHalf: 78,  shift: 104, islands: 0, gap: [150, 230], form: 0.30, mix: { mine: 3, boat: 2, skim: 2, ice: 2 }, ventGap: 1100, drain: 1.1 },
    { name: 'Fener Adaları',   name2: 'Işıklı Takımada',   pal: 1, cps: 22, minHalf: 62,  maxHalf: 156, shift: 70,  islands: 6, gap: [120, 200], form: 0.35, mix: { boat: 4, turret: 3, mine: 2, skim: 2, hunter: 2, ice: 1 }, ventGap: 1150, drain: 1.15 },
    { name: 'Fırtına Hattı',   name2: 'Tipi Koridoru',     pal: 2, cps: 20, minHalf: 70,  maxHalf: 140, shift: 80,  islands: 2, gap: [110, 180], form: 0.40, mix: { skim: 6, boat: 2, hunter: 2, mine: 1, turret: 1 }, ventGap: 1150, drain: 1.2, wind: 60 },
    { name: 'Kör Gece',        name2: 'Zifiri Geçit',      pal: 2, cps: 20, minHalf: 58,  maxHalf: 110, shift: 70,  islands: 2, gap: [130, 200], form: 0.35, mix: { hunter: 4, mine: 3, boat: 2, turret: 2, whirl: 1 }, ventGap: 1150, drain: 1.15, fog: 0.7 },
    { name: 'Dar Boğaz',       name2: 'Sıkışık Kanal',     pal: 4, cps: 20, minHalf: 40,  maxHalf: 72,  shift: 88,  islands: 0, gap: [140, 210], form: 0.35, mix: { mine: 4, ice: 3, turret: 2, boat: 2, skim: 2, hunter: 1 }, ventGap: 1200, drain: 1.2 },
    { name: 'Buz Labirenti',   name2: 'Kristal Dehliz',    pal: 0, cps: 22, minHalf: 60,  maxHalf: 156, shift: 70,  islands: 7, gap: [110, 180], form: 0.35, mix: { ice: 4, beam: 2, whirl: 2, mine: 2, boat: 2, turret: 2, hunter: 1 }, ventGap: 1150, drain: 1.2 },
    { name: 'Kuzey Kapısı',    name2: 'Son Boğaz',         pal: 1, cps: 24, minHalf: 50,  maxHalf: 156, shift: 90,  islands: 5, gap: [95, 170],  form: 0.45, mix: { mine: 3, boat: 3, skim: 3, turret: 3, hunter: 2, ice: 2, beam: 1 }, ventGap: 1200, drain: 1.25, wind: 40 },
    { name: 'Pusu Koyu',       name2: 'Tuzak Körfezi',     pal: 3, cps: 22, minHalf: 54,  maxHalf: 140, shift: 80,  islands: 4, gap: [100, 170], form: 0.45, mix: { hunter: 3, turret: 3, whirl: 2, beam: 2, mine: 2, skim: 2, boat: 2 }, ventGap: 1200, drain: 1.25 },
    { name: 'Bekçinin Kapısı', name2: 'Bekçinin Dönüşü',   pal: 2, cps: 32, minHalf: 60,  maxHalf: 130, shift: 60,  islands: 1, gap: [110, 180], form: 0.40, mix: { mine: 3, boat: 2, skim: 2, turret: 2, hunter: 2, ice: 2, beam: 1 }, ventGap: 1000, drain: 1.2, boss: true }
  ];

  var NS = DEFS.length, LOOP_ROWS = 0, ARENA = 22;
  for (var d = 0; d < NS; d++) LOOP_ROWS += DEFS[d].cps * CP;

  // Tur planı: ilk tur tablo sırasıyla oynanır. Sonraki turlarda etapların sırası karışır
  // (ilk etap ve bekçi yerinde kalır), adları, günün saati ve sis/rüzgâr dağılımı değişir.
  var planCache = {};
  function loopPlan(loop) {
    if (planCache[loop]) return planCache[loop];
    var order = [], i;
    for (i = 0; i < NS; i++) order.push(i);
    if (loop > 0) {
      var r = rng(9173 + loop * 131);
      // bekçi etapları (her 10. etap) ve ilk etap yerinde kalır; aradaki etaplar kendi yarısında karışır
      var lo = 1;
      for (var b = 0; b < NS; b++) if (DEFS[b].boss) {
        for (i = b - 1; i > lo; i--) { var j = lo + Math.floor(r() * (i - lo + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
        lo = b + 1;
      }
    }
    var prefix = [0];
    for (i = 0; i < NS; i++) prefix.push(prefix[i] + DEFS[order[i]].cps * CP);
    return (planCache[loop] = { order: order, prefix: prefix });
  }

  function info(k) {
    if (k < 0) k = 0;
    var loop = Math.floor(k / NS), i = k % NS, def = DEFS[loopPlan(loop).order[i]];
    var mod = loop ? DEFS[(loopPlan(loop).order[i] + 7 * loop) % NS] : def;
    return {
      def: def, loop: loop, index: i,
      name: loop % 2 ? def.name2 : def.name,
      pal: (def.pal + 2 * loop) % 5,
      fog: def.boss ? 0 : (mod.fog || 0),
      wind: mod.wind || 0,
      boss: !!def.boss
    };
  }

  function startRow(k) {
    var loop = Math.floor(k / NS);
    return loop * LOOP_ROWS + loopPlan(loop).prefix[k % NS];
  }

  function sectionAtRow(g) {
    if (g < 0) return 0;
    var loop = Math.floor(g / LOOP_ROWS), rem = g - loop * LOOP_ROWS, pf = loopPlan(loop).prefix, i = 0;
    while (i < NS - 1 && rem >= pf[i + 1]) i++;
    return loop * NS + i;
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
    var inf = info(k), def = inf.def, loop = inf.loop;
    var arena = def.boss ? ARENA : 0;      // bekçi alanı: etabın sonundaki geniş, düz kısım
    var r = rng((k + 1) * 7919 + loop * 1013 + 12345);
    var nc = def.cps, N = nc * CP, i, j;
    var y0 = startRow(k) * ROW;
    var hard = 1 + 0.15 * loop;      // tur attıkça düşmanlar hızlanır

    // --- kontrol noktaları: yarı genişlik
    var h = [], c = [];
    for (i = 0; i <= nc; i++) {
      h[i] = (i <= 1 || i >= nc - 1) ? GATE_HALF
        : (arena && i >= nc - 1 - arena) ? 112 + r() * 14
        : def.minHalf + r() * (def.maxHalf - def.minHalf);
    }

    // --- adalar: bulundukları yerde kanal genişler
    var isl = [], tries = 0;
    while (isl.length < def.islands && tries++ < 300) {
      j = 3 + Math.floor(r() * (nc - 6 - arena));  // 3 .. nc-4 (bekçi alanında ada yok)
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
      if (arena && i >= nc - 1 - arena) lim = Math.min(lim, 24);
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
    var mix = {}, mk;
    for (mk in def.mix) mix[mk] = def.mix[mk];
    if (loop > 0) {                       // sonraki turlarda her etaba yeni tehlikeler karışır
      mix.hunter = (mix.hunter || 0) + 1; mix.ice = (mix.ice || 0) + 1;
      mix.whirl = (mix.whirl || 0) + 1; mix.beam = (mix.beam || 0) + 1;
    }
    var spawns = [], types = Object.keys(mix), tot = 0;
    for (i = 0; i < types.length; i++) tot += mix[types[i]];
    var gscale = Math.pow(0.9, loop);

    function addEnemy(type, yy) {
      var sg2 = segs(rowOf(yy)), s2 = sg2[Math.floor(r() * sg2.length)], wd = s2[1] - s2[0];
      if (type === 'turret' && wd < 104) type = 'mine';
      if (type === 'boat' && wd < 60) type = 'mine';
      if (type === 'whirl' && wd < 100) type = 'mine';
      if (type === 'beam') {
        // ışık çiti: geçidi kapatan, aralıklarla sönen ışın
        spawns.push({ type: 'beam', x: (s2[0] + s2[1]) / 2, y: y0 + yy, minX: s2[0] + 3, maxX: s2[1] - 3,
          period: (2.2 + r() * 0.6) / Math.sqrt(hard), ph: r() * 3 });
        return;
      }
      if (type === 'ice') {
        // buz bariyeri: geçidi boydan boya kapatan, ateşle kırılan bloklar
        var cnt = Math.floor((wd - 6) / 20), x0 = s2[0] + (wd - (cnt - 1) * 20) / 2;
        for (var b = 0; b < cnt; b++) spawns.push({ type: 'ice', x: x0 + b * 20, y: y0 + yy });
        return;
      }
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
      } else if (type === 'hunter') {
        e.x = s2[0] + 16 + r() * (wd - 32);
      } else if (type === 'whirl') {
        e.x = s2[0] + 46 + r() * (wd - 92); e.r = 44;
      } else {
        e.x = s2[0] + 40 + r() * (wd - 80);
      }
      spawns.push(e);
    }

    y = 400 + r() * 100;
    endY = (N - arena * CP) * ROW - 200;
    while (y < endY) {
      var yy = y;
      if (nearVent(yy)) yy += 66;
      if (!nearVent(yy) && yy < endY) {
        var pick = r() * tot, type = types[0];
        for (i = 0; i < types.length; i++) { pick -= mix[types[i]]; if (pick < 0) { type = types[i]; break; } }
        var twin = type !== 'ice' && type !== 'turret' && type !== 'beam' && type !== 'whirl' && r() < def.form;
        addEnemy(type, yy);
        if (twin) addEnemy(type, yy + 34);
      }
      y += (def.gap[0] + r() * (def.gap[1] - def.gap[0])) * gscale;
    }

    if (def.boss) spawns.push({ type: 'boss', x: W / 2, y: y0 + (N - arena * CP) * ROW + 380 });

    // --- hızlı akıntı bölgeleri: içindeyken yavaşlanamaz
    var rapids = [], q2, at, ry, okr;
    for (q2 = 0; q2 < (def.rapids || 0); q2++) {
      for (at = 0; at < 14; at++) {
        ry = 500 + r() * (N * ROW - 1500); okr = true;
        for (i = 0; i < vents.length; i++) if (vents[i].y - y0 > ry - 90 && vents[i].y - y0 < ry + 570) okr = false;
        for (i = 0; i < rapids.length; i++) if (Math.abs(rapids[i].y0 - y0 - ry) < 800) okr = false;
        if (okr) { rapids.push({ y0: y0 + ry, y1: y0 + ry + 480 }); break; }
      }
    }

    // --- altınlar: düz ya da çapraz diziler, arada kıyıya yakın büyük altın (5 değerinde)
    var coins = [];
    y = 240 + r() * 120;
    endY = N * ROW - 130;
    while (y < endY) {
      var sg3 = segs(rowOf(y)), s3 = sg3[Math.floor(r() * sg3.length)], wd3 = s3[1] - s3[0], kindc = r(), q;
      if (kindc < 0.2) {
        var bx = r() < 0.5 ? s3[0] + 18 : s3[1] - 18;
        if (inWater(bx, y - 12, 13) && inWater(bx, y, 13) && inWater(bx, y + 12, 13)) coins.push({ x: bx, y: y0 + y, v: 5 });
      } else {
        var cx0 = s3[0] + 16 + r() * (wd3 - 32), slope = kindc < 0.6 ? 0 : (r() * 2 - 1) * 0.75, nco = 4 + Math.floor(r() * 3);
        for (q = 0; q < nco; q++) {
          var cxq = cx0 + slope * q * 22, cyq = y + q * 22;
          if (cyq < endY + 60 && inWater(cxq, cyq, 13)) coins.push({ x: cxq, y: y0 + cyq, v: 1 });
        }
        y += nco * 22;
      }
      y += 250 + r() * 210;
    }

    // --- süsler: çamlar, kayalar, kulübeler (0: çam, 1: kaya, 2: kulübe)
    var deco = [], nd = Math.floor(N * 1.5);
    for (i = 0; i < nd; i++) {
      var ri = Math.floor(r() * N), side = r(), kr = r(), sc = 0.8 + r() * 0.5, dx, kind;
      kind = kr < 0.72 ? 0 : kr < 0.93 ? 1 : 2;
      if (side < 0.46) {
        if (L[ri] < 26) continue;
        dx = 5 + r() * (L[ri] - 17);
        if (kind === 2 && dx > L[ri] - 34) kind = 0;
      } else if (side < 0.92) {
        if (R[ri] > W - 26) continue;
        dx = R[ri] + 12 + r() * (W - R[ri] - 17);
        if (kind === 2 && dx < R[ri] + 34) kind = 0;
      } else {
        if (IR[ri] - IL[ri] < 26) continue;
        dx = IL[ri] + 9 + r() * (IR[ri] - IL[ri] - 18);
        kind = kr < 0.6 ? 0 : 1;
      }
      deco.push({ x: dx, y: y0 + ri * ROW, k: kind, s: sc });
    }
    deco.sort(function (p, q) { return q.y - p.y; });

    return {
      k: k, def: def, info: inf, loop: loop, N: N, g0: startRow(k), y0: y0,
      L: L, R: R, IL: IL, IR: IR,
      vents: vents, spawns: spawns, coins: coins, deco: deco, rapids: rapids,
      arenaEnd: y0 + (N - 8) * ROW - 320,
      gateY: y0 + (N - 8) * ROW
    };
  }

  var api = {
    W: W, ROW: ROW, CP: CP, GATE_HALF: GATE_HALF, MIN_PASS: MIN_PASS,
    DEFS: DEFS, LOOP_ROWS: LOOP_ROWS,
    startRow: startRow, sectionAtRow: sectionAtRow, generate: generate, info: info
  };

  root.Level = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
