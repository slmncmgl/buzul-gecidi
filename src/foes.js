/* Buzul Geçidi: 50. aşamadan sonraki düşmanlar ve 60-100 bekçileri.
   window.FOES.drawEnemy(ctx, e, x, y, t) · window.FOES.drawBoss(ctx, e, x, y, t)
   Tarz game.js ile aynı: degrade dolgu, koyu kontur, 'lighter' ile radyal parıltı, shadowBlur yok. */
(function () {
  'use strict';
  const TAU = Math.PI * 2, PI = Math.PI;
  const OUT = 'rgba(5,10,20,0.85)';
  let c = null;      // o anki çizim bağlamı
  let U = 0, LG = 0;      // bekçi özel saldırı şarjı (e.ulti 0..1) ve hamle (e.lunge 0..1); drawBoss her çağrıda ayarlar

  // ---------- yardımcılar ----------
  function A(a) { return (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3); }
  function rgba(r, g, b, a) { return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + A(a) + ')'; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function glow(x, y, r, col, a) {
    if (!(r > 0.2) || !(a > 0.004)) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + col + ',' + A(a) + ')');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function add() { c.save(); c.globalCompositeOperation = 'lighter'; }
  function end() { c.restore(); }
  function path(p) { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }
  function line(p) { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); }
  function ell(x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx > 0.1 ? rx : 0.1, ry > 0.1 ? ry : 0.1, rot || 0, 0, TAU); }
  function lin(x0, y0, x1, y1, c0, c1, c2) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c0);
    if (c2) { g.addColorStop(0.5, c1); g.addColorStop(1, c2); } else g.addColorStop(1, c1);
    return g;
  }
  function rad(x, y, r, c0, c1, c2) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
    g.addColorStop(0, c0);
    if (c2) { g.addColorStop(0.55, c1); g.addColorStop(1, c2); } else g.addColorStop(1, c1);
    return g;
  }
  // degrade dolgulu çokgen + kontur (line === 0: kontursuz)
  function shape(p, x0, y0, x1, y1, c0, c1, fl, ln, lw) {
    path(p);
    c.fillStyle = fl ? '#ffffff' : lin(x0, y0, x1, y1, c0, c1); c.fill();
    if (ln !== 0) { c.strokeStyle = ln || OUT; c.lineWidth = lw || 1.6; c.lineJoin = 'round'; c.stroke(); }
  }
  // parlayan çekirdek (bekçinin zayıf noktası); can azalınca kırmızı ve hızlı nabız
  function core(x, y, r, hpf, hue, t) {
    const col = hpf > 0.4 ? hue : '255,70,50', pul = 0.5 + 0.5 * Math.sin(t * (hpf > 0.4 ? 5 : 13) + U * t * 10);
    r *= 1 + U * (0.35 + 0.15 * pul);
    add(); glow(x, y, r * 3.2 + U * 14, col, 0.45 + 0.3 * pul + U * 0.25); if (U > 0) glow(x, y, r * 1.4, '255,255,255', U * (0.15 + 0.2 * pul)); end();
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(U > 0.5 ? 0.6 : 0.35, 'rgb(' + col + ')'); g.addColorStop(1, 'rgba(' + col + ',0.2)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(5,10,20,0.9)'; c.lineWidth = 1.5; c.stroke();
    if (U > 0.05) {      // şarj: çekirdek etrafında daralan enerji halkası
      add(); c.strokeStyle = rgba(255, 255, 255, U * (0.35 + 0.4 * pul)); c.lineWidth = 1.2;
      c.beginPath(); c.arc(x, y, r + 3 + (1 - pul) * 5, 0, TAU); c.stroke(); end();
    }
  }
  function eye(x, y, r, col, gm) {
    add(); glow(x, y, r * (gm || 3) * (1 + U * 0.8), col, 0.7 + U * 0.3); end();
    c.fillStyle = 'rgb(' + col + ')'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * (0.4 + U * 0.3), 0, TAU); c.fill();
  }
  // özel saldırı şarjı: çekirdeğe akan kıvılcımlar, daralan halkalar, ışık direği (U = e.ulti)
  function charge(x, y, cx, cy, t, hue) {
    if (U <= 0.01) return;
    const pul = 0.5 + 0.5 * Math.sin(t * 11);
    add();
    glow(cx, cy, 34 + 56 * U, hue, U * (0.16 + 0.1 * pul));
    const N = 16;
    c.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const p = (t * 1.5 + i * 0.3137) % 1, r = (1 - p) * 82 * (0.6 + 0.4 * U), a = i * 2.399 + t * 2.2 + p * 3.5;
      const px = cx + Math.cos(a) * r * 1.15, py = cy + Math.sin(a) * r * 0.62, al = U * (0.25 + 0.75 * p);
      const dx = cx - px, dy = cy - py, d = Math.hypot(dx, dy) || 1, L = 5 + p * 6;
      c.strokeStyle = 'rgba(' + hue + ',' + A(al) + ')'; c.lineWidth = 1 + p * 1.4;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + dx / d * L, py + dy / d * L); c.stroke();
      c.fillStyle = rgba(255, 255, 255, al); c.beginPath(); c.arc(px, py, 0.8 + p * 1.3, 0, TAU); c.fill();
    }
    for (let k = 0; k < 3; k++) {
      const p = (t * 1.1 + k / 3) % 1, r = 8 + (1 - p) * 68 * U;
      c.strokeStyle = 'rgba(' + hue + ',' + A(U * (1 - p) * 0.5) + ')'; c.lineWidth = 1.5;
      ell(cx, cy, r * 1.15, r * 0.62); c.stroke();
    }
    if (U > 0.6) {      // tam şarj: dikey ışık direği + beyaz parlama
      const k = (U - 0.6) / 0.4, g = c.createLinearGradient(0, cy - 70, 0, cy + 30);
      g.addColorStop(0, 'rgba(' + hue + ',0)'); g.addColorStop(0.55, 'rgba(255,255,255,' + A(k * 0.28) + ')'); g.addColorStop(1, 'rgba(' + hue + ',0)');
      c.fillStyle = g; c.fillRect(cx - 2 - k * 2.5, cy - 70, 4 + k * 5, 100);
      glow(cx, cy, 16, '255,255,255', k * (0.15 + 0.2 * pul));
    }
    end();
  }
  // kalın gövde: koyu dış kontur + degrade boru + üstte ince parlama
  function tube(p, r, fill, fl, hiA) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    line(p); c.strokeStyle = OUT; c.lineWidth = r * 2 + 3; c.stroke();
    c.strokeStyle = fl ? '#ffffff' : fill; c.lineWidth = r * 2; c.stroke();
    if (hiA) {
      c.save(); c.translate(-r * 0.3, -r * 0.38);
      line(p); c.strokeStyle = 'rgba(255,255,255,' + A(hiA) + ')'; c.lineWidth = r * 0.55; c.stroke();
      c.restore();
    }
  }

  // =====================================================================
  //  DÜŞMANLAR
  // =====================================================================

  // BUZ EŞEKARISI: kristal göğüs, çizgili karın, aşağı bakan iğne, vızıldayan 4 kanat
  function wasp(e, x, y, t, fl) {
    const ph = e.ph || 0;
    x += Math.sin(t * 3.7 + ph * 2) * 0.8; y += Math.sin(t * 6 + ph) * 1.2;
    c.fillStyle = 'rgba(0,0,0,0.2)'; ell(x + 5, y + 11, 7, 3.5); c.fill();
    // bacaklar
    c.strokeStyle = 'rgba(10,15,25,0.9)'; c.lineWidth = 1; c.lineCap = 'round'; c.beginPath();
    for (let s = -1; s <= 1; s += 2) for (let q = 0; q < 3; q++) {
      const ly = y - 3 + q * 1.8, k = Math.sin(t * 9 + q + ph) * 0.6;
      c.moveTo(x + s * 2.5, ly); c.lineTo(x + s * 5.5, ly + 1 + q * 0.6 + k); c.lineTo(x + s * 6.6, ly + 3.2 + q * 0.8);
    }
    c.stroke();
    // karın: buz mavisi taban, kehribar şeritler
    const ax = x, ay = y + 3.8;
    ell(ax, ay, 4.8, 5.6); c.fillStyle = fl ? '#ffffff' : lin(ax - 5, 0, ax + 5, 0, '#e4f7ff', '#7cc6ea', '#2f78a8'); c.fill();
    if (!fl) {
      c.save(); ell(ax, ay, 4.8, 5.6); c.clip();
      c.fillStyle = lin(ax - 5, 0, ax + 5, 0, '#ffe08a', '#f0a020', '#9a4e06');
      for (let q = 0; q < 3; q++) c.fillRect(ax - 6, ay - 3.4 + q * 3, 12, 1.5);
      c.fillStyle = 'rgba(255,255,255,0.4)'; ell(ax - 1.7, ay - 1.6, 1.3, 3.2, 0.2); c.fill();
      c.restore();
    }
    ell(ax, ay, 4.8, 5.6); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
    // iğne (oyuncuya doğru)
    shape([ax - 1.7, ay + 4.8, ax + 1.7, ay + 4.8, ax, ay + 10.8], ax - 2, 0, ax + 2, 0, '#7d8ea4', '#10161e', fl, OUT, 1);
    add(); glow(ax, ay + 10.5, 4.5, '255,190,80', 0.4 + 0.3 * Math.sin(t * 10 + ph)); end();
    // kristal göğüs
    shape([x, y - 5.4, x + 3.9, y - 3.4, x + 3.6, y + 0.4, x, y + 2, x - 3.6, y + 0.4, x - 3.9, y - 3.4], x - 4, y - 5, x + 4, y + 2, '#f2fbff', '#3f97cc', fl, OUT, 1.3);
    shape([x, y - 5.4, x + 3.9, y - 3.4, x, y - 1.5, x - 3.9, y - 3.4], x - 4, y - 5, x + 3, y - 2, '#ffffff', '#b4e8ff', fl, 0);
    // baş, antenler, bileşik gözler
    shape([x, y - 10, x + 3.3, y - 7.6, x + 2.4, y - 5, x - 2.4, y - 5, x - 3.3, y - 7.6], x, y - 10, x, y - 5, '#41536a', '#0e151e', fl, OUT, 1.1);
    c.strokeStyle = '#1a2230'; c.lineWidth = 0.9; c.beginPath();
    c.moveTo(x - 1, y - 9.6); c.quadraticCurveTo(x - 2.4, y - 13, x - 4.6, y - 13.2);
    c.moveTo(x + 1, y - 9.6); c.quadraticCurveTo(x + 2.4, y - 13, x + 4.6, y - 13.2);
    c.stroke();
    eye(x - 1.9, y - 7.6, 1.25, '255,170,40'); eye(x + 1.9, y - 7.6, 1.25, '255,170,40');
    // kanatlar: hızlı çırpma, yarı saydam
    const fq = t * 58 + ph;
    c.lineWidth = 0.8;
    for (let k = 0; k < 2; k++) for (let s = -1; s <= 1; s += 2) {
      const sw = Math.sin(fq + k * 1.3 + (s > 0 ? 0 : 0.4)), a0 = (k ? 0.42 : -0.32) + sw * 0.3, a = s > 0 ? a0 : PI - a0;
      const len = (k ? 7 : 10.5) * (0.72 + 0.28 * Math.abs(Math.cos(fq + k * 1.3))), bx = x + s * 2.4, by = y - 2.8 + k * 1.9;
      const ca = Math.cos(a), sa = Math.sin(a);
      ell(bx + ca * len * 0.5, by + sa * len * 0.5, len * 0.5, k ? 2.3 : 2.9, a);
      c.fillStyle = fl ? 'rgba(255,255,255,0.85)' : 'rgba(190,235,255,0.32)'; c.fill();
      c.strokeStyle = 'rgba(30,70,110,0.55)'; c.stroke();
      c.strokeStyle = 'rgba(235,250,255,0.65)'; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + ca * len * 0.9, by + sa * len * 0.9); c.stroke();
    }
    add(); const sh = 0.12 + 0.08 * Math.sin(fq * 0.5); glow(x - 7, y - 2, 7, '170,230,255', sh); glow(x + 7, y - 2, 7, '170,230,255', sh); end();
  }

  // DENİZALTI: burun aşağıda; e.sub 0 su üstü (köpük halkası), 1 tamamen dalmış (soluk, mavi, sadece halkalar)
  function sub(e, x, y, t, fl) {
    const ph = e.ph || 0, sb = clamp(e.sub || 0, 0, 1), ch = clamp(e.charge || 0, 0, 1), vis = 1 - sb;
    // su halkaları
    c.lineWidth = 1;
    for (let q = 0; q < 2; q++) {
      const p = (t * 0.6 + q * 0.5 + ph * 0.16) % 1;
      c.strokeStyle = rgba(215, 240, 255, (1 - p) * (0.12 + 0.4 * sb));
      ell(x, y, 8 + p * 12, 13 + p * 9); c.stroke();
    }
    // su üstündeyse: gölge + köpük halkası
    if (vis > 0.05) {
      c.fillStyle = rgba(0, 0, 0, 0.25 * vis); ell(x + 3, y + 4, 8, 13); c.fill();
      c.strokeStyle = rgba(240, 250, 255, 0.55 * vis); c.lineWidth = 1.4;
      ell(x, y + 0.5, 9.5 + Math.sin(t * 5 + ph) * 0.6, 15.5); c.stroke();
      c.fillStyle = rgba(245, 252, 255, 0.75 * vis); c.beginPath();
      for (let q = 0; q < 12; q++) {
        const a = q * 0.5236 + t * 0.7 + ph, j = 1 + 0.18 * Math.sin(t * 9 + q * 2.1), r = 0.9 + (q % 3) * 0.35;
        const px = x + Math.cos(a) * 11.5 * j, py = y + Math.sin(a) * 17.5 * j;
        c.moveTo(px + r, py); c.arc(px, py, r, 0, TAU);
      }
      c.fill();
    }
    c.save(); c.globalAlpha = 0.2 + 0.8 * vis;
    // kıç dümenleri
    shape([x - 12, y - 10.5, x - 5, y - 12, x + 5, y - 12, x + 12, y - 10.5, x + 11, y - 8.5, x - 11, y - 8.5], x, y - 12, x, y - 8.5, '#6a7c93', '#1a222d', fl, OUT, 1.2);
    shape([x - 1, y - 15, x + 1, y - 15, x + 1, y - 10, x - 1, y - 10], x, y - 15, x, y - 10, '#3a4656', '#11171f', fl, OUT, 1);
    // gövde
    ell(x, y, 5.8, 13); c.fillStyle = fl ? '#ffffff' : lin(x - 6, 0, x + 6, 0, '#7489a3', '#2f3b4d', '#0d131b'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.18)'; ell(x - 2, y - 1, 1.2, 9.5); c.fill();
    c.strokeStyle = 'rgba(5,10,20,0.45)'; c.lineWidth = 0.8; c.beginPath();
    c.moveTo(x - 3.5, y - 9); c.lineTo(x + 3.5, y - 9); c.moveTo(x - 4.2, y + 7); c.lineTo(x + 4.2, y + 7); c.stroke();
    // baş dümenleri
    for (let s = -1; s <= 1; s += 2) shape([x + s * 5, y + 3.8, x + s * 10.5, y + 5.8, x + s * 10.5, y + 7.4, x + s * 5, y + 7.2], x + s * 5, 0, x + s * 10, 0, '#5d6f86', '#1a222d', fl, OUT, 1);
    // kule
    shape([x, y - 6.5, x + 2.4, y - 3, x + 2.8, y + 1, x + 1.6, y + 3.3, x - 1.6, y + 3.3, x - 2.8, y + 1, x - 2.4, y - 3], x - 3, y - 6, x + 3, y + 3, '#8a9db4', '#1d2733', fl, OUT, 1.2);
    c.strokeStyle = 'rgba(5,10,20,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 5, y + 0.4); c.lineTo(x + 5, y + 0.4); c.stroke();
    if (sb > 0.02) {      // su altında mavi örtü
      c.fillStyle = rgba(25, 95, 150, sb * 0.6);
      ell(x, y, 5.9, 13.1); c.fill();
    }
    c.restore();
    // periskop (her zaman suyun üstünde)
    c.strokeStyle = '#141b24'; c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y - 1); c.lineTo(x + 2, y - 5); c.stroke();
    c.fillStyle = '#d2ecff'; c.beginPath(); c.arc(x + 2, y - 5, 1.2, 0, TAU); c.fill();
    add(); glow(x + 2, y - 5, 4, '200,235,255', 0.35 + 0.25 * Math.sin(t * 4 + ph)); end();
    if (sb > 0.3) {      // periskop dümen suyu
      c.strokeStyle = rgba(230, 245, 255, 0.55 * sb); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + 2, y - 5); c.lineTo(x - 1.5, y - 13); c.moveTo(x + 2, y - 5); c.lineTo(x + 5.5, y - 13); c.stroke();
      ell(x + 2, y - 5, 2.6, 1.6); c.stroke();
    }
    // halka atışı öncesi parlayan delikler
    if (ch > 0.01) {
      const P = [-5.2, -7, 5.2, -7, -6, 0, 6, 0, -5, 7, 5, 7];
      add();
      for (let q = 0; q < 6; q++) glow(x + P[q * 2], y + P[q * 2 + 1], 3 + ch * 6, '110,230,255', ch * (0.55 + 0.35 * Math.sin(t * 24 + q)));
      c.strokeStyle = rgba(140, 230, 255, ch * 0.45); c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 19 - ch * 3, 0, TAU); c.stroke();
      end();
      c.fillStyle = rgba(225, 250, 255, 0.35 + 0.65 * ch); c.beginPath();
      for (let q = 0; q < 6; q++) { const px = x + P[q * 2], py = y + P[q * 2 + 1]; c.moveTo(px + 1.1, py); c.arc(px, py, 1.1, 0, TAU); }
      c.fill();
    }
  }

  // KRİSTAL ÇEKİRDEK: dönen altıgen çift piramit, içte atan çekirdek
  function crystal(e, x, y, t, fl) {
    const ph = e.ph || 0, yy = y + Math.sin(t * 2 + ph) * 1.8, rot = t * 0.9 + ph, pul = 0.5 + 0.5 * Math.sin(t * 4 + ph);
    c.fillStyle = 'rgba(0,0,0,0.2)'; ell(x + 4, y + 13, 8, 3.2); c.fill();
    add(); glow(x, yy, 20, '140,220,255', 0.2 + 0.15 * pul); end();
    const N = 6, RX = 10, RY = 3.4, TOP = -11.5, BOT = 10.5, eq = [];
    for (let i = 0; i < N; i++) { const a = rot + i * TAU / N; eq.push(x + Math.cos(a) * RX, yy + Math.sin(a) * RY); }
    const faces = [];
    for (let i = 0; i < N; i++) {
      const m = rot + (i + 0.5) * TAU / N, j = (i + 1) % N;
      faces.push([Math.sin(m), m, i, j, 1], [Math.sin(m), m, i, j, 0]);
    }
    faces.sort(function (a, b) { return a[0] - b[0]; });
    let coreDone = false;
    for (let f = 0; f < faces.length; f++) {
      const F = faces[f], front = F[0] > 0, up = F[4];
      if (front && !coreDone) {      // arka yüzlerden sonra çekirdek
        coreDone = true;
        add(); glow(x, yy - 0.5, 8 + pul * 3, '170,240,255', 0.6 + 0.3 * pul); glow(x, yy - 0.5, 3, '255,255,255', 0.9); end();
      }
      const ax = x, ay = yy + (up ? TOP : BOT), i = F[2], j = F[3];
      path([ax, ay, eq[i * 2], eq[i * 2 + 1], eq[j * 2], eq[j * 2 + 1]]);
      const lum = 0.5 + 0.5 * Math.cos(F[1] + 2.4), k = (up ? 1 : 0.68) * (front ? 1 : 0.55);
      if (fl) c.fillStyle = 'rgba(255,255,255,0.95)';
      else c.fillStyle = rgba((70 + 175 * lum) * k + (up ? 0 : 30), (140 + 112 * lum) * k, (215 + 40 * lum) * k + (up ? 0 : 20), front ? 0.8 : 0.95);
      c.fill();
      c.strokeStyle = front ? 'rgba(8,22,45,0.85)' : 'rgba(8,22,45,0.5)'; c.lineWidth = front ? 1.1 : 0.8; c.lineJoin = 'round'; c.stroke();
    }
    add();
    glow(x, yy, 5 + pul * 2, '200,250,255', 0.35 + 0.35 * pul);
    const sp = (t * 0.7 + ph) % 1;      // tepede kıvılcım
    if (sp < 0.25) { const s = Math.sin(sp * 4 * PI) * 3.5; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - s, yy + TOP); c.lineTo(x + s, yy + TOP); c.moveTo(x, yy + TOP - s); c.lineTo(x, yy + TOP + s); c.stroke(); }
    end();
  }

  // KIRIK KRİSTAL: dönen küçük sivri parça, pembe-mor parıltı
  function shard(e, x, y, t, fl) {
    const ph = e.ph || 0, a = t * 7 + ph * 3;
    c.fillStyle = 'rgba(0,0,0,0.18)'; ell(x + 3, y + 6, 4.5, 2.2); c.fill();
    add(); glow(x, y, 12, '255,110,230', 0.4 + 0.2 * Math.sin(t * 9 + ph)); end();
    c.save(); c.translate(x, y); c.rotate(a);
    shape([0, -7.5, 2.8, -1.4, 1.7, 5.5, -1.3, 6.8, -3.3, 0.4], -3, -7, 3, 7, '#ffd6f6', '#8a2fd0', fl, OUT, 1.2);
    shape([0, -7.5, 2.8, -1.4, 0, 0.6], 0, -7, 2, 0, '#ffffff', '#ff9be8', fl, 0);
    c.strokeStyle = 'rgba(255,230,250,0.6)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(0, 0.6); c.lineTo(-1.3, 6.8); c.stroke();
    c.restore();
    add(); glow(x + Math.cos(a - PI / 2) * 7, y + Math.sin(a - PI / 2) * 7, 3.5, '255,220,250', 0.6); end();
  }

  // HAVAN BOTU: zırhlı mavna, oyuncuya doğru yukarı kalkık kalın havan topu
  function mortar(e, x, y, t, fl) {
    const ph = e.ph || 0, ch = clamp(e.charge || 0, 0, 1);
    y += Math.sin(t * 2.2 + ph) * 0.6;
    // dümen suyu + gölge
    c.strokeStyle = 'rgba(210,235,255,0.35)'; c.lineWidth = 1.4; c.beginPath();
    c.moveTo(x - 10, y - 9); c.lineTo(x - 16, y - 18); c.moveTo(x + 10, y - 9); c.lineTo(x + 16, y - 18); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.28)'; ell(x + 3, y + 5, 14, 8.5); c.fill();
    // lastik tamponlar
    c.fillStyle = '#141820';
    for (let s = -1; s <= 1; s += 2) for (let q = 0; q < 2; q++) { ell(x + s * 13, y - 2 + q * 6, 1.8, 2.4); c.fill(); }
    // gövde ve güverte
    shape([x - 9, y - 9.5, x + 9, y - 9.5, x + 13, y - 5, x + 13, y + 5, x + 9, y + 10, x - 9, y + 10, x - 13, y + 5, x - 13, y - 5], x, y - 10, x, y + 10, '#7d8896', '#232a33', fl, OUT, 1.6);
    shape([x - 9, y - 6.5, x + 9, y - 6.5, x + 10.5, y - 3, x + 10.5, y + 5, x + 7.5, y + 7.5, x - 7.5, y + 7.5, x - 10.5, y + 5, x - 10.5, y - 3], x - 10, y - 6, x + 10, y + 7, '#9eabba', '#46505d', fl, 'rgba(5,10,20,0.6)', 1);
    // perçinler
    c.fillStyle = 'rgba(20,26,34,0.75)'; c.beginPath();
    for (let q = 0; q < 5; q++) { const px = x - 8 + q * 4; c.moveTo(px + 0.6, y - 8); c.arc(px, y - 8, 0.6, 0, TAU); c.moveTo(px + 0.6, y + 8.8); c.arc(px, y + 8.8, 0.6, 0, TAU); }
    c.fill();
    // kıçta kabin
    shape([x - 5, y - 9, x + 5, y - 9, x + 5, y - 5, x - 5, y - 5], x, y - 9, x, y - 5, '#5b6572', '#1d232b', fl, OUT, 1);
    c.fillStyle = '#ffd27a'; c.fillRect(x - 3.5, y - 7.6, 2, 1.4); c.fillRect(x + 1.5, y - 7.6, 2, 1.4);
    // taret halkası
    ell(x, y - 0.5, 6.2, 5.6); c.fillStyle = fl ? '#ffffff' : rad(x, y - 0.5, 6.2, '#b8c3cf', '#55606d', '#262d36'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
    // namlu: tabandan oyuncuya doğru genişleyen (kamera yönüne kalkık) boru
    const mx = x, my = y + 6;
    shape([x - 3.2, y - 1, x + 3.2, y - 1, x + 4.8, my, x - 4.8, my], x - 5, 0, x + 5, 0, '#5a6573', '#c4ced9', fl, OUT, 1.3);
    c.strokeStyle = 'rgba(5,10,20,0.55)'; c.lineWidth = 1; c.beginPath();
    c.moveTo(x - 3.7, y + 1.8); c.lineTo(x + 3.7, y + 1.8); c.moveTo(x - 4.2, y + 3.8); c.lineTo(x + 4.2, y + 3.8); c.stroke();
    if (ch > 0.01) { add(); c.strokeStyle = rgba(255, 150, 60, ch * 0.7); c.lineWidth = 1.2; path([x - 3.2, y - 1, x + 3.2, y - 1, x + 4.8, my, x - 4.8, my]); c.stroke(); end(); }
    ell(mx, my, 5.2, 3.1); c.fillStyle = fl ? '#ffffff' : '#2a313b'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
    ell(mx, my, 3.4, 1.9);
    c.fillStyle = ch > 0.01 ? rgba(255, 120 + 120 * ch, 40 + 80 * ch, 0.35 + 0.65 * ch) : '#06080b'; c.fill();
    if (ch > 0.01) { add(); glow(mx, my, 6 + ch * 10, '255,150,60', ch * (0.6 + 0.3 * Math.sin(t * 22))); glow(mx, my, 3, '255,240,200', ch); end(); }
  }

  const ENEMY = { wasp: wasp, sub: sub, crystal: crystal, shard: shard, mortar: mortar };

  // =====================================================================
  //  BEKÇİLER (5..9)
  // =====================================================================
  function base(x, y, t, rx, oy, sa) {      // gölge + su halkası
    c.fillStyle = rgba(0, 0, 0, sa); ell(x + 6, y + oy + 4, rx, 15); c.fill();
    c.strokeStyle = rgba(220, 240, 255, 0.18 + 0.1 * Math.sin(t * 3)); c.lineWidth = 1.2;
    ell(x, y + oy, rx + 2 + Math.sin(t * 2) * 3, 14); c.stroke();
  }
  // hasar: parlayan çatlaklar + yükselen duman (deterministik, parçacık sistemi gerektirmez)
  function damage(x, y, t, hpf, cracks, smoke) {
    if (hpf >= 0.5) return;
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < cracks.length; i++) {
      const p = cracks[i], q = [];
      for (let j = 0; j < p.length; j += 2) q.push(x + p[j], y + p[j + 1]);
      line(q); c.strokeStyle = 'rgba(10,5,10,0.7)'; c.lineWidth = 2.2; c.stroke();
    }
    add();
    c.strokeStyle = rgba(255, 130, 60, 0.55 + 0.4 * Math.sin(t * 15)); c.lineWidth = 1.1;
    for (let i = 0; i < cracks.length; i++) {
      const p = cracks[i], q = [];
      for (let j = 0; j < p.length; j += 2) q.push(x + p[j], y + p[j + 1]);
      line(q); c.stroke();
    }
    end();
    const n = hpf < 0.25 ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const p = (t * 0.55 + i / n) % 1, o = cracks[i % cracks.length];
      const sx = x + o[0] + Math.sin(t * 1.3 + i * 2) * 3 * p, sy = y + o[1] - p * 30, r = 3 + p * 8;
      c.fillStyle = rgba(smoke[0], smoke[1], smoke[2], (1 - p) * 0.38);
      c.beginPath(); c.arc(sx, sy, r, 0, TAU); c.fill();
      if (hpf < 0.25 && p < 0.5) { add(); glow(sx, sy + 3, 5, '255,140,60', (0.5 - p) * 1.2); end(); }
    }
  }

  // ---------- 5 · BUZ YILANI ----------
  function hump(x0, y0, x1, y1, h, r, fl, t, ph) {
    const N = 12, p = [];
    let top = Math.min(y0, y1);
    for (let i = 0; i <= N; i++) {
      const u = i / N, px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u - Math.sin(u * PI) * h;
      p.push(px, py); if (py < top) top = py;
    }
    // suya giriş/çıkış: koyu delik + köpük
    for (let k = 0; k < 2; k++) {
      const wx = k ? x1 : x0, wy = k ? y1 : y0, w = r + 3 + Math.sin(t * 4 + ph + k) * 0.8;
      c.fillStyle = 'rgba(0,20,40,0.35)'; ell(wx, wy + 1, w, w * 0.45); c.fill();
      c.strokeStyle = 'rgba(235,250,255,0.7)'; c.lineWidth = 1.3; ell(wx, wy + 1, w + 1.5, (w + 1.5) * 0.45); c.stroke();
      c.fillStyle = 'rgba(245,252,255,0.8)'; c.beginPath();
      for (let q = 0; q < 4; q++) { const a = t * 1.5 + q * 1.57 + k, fx = wx + Math.cos(a) * (w + 3), fy = wy + 1 + Math.sin(a) * (w + 3) * 0.45; c.moveTo(fx + 0.9, fy); c.arc(fx, fy, 0.9, 0, TAU); }
      c.fill();
    }
    const my = (y0 + y1) / 2;
    tube(p, r, lin(0, my + r, 0, top - r, '#0b3a4c', '#3fa6bf', '#c9f6ff'), fl, 0.35);
    // pul halkaları
    c.strokeStyle = 'rgba(8,40,60,0.45)'; c.lineWidth = 1; c.beginPath();
    for (let i = 2; i < N - 1; i += 2) {
      const ax = p[i * 2], ay = p[i * 2 + 1], dx = p[i * 2 + 2] - p[i * 2 - 2], dy = p[i * 2 + 3] - p[i * 2 - 1], d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d * r * 0.85, ny = dx / d * r * 0.85;
      c.moveTo(ax - nx, ay - ny); c.lineTo(ax + nx, ay + ny);
    }
    c.stroke();
    // sırt dikenleri (gövde ekseni boyunca, geriye bakan)
    for (let i = 3; i <= N - 3; i += 2) {
      const ax = p[i * 2], ay = p[i * 2 + 1], dx = p[i * 2 + 2] - p[i * 2 - 2], dy = p[i * 2 + 3] - p[i * 2 - 1], d = Math.hypot(dx, dy) || 1;
      const tx = dx / d, ty = dy / d, nx = -ty, ny = tx, L = r * 0.9 + 2.5;
      shape([ax + nx * 1.7, ay + ny * 1.7, ax - tx * L, ay - ty * L, ax - nx * 1.7, ay - ny * 1.7], ax, ay, ax - tx * L, ay - ty * L, '#e9fbff', '#5fb7cf', fl, 'rgba(5,20,35,0.8)', 1);
    }
  }
  function serpent(e, x, y, t, fl, hpf) {
    base(x, y, t, 50, 12, 0.3);
    const pul = 0.5 + 0.5 * Math.sin(t * 3);
    // iki yanda sudan çıkıp giren halkalar
    for (let s = -1; s <= 1; s += 2) {
      const o = s > 0 ? 1.7 : 0;
      const w1 = Math.sin(t * 2.4 + o), w2 = Math.sin(t * 2.4 + o + 1.6), dx = Math.sin(t * 1.7 + o) * 2;
      hump(x + s * 36 + dx, y + 4, x + s * 50 + dx, y - 2, 10 + w2 * 3, 4.2, fl, t, o + 3);
      hump(x + s * 13 + dx * 0.5, y - 10, x + s * 31 + dx, y - 16, 15 + w1 * 4, 5.6, fl, t, o);
      // kuyruk ucu
      const tx = x + s * 46, ty = y + 15, fk = Math.sin(t * 5 + o) * 3;
      c.fillStyle = 'rgba(0,20,40,0.3)'; ell(tx, ty + 1, 5, 2.2); c.fill();
      shape([tx - 2.5, ty, tx + 2.5, ty, tx + s * 7 + fk, ty - 9, tx + s * 2 + fk * 0.5, ty - 5], tx, ty, tx + s * 7, ty - 9, '#9fe3f0', '#0d4558', fl, OUT, 1.2);
    }
    // boyun: arkada sudan çıkıp başa uzanır
    const nk = [];
    for (let i = 0; i <= 6; i++) { const u = i / 6; nk.push(x + Math.sin(t * 2 + u * 3) * 3 * (1 - u), y - 24 + u * 26); }
    c.fillStyle = 'rgba(0,20,40,0.35)'; ell(nk[0], y - 23, 11, 4); c.fill();
    c.strokeStyle = 'rgba(235,250,255,0.6)'; c.lineWidth = 1.2; ell(nk[0], y - 23, 12.5 + Math.sin(t * 4) * 0.8, 4.8); c.stroke();
    tube(nk, 7.5, lin(x - 8, 0, x + 8, 0, '#2f8aa3', '#bdf2fb', '#0f4458'), fl, 0);
    for (let i = 1; i < 6; i++) {      // boyun sırt plakaları
      const ax = nk[i * 2], ay = nk[i * 2 + 1];
      shape([ax - 2.4, ay + 1.5, ax, ay - 3.5, ax + 2.4, ay + 1.5], ax, ay - 3, ax, ay + 2, '#ffffff', '#6cc4da', fl, 'rgba(5,20,35,0.8)', 1);
    }
    // alt çene (hafifçe açılıp kapanır) ve ağız içi soğuk ışık
    const jo = 1.5 + Math.sin(t * 2) * 1.5;
    shape([x - 5.5, y + 22, x + 5.5, y + 22, x + 3.2, y + 31 + jo, x - 3.2, y + 31 + jo], x, y + 22, x, y + 32, '#3c8ea6', '#0b3240', fl, OUT, 1.3);
    add(); glow(x, y + 29 + jo * 0.5, 7, '160,245,255', 0.6 + 0.3 * pul); end();
    // boynuzlar
    for (let s = -1; s <= 1; s += 2) {
      shape([x + s * 6, y - 2, x + s * 13, y + 1, x + s * 21, y - 7, x + s * 27, y - 20, x + s * 30, y - 27, x + s * 24, y - 18, x + s * 17, y - 10, x + s * 11, y - 6], x + s * 6, y, x + s * 30, y - 27, '#fffbea', '#7f8f9e', fl, OUT, 1.4);
      c.strokeStyle = 'rgba(60,70,80,0.55)'; c.lineWidth = 0.9; c.beginPath();
      for (let q = 0; q < 4; q++) { const u = 0.25 + q * 0.17, hx = x + s * (8 + 18 * u), hy = y - 1 - 22 * u * u * 1.1; c.moveTo(hx - s * 1.5, hy - 2.5); c.lineTo(hx + s * 2.5, hy + 1.5); }
      c.stroke();
      // yanak yüzgeçleri
      shape([x + s * 12.5, y + 5, x + s * 24, y + 2, x + s * 21, y + 8, x + s * 25, y + 12, x + s * 13.5, y + 13], x + s * 12, 0, x + s * 25, 0, '#7fd6e8', '#13505f', fl, OUT, 1.2);
      c.strokeStyle = 'rgba(220,250,255,0.5)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + s * 13, y + 8); c.lineTo(x + s * 23, y + 3.5); c.moveTo(x + s * 13.5, y + 10); c.lineTo(x + s * 23, y + 11); c.stroke();
    }
    // kafatası (burun aşağıda, oyuncuya bakar)
    shape([x, y - 7, x + 9, y - 3.5, x + 14, y + 5, x + 12, y + 14, x + 7.5, y + 23, x + 3.5, y + 29, x - 3.5, y + 29, x - 7.5, y + 23, x - 12, y + 14, x - 14, y + 5, x - 9, y - 3.5],
      x - 14, y - 7, x + 12, y + 29, '#dcfbff', '#16566b', fl, OUT, 1.8);
    shape([x, y - 3, x + 4, y + 7, x + 2.4, y + 25, x - 2.4, y + 25, x - 4, y + 7], x, y - 3, x, y + 25, '#ffffff', '#62bcd3', fl, 'rgba(10,40,60,0.55)', 1);
    // kaş çıkıntıları + gözler (dikey yarık göz bebeği)
    for (let s = -1; s <= 1; s += 2) {
      shape([x + s * 3.6, y + 6, x + s * 12.5, y + 3.2, x + s * 11.6, y + 7.5, x + s * 4.4, y + 8.6], x, y + 4, x, y + 8, '#1f6a80', '#082733', fl, OUT, 1);
      const ex = x + s * 7.6, ey = y + 11;
      add(); glow(ex, ey, 10, '120,255,240', 0.55 + 0.25 * pul); end();
      ell(ex, ey, 3, 2.2, s * 0.35); c.fillStyle = fl ? '#ffffff' : rad(ex, ey, 3, '#ffffff', '#7affee', '#139c9a'); c.fill();
      c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#04181c'; ell(ex, ey, 0.7, 2, s * 0.35); c.fill();
    }
    // burun delikleri, dişler
    c.fillStyle = '#062029'; ell(x - 1.6, y + 25.5, 0.8, 1.3, -0.3); c.fill(); ell(x + 1.6, y + 25.5, 0.8, 1.3, 0.3); c.fill();
    for (let s = -1; s <= 1; s += 2) {
      shape([x + s * 3.5, y + 27.5, x + s * 2, y + 27.5, x + s * 2.6, y + 31.5], x, y + 27, x, y + 31, '#ffffff', '#bfe9f5', fl, 'rgba(5,20,35,0.8)', 0.8);
      shape([x + s * 6.5, y + 23, x + s * 5.2, y + 24.5, x + s * 6.6, y + 27.5], x, y + 23, x, y + 27, '#ffffff', '#bfe9f5', fl, 'rgba(5,20,35,0.8)', 0.8);
    }
    // ayaz nefesi
    add();
    glow(x, y + 34, 12 + pul * 4, '160,240,255', 0.45 + 0.25 * pul);
    glow(x, y + 31, 4, '255,255,255', 0.7);
    c.fillStyle = 'rgba(220,250,255,0.8)'; c.beginPath();
    for (let i = 0; i < 6; i++) {
      const p = (t * 1.4 + i / 6) % 1, px = x + Math.sin(i * 2.3 + t) * p * 10, py = y + 31 + p * 15, r = 0.6 + p * 1.4;
      c.moveTo(px + r, py); c.arc(px, py, r, 0, TAU);
    }
    c.globalAlpha = 0.8; c.fill();
    end();
    core(x, y + 1.5, 4.5, hpf, '120,240,255', t);
    return [[-6, -1, -9, 6, -6, 12], [7, 4, 10, 10, 8, 17], [-2, 16, 1, 21], [-20, -18, -25, -14], [22, -16, 28, -12]];
  }

  // ---------- 6 · KRİSTAL GÖZ ----------
  const VEINS = [[0.2, 0.5, 2], [0.75, 0.42, -3], [1.35, 0.35, 2], [2.0, 0.45, -2], [2.6, 0.5, 3], [3.4, 0.45, -2], [4.1, 0.38, 2], [5.0, 0.4, -3], [5.7, 0.48, 2]];
  function ringShards(x, y, t, sp, fl, front) {
    const N = 10, RX = 46, RY = 22;
    for (let i = 0; i < N; i++) {
      const a = sp * 0.8 + i * TAU / N, d = Math.sin(a);
      if ((d > 0) !== front) continue;
      const cx = x + Math.cos(a) * RX, cy = y - 2 + d * RY, ang = Math.atan2(d * RY, Math.cos(a) * RX);
      const L = 9 + d * 2, w = 1.6 + 2 * Math.abs(Math.cos(sp * 2 + i)), ca = Math.cos(ang), sa = Math.sin(ang);
      const p = [cx + ca * L, cy + sa * L, cx - sa * w, cy + ca * w, cx - ca * L * 0.55, cy - sa * L * 0.55, cx + sa * w, cy - ca * w];
      const v = i % 2, dk = front ? 1 : 0.6;
      shape(p, cx - ca * L, cy - sa * L, cx + ca * L, cy + sa * L,
        v ? rgba(200 * dk, 160 * dk, 255 * dk, 1) : rgba(170 * dk, 245 * dk, 255 * dk, 1), v ? rgba(70 * dk, 20 * dk, 130 * dk, 1) : rgba(20 * dk, 90 * dk, 150 * dk, 1), fl, OUT, 1.2);
      c.strokeStyle = 'rgba(255,255,255,' + (front ? 0.55 : 0.25) + ')'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(cx + ca * L, cy + sa * L); c.lineTo(cx - ca * L * 0.55, cy - sa * L * 0.55); c.stroke();
      if (front) { add(); glow(cx + ca * L, cy + sa * L, 5, v ? '210,150,255' : '150,240,255', 0.55); end(); }
    }
    add(); c.strokeStyle = 'rgba(190,150,255,0.28)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, y - 2, RX, RY, 0, front ? 0 : PI, front ? PI : TAU); c.stroke(); end();
  }
  function crystalEye(e, x, y, t, fl, hpf) {
    const sp = e.spin || 0, pul = 0.5 + 0.5 * Math.sin(t * 2.2), low = hpf < 0.4;
    base(x, y, t, 42, 26, 0.24);
    add(); glow(x, y, 66, low ? '255,80,110' : '170,120,255', 0.2 + 0.1 * pul); end();
    ringShards(x, y, t, sp, fl, false);
    // göz yuvası
    ell(x, y, 35, 26); c.fillStyle = fl ? '#ffffff' : rad(x, y, 35, '#4a2f78', '#22123d', '#0b0516'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.8; c.stroke();
    // akı
    ell(x, y, 27, 19); c.fillStyle = fl ? '#ffffff' : rad(x, y, 27, '#fff8fb', '#f0d4e4', '#a86d92'); c.fill();
    const ix = x + Math.sin(t * 0.9) * 7 + Math.sin(t * 2.3) * 1.2, iy = y + Math.sin(t * 0.7 + 1) * 3;
    if (!fl) {
      c.save(); ell(x, y, 27, 19); c.clip();
      // damarlar
      c.strokeStyle = rgba(190, 30, 60, 0.45 + (1 - hpf) * 0.4); c.lineWidth = 0.8 + (1 - hpf) * 1.1; c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i < VEINS.length; i++) {
        const v = VEINS[i], sx = x + Math.cos(v[0]) * 28, sy = y + Math.sin(v[0]) * 20;
        const ex = sx + (ix - sx) * v[1], ey = sy + (iy - sy) * v[1], mx = (sx + ex) / 2 + v[2], my = (sy + ey) / 2 - v[2];
        c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, ex, ey);
        c.moveTo(mx, my); c.lineTo(mx + v[2] * 1.6, my + 3);
      }
      c.stroke();
      // iris
      const g = c.createRadialGradient(ix, iy, 0, ix, iy, 11.5);
      g.addColorStop(0, '#12061f'); g.addColorStop(0.3, low ? '#ff3b4b' : '#8a45ff');
      g.addColorStop(0.72, low ? '#ffb03b' : '#46d6ff'); g.addColorStop(1, '#130923');
      c.fillStyle = g; c.beginPath(); c.arc(ix, iy, 11.5, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 0.8; c.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16 + t * 0.2; c.moveTo(ix + Math.cos(a) * 4.2, iy + Math.sin(a) * 4.2); c.lineTo(ix + Math.cos(a) * 10.5, iy + Math.sin(a) * 10.5); }
      c.stroke();
      c.strokeStyle = 'rgba(10,4,20,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.arc(ix, iy, 11.5, 0, TAU); c.stroke();
      // göz bebeği (dikey yarık, nefes alır gibi genişler)
      const pw = low ? 1.4 : 2 + 1.6 * Math.pow(Math.sin(t * 1.3), 2);
      add(); glow(ix, iy, 9, low ? '255,60,60' : '180,120,255', 0.45 + 0.3 * pul); end();
      c.fillStyle = '#05020a'; ell(ix, iy, pw, 7.5); c.fill();
      // üst kapağın gölgesi
      c.fillStyle = lin(0, y - 19, 0, y - 5, 'rgba(50,10,40,0.5)', 'rgba(50,10,40,0)'); c.fillRect(x - 28, y - 20, 56, 15);
      c.restore();
    }
    c.fillStyle = 'rgba(255,255,255,0.85)'; ell(x - 9, y - 8, 4, 2.4, -0.5); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)'; ell(ix + 4, iy + 4, 1.6, 1.1); c.fill();
    // kırpma: arada bir kapak iner
    const bp = (t * 0.23 + (e.ph || 0) * 0.1) % 1, bl = bp < 0.05 ? Math.sin(bp / 0.05 * PI) : 0;
    // üst kapak kristal kirpikleri
    for (let i = 0; i < 7; i++) {
      const a = PI + (i + 1) / 8 * PI, ca = Math.cos(a), sa = Math.sin(a), bx = x + ca * 33, by = y + sa * 24;
      const L = 6 + 7 * Math.sin((i + 1) / 8 * PI), nl = Math.hypot(ca, sa * 1.4), nx = ca / nl, ny = sa * 1.4 / nl;
      shape([bx - ny * 2.6, by + nx * 2.6, bx + nx * L, by + ny * L, bx + ny * 2.6, by - nx * 2.6], bx, by, bx + nx * L, by + ny * L, '#5b2a9a', '#f1e2ff', fl, OUT, 1.1);
    }
    // üst kapak (plakalı)
    const up = [];
    for (let i = 0; i <= 10; i++) { const a = PI + i / 10 * PI; up.push(x + Math.cos(a) * 34, y - 1 + Math.sin(a) * 25); }
    for (let i = 10; i >= 0; i--) { const a = PI + i / 10 * PI; up.push(x + Math.cos(a) * 26, y + Math.sin(a) * 17.5 * (1 - 2 * bl)); }
    shape(up, x, y - 26, x, y + 17 * bl, '#8d6cc4', '#2a1450', fl, OUT, 1.6);
    const lo = [];
    for (let i = 0; i <= 10; i++) { const a = i / 10 * PI; lo.push(x + Math.cos(a) * 32, y + Math.sin(a) * 23); }
    for (let i = 10; i >= 0; i--) { const a = i / 10 * PI; lo.push(x + Math.cos(a) * 26.5, y + Math.sin(a) * 17.8); }
    shape(lo, x, y + 17, x, y + 23, '#6a4aa2', '#1d0d38', fl, OUT, 1.4);
    // plaka ekleri + parlayan çiviler
    c.strokeStyle = 'rgba(8,4,18,0.75)'; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i < 5; i++) {
      const a = PI + i / 5 * PI, b = i / 5 * PI;
      c.moveTo(x + Math.cos(a) * 26, y + Math.sin(a) * 17.5 * (1 - 2 * bl)); c.lineTo(x + Math.cos(a) * 34, y - 1 + Math.sin(a) * 25);
      c.moveTo(x + Math.cos(b) * 26.5, y + Math.sin(b) * 17.8); c.lineTo(x + Math.cos(b) * 32, y + Math.sin(b) * 23);
    }
    c.stroke();
    add();
    for (let i = 0; i < 5; i++) {
      const a = PI + (i + 0.5) / 5 * PI;
      glow(x + Math.cos(a) * 31, y - 0.5 + Math.sin(a) * 22.5 * (1 - bl * 0.5), 4, low ? '255,90,90' : '200,160,255', 0.4 + 0.35 * Math.sin(t * 3 + i));
    }
    end();
    ringShards(x, y, t, sp, fl, true);
    return [[-24, -14, -18, -10, -20, -4], [20, -15, 15, -9], [-15, 18, -9, 21, -4, 18], [14, 17, 20, 13], [-3, -20, 2, -16]];
  }

  // ---------- 7 · KAR DEVİ ----------
  const ROCK = [1, 0.88, 1.04, 0.94, 1.1, 0.9, 1.02, 0.86, 1.08, 0.96];
  function giant(e, x, y, t, fl, hpf) {
    const br = Math.sin(t * 1.6) * 1.2, lift = Math.sin(t * 1.6 + 0.6) * 2;
    base(x, y, t, 50, 14, 0.34);
    // sırt / kürk
    shape([x - 30, y - 12, x - 16, y - 20, x + 16, y - 20, x + 30, y - 12, x + 35, y + 8, x + 22, y + 23, x, y + 27, x - 22, y + 23, x - 35, y + 8],
      x - 30, y - 20, x + 30, y + 27, '#f2f8ff', '#6c8bad', fl, OUT, 1.8);
    c.strokeStyle = 'rgba(70,100,135,0.5)'; c.lineWidth = 1; c.beginPath();
    for (let q = 0; q < 9; q++) { const fx = x - 26 + (q % 5) * 13 + (q > 4 ? 6 : 0), fy = y - 8 + (q > 4 ? 16 : 6); c.moveTo(fx - 3, fy); c.quadraticCurveTo(fx, fy + 3, fx + 3, fy); }
    c.stroke();
    // kollar: omuzdan dirseğe, dirsekten kayayı tutan yumruklara
    const fy = y - 31 + lift;
    for (let s = -1; s <= 1; s += 2) {
      const p = [x + s * 30, y - 8 + br * 0.5, x + s * 44, y - 22 + br, x + s * 16, fy];
      tube(p, 6, lin(x + s * 44, y - 22, x + s * 16, fy, '#e6f0fb', '#7f9ab8'), fl, 0.3);
      c.strokeStyle = 'rgba(60,85,115,0.5)'; c.lineWidth = 1; c.beginPath(); c.arc(x + s * 44, y - 22 + br, 4, 0, TAU); c.stroke();
    }
    // kaya (başın üstünde)
    const bx = x, by = y - 35 + lift, rk = [];
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + 0.2; rk.push(bx + Math.cos(a) * 15 * ROCK[i], by + Math.sin(a) * 12.5 * ROCK[i]); }
    shape(rk, bx - 15, by - 12, bx + 15, by + 12, '#b4bcc6', '#353c46', fl, OUT, 1.8);
    if (!fl) {
      shape([bx - 12, by - 6, bx - 6, by - 11.5, bx + 4, by - 12.5, bx + 12, by - 8, bx + 8, by - 5, bx, by - 7, bx - 7, by - 3.5], bx, by - 12, bx, by - 3, '#ffffff', '#cfe3f5', false, 'rgba(60,90,120,0.6)', 1);
      c.strokeStyle = 'rgba(20,24,30,0.6)'; c.lineWidth = 1; c.beginPath();
      c.moveTo(bx - 4, by - 2); c.lineTo(bx + 1, by + 3); c.lineTo(bx - 1, by + 8); c.moveTo(bx + 6, by); c.lineTo(bx + 10, by + 4); c.stroke();
    }
    add(); glow(bx + 8, by - 8, 4, '220,240,255', 0.5 + 0.4 * Math.sin(t * 5)); end();
    // yumruklar
    for (let s = -1; s <= 1; s += 2) {
      const kx = x + s * 15.5, ky = fy;
      ell(kx, ky, 6.5, 5.8); c.fillStyle = fl ? '#ffffff' : rad(kx, ky, 6.5, '#ffffff', '#a8bdd4', '#4e6886'); c.fill();
      c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
      c.strokeStyle = 'rgba(40,60,85,0.6)'; c.lineWidth = 0.9; c.beginPath();
      for (let q = 0; q < 3; q++) { c.moveTo(kx - s * 2 - s * 0.5, ky - 4 + q * 3); c.lineTo(kx - s * 5, ky - 3.5 + q * 3); }
      c.stroke();
    }
    // omuzlar + buz apoletleri
    for (let s = -1; s <= 1; s += 2) {
      const sx = x + s * 28, sy = y - 5 + br * 0.5;
      ell(sx, sy, 15, 12.5); c.fillStyle = fl ? '#ffffff' : rad(sx, sy, 15, '#ffffff', '#a2bad3', '#4a6584'); c.fill();
      c.strokeStyle = OUT; c.lineWidth = 1.7; c.stroke();
      for (let q = 0; q < 3; q++) {
        const ax = sx + s * (2 + q * 4.5), ay = sy - 7 + q * 3.5, L = 9 - q * 1.5;
        shape([ax - 2.2, ay + 1, ax + 2.2, ay + 1, ax + s * L * 0.6, ay - L], ax, ay, ax + s * L * 0.6, ay - L, '#ffffff', '#6fcaf2', fl, 'rgba(20,50,80,0.85)', 1);
      }
    }
    // sırttaki buz kalbi (zayıf nokta)
    core(x, y - 14, 5.5, hpf, '110,200,255', t);
    // baş: kürk başlık, kaş çıkıntısı, mavi gözler
    ell(x, y + 2, 11.5, 10.5); c.fillStyle = fl ? '#ffffff' : rad(x, y + 2, 11.5, '#ffffff', '#c5d6e8', '#6f88a6'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke();
    shape([x - 10, y + 2, x - 4, y - 0.5, x, y + 1.5, x + 4, y - 0.5, x + 10, y + 2, x + 9, y + 5, x - 9, y + 5], x, y, x, y + 5, '#8aa2bc', '#3b4f68', fl, OUT, 1.1);
    const gw = 0.65 + 0.25 * Math.sin(t * 3);
    add(); glow(x - 4.3, y + 6.5, 9, '110,200,255', gw); glow(x + 4.3, y + 6.5, 9, '110,200,255', gw); end();
    eye(x - 4.3, y + 6.5, 1.9, '150,225,255', 2); eye(x + 4.3, y + 6.5, 1.9, '150,225,255', 2);
    c.strokeStyle = 'rgba(25,35,50,0.85)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - 3.5, y + 9.8); c.lineTo(x + 3.5, y + 9.8); c.stroke();
    // buz sakal
    const IO = [-8, -5.3, -2.6, 0, 2.6, 5.3, 8], IL = [6, 10, 13, 16.5, 13, 10, 6];
    for (let i = 0; i < 7; i++) {
      const ix = x + IO[i], len = IL[i] + Math.sin(t * 2 + i) * 0.4;
      shape([ix - 1.9, y + 10.5, ix + 1.9, y + 10.5, ix + 0.2, y + 10.5 + len], ix - 2, y + 10, ix + 2, y + 10 + len, '#ffffff', '#62c4f2', fl, 'rgba(20,50,80,0.85)', 1);
    }
    add();
    glow(x, y + 28, 9, '200,240,255', 0.25 + 0.2 * Math.sin(t * 1.6));      // soğuk nefes
    c.fillStyle = 'rgba(235,248,255,0.85)';      // omuzlardan dökülen kar
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.5 + i / 6) % 1, s = i % 2 ? 1 : -1, px = x + s * (20 + (i % 3) * 7) + Math.sin(t * 2 + i) * 2, py = y - 4 + p * 26;
      c.moveTo(px + 0.9, py); c.arc(px, py, 0.9, 0, TAU);
    }
    c.fill();
    end();
    return [[-24, -10, -19, -4, -23, 2], [26, -8, 22, -1], [-6, -40, -2, -34, -5, -30], [16, 6, 21, 12, 18, 17], [-15, 12, -19, 18]];
  }

  // ---------- 8 · GÖLGE KUZGUN ----------
  const PJ = [0.9, 1.1, 0.85, 1.05, 0.95, 1.15, 1];
  function feather(rx, ry, dx, dy, L, w, fl, jag, c0, c1, ln) {
    const px = -dy, py = dx, tx = rx + dx * L, ty = ry + dy * L;
    path([rx + px * w, ry + py * w, rx + dx * L * 0.7 + px * w * 0.8, ry + dy * L * 0.7 + py * w * 0.8, tx, ty,
      rx + dx * L * 0.8 - px * w * 0.2 * jag, ry + dy * L * 0.8 - py * w * 0.2 * jag, rx + dx * L * 0.86 - px * w * 0.9, ry + dy * L * 0.86 - py * w * 0.9, rx - px * w, ry - py * w]);
    c.fillStyle = fl ? '#ffffff' : lin(rx, ry, tx, ty, c0 || '#3a2856', c1 || '#0a0611'); c.fill();
    c.strokeStyle = ln || 'rgba(160,100,235,0.55)'; c.lineWidth = 0.8; c.stroke();
  }
  function raven(e, x, y, t, fl, hpf) {
    const fp = Math.sin(t * 2.6) * 5, fk = Math.sin(t * 31) * Math.sin(t * 7.3), glitch = fk > 0.72, pul = 0.5 + 0.5 * Math.sin(t * 2);
    base(x, y, t, 48, 14, 0.3);
    // karanlık hale + mor aura
    const dg = c.createRadialGradient(x, y, 8, x, y, 60);
    dg.addColorStop(0, 'rgba(18,4,34,0.45)'); dg.addColorStop(1, 'rgba(18,4,34,0)');
    c.fillStyle = dg; c.fillRect(x - 60, y - 60, 120, 120);
    add(); glow(x, y - 2, 62, '120,40,210', 0.3 + 0.12 * pul); glow(x, y + 6, 30, '200,90,255', 0.2 + 0.1 * pul); end();
    // yukarı süzülen gölge tülleri
    c.lineCap = 'round';
    const WO = [-42, -12, -26, -6, -10, -14, 10, -14, 26, -6, 42, -12];
    for (let i = 0; i < 6; i++) {
      const ox = x + WO[i * 2], oy = y + WO[i * 2 + 1] - (i === 0 || i === 5 ? fp : 0), w = [];
      for (let k = 0; k <= 5; k++) w.push(ox + Math.sin(t * 3 + i * 1.7 + k * 0.8) * (1 + k) * 0.9, oy - k * 5.5);
      add(); line(w); c.strokeStyle = 'rgba(150,70,240,0.3)'; c.lineWidth = 3.2; c.stroke(); end();
      line(w); c.strokeStyle = 'rgba(15,4,28,0.45)'; c.lineWidth = 1.4; c.stroke();
    }
    let alpha = 0.9 + 0.1 * Math.sin(t * 23), gx = 0;
    if (glitch) {      // ışınlanma titremesi: kaymış mor hayalet + asıl beden yana kayar
      gx = Math.sin(t * 91) > 0 ? 3 : -3; alpha = 0.75;
      add(); c.fillStyle = 'rgba(170,80,255,0.35)';
      path([x - gx - 50, y - 14 - fp, x - gx - 20, y - 16, x - gx, y - 12, x - gx + 20, y - 16, x - gx + 50, y - 14 - fp, x - gx + 22, y + 6, x - gx, y + 30, x - gx - 22, y + 6]); c.fill();
      end();
    }
    c.save(); c.globalAlpha = alpha; c.translate(gx, 0);
    // kanatlar: önce uç tüyleri, sonra örtü tüyleri
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 6; k >= 0; k--) {      // uç (birincil) tüyler: dağınık, dışa ve geriye
        const rx = x + s * (24 + k * 4.2), ry = y - 9 - fp * (0.35 + k * 0.1), th = 0.12 + k * 0.13;
        feather(rx, ry, s * Math.cos(th), -Math.sin(th), (15 + k * 1.6) * PJ[k], 2.4, fl, k % 2 ? 1.6 : 0.8);
      }
      for (let k = 0; k < 5; k++) {      // ikincil tüyler: geriye
        const rx = x + s * (8 + k * 4), ry = y - 6 - fp * k * 0.06;
        feather(rx, ry, s * (0.12 + k * 0.06), -1, 11 + (k % 2) * 2.5, 2.3, fl, 1);
      }
      shape([x + s * 6, y - 7, x + s * 20, y - 15 - fp * 0.4, x + s * 36, y - 19 - fp * 0.8, x + s * 50, y - 15 - fp, x + s * 41, y - 4 - fp * 0.4, x + s * 30, y + 1, x + s * 20, y + 5, x + s * 8, y + 7],
        x, y - 15, x + s * 46, y, '#4a3170', '#0b0613', fl, OUT, 1.6);
      // örtü tüyü sıraları (ışıltılı kenar)
      c.strokeStyle = 'rgba(170,120,255,0.4)'; c.lineWidth = 0.9; c.beginPath();
      for (let q = 0; q < 4; q++) { const u = q / 4; c.moveTo(x + s * (12 + u * 30), y - 9 - fp * u * 0.8); c.quadraticCurveTo(x + s * (16 + u * 30), y - 3 - fp * u * 0.5, x + s * (12 + u * 26), y + 3); }
      c.stroke();
    }
    // kuyruk yelpazesi (yukarıda)
    for (let k = -2; k <= 2; k++) { const a = -PI / 2 + k * 0.22; feather(x + k * 1.5, y - 10, Math.cos(a), Math.sin(a), 17 - Math.abs(k) * 1.5, 2.6, fl, 1); }
    // gövde
    shape([x, y - 14, x + 9, y - 4, x + 10, y + 8, x + 6, y + 16, x, y + 19, x - 6, y + 16, x - 10, y + 8, x - 9, y - 4], x - 10, y - 14, x + 10, y + 19, '#46335f', '#07040c', fl, OUT, 1.7);
    c.strokeStyle = 'rgba(170,120,255,0.35)'; c.lineWidth = 1; c.beginPath();
    c.moveTo(x - 5, y - 6); c.quadraticCurveTo(x - 7, y + 4, x - 4, y + 12); c.moveTo(x + 3, y - 8); c.quadraticCurveTo(x + 6, y, x + 4, y + 8); c.stroke();
    core(x, y + 3, 5, hpf, '190,80,255', t);
    // boyun yakası + baş + gaga
    shape([x - 8, y + 12, x - 5, y + 10, x - 3, y + 13, x, y + 10.5, x + 3, y + 13, x + 5, y + 10, x + 8, y + 12, x + 6, y + 17, x - 6, y + 17], x, y + 10, x, y + 17, '#2c1f40', '#06030a', fl, OUT, 1.1);
    ell(x, y + 19, 7, 7.4); c.fillStyle = fl ? '#ffffff' : rad(x, y + 19, 7.4, '#4b3a66', '#17101f', '#050208'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    shape([x - 3.3, y + 22.5, x + 3.3, y + 22.5, x, y + 34], x - 3, y + 22, x + 3, y + 34, '#6c6676', '#121016', fl, OUT, 1.2);
    c.strokeStyle = 'rgba(230,220,255,0.45)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - 1, y + 23.5); c.lineTo(x - 0.2, y + 31); c.stroke();
    // kırmızı gözler + kısa iz
    add();
    for (let s = -1; s <= 1; s += 2) {
      glow(x + s * 3.6, y + 18.5, 9, '255,30,60', 0.7 + 0.2 * Math.sin(t * 6));
      c.strokeStyle = 'rgba(255,60,80,0.45)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + s * 3.6, y + 18.5); c.lineTo(x + s * 7, y + 13); c.stroke();
    }
    end();
    eye(x - 3.6, y + 18.5, 1.9, '255,50,70'); eye(x + 3.6, y + 18.5, 1.9, '255,50,70');
    c.restore();
    return [[-30, -10, -24, -4, -28, 1], [26, -12, 31, -6], [-4, -6, -1, 0, -4, 6], [5, 8, 8, 13], [38, -14, 43, -9]];
  }

  // ---------- 9 · BUZULUN TANRISI ----------
  const GLYPHS = [
    [0, -1, 0, 1, 0, -0.4, 0.7, -1, 0, 0.1, -0.7, -0.5],
    [0, -1, 0.7, 0, 0.7, 0, 0, 1, 0, 1, -0.7, 0, -0.7, 0, 0, -1],
    [-0.6, -1, -0.6, 1, -0.6, -1, 0.6, -0.3, 0.6, -0.3, -0.6, 0.4],
    [0, -1, 0, 1, -0.7, -0.5, 0.7, 0.5, 0.7, -0.5, -0.7, 0.5],
    [-0.6, 1, 0, -1, 0, -1, 0.6, 1, -0.35, 0.2, 0.35, 0.2],
    [-0.5, -1, 0.5, -1, 0, -1, 0, 1, -0.5, 1, 0.5, 0.3]
  ];
  function runes(x, y, t, sp, front, low) {
    const N = 8;
    add();
    for (let i = 0; i < N; i++) {
      const a = sp * 0.5 + i * TAU / N, d = Math.sin(a);
      if ((d > 0) !== front) continue;
      const rx = x + Math.cos(a) * 56, ry = y + 2 + d * 20, sc = 0.8 + 0.25 * d, al = 0.45 + 0.4 * (d + 1) / 2;
      glow(rx, ry, 9 * sc, low ? '255,150,170' : '150,220,255', 0.35 * al);
      const g = GLYPHS[i % GLYPHS.length], s = 4 * sc;
      c.strokeStyle = low ? rgba(255, 200, 210, al) : rgba(210, 245, 255, al); c.lineWidth = 1.5; c.beginPath();
      for (let k = 0; k < g.length; k += 4) { c.moveTo(rx + g[k] * s, ry + g[k + 1] * s); c.lineTo(rx + g[k + 2] * s, ry + g[k + 3] * s); }
      c.stroke();
    }
    end();
  }
  function lightWing(x, y, t, s, i, fl) {
    const ang = [-0.6, -0.12, 0.34][i] + Math.sin(t * 1.5 + i * 0.7) * 0.07, L = [60, 54, 42][i], W = 13 - i * 2.5;
    const bx = x + s * 9, by = y - 9 + i * 4, dx = s * Math.cos(ang), dy = Math.sin(ang), px = -dy * s, py = dx * s;
    const p = [bx - px * 2, by - py * 2];
    for (let k = 1; k <= 4; k++) { const u = k / 4, b = Math.sin(u * PI) * W * 0.35; p.push(bx + dx * L * u - px * b, by + dy * L * u - py * b); }
    for (let k = 7; k >= 1; k--) { const u = k / 8, w = W * Math.sin(u * PI * 0.9 + 0.2) * (k % 2 ? 1 : 0.72); p.push(bx + dx * L * u + px * w, by + dy * L * u + py * w); }
    p.push(bx + px * 3, by + py * 3);
    path(p);
    c.strokeStyle = 'rgba(25,55,120,0.4)'; c.lineWidth = 1.2; c.lineJoin = 'round'; c.stroke();
    add();
    c.fillStyle = fl ? 'rgba(255,255,255,0.9)' : lin(bx, by, bx + dx * L, by + dy * L, 'rgba(255,255,255,0.75)', 'rgba(160,225,255,0.42)', 'rgba(150,200,255,0.04)');
    c.fill();
    c.strokeStyle = 'rgba(220,245,255,0.32)'; c.lineWidth = 0.8; c.beginPath();
    for (let k = 2; k <= 7; k += 1) { const u = k / 8; c.moveTo(bx, by); c.lineTo(bx + dx * L * u + px * W * 0.6, by + dy * L * u + py * W * 0.6); }
    c.stroke();
    end();
  }
  function deity(e, x, y, t, fl, hpf) {
    const sp = e.spin || 0, pul = 0.5 + 0.5 * Math.sin(t * 2.4), low = hpf < 0.4, hy = y - 15;
    base(x, y, t, 52, 18, 0.3);
    // yoğun aura + dönen ışık huzmeleri
    add();
    glow(x, y - 6, 84, low ? '255,120,150' : '120,200,255', 0.26 + 0.08 * pul);
    glow(x, y + 6, 60, '190,130,255', 0.18 + 0.06 * pul);
    glow(x, hy, 40, '255,255,255', 0.16 + 0.08 * pul);
    const rg = c.createRadialGradient(x, hy, 6, x, hy, 78);
    rg.addColorStop(0, 'rgba(220,245,255,0.32)'); rg.addColorStop(1, 'rgba(220,245,255,0)');
    c.fillStyle = rg; c.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = sp * 0.25 + i * TAU / 14, w = 0.05 + 0.02 * Math.sin(t * 2 + i), r = 70 + Math.sin(t * 1.7 + i * 1.3) * 8;
      c.moveTo(x, hy); c.lineTo(x + Math.cos(a - w) * r, hy + Math.sin(a - w) * r); c.lineTo(x + Math.cos(a + w) * r, hy + Math.sin(a + w) * r); c.closePath();
    }
    c.fill();
    end();
    // ışık kanatları (3 çift)
    for (let i = 2; i >= 0; i--) { lightWing(x, y, t, -1, i, fl); lightWing(x, y, t, 1, i, fl); }
    // hale: dış kristal dikenler (e.spin), orta halka, ters dönen iç kristaller
    const flick = hpf < 0.5 && Math.sin(t * 19) > 0.6;
    for (let i = 0; i < 16; i++) {
      if (flick && i % 4 === 0) continue;
      const a = sp * 0.35 + i * TAU / 16, ca = Math.cos(a), sa = Math.sin(a), r0 = 29, r1 = i % 2 ? 41 : 49, w = i % 2 ? 2.2 : 3;
      shape([x + ca * r0 - sa * w, hy + sa * r0 + ca * w, x + ca * r1, hy + sa * r1, x + ca * r0 + sa * w, hy + sa * r0 - ca * w, x + ca * (r0 - 3), hy + sa * (r0 - 3)],
        x + ca * r0, hy + sa * r0, x + ca * r1, hy + sa * r1, '#bdefff', '#ffffff', fl, 'rgba(20,40,90,0.75)', 1);
    }
    add();
    c.strokeStyle = rgba(180, 235, 255, 0.55 + 0.25 * pul); c.lineWidth = 2; c.beginPath(); c.arc(x, hy, 28, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(220,245,255,0.55)'; c.lineWidth = 1; c.beginPath();
    for (let i = 0; i < 24; i++) { const a = -sp * 0.2 + i * TAU / 24, r = i % 3 ? 31 : 33.5; c.moveTo(x + Math.cos(a) * 29.5, hy + Math.sin(a) * 29.5); c.lineTo(x + Math.cos(a) * r, hy + Math.sin(a) * r); }
    c.stroke();
    glow(x, hy, 26, '200,240,255', 0.3 + 0.15 * pul);
    end();
    for (let i = 0; i < 8; i++) {
      const a = -sp * 0.6 + i * TAU / 8, cx = x + Math.cos(a) * 22, cy = hy + Math.sin(a) * 22, tx = -Math.sin(a), ty = Math.cos(a);
      shape([cx + tx * 4.5, cy + ty * 4.5, cx + Math.cos(a) * 1.8, cy + Math.sin(a) * 1.8, cx - tx * 4.5, cy - ty * 4.5, cx - Math.cos(a) * 1.8, cy - Math.sin(a) * 1.8],
        cx - tx * 4, cy - ty * 4, cx + tx * 4, cy + ty * 4, i % 2 ? '#ffd8f6' : '#d0fff4', i % 2 ? '#c14fff' : '#22b8c8', fl, 'rgba(15,20,50,0.7)', 0.9);
    }
    runes(x, y, t, sp, false, low);
    // cüppe (dalgalı etek)
    const w1 = Math.sin(t * 2.6) * 3, w2 = Math.sin(t * 2.6 + 1.6) * 3;
    shape([x - 14, y - 6, x + 14, y - 6, x + 21, y + 9, x + 31, y + 27 + w1, x + 19, y + 23 + w2, x + 9, y + 31 + w1, x, y + 27 + w2, x - 9, y + 31 + w1, x - 19, y + 23 + w2, x - 31, y + 27 + w1, x - 21, y + 9],
      x, y - 6, x, y + 31, '#f4fbff', '#2f5ea6', fl, OUT, 1.7);
    shape([x - 6, y - 4, x + 6, y - 4, x + 9, y + 26 + w2, x, y + 22 + w1, x - 9, y + 26 + w2], x, y - 4, x, y + 26, '#ffffff', '#7fb8ec', fl, 'rgba(20,40,90,0.6)', 1);
    c.strokeStyle = 'rgba(255,225,160,0.75)'; c.lineWidth = 1; c.beginPath();      // altın işleme
    c.moveTo(x - 20, y + 10); c.quadraticCurveTo(x, y + 16, x + 20, y + 10); c.moveTo(x - 27, y + 24 + w1 * 0.8); c.quadraticCurveTo(x, y + 30 + w2 * 0.5, x + 27, y + 24 + w1 * 0.8); c.stroke();
    add(); c.strokeStyle = rgba(180, 240, 255, 0.5 + 0.3 * pul); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x, y + 24 + w1); c.stroke(); end();
    // kollar ve avuçlarda ışık küreleri
    for (let s = -1; s <= 1; s += 2) {
      const hx = x + s * 31, hY = y + 12 + Math.sin(t * 1.8 + s) * 2;
      shape([x + s * 13, y - 4, x + s * 26, y + 2, x + s * 34, y + 10, x + s * 30, y + 16, x + s * 22, y + 11, x + s * 15, y + 6], x + s * 13, y, x + s * 34, y + 14, '#e8f6ff', '#3c6cb0', fl, OUT, 1.4);
      add(); glow(hx, hY, 13, '170,235,255', 0.55 + 0.25 * Math.sin(t * 4 + s)); glow(hx, hY, 4, '255,255,255', 0.9); end();
      c.strokeStyle = 'rgba(220,250,255,0.7)'; c.lineWidth = 0.9; c.beginPath(); c.ellipse(hx, hY, 6, 2.4, t * 2 * s, 0, TAU); c.stroke();
    }
    // omuz kristal plakaları
    for (let s = -1; s <= 1; s += 2) {
      shape([x + s * 9, y - 11, x + s * 24, y - 9, x + s * 29, y - 1, x + s * 15, y + 1], x + s * 9, y - 11, x + s * 29, y, '#ffffff', '#6fa6dc', fl, OUT, 1.4);
      shape([x + s * 15, y - 15, x + s * 21, y - 22, x + s * 25, y - 10], x + s * 15, y - 15, x + s * 21, y - 22, '#ffffff', '#9fe0ff', fl, 'rgba(20,40,90,0.8)', 1);
    }
    // kalp kristali (zayıf nokta)
    shape([x, y - 3, x + 6, y + 5, x, y + 15, x - 6, y + 5], x - 6, y - 3, x + 6, y + 15, '#ffffff', low ? '#ff6a7a' : '#7fe0ff', fl, OUT, 1.3);
    core(x, y + 5, 5, hpf, '170,230,255', t);
    // taç
    const CH = [8, 12, 17, 12, 8];
    for (let i = 0; i < 5; i++) {
      const cx = x + (i - 2) * 4.6, by = hy - 12 + Math.abs(i - 2) * 1.5;
      shape([cx - 2.6, by, cx, by - CH[i], cx + 2.6, by], cx - 2, by, cx + 2, by - CH[i], '#ffffff', '#7fd8ff', fl, 'rgba(20,40,90,0.85)', 1);
    }
    add(); glow(x, hy - 26, 8, '255,255,255', 0.5 + 0.3 * pul); end();
    // maske yüz
    path([x, hy - 14, x + 8, hy - 11, x + 10.5, hy - 3, x + 9, hy + 6, x + 5, hy + 12, x, hy + 14, x - 5, hy + 12, x - 9, hy + 6, x - 10.5, hy - 3, x - 8, hy - 11]);
    c.fillStyle = fl ? '#ffffff' : rad(x, hy, 14, '#ffffff', '#d4e4f4', '#8aa3c4'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
    c.strokeStyle = 'rgba(210,170,90,0.85)'; c.lineWidth = 0.9; c.beginPath();      // altın süsleme
    c.moveTo(x - 9, hy - 5); c.quadraticCurveTo(x - 5, hy - 8.5, x - 1.2, hy - 6); c.moveTo(x + 9, hy - 5); c.quadraticCurveTo(x + 5, hy - 8.5, x + 1.2, hy - 6);
    c.moveTo(x - 4, hy + 8); c.quadraticCurveTo(x, hy + 9.5, x + 4, hy + 8); c.stroke();
    c.strokeStyle = 'rgba(90,110,140,0.4)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x, hy - 13); c.lineTo(x, hy + 13); c.stroke();
    c.fillStyle = '#0a1426';      // göz yarıkları
    for (let s = -1; s <= 1; s += 2) { path([x + s * 2, hy - 2, x + s * 8, hy - 3.5, x + s * 7, hy - 0.2, x + s * 2.6, hy]); c.fill(); }
    add();
    const ec = low ? '255,110,130' : '160,240,255';
    for (let s = -1; s <= 1; s += 2) {
      glow(x + s * 5, hy - 1.6, 8, ec, 0.8 + 0.2 * pul);
      c.fillStyle = 'rgba(255,255,255,0.95)'; path([x + s * 3, hy - 1.8, x + s * 7, hy - 2.6, x + s * 6.4, hy - 1, x + s * 3.3, hy - 1]); c.fill();
      const tg = c.createLinearGradient(0, hy, 0, hy + 12);      // ışık gözyaşı
      tg.addColorStop(0, 'rgba(' + ec + ',0.7)'); tg.addColorStop(1, 'rgba(' + ec + ',0)');
      c.fillStyle = tg; c.fillRect(x + s * 5 - 0.6, hy, 1.2, 12);
    }
    end();
    shape([x, hy - 11.5, x + 2.2, hy - 8.5, x, hy - 5.5, x - 2.2, hy - 8.5], x, hy - 11, x, hy - 5, '#ffe0fa', '#d03cff', fl, 'rgba(20,10,40,0.8)', 0.9);
    add(); glow(x, hy - 8.5, 6, '255,140,240', 0.6 + 0.3 * pul); end();
    runes(x, y, t, sp, true, low);
    // yükselen ışık zerreleri
    add(); c.fillStyle = 'rgba(225,248,255,0.85)'; c.beginPath();
    for (let i = 0; i < 10; i++) {
      const p = (t * 0.35 + i * 0.1) % 1, px = x + Math.sin(i * 12.9898) * 44 + Math.sin(t + i) * 2, py = y + 28 - p * 72, r = 0.6 + Math.sin(p * PI) * 0.9;
      c.moveTo(px + r, py); c.arc(px, py, r, 0, TAU);
    }
    c.fill(); end();
    return [[-5, hy - y - 10, -3, hy - y - 4, -6, hy - y + 2], [18, -6, 23, 0, 20, 6], [-20, 4, -25, 11], [6, 16, 10, 22, 7, 27], [-24, -10, -20, -4]];
  }

  // =====================================================================
  //  BEKÇİLER (0..4): 10-50. aşamalar
  // =====================================================================
  // perçin sırası
  function rivets(pts, r, col) {
    c.fillStyle = col || 'rgba(8,12,22,0.75)'; c.beginPath();
    for (let i = 0; i < pts.length; i += 2) { c.moveTo(pts[i] + r, pts[i + 1]); c.arc(pts[i], pts[i + 1], r, 0, TAU); }
    c.fill();
  }
  // buz kristali: yarı saydam, açık tepe + koyu taban, iç parlama çizgisi
  function icicle(bx, by, tx, ty, w, fl, c0, c1) {
    const dx = tx - bx, dy = ty - by, d = Math.hypot(dx, dy) || 1, nx = -dy / d * w, ny = dx / d * w;
    shape([bx + nx, by + ny, tx, ty, bx - nx, by - ny, bx - dx * 0.12, by - dy * 0.12], bx, by, tx, ty, c0 || '#7fd8ff', c1 || '#ffffff', fl, 'rgba(20,50,80,0.85)', 1);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(bx + nx * 0.4, by + ny * 0.4); c.lineTo(bx + dx * 0.75 + nx * 0.1, by + dy * 0.75 + ny * 0.1); c.stroke();
  }

  // ---------- 0 · GÖZCÜ: zırhlı gözetleme gemisi; dönen radar, türbinli yan kapsüller, burunda sensör gözler, karında reaktör ----------
  function scout(e, x, y, t, fl, hpf) {
    const ph = e.ph || 0, pul = 0.5 + 0.5 * Math.sin(t * 4), low = hpf < 0.5;
    base(x, y, t, 54, 14, 0.32);
    y += Math.sin(t * 1.7 + ph) * 1.5;
    // arka iticiler (üstte, geriye bakar): hamlede ve şarjda uzar
    const thr = 1 + LG * 0.8 + U * 0.6;
    add();
    for (let s = -1; s <= 1; s += 2) {
      const fx = x + s * 20, fk = 0.75 + 0.25 * Math.sin(t * 27 + s * 2), L = (12 + fk * 4) * thr;
      glow(fx, y - 18, 9 + U * 5, '120,200,255', 0.5 * fk);
      c.fillStyle = lin(fx, y - 16, fx, y - 16 - L, 'rgba(255,255,255,0.95)', 'rgba(120,200,255,0.55)', 'rgba(120,200,255,0)');
      path([fx - 4.5, y - 16, fx + 4.5, y - 16, fx + 1.2, y - 16 - L, fx - 1.2, y - 16 - L]); c.fill();
    }
    end();
    // yan motor kapsülleri + dönen türbin
    for (let s = -1; s <= 1; s += 2) {
      const px = x + s * 43;
      shape([px - 8, y - 11, px + 8, y - 11, px + 8, y + 8, px + 5, y + 13, px - 5, y + 13, px - 8, y + 8], px - 8, 0, px + 8, 0, s < 0 ? '#6a7d9e' : '#242d40', s < 0 ? '#242d40' : '#6a7d9e', fl, OUT, 1.6);
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px - 6, y - 8.5); c.lineTo(px + 6, y - 8.5); c.moveTo(px - 6.5, y - 4); c.lineTo(px + 6.5, y - 4); c.stroke();
      rivets([px - 5, y - 6.2, px, y - 6.2, px + 5, y - 6.2], 0.9);
      c.save(); c.beginPath(); c.arc(px, y + 4, 5.6, 0, TAU); c.clip();
      c.fillStyle = fl ? '#ffffff' : '#07101c'; c.fillRect(px - 6, y - 2, 12, 12);
      c.strokeStyle = 'rgba(170,215,250,0.85)'; c.lineWidth = 1.4; c.beginPath();
      for (let q = 0; q < 5; q++) { const a = t * (9 + U * 12) * s + q * TAU / 5; c.moveTo(px, y + 4); c.lineTo(px + Math.cos(a) * 6.5, y + 4 + Math.sin(a) * 6.5); }
      c.stroke(); c.restore();
      c.strokeStyle = OUT; c.lineWidth = 1.4; c.beginPath(); c.arc(px, y + 4, 5.6, 0, TAU); c.stroke();
      add(); glow(px, y + 4, 8, '120,200,255', 0.3 + 0.25 * pul + U * 0.35); glow(px, y + 4, 2, '255,255,255', 0.7); end();
    }
    // alt gövde, zırh kuşağı, üst güverte
    shape([x - 47, y - 2, x - 33, y - 16, x + 33, y - 16, x + 47, y - 2, x + 30, y + 14, x + 10, y + 25, x - 10, y + 25, x - 30, y + 14], x, y - 16, x, y + 25, '#4e6080', '#101623', fl, OUT, 1.9);
    shape([x - 45, y - 2, x - 32, y - 14, x + 32, y - 14, x + 45, y - 2, x + 37, y + 2, x - 37, y + 2], x, y - 14, x, y + 2, '#95a9c9', '#3a4962', fl, 'rgba(5,10,20,0.6)', 1.1);
    shape([x - 31, y - 15, x + 31, y - 15, x + 24, y - 3, x - 24, y - 3], x, y - 15, x, y - 3, '#cad9ec', '#6d82a3', fl, OUT, 1.3);
    c.strokeStyle = 'rgba(10,15,28,0.55)'; c.lineWidth = 1; c.beginPath();      // panel çizgileri
    c.moveTo(x - 21, y - 15); c.lineTo(x - 16, y - 3); c.moveTo(x + 21, y - 15); c.lineTo(x + 16, y - 3);
    c.moveTo(x - 30, y + 14); c.lineTo(x - 10, y + 25); c.moveTo(x + 30, y + 14); c.lineTo(x + 10, y + 25);
    c.moveTo(x - 20, y + 9); c.lineTo(x - 22, y + 18); c.moveTo(x + 20, y + 9); c.lineTo(x + 22, y + 18);
    c.moveTo(x - 37, y + 2); c.lineTo(x - 37, y + 8); c.moveTo(x + 37, y + 2); c.lineTo(x + 37, y + 8); c.stroke();
    rivets([x - 38, y - 0.5, x - 26, y - 0.5, x - 14, y - 0.5, x + 14, y - 0.5, x + 26, y - 0.5, x + 38, y - 0.5, x - 26, y + 10, x + 26, y + 10], 1);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - 30, y - 14.6); c.lineTo(x + 30, y - 14.6); c.stroke();      // kenar ışığı
    // şerit boya + uyarı ışıkları
    c.fillStyle = fl ? '#ffffff' : '#c8366f'; c.fillRect(x - 44, y - 1.5, 9, 3); c.fillRect(x + 35, y - 1.5, 9, 3);
    add(); for (let s = -1; s <= 1; s += 2) glow(x + s * 39.5, y, 4, '255,90,170', Math.sin(t * 6 + s) > 0.2 ? 0.7 : 0.1); end();
    // yan toplar (aşağı, oyuncuya bakar)
    for (let s = -1; s <= 1; s += 2) {
      const gx = x + s * 26;
      shape([gx - 4, y + 4, gx + 4, y + 4, gx + 4, y + 9, gx - 4, y + 9], gx - 4, 0, gx + 4, 0, '#6d7f9c', '#1a2232', fl, OUT, 1.2);
      shape([gx - 2.6, y + 8, gx + 2.6, y + 8, gx + 2.2, y + 23, gx - 2.2, y + 23], gx - 3, 0, gx + 3, 0, '#5a6b86', '#141a28', fl, OUT, 1.2);
      c.fillStyle = '#05080e'; c.beginPath(); c.arc(gx, y + 23, 1.6, 0, TAU); c.fill();
      add(); glow(gx, y + 23, 5 + U * 7, '255,120,170', 0.3 + U * 0.7); end();
    }
    // köprü: cam kabin, içi ışıklı
    shape([x - 10, y - 9, x + 10, y - 9, x + 12.5, y + 1, x - 12.5, y + 1], x, y - 9, x, y + 1, '#1f3b5c', '#0a1a2c', fl, OUT, 1.3);
    c.fillStyle = 'rgba(150,225,255,0.4)'; path([x - 8.5, y - 7.5, x - 1.5, y - 7.5, x - 5, y - 0.5, x - 10.5, y - 0.5]); c.fill();
    add(); glow(x, y - 4, 11, '120,200,255', 0.25 + 0.15 * pul); c.fillStyle = 'rgba(200,240,255,0.9)'; c.fillRect(x + 3, y - 3, 4, 1); c.fillRect(x + 3, y - 1, 6, 1); end();
    // burun zırh plakaları + enerji hatları (çekirdekten kapsüllere akan ışık)
    for (let s = -1; s <= 1; s += 2) {
      shape([x + s * 31, y + 11, x + s * 12, y + 22, x + s * 12, y + 25.5, x + s * 29.5, y + 15], x, y + 11, x, y + 25, '#3a4760', '#0b1019', fl, 'rgba(5,10,20,0.7)', 1.1);
      add(); c.strokeStyle = rgba(120, 200, 255, 0.35 + U * 0.4); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + s * 10, y + 8); c.lineTo(x + s * 21, y + 3.5); c.lineTo(x + s * 35, y + 3.5); c.stroke();
      for (let q = 0; q < 2; q++) { const p = (t * 1.2 + q * 0.5 + (s > 0 ? 0.25 : 0)) % 1, px = x + s * (10 + p * 25), py = p < 0.44 ? y + 8 - p / 0.44 * 4.5 : y + 3.5; glow(px, py, 3.5, '160,230,255', 0.8); }
      end();
    }
    // burun sensör gözleri (koyu yuvalı)
    for (let s = -1; s <= 1; s += 2) {
      shape([x + s * 11, y + 9, x + s * 21, y + 9, x + s * 21.5, y + 15.5, x + s * 11.5, y + 15.5], x, y + 9, x, y + 15, '#1e2838', '#070a10', fl, OUT, 1.1);
      eye(x + s * 16.2, y + 12.3, 2.7, '255,70,100', 3.5);
    }
    // reaktör yuvası + çekirdek (zayıf nokta) + ızgara
    c.fillStyle = fl ? '#ffffff' : rad(x, y + 11, 10.5, '#34435a', '#0a0e16'); c.beginPath(); c.arc(x, y + 11, 10.5, 0, TAU); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke();
    core(x, y + 11, 6.5, hpf, '255,90,170', t);
    c.strokeStyle = 'rgba(8,12,22,0.9)'; c.lineWidth = 1.6; c.beginPath();
    c.moveTo(x, y + 1.5); c.lineTo(x, y + 20.5); c.moveTo(x - 4, y + 2.8); c.lineTo(x - 4, y + 19.2); c.moveTo(x + 4, y + 2.8); c.lineTo(x + 4, y + 19.2); c.stroke();
    // radar direği, dönen çanak ve tarama huzmesi
    shape([x - 1.8, y - 15, x + 1.8, y - 15, x + 1.2, y - 28, x - 1.2, y - 28], x - 2, 0, x + 2, 0, '#aebfd6', '#2a3446', fl, OUT, 1);
    const ra = t * (2.2 + U * 5) + ph;
    c.save(); c.translate(x, y - 28); c.scale(1, 0.5); c.rotate(ra);
    add(); c.fillStyle = lin(0, 0, 0, 40, 'rgba(140,220,255,0.35)', 'rgba(140,220,255,0)'); path([-3, 0, 3, 0, 16, 40, -16, 40]); c.fill(); end();
    shape([-13, -2.5, 13, -2.5, 14.5, 0, 13, 2.5, 7, 3.5, -7, 3.5, -13, 2.5, -14.5, 0], 0, -3, 0, 3, fl ? '#ffffff' : '#e3ecf7', '#7f91ad', fl, OUT, 1.2);
    c.fillStyle = '#ff5fb8'; c.fillRect(10, -2, 3, 4.5); c.fillStyle = '#1b2431'; c.beginPath(); c.arc(0, 0, 2.2, 0, TAU); c.fill();
    c.restore();
    add(); glow(x, y - 30, 4, '255,60,90', Math.sin(t * 7) > 0 ? 0.9 : 0.15); end();
    c.fillStyle = Math.sin(t * 7) > 0 ? '#ff6a8a' : '#5a2030'; c.beginPath(); c.arc(x, y - 30, 1.2, 0, TAU); c.fill();
    if (low) { add(); glow(x + 43, y - 4, 6, '255,120,60', 0.3 + 0.3 * Math.sin(t * 17)); end(); }      // yanan motor
    return [[-14, -12, -9, -6, -13, -1], [18, -13, 22, -7], [-26, 4, -22, 9], [34, -8, 38, -3], [6, 14, 10, 19]];
  }

  // ---------- 1 · BUZ ÖRÜMCEĞİ: kristal karın, 8 eklemli adım atan bacak, 8 kırmızı göz, açılan zehir dişleri ----------
  function spider(e, x, y, t, fl, hpf) {
    const ph = e.ph || 0, pul = 0.5 + 0.5 * Math.sin(t * 3), low = hpf < 0.5, gait = 6 + LG * 6;
    base(x, y, t, 48, 14, 0.3);
    const by = y - 12 + Math.sin(t * 1.5 + ph) * 1.2;      // karın merkezi (üstte)
    // bacaklar: 4 çift, kalça → diz (yukarı) → ayak (suya); zıt köşegenler sırayla adım atar
    const TH = [-1.05, -0.5, 0.1, 0.62];
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let q = 3; q >= 0; q--) for (let s = -1; s <= 1; s += 2) {
      const pz = ((q + (s > 0 ? 1 : 0)) % 2) * PI + q * 0.35, k = Math.sin(t * gait + pz), lift = k > 0 ? k : 0;
      const th = TH[q] + Math.cos(t * gait + pz) * 0.07 * (1 + LG), dx = s * Math.cos(th), dy = Math.sin(th);
      const hx = x + s * 10, hy = y + 4 + q * 3.3;
      const kx = hx + dx * 17, ky = hy + dy * 17 - 9 - lift * 4;
      const fx = kx + dx * 18, fy = ky + 16 + dy * 12 - lift * 3;
      if (lift < 0.15) {      // ayak sudayken halka
        c.strokeStyle = rgba(230, 248, 255, 0.5 - lift * 3); c.lineWidth = 1; ell(fx, fy + 1, 4 + Math.sin(t * 5 + q) * 0.8, 1.6); c.stroke();
      }
      tube([kx, ky, fx, fy], 2.1, lin(kx, ky, fx, fy, '#7fd4ea', '#1c5f78'), fl, 0.3);
      tube([hx, hy, kx, ky], 2.7, lin(hx, hy, kx, ky, '#2d7fa6', '#bff3ff'), fl, 0.35);
      c.fillStyle = fl ? '#ffffff' : '#e8fbff'; c.beginPath(); c.arc(kx, ky, 2.1, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      icicle(hx + dx * 8, hy + dy * 8 - 4.5, hx + dx * 9 - dy * 2, hy + dy * 9 - 11, 1.3, fl);      // dizde buz dikeni
      c.strokeStyle = '#06202c'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + dx * 2.5, fy + 2.5); c.stroke();      // pençe
    }
    // karın: kristal, içinde çekirdek (zayıf nokta) görünür
    add(); glow(x, by, 26, low ? '255,90,90' : '120,230,255', 0.2 + 0.1 * pul + U * 0.3); end();
    ell(x, by, 20, 17); c.fillStyle = fl ? '#ffffff' : rad(x, by, 20, '#dff8ff', '#2f8db0', '#0a3448'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.9; c.stroke();
    core(x, by + 1, 5.5, hpf, '120,230,255', t);
    if (!fl) {      // kesilmiş taş yüzeyleri (yarı saydam)
      c.fillStyle = 'rgba(255,255,255,0.28)'; path([x - 12, by - 8, x - 2, by - 16.5, x + 9, by - 10, x - 1, by - 3]); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.14)'; path([x + 9, by - 10, x + 19, by - 3, x + 16, by + 9, x + 6, by + 4]); c.fill();
      c.fillStyle = 'rgba(5,30,50,0.3)'; path([x - 12, by - 8, x - 1, by - 3, x - 3, by + 15, x - 15, by + 9, x - 19.5, by]); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 0.8; c.beginPath();
      c.moveTo(x - 2, by - 16.5); c.lineTo(x - 1, by - 3); c.lineTo(x - 3, by + 15); c.moveTo(x - 1, by - 3); c.lineTo(x + 19, by - 3); c.moveTo(x - 1, by - 3); c.lineTo(x - 19.5, by); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.85)'; ell(x - 8, by - 10, 3, 1.6, -0.6); c.fill();
    }
    for (let i = 0; i < 5; i++) {      // sırt kristalleri
      const a = PI * 1.12 + i * 0.19 * PI, L = 7 + 4 * Math.sin(i / 4 * PI) + U * 3;
      const bx = x + Math.cos(a) * 18, byy = by + Math.sin(a) * 15;
      icicle(bx, byy, bx + Math.cos(a) * L, byy + Math.sin(a) * L, 2.2, fl, '#5fc0e8', '#ffffff');
    }
    // boyun (karın ile baş arası)
    shape([x - 7, by + 13, x + 7, by + 13, x + 8, y + 3, x - 8, y + 3], x, by + 13, x, y + 3, '#2d7fa6', '#0d3a50', fl, OUT, 1.2);
    // baş-göğüs
    ell(x, y + 10, 13, 10.5); c.fillStyle = fl ? '#ffffff' : rad(x, y + 10, 13, '#bff3ff', '#2d7fa6', '#0a3448'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.7; c.stroke();
    if (!fl) { c.fillStyle = 'rgba(255,255,255,0.3)'; path([x, y + 0.5, x + 5, y + 4, x + 2, y + 9, x - 2, y + 9, x - 5, y + 4]); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.7)'; ell(x - 6, y + 4, 2.6, 1.3, -0.5); c.fill();
    // 8 göz (2+2+2+2)
    eye(x - 3.6, y + 13, 2.2, '255,60,90', 3); eye(x + 3.6, y + 13, 2.2, '255,60,90', 3);
    eye(x - 7.6, y + 10.5, 1.5, '255,60,90', 3); eye(x + 7.6, y + 10.5, 1.5, '255,60,90', 3);
    eye(x - 10.2, y + 14.5, 1.1, '255,60,90', 3); eye(x + 10.2, y + 14.5, 1.1, '255,60,90', 3);
    eye(x - 1.6, y + 8.8, 1, '255,60,90', 3); eye(x + 1.6, y + 8.8, 1, '255,60,90', 3);
    // pedipalpler + zehir dişleri (açılıp kapanır)
    const op = 1.5 + 1.5 * Math.sin(t * 3 + ph) + U * 2.5;
    for (let s = -1; s <= 1; s += 2) {
      tube([x + s * 10, y + 17, x + s * 15, y + 24], 1.6, '#3c8ea6', fl, 0.3);
      shape([x + s * 1.5, y + 18, x + s * 7, y + 18, x + s * 7, y + 24, x + s * 3.5, y + 26], x, y + 18, x, y + 26, '#1f6a80', '#082733', fl, OUT, 1.1);
      shape([x + s * 3, y + 25, x + s * 6.5, y + 24, x + s * (2.5 + op), y + 31], x, y + 24, x, y + 31, '#ffffff', '#bfe9f5', fl, 'rgba(5,20,35,0.85)', 0.9);
      add(); glow(x + s * (2.5 + op), y + 31, 3.5, '140,255,200', 0.5 + 0.3 * pul); end();
    }
    return [[-10, -24, -6, -17, -10, -10], [9, -22, 13, -15], [-6, 4, -3, 9, -6, 13], [7, 2, 10, 8], [0, -30, 3, -25]];
  }

  // ---------- 2 · FIRTINA KARTALI: tüy katmanlı çırpan kanatlar, fırtına bulutları, şimşek, beyaz baş aşağı bakar ----------
  function eagle(e, x, y, t, fl, hpf) {
    const ph = e.ph || 0, fp = Math.sin(t * (4 + LG * 3) + ph) * 8, pul = 0.5 + 0.5 * Math.sin(t * 3), flash = Math.sin(t * 3 + ph) > 0.82 || U > 0.55, low = hpf < 0.5;
    base(x, y, t, 50, 14, 0.3);
    // fırtına bulutları (kanatların arkasında), şimşekte aydınlanır
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 4; i++) {
      const cx = x + s * (28 + i * 8 + Math.sin(t * 0.8 + i + s) * 2), cy = y - 27 - fp * 0.4 + (i % 2) * 9 + Math.sin(t * 1.1 + i * 2) * 1.5, r = 9.5 - i;
      ell(cx, cy, r * 1.5, r); c.fillStyle = rad(cx, cy, r * 1.5, flash ? 'rgba(200,215,245,0.7)' : 'rgba(150,160,190,0.6)', 'rgba(50,56,85,0.55)', 'rgba(30,34,55,0)'); c.fill();
    }
    if (flash) { add(); glow(x, y - 22, 70, '160,210,255', 0.2 + U * 0.15); end(); }
    // kanatlar: ikincil tüyler → birincil yelpaze → örtü tüyleri
    for (let s = -1; s <= 1; s += 2) {
      const wx = x + s * 24, wy = y - 9 - fp * 0.6;      // bilek
      for (let k = 0; k < 4; k++) feather(x + s * (9 + k * 4), y - 9 - fp * 0.15 * k, s * 0.3, -0.95, 15 + (k % 2) * 2, 3, fl, 1, '#5a2e10', '#3a1a06', 'rgba(255,200,140,0.3)');
      for (let k = 6; k >= 0; k--) {
        const th = -1.2 + k * 0.23, L = 31 - Math.abs(k - 2.5) * 2.4;
        feather(wx + s * k * 1.2, wy + k * 1.6, s * Math.cos(th), Math.sin(th), L, 3.4, fl, k % 2 ? 1.5 : 0.7, '#4a2408', k % 2 ? '#e9a94a' : '#c47a2a', 'rgba(255,215,150,0.35)');
      }
      path([x + s * 6, y - 10, x + s * 16, y - 14 - fp * 0.4, wx + s * 2, wy - 3.5, wx + s * 12, wy, wx + s * 10, wy + 7, wx + s * 3, wy + 10, x + s * 16, y + 4, x + s * 8, y + 5]);
      c.fillStyle = fl ? '#ffffff' : lin(x, y - 12, wx + s * 8, wy + 10, '#c8863a', '#4a2408'); c.fill();
      c.strokeStyle = OUT; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
      c.strokeStyle = 'rgba(40,20,8,0.45)'; c.lineWidth = 0.9; c.beginPath();      // örtü tüyü pulları (iki sıra)
      for (let r = 0; r < 2; r++) for (let q = 0; q < 4; q++) { const px = x + s * (10 + q * 5.5 + r * 2.5), py = y - 9 + r * 6 - fp * 0.2 * (q / 4); c.moveTo(px - s * 2.5, py); c.quadraticCurveTo(px, py + 3, px + s * 2.5, py); }
      c.stroke();
      c.strokeStyle = 'rgba(255,240,210,0.55)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + s * 7, y - 10); c.quadraticCurveTo(x + s * 16, y - 15 - fp * 0.4, wx, wy - 3); c.stroke();      // kenar ışığı
    }
    // kuyruk yelpazesi (üstte, beyaz uçlu)
    for (let k = -2; k <= 2; k++) { const a = -PI / 2 + k * 0.26; feather(x + k * 2, y - 12, Math.cos(a), Math.sin(a), 21 - Math.abs(k) * 1.5, 3.2, fl, 1, '#3a1c08', '#f4f7fb', 'rgba(60,40,20,0.6)'); }
    // gövde (omuzda geniş, başa doğru daralır) + göğüs pulları
    shape([x, y - 16, x + 10, y - 8, x + 11, y + 2, x + 8, y + 12, x, y + 16, x - 8, y + 12, x - 11, y + 2, x - 10, y - 8], x - 11, y - 16, x + 11, y + 16, '#e0ad62', '#4a2408', fl, OUT, 1.7);
    c.strokeStyle = 'rgba(40,20,8,0.5)'; c.lineWidth = 0.9; c.beginPath();
    for (let r = 0; r < 4; r++) for (let q = -1; q <= 1; q++) { const px = x + q * 5 + (r % 2) * 2.5, py = y - 7 + r * 5; c.moveTo(px - 2.5, py); c.quadraticCurveTo(px, py + 2.5, px + 2.5, py); }
    c.stroke();
    core(x, y + 1, 5, hpf, '255,180,80', t);
    // pençeler arasında tutulan şimşek (boynun arkasından geçer, iki yandan taşar)
    const ly = y + 18, jt = Math.floor(t * 30) % 3;
    add(); c.lineCap = 'round'; c.lineJoin = 'round';
    const bolt = [x - 15, ly + 1, x - 9 + jt, ly - 2, x - 2 - jt, ly + 2, x + 5, ly - 2 + jt, x + 15, ly + 1];
    line(bolt); c.strokeStyle = rgba(140, 200, 255, 0.5 + U * 0.3); c.lineWidth = 4 + U * 3; c.stroke();
    line(bolt); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.2; c.stroke();
    glow(x - 15, ly + 1, 7 + U * 4, '160,210,255', 0.7); glow(x + 15, ly + 1, 7 + U * 4, '160,210,255', 0.7);
    if (flash) {      // kanat uçlarından aşağı inen şimşekler
      for (let s = -1; s <= 1; s += 2) {
        const p = [x + s * 50, y - 14 - fp, x + s * (55 + jt), y - 4, x + s * 49, y + 2 + jt, x + s * (57 - jt), y + 12, x + s * 52, y + 20];
        line(p); c.strokeStyle = 'rgba(140,200,255,0.5)'; c.lineWidth = 4; c.stroke();
        line(p); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.3; c.stroke();
        glow(x + s * 50, y - 14 - fp, 10, '160,210,255', 0.6);
      }
    }
    end();
    // bacaklar (gövdenin yanında): tüylü but + sarı tarsus + şimşeği kavrayan üç pençe
    for (let s = -1; s <= 1; s += 2) {
      tube([x + s * 8, y + 8, x + s * 12, y + 13], 3, lin(0, y + 7, 0, y + 14, '#d9a35a', '#7a4214'), fl, 0.3);
      tube([x + s * 12, y + 13, x + s * 14, ly - 1], 1.8, '#e0b040', fl, 0.3);
      for (let q = -1; q <= 1; q++) {
        line([x + s * 14, ly - 1, x + s * 14 + q * 2.6, ly + 4.5]); c.strokeStyle = '#1a1006'; c.lineWidth = 2.8; c.stroke();
        c.strokeStyle = fl ? '#ffffff' : '#f0c04a'; c.lineWidth = 1.3; c.stroke();
      }
    }
    // beyaz baş (aşağı bakar): ense tüyleri, kafa, sert kaş, gözler, kancalı gaga
    shape([x - 8, y + 13, x - 5.5, y + 15.5, x - 3, y + 13.5, x, y + 16, x + 3, y + 13.5, x + 5.5, y + 15.5, x + 8, y + 13, x + 8, y + 19, x - 8, y + 19], x, y + 13, x, y + 19, '#ffffff', '#c9d3dd', fl, OUT, 1.1);
    ell(x, y + 21.5, 7.6, 8); c.fillStyle = fl ? '#ffffff' : rad(x, y + 21.5, 8, '#ffffff', '#e2e9f0', '#8d9aa8'); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = 'rgba(25,20,15,0.85)'; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();      // çatık kaşlar
    c.moveTo(x - 7.5, y + 17.5); c.lineTo(x - 1.5, y + 20.5); c.moveTo(x + 7.5, y + 17.5); c.lineTo(x + 1.5, y + 20.5); c.stroke();
    eye(x - 4, y + 22, 1.9, '255,220,60', 3); eye(x + 4, y + 22, 1.9, '255,220,60', 3);
    c.fillStyle = '#1a1206'; c.beginPath(); c.arc(x - 4, y + 22.3, 0.8, 0, TAU); c.arc(x + 4, y + 22.3, 0.8, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(x - 3.8, y + 26); c.quadraticCurveTo(x - 4.6, y + 32, x + 0.6, y + 36); c.quadraticCurveTo(x + 4.2, y + 31, x + 3.8, y + 26); c.closePath();
    c.fillStyle = fl ? '#ffffff' : lin(x - 4, y + 26, x + 2, y + 36, '#ffd24a', '#c97a10'); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
    c.strokeStyle = 'rgba(80,40,0,0.6)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - 3, y + 28.5); c.quadraticCurveTo(x, y + 30, x + 3, y + 28.5); c.stroke();
    c.fillStyle = 'rgba(80,40,0,0.7)'; ell(x - 1.6, y + 27.3, 0.6, 0.9); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; ell(x - 2.2, y + 27.5, 0.7, 1.4, 0.3); c.fill();
    if (low) { add(); glow(x - 24, y - 6, 7, '255,120,60', 0.3 + 0.3 * Math.sin(t * 15)); end(); }
    return [[-9, -4, -5, 1, -8, 6], [8, -6, 11, 0], [-30, -10, -25, -5], [27, -11, 32, -6], [-2, 9, 2, 13]];
  }

  // ---------- 3 · BUZ KALESİ: taş sur, iki kule + buz sivri, flamalar, zincirli kapı arkasında çekirdek, dönen top halkası ----------
  function fortress(e, x, y, t, fl, hpf) {
    const sp = e.spin || 0, ph = e.ph || 0, pul = 0.5 + 0.5 * Math.sin(t * 3), low = hpf < 0.5;
    base(x, y, t, 60, 16, 0.34);
    // iç kale (arkada) + merlonlar + merkez buz sivrisi
    shape([x - 17, y - 33, x + 17, y - 33, x + 19, y - 12, x - 19, y - 12], x, y - 33, x, y - 12, '#a6b4ca', '#4a5872', fl, OUT, 1.5);
    for (let q = 0; q < 4; q++) { const bx = x - 15.5 + q * 8.6; shape([bx, y - 33, bx + 5.3, y - 33, bx + 5.3, y - 39, bx, y - 39], bx, y - 39, bx, y - 33, '#c3cfe0', '#6a7890', fl, OUT, 1.1); }
    icicle(x, y - 36, x, y - 58 - U * 6, 4.5, fl, '#8fd8ff', '#ffffff');
    add(); glow(x, y - 56, 7, '160,230,255', 0.4 + 0.3 * pul + U * 0.4); end();
    // kuleler
    for (let s = -1; s <= 1; s += 2) {
      const tx = x + s * 47;
      shape([tx - 9, y - 27, tx + 9, y - 27, tx + 11, y + 18, tx - 11, y + 18], tx - 11, 0, tx + 11, 0, '#b8c5da', '#3a4458', fl, OUT, 1.7);
      c.strokeStyle = 'rgba(10,15,25,0.4)'; c.lineWidth = 1; c.beginPath();      // taş sıraları
      for (let r = 0; r < 5; r++) { const yy = y - 20 + r * 9; c.moveTo(tx - 10, yy); c.lineTo(tx + 10, yy); c.moveTo(tx + (r % 2 ? -4 : 3), yy); c.lineTo(tx + (r % 2 ? -4 : 3), yy + 9); }
      c.stroke();
      ell(tx, y - 27, 10, 3.6); c.fillStyle = fl ? '#ffffff' : '#55637c'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
      shape([tx - 10, y - 27, tx, y - 50, tx + 10, y - 27], tx - 10, y - 27, tx + 10, y - 50, '#8fd8ff', '#ffffff', fl, 'rgba(20,50,80,0.85)', 1.3);      // buz sivri
      c.fillStyle = 'rgba(255,255,255,0.35)'; path([tx - 8, y - 28, tx, y - 48, tx - 1, y - 28]); c.fill();
      add(); glow(tx, y - 48, 5, '160,230,255', 0.35 + 0.3 * pul); end();
      // flama (dalgalanır)
      const w1 = Math.sin(t * 4 + s + ph) * 2.5, w2 = Math.sin(t * 4 + s + 1.3 + ph) * 2.5;
      c.strokeStyle = '#1b2431'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(tx, y - 50); c.lineTo(tx, y - 64); c.stroke();
      shape([tx, y - 64, tx + s * 8, y - 61 + w1, tx + s * 15, y - 60 + w2, tx + s * 7, y - 56 + w1, tx, y - 53], tx, 0, tx + s * 15, 0, '#ff8a3c', '#b8431a', fl, OUT, 1);
      // pencere gözleri (turuncu) + ok yarığı
      c.fillStyle = '#0a0e16'; c.fillRect(tx - 1.2, y - 20, 2.4, 7);
      add(); glow(tx, y - 16.5, 4, '255,130,60', 0.5 + 0.3 * pul); end();
      c.fillStyle = fl ? '#ffffff' : rad(tx, y - 6, 4, '#2a1a10', '#0a0e16'); c.beginPath(); c.arc(tx, y - 6, 4, 0, TAU); c.fill();
      eye(tx, y - 6, 2.4, '255,130,60', 3.5);
      // kule dibindeki buz kristalleri
      icicle(tx + s * 8, y + 16, tx + s * 15, y + 4, 2.4, fl); icicle(tx + s * 4, y + 17, tx + s * 10, y + 10, 1.6, fl); icicle(tx - s * 6, y + 18, tx - s * 10, y + 11, 1.6, fl);
    }
    // ana sur + derzler + alt buz kaplaması + kenar ışığı
    shape([x - 42, y - 14, x + 42, y - 14, x + 46, y + 16, x - 46, y + 16], x, y - 14, x, y + 16, '#9aa9c0', '#2a3242', fl, OUT, 1.9);
    c.strokeStyle = 'rgba(10,15,25,0.5)'; c.lineWidth = 1; c.beginPath();
    for (let r = 0; r < 3; r++) { const yy = y - 4 + r * 9; c.moveTo(x - 44, yy); c.lineTo(x + 44, yy); for (let q = 0; q < 6; q++) { const cx = x - 36 + q * 14 + (r % 2) * 7; c.moveTo(cx, yy - 9); c.lineTo(cx, yy); } }
    c.stroke();
    if (!fl) {
      c.fillStyle = lin(0, y - 14, 0, y - 6, 'rgba(5,10,20,0.45)', 'rgba(5,10,20,0)'); path([x - 42, y - 14, x + 42, y - 14, x + 43, y - 6, x - 43, y - 6]); c.fill();      // mazgal gölgesi
      c.fillStyle = lin(0, y + 6, 0, y + 16, 'rgba(140,220,255,0)', 'rgba(140,220,255,0.32)'); path([x - 45, y + 6, x + 45, y + 6, x + 46, y + 16, x - 46, y + 16]); c.fill();      // buz kaplaması
    }
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - 41, y - 13.4); c.lineTo(x + 41, y - 13.4); c.stroke();
    for (let q = 0; q < 6; q++) {      // merlonlar (karlı tepeli) + aralardan sarkan buz
      const bx = x - 40 + q * 15;
      shape([bx, y - 14, bx + 8, y - 14, bx + 8, y - 23, bx, y - 23], bx, y - 23, bx, y - 14, '#c3cfe0', '#5d6a80', fl, OUT, 1.2);
      shape([bx - 0.5, y - 23, bx + 8.5, y - 23, bx + 7.5, y - 25.5, bx + 4, y - 26.5, bx + 0.5, y - 25.5], bx, y - 26, bx, y - 23, '#ffffff', '#d6e6f5', fl, 'rgba(60,90,120,0.6)', 0.9);
      if (q < 5) icicle(bx + 11.5, y - 14, bx + 11.5, y - 6 - (q % 2) * 3, 1.5, fl, '#9fe0ff', '#ffffff');
    }
    // kapı: kemerli açıklık, içinde çekirdek, önünde demir parmaklık
    c.fillStyle = fl ? '#ffffff' : lin(0, y - 10, 0, y + 14, '#1b2230', '#05070c');
    c.beginPath(); c.moveTo(x - 10, y + 14); c.lineTo(x - 10, y - 4); c.arc(x, y - 4, 10, PI, 0); c.lineTo(x + 10, y + 14); c.closePath(); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.7; c.stroke();
    c.strokeStyle = 'rgba(190,205,225,0.5)'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y - 4, 11.5, PI + 0.1, -0.1); c.stroke();      // kemer taşı
    core(x, y + 3, 6, hpf, '255,150,70', t);
    c.strokeStyle = '#2a3140'; c.lineWidth = 1.8; c.beginPath();
    for (let q = -1; q <= 1; q++) { c.moveTo(x + q * 5, y - 12 + Math.abs(q) * 1.5); c.lineTo(x + q * 5, y + 14); }
    c.moveTo(x - 10, y + 1); c.lineTo(x + 10, y + 1); c.moveTo(x - 10, y + 8); c.lineTo(x + 10, y + 8); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.6; c.beginPath(); for (let q = -1; q <= 1; q++) { c.moveTo(x + q * 5 - 0.6, y - 10); c.lineTo(x + q * 5 - 0.6, y + 14); } c.stroke();
    // zincirler: kapı üstünden kulelere, hafif sallanır
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k <= 7; k++) {
        const u = k / 7, cx = x + s * (12 + u * 24), cy = y - 12 + Math.sin(u * PI) * 6 + Math.sin(t * 2.2 + k + s) * 0.7 - u * 6;
        c.fillStyle = k % 2 ? '#1d2430' : '#3a4454'; ell(cx, cy, 1.7, 1.2, s * 0.4); c.fill();
        c.strokeStyle = 'rgba(200,215,235,0.5)'; c.lineWidth = 0.5; c.stroke();
      }
    }
    // dönen top bataryası (ön yarı)
    for (let q = 0; q < 8; q++) {
      const a = sp + q * PI / 4, d = Math.sin(a);
      if (d < 0) continue;
      const cx = x + Math.cos(a) * 27, cy = y + 4 + d * 9, sc = 0.75 + d * 0.35;
      shape([cx - 1.8 * sc, cy, cx + 1.8 * sc, cy, cx + 1.5 * sc, cy + 8 * sc, cx - 1.5 * sc, cy + 8 * sc], cx - 2, 0, cx + 2, 0, '#55637c', '#141a26', fl, OUT, 1.1);      // namlu
      c.fillStyle = '#05080e'; c.beginPath(); c.arc(cx, cy + 8 * sc, 1.1 * sc, 0, TAU); c.fill();
      c.beginPath(); c.arc(cx, cy + 0.5, 4.4 * sc, PI, 0); c.closePath();      // kubbe
      c.fillStyle = fl ? '#ffffff' : rad(cx, cy - 1, 4.4 * sc, '#7c8aa4', '#303a4e', '#0e131c'); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = fl ? '#ffffff' : '#2a3140'; c.fillRect(cx - 5 * sc, cy - 0.2, 10 * sc, 1.8 * sc);
      add(); glow(cx, cy + 8 * sc, 3 + U * 5, '255,150,70', 0.45 + U * 0.5); end();
      c.fillStyle = '#ffb060'; c.beginPath(); c.arc(cx, cy - 1.5 * sc, 1.1 * sc, 0, TAU); c.fill();
    }
    if (low) { add(); glow(x - 20, y - 20, 10, '255,120,60', 0.3 + 0.3 * Math.sin(t * 13)); end(); }
    return [[-30, -8, -24, -2, -28, 6], [26, -10, 31, -3, 28, 4], [-14, 8, -10, 13], [-12, -30, -8, -24], [40, 0, 44, 6]];
  }

  // ---------- 4 · KUZEY KRALI: altın taç ve kürk yaka, dalgalanan pelerin, kristal asa, yörünge kristalleri, rün halkası ----------
  const KGLY = [[0, -1, 0, 1, -0.6, -0.4, 0.6, 0.4], [-0.6, -1, 0.6, 1, 0.6, -1, -0.6, 1], [0, -1, 0, 1, 0, -1, 0.6, -0.3, 0, 0.2, -0.6, 0.6]];
  function orbit(x, y, t, sp, fl, front, hue) {
    const r = 40 - U * 16, spd = sp * 1.5 + U * t * 4;
    for (let q = 0; q < 6; q++) {
      const a = spd + q * TAU / 6, d = Math.sin(a);
      if ((d > 0) !== front) continue;
      const ox = x + Math.cos(a) * r, oy = y + 6 + d * r * 0.4, sc = 0.8 + 0.3 * (d + 1) / 2, pink = q % 2;
      add(); c.strokeStyle = pink ? 'rgba(255,90,190,0.35)' : 'rgba(60,230,170,0.35)'; c.lineWidth = 2.5 * sc;
      c.beginPath(); c.ellipse(x, y + 6, r, r * 0.4, 0, a - 0.5, a); c.stroke();
      glow(ox, oy, 7 * sc, pink ? '255,120,220' : '100,255,200', 0.5 + U * 0.4); end();
      shape([ox, oy - 6 * sc, ox + 3.6 * sc, oy, ox, oy + 6 * sc, ox - 3.6 * sc, oy], ox, oy - 6, ox, oy + 6, pink ? '#ffd0f0' : '#c8fff0', pink ? '#ff4fb0' : '#20c090', fl, 'rgba(10,10,30,0.7)', 1);
      c.fillStyle = 'rgba(255,255,255,0.7)'; path([ox, oy - 5 * sc, ox + 1.6 * sc, oy - 1, ox, oy]); c.fill();
    }
  }
  function king(e, x, y, t, fl, hpf) {
    const sp = e.spin || 0, ph = e.ph || 0, pul = 0.5 + 0.5 * Math.sin(t * 2), low = hpf < 0.4;
    base(x, y, t, 52, 20, 0.3);
    add(); glow(x, y, 74, low ? '255,90,120' : '160,90,255', 0.22 + 0.1 * pul + U * 0.25); end();
    // rün halkası (zeminde, perspektifli)
    add();
    c.strokeStyle = rgba(200, 160, 255, 0.45 + U * 0.3); c.lineWidth = 1.5; c.setLineDash([6, 5]); c.lineDashOffset = -sp * 10;
    ell(x, y + 8, 52, 21); c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const a = sp * 0.6 + i * TAU / 6, gx = x + Math.cos(a) * 52, gy = y + 8 + Math.sin(a) * 21, g = KGLY[i % 3], s = 3.2 + Math.sin(a) * 0.8;
      glow(gx, gy, 7, '210,170,255', 0.35 + 0.3 * Math.sin(t * 3 + i));
      c.strokeStyle = 'rgba(235,215,255,0.8)'; c.lineWidth = 1.3; c.beginPath();
      for (let k = 0; k < g.length; k += 4) { c.moveTo(gx + g[k] * s, gy + g[k + 1] * s); c.lineTo(gx + g[k + 2] * s, gy + g[k + 3] * s); }
      c.stroke();
    }
    end();
    orbit(x, y, t, sp, fl, false);
    y += Math.sin(t * 1.4 + ph) * 1.5;      // havada süzülür
    // pelerin
    const w1 = Math.sin(t * 3) * 4, w2 = Math.sin(t * 3 + 1.5) * 4, w3 = Math.sin(t * 3 + 3) * 3;
    shape([x - 19, y - 12, x + 19, y - 12, x + 29, y + 4, x + 42, y + 28 + w1, x + 30, y + 23 + w2, x + 20, y + 31 + w3, x + 9, y + 25 + w1, x, y + 32 + w2, x - 9, y + 25 + w1, x - 20, y + 31 + w3, x - 30, y + 23 + w2, x - 42, y + 28 + w1, x - 29, y + 4],
      x, y - 12, x, y + 32, '#8d4fe6', '#1a0838', fl, OUT, 1.8);
    c.strokeStyle = 'rgba(20,5,45,0.5)'; c.lineWidth = 1.2; c.beginPath();      // kıvrımlar
    for (let q = -2; q <= 2; q++) { c.moveTo(x + q * 8, y - 8); c.quadraticCurveTo(x + q * 11, y + 10, x + q * 10 + (q > 0 ? 2 : -2), y + 26 + (q % 2 ? w1 : w2)); }
    c.stroke();
    c.strokeStyle = 'rgba(255,200,255,0.35)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(x - 19, y - 10); c.quadraticCurveTo(x - 30, y + 6, x - 41, y + 27 + w1); c.stroke();      // kenar ışığı
    c.strokeStyle = 'rgba(255,225,160,0.7)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x - 40, y + 25 + w1); c.lineTo(x - 30, y + 20 + w2); c.lineTo(x - 20, y + 28 + w3); c.lineTo(x - 9, y + 22 + w1); c.lineTo(x, y + 29 + w2); c.lineTo(x + 9, y + 22 + w1); c.lineTo(x + 20, y + 28 + w3); c.lineTo(x + 30, y + 20 + w2); c.lineTo(x + 40, y + 25 + w1); c.stroke();      // altın etek işlemesi
    // zırh gövde + altın işlemeler + kemer
    shape([x - 17, y - 12, x + 17, y - 12, x + 14, y + 15, x - 14, y + 15], x - 17, y, x + 17, y, '#5c4a84', '#1e1530', fl, OUT, 1.6);
    c.strokeStyle = 'rgba(255,225,160,0.8)'; c.lineWidth = 1.1; c.beginPath();
    c.moveTo(x - 14, y - 8); c.lineTo(x - 6, y + 4); c.moveTo(x + 14, y - 8); c.lineTo(x + 6, y + 4); c.moveTo(x - 12, y + 12); c.lineTo(x + 12, y + 12); c.stroke();
    shape([x - 14, y + 7, x + 14, y + 7, x + 13.5, y + 11, x - 13.5, y + 11], x, y + 7, x, y + 11, '#ffe9a8', '#b07a10', fl, OUT, 1);
    c.fillStyle = low ? '#ff5a6a' : '#4fe0c0'; c.beginPath(); c.arc(x, y + 9, 1.6, 0, TAU); c.fill();
    core(x, y - 1, 6.5, hpf, '190,120,255', t);
    // apoletler
    for (let s = -1; s <= 1; s += 2) {
      shape([x + s * 14, y - 16, x + s * 31, y - 10, x + s * 28, y + 1, x + s * 13, y - 4], x + s * 14, y - 16, x + s * 31, y, '#ffe9a8', '#b07a10', fl, OUT, 1.3);
      c.strokeStyle = 'rgba(120,70,10,0.6)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + s * 17, y - 11); c.lineTo(x + s * 26, y - 7); c.moveTo(x + s * 16, y - 7); c.lineTo(x + s * 25, y - 3); c.stroke();
      add(); glow(x + s * 22, y - 9, 4, '255,255,255', 0.4 + 0.3 * pul); end();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + s * 22, y - 9, 1.2, 0, TAU); c.fill();
    }
    // kürk yaka (kakım: beyaz, siyah benekli)
    for (let q = -3; q <= 3; q++) {
      const cx = x + q * 5.2, cy = y - 12 + Math.abs(q) * 0.6;
      ell(cx, cy, 3.6, 3.2); c.fillStyle = fl ? '#ffffff' : rad(cx, cy, 3.6, '#ffffff', '#dbe4ef', '#8fa0b8'); c.fill(); c.strokeStyle = 'rgba(30,20,50,0.7)'; c.lineWidth = 1; c.stroke();
      if (q % 2) { c.fillStyle = '#15101e'; ell(cx, cy + 0.5, 1, 1.4); c.fill(); }
    }
    // asa (sağ el): altın sap, kristal küre, dönen kıvılcımlar
    const ax = x + 25;
    tube([ax, y + 20, ax, y - 42], 1.9, lin(ax - 2, 0, ax + 2, 0, '#ffe9a8', '#b07a10'), fl, 0.4);
    for (let q = 0; q < 4; q++) { const a = q * PI / 2 + PI / 4; shape([ax + Math.cos(a) * 3, y - 44 + Math.sin(a) * 3, ax + Math.cos(a) * 8, y - 46 + Math.sin(a) * 8, ax + Math.cos(a + 0.5) * 3, y - 44 + Math.sin(a + 0.5) * 3], ax, y - 44, ax, y - 52, '#ffe9a8', '#b07a10', fl, OUT, 0.9); }
    add(); glow(ax, y - 46, 14 + U * 10, low ? '255,120,150' : '120,220,255', 0.5 + 0.3 * pul + U * 0.4); end();
    c.fillStyle = fl ? '#ffffff' : rad(ax, y - 46, 5.5, '#ffffff', low ? '#ff7a9a' : '#7fe0ff', low ? '#8a1f3a' : '#1f5a8a'); c.beginPath(); c.arc(ax, y - 46, 5.5, 0, TAU); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
    add(); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.9; c.beginPath(); c.ellipse(ax, y - 46, 8, 3, t * 2.5, 0, TAU); c.stroke();
    for (let q = 0; q < 3; q++) { const a = t * 4 + q * TAU / 3; glow(ax + Math.cos(a) * 8, y - 46 + Math.sin(a) * 3, 2.5, '255,255,255', 0.9); }
    end();
    ell(ax, y + 3, 4.2, 3.8); c.fillStyle = fl ? '#ffffff' : rad(ax, y + 3, 4.2, '#6a5a90', '#1e1530'); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();      // eldivenli el
    c.strokeStyle = 'rgba(255,225,160,0.8)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(ax - 3, y + 1.5); c.lineTo(ax + 3, y + 1.5); c.stroke();
    // sol el: şarjda yukarı kalkar ve enerji toplar
    const hx = x - 24, hy = y + 3 - U * 12 - LG * 4;
    tube([x - 16, y - 4, x - 21, y + 1 - U * 5, hx, hy], 3.2, lin(0, y - 6, 0, y + 6, '#8a6fc0', '#3a2a5c'), fl, 0.35);
    shape([x - 23.5, y - 1 - U * 6, x - 19, y - 2 - U * 6, x - 18, y + 2 - U * 6, x - 22.5, y + 3 - U * 6], x - 23, 0, x - 18, 0, '#ffe9a8', '#b07a10', fl, OUT, 0.9);      // altın bilezik
    ell(hx, hy, 4.2, 3.8); c.fillStyle = fl ? '#ffffff' : rad(hx, hy, 4.2, '#7a6aa4', '#2a1e44'); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
    if (U > 0.05) { add(); glow(hx, hy - 4, 10 + U * 8, '190,120,255', U * (0.5 + 0.3 * pul)); glow(hx, hy - 4, 3, '255,255,255', U * 0.8); end(); }
    // yüz maskesi, yeşil gözler, buz sakal
    shape([x - 11, y - 30, x + 11, y - 30, x + 10.5, y - 20, x + 8, y - 13, x - 8, y - 13, x - 10.5, y - 20], x, y - 30, x, y - 13, '#eef3ff', '#9fb2d0', fl, OUT, 1.5);
    c.strokeStyle = 'rgba(90,110,140,0.5)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y - 20); c.lineTo(x, y - 15); c.moveTo(x - 9, y - 24.5); c.lineTo(x - 2, y - 24.5); c.moveTo(x + 9, y - 24.5); c.lineTo(x + 2, y - 24.5); c.stroke();
    c.fillStyle = '#0a1426'; for (let s = -1; s <= 1; s += 2) { path([x + s * 2, y - 24, x + s * 8.5, y - 25, x + s * 7.5, y - 21, x + s * 2.5, y - 21.5]); c.fill(); }
    eye(x - 5, y - 23, 1.9, '120,255,200', 3.5); eye(x + 5, y - 23, 1.9, '120,255,200', 3.5);
    const BL = [5, 8, 11, 7, 11, 8, 5];
    for (let i = 0; i < 7; i++) { const ix = x - 7.5 + i * 2.5; icicle(ix, y - 13.5, ix + 0.3, y - 13.5 + BL[i] + Math.sin(t * 2 + i) * 0.4, 1.3, fl, '#7fd8ff', '#ffffff'); }
    // taç: altın bant, 5 sivri uç, parlayan taşlar
    shape([x - 13, y - 30, x - 15, y - 42, x - 8, y - 35, x - 4, y - 47, x, y - 37, x + 4, y - 47, x + 8, y - 35, x + 15, y - 42, x + 13, y - 30], x, y - 47, x, y - 30, '#fff3b0', '#c98a10', fl, OUT, 1.4);
    shape([x - 13, y - 33, x + 13, y - 33, x + 13, y - 30, x - 13, y - 30], x, y - 33, x, y - 30, '#ffe9a8', '#a06a08', fl, OUT, 1);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - 4, y - 46); c.lineTo(x - 5.5, y - 38); c.moveTo(x + 4, y - 46); c.lineTo(x + 5.5, y - 38); c.stroke();
    add(); glow(x, y - 31.5, 6, '255,90,200', 0.8 + U * 0.3); glow(x - 7.5, y - 31.5, 4, '120,255,200', 0.6); glow(x + 7.5, y - 31.5, 4, '120,200,255', 0.6); glow(x, y - 44, 5, '255,255,255', 0.35 + 0.3 * pul); end();
    c.fillStyle = '#ff5fb8'; c.beginPath(); c.arc(x, y - 31.5, 1.9, 0, TAU); c.fill();
    c.fillStyle = '#4fe0c0'; c.beginPath(); c.arc(x - 7.5, y - 31.5, 1.3, 0, TAU); c.fill();
    c.fillStyle = '#5fc8ff'; c.beginPath(); c.arc(x + 7.5, y - 31.5, 1.3, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(x - 0.6, y - 32.2, 0.6, 0, TAU); c.fill();
    orbit(x, y, t, sp, fl, true);
    return [[-10, -8, -6, -2, -9, 4], [9, -6, 12, 0, 10, 6], [-3, -28, 0, -22], [20, 12, 24, 18], [-24, 14, -28, 20]];
  }

  const BOSS = { 0: scout, 1: spider, 2: eagle, 3: fortress, 4: king, 5: serpent, 6: crystalEye, 7: giant, 8: raven, 9: deity };
  const SMOKE = { 0: [60, 70, 90], 1: [120, 170, 190], 2: [70, 50, 40], 3: [100, 105, 120], 4: [70, 30, 100], 5: [70, 90, 105], 6: [60, 40, 90], 7: [90, 100, 115], 8: [30, 10, 50], 9: [150, 190, 230] };
  // şarj efektinin merkezi (çekirdek konumu) ve rengi
  const CORE = { 0: [0, 11, '255,90,170'], 1: [0, -11, '120,230,255'], 2: [0, 2, '255,180,80'], 3: [0, 3, '255,150,70'], 4: [0, -1, '190,120,255'], 5: [0, 1.5, '120,240,255'], 6: [0, 0, '180,120,255'], 7: [0, -14, '110,200,255'], 8: [0, 3, '190,80,255'], 9: [0, 5, '170,230,255'] };

  window.FOES = {
    drawEnemy(ctx, e, x, y, t) {
      const f = ENEMY[e.type];
      if (!f) return;
      c = ctx; ctx.save();
      try { U = 0; LG = 0; f(e, x, y, t || 0, e.flash > 0); }
      finally { ctx.restore(); }
    },
    drawBoss(ctx, e, x, y, t) {
      const k = e.kind || 0, f = BOSS[k];
      if (!f) return;
      c = ctx; ctx.save();
      try {
        t = t || 0;
        U = clamp(+e.ulti || 0, 0, 1); LG = clamp(+e.lunge || 0, 0, 1);
        const hpf = clamp(e.maxHp ? e.hp / e.maxHp : 1, 0, 1);
        if (LG > 0) {      // hamle: tepeden sabit, aşağıya (oyuncuya) doğru uzar ve biraz daralır
          const py = y - 46;
          ctx.translate(x, py + LG * 4); ctx.scale(1 - LG * 0.07, 1 + LG * 0.14); ctx.translate(-x, -py);
        }
        const cracks = f(e, x, y, t, e.flash > 0, hpf);
        damage(x, y, t, hpf, cracks, SMOKE[k]);
        const cp = CORE[k];
        charge(x, y, x + cp[0], y + cp[1], t, cp[2]);
      } finally { ctx.restore(); U = 0; LG = 0; }
    }
  };
})();
