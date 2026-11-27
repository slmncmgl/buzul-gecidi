/* Buzul Geçidi — kozmetikler: kızak gövdeleri ve pilot avatarları.
   Sadece görünüm; oyun kuralına dokunmaz. Kütüphane yok, saf Canvas 2D.
   window.COS.drawSled(ctx, id, tier, t)      → o anki orijinde, yerel birimde, burun yukarı
   window.COS.drawAvatar(ctx, id, x, y, r, t) → (x,y) merkezli r yarıçaplı daire içinde portre */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const OUT = '#0b111b';            // koyu dış hat: açık buzda ve koyu suda seçilsin

  /* ---------- ortak yardımcılar ---------- */
  function mod(a, m) { return ((a % m) + m) % m; }
  function path(ctx, a) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]);
    for (let i = 2; i < a.length; i += 2) ctx.lineTo(a[i], a[i + 1]);
    ctx.closePath();
  }
  function pathM(ctx, a, q) {      // x ekseninde aynalı (q = -1 / 1)
    ctx.beginPath(); ctx.moveTo(a[0] * q, a[1]);
    for (let i = 2; i < a.length; i += 2) ctx.lineTo(a[i] * q, a[i + 1]);
    ctx.closePath();
  }
  function lin(ctx, x0, y0, x1, y1, s) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < s.length; i += 2) g.addColorStop(s[i], s[i + 1]);
    return g;
  }
  function rad(ctx, x0, y0, r0, x1, y1, r1, s) {
    const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (let i = 0; i < s.length; i += 2) g.addColorStop(s[i], s[i + 1]);
    return g;
  }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function fill(ctx, f) { ctx.fillStyle = f; ctx.fill(); }
  // önce koyu kontur, sonra dolgu: dışarıda lw/2 kalınlığında hat kalır
  function fo(ctx, f, lw) {
    ctx.lineJoin = 'round'; ctx.lineWidth = lw || 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = f; ctx.fill();
  }
  function line(ctx, pts, col, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function star(ctx, x, y, n, ri, ro, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i * Math.PI / n, r = i % 2 ? ri : ro;
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function sparkle(ctx, x, y, s, col) {          // dört köşeli ışıltı
    if (s <= 0.05) return;
    ctx.beginPath(); ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  // parıltı: radyal gradyan + 'lighter' (shadowBlur yok)
  function glow(ctx, x, y, r, rgb, a) {
    if (a <= 0.005) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rad(ctx, x, y, 0, x, y, r, [0, 'rgba(' + rgb + ',' + a + ')', 0.45, 'rgba(' + rgb + ',' + (a * 0.4) + ')', 1, 'rgba(' + rgb + ',0)']);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------- kızak parçaları ---------- */
  // o: x, y0, y1, w, metal, hi, strut, struts[], sx, tip
  function runners(ctx, o) {
    const x = o.x, y0 = o.y0, y1 = o.y1, w = o.w || 4.2;
    ctx.save(); ctx.lineCap = 'round';
    if (o.struts) {
      ctx.beginPath();
      for (const sy of o.struts) { ctx.moveTo(-x, sy); ctx.lineTo(-o.sx, sy + 1); ctx.moveTo(x, sy); ctx.lineTo(o.sx, sy + 1); }
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = o.strut; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-x, y0); ctx.lineTo(-x, y1); ctx.moveTo(x, y0); ctx.lineTo(x, y1);
    ctx.strokeStyle = OUT; ctx.lineWidth = w; ctx.stroke();
    ctx.strokeStyle = o.metal; ctx.lineWidth = w * 0.56; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-x - 0.4, y0 + 0.6); ctx.lineTo(-x - 0.4, y1 - 1); ctx.moveTo(x - 0.4, y0 + 0.6); ctx.lineTo(x - 0.4, y1 - 1);
    ctx.strokeStyle = o.hi; ctx.lineWidth = 0.55; ctx.stroke();
    if (o.tip) { ctx.fillStyle = o.tip; circ(ctx, -x, y0, w * 0.3); ctx.fill(); circ(ctx, x, y0, w * 0.3); ctx.fill(); }
    ctx.restore();
  }
  function pods(ctx, body, bodyDark, cap, rgb, t) {      // tier ≥ 2 namlu yuvaları (x = ±11)
    for (let q = -1; q <= 1; q += 2) {
      const x = q * 11.25;
      rrect(ctx, x - 1.6, -6.4, 3.2, 10, 1.3); fo(ctx, lin(ctx, x - 1.6, 0, x + 1.6, 0, [0, body, 1, bodyDark]), 1.6);
      ctx.fillStyle = cap; ctx.fillRect(x - 1.6, -0.8, 3.2, 0.9); ctx.fillRect(x - 1.6, 1.4, 3.2, 0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 1.1, -5.6, 0.6, 8.6);
      rrect(ctx, x - 1.9, -8.2, 3.8, 2.3, 0.8); fo(ctx, cap, 1.3);
      ctx.fillStyle = OUT; circ(ctx, x, -7.4, 0.7); ctx.fill();
      glow(ctx, x, -8.4, 3.2, rgb, 0.3 + 0.2 * Math.sin(t * 8 + q));
    }
  }
  function crownSpike(ctx, tipY, t, col, rgb) {          // tier 3 burun sivrisi + parıltı
    glow(ctx, 0, tipY + 2, 10, rgb, 0.32 + 0.16 * Math.sin(t * 6));
    path(ctx, [0, tipY - 5.5, 2.1, tipY + 1.2, -2.1, tipY + 1.2]); fo(ctx, col, 1.4);
    path(ctx, [0, tipY - 5.5, 0, tipY + 1.2, -2.1, tipY + 1.2]); fill(ctx, 'rgba(255,255,255,0.45)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    sparkle(ctx, 0, tipY - 5.5, 1.6 + 1.1 * Math.sin(t * 5), 'rgba(255,255,240,0.9)');
    ctx.restore();
  }
  function cockpit(ctx, x, y, rx, ry, stops, t, frame) {
    ell(ctx, x, y, rx + 0.75, ry + 0.75); fo(ctx, frame || '#1a2330', 1.4);
    ell(ctx, x, y, rx, ry); fill(ctx, lin(ctx, x, y - ry, x, y + ry, stops));
    ctx.save(); ell(ctx, x, y, rx, ry); ctx.clip();
    const g = mod(t * 0.45, 1.7);              // cama kayan parlama
    if (g < 1) {
      const gy = y - ry * 1.6 + g * ry * 3.4;
      line(ctx, [x - rx, gy + rx, x + rx, gy - rx], 'rgba(255,255,255,0.55)', 0.9);
    }
    ctx.restore();
    ell(ctx, x - rx * 0.36, y - ry * 0.36, rx * 0.3, ry * 0.4); fill(ctx, 'rgba(255,255,255,0.78)');
    circ(ctx, x + rx * 0.35, y + ry * 0.45, Math.min(rx, ry) * 0.12); fill(ctx, 'rgba(255,255,255,0.5)');
  }

  /* ---------- 0 KEŞİF ---------- */
  function sled0(ctx, tier, t) {      // turuncu delta mekik: geniş ok kanatlar, çift motor
    for (let q = -1; q <= 1; q += 2) {      // kanatlar
      pathM(ctx, [0, -4, 6, 2, 14, 8, 13, 11, 5, 9, 3, 10], q);
      fo(ctx, lin(ctx, 0, -4, 0, 11, [0, '#ff9a4d', 1, '#b8430e']), 1.6);
      line(ctx, [q * 5.5, 3.2, q * 12.4, 8.6], '#fff1dc', 0.7);
      if (tier >= 1) {      // kanat ucu dikmeleri
        pathM(ctx, [12.2, 4.6, 14.4, 6.8 - tier * 0.6, 14.6, 11, 12.4, 10.6], q);
        fo(ctx, lin(ctx, 0, 4, 0, 11, [0, '#ffc590', 1, '#a8400b']), 1.3);
      }
    }
    if (tier >= 2) pods(ctx, '#3d4a5e', '#141c28', '#ff9a4d', '255,160,80', t);
    if (tier >= 3) crownSpike(ctx, -18, t, '#ffe58a', '255,215,120');
    path(ctx, [0, -18, 4, -8, 5, 4, 4, 10, -4, 10, -5, 4, -4, -8]);      // gövde
    fo(ctx, lin(ctx, -5, 0, 5, 0, [0, '#ffc590', 0.45, '#f6782a', 1, '#b3440c']), 1.8);
    path(ctx, [0, -16.5, -3.3, -8, -4.2, 3.6, -3.2, 3.6, -2.4, -8]); fill(ctx, 'rgba(255,232,205,0.42)');
    rrect(ctx, -5.2, 7, 3.6, 3.6, 0.8); fo(ctx, '#2b3646', 1);      // motor ağızları
    rrect(ctx, 1.6, 7, 3.6, 3.6, 0.8); fo(ctx, '#2b3646', 1);
    const fl = 0.55 + 0.45 * Math.sin(t * 22);
    for (let q = -1; q <= 1; q += 2) { glow(ctx, q * 3.4, 10, 3.6, '255,170,70', 0.6 * fl); circ(ctx, q * 3.4, 9.6, 0.9); fill(ctx, '#ffd9a0'); }
    ctx.fillStyle = '#fff1dc'; ctx.fillRect(-3.5, 2, 7, 1.2);
    ctx.fillStyle = '#7a2c06'; circ(ctx, -3.6, 5, 0.45); ctx.fill(); circ(ctx, 3.6, 5, 0.45); ctx.fill();
    const b = 0.5 + 0.5 * Math.sin(t * 5);      // seyir ışıkları: sol kırmızı, sağ yeşil
    circ(ctx, -13, 9, 0.8); fill(ctx, '#ff4b3a'); glow(ctx, -13, 9, 3, '255,70,50', 0.6 * b);
    circ(ctx, 13, 9, 0.8); fill(ctx, '#7dffa0'); glow(ctx, 13, 9, 3, '120,255,160', 0.6 * (1 - b));
    cockpit(ctx, 0, -7, 2.6, 4.2, [0, '#d8f7ff', 0.45, '#59c3ef', 1, '#0f3a5c'], t, '#16212f');
  }

  /* ---------- 1 KUTUP TİLKİSİ ---------- */
  function sled1(ctx, tier, t) {
    runners(ctx, { x: 8.5, y0: -4, y1: 11, w: 3.6, metal: lin(ctx, 0, -4, 0, 11, [0, '#ffffff', 1, '#b6d4ea']), hi: '#ffffff', strut: '#9cc4de', struts: [0, 5], sx: 4.5 });
    for (let q = -1; q <= 1; q += 2) {
      glow(ctx, q * 8.5, -4, 3.4, '90,230,255', 0.45 + 0.3 * Math.sin(t * 4 + q));
      circ(ctx, q * 8.5, -4, 0.95); fill(ctx, '#c8fbff');
    }
    for (let q = -1; q <= 1; q += 2) {      // arka ok kanatçıklar
      pathM(ctx, [4.4, 3.4, 11, 10, 10.4, 12, 4.2, 9.8], q);
      fo(ctx, lin(ctx, q * 4.5, 4, q * 11, 11, [0, '#f4f9ff', 1, '#8fb3d2']), 1.6);
      line(ctx, [q * 5.2, 4.6, q * 10.6, 10.6], '#4fe3ff', 0.7);
    }
    if (tier >= 1) for (let q = -1; q <= 1; q += 2) {
      pathM(ctx, [4.8, -5, 11.5 + tier, 2.5, 12 + tier, 5, 5, 1.5], q);
      fo(ctx, lin(ctx, q * 5, -3, q * (12 + tier), 4, [0, '#ffffff', 1, '#9cbfdc']), 1.6);
      line(ctx, [q * 5.4, -4.1, q * (11.4 + tier), 3], '#4fe3ff', 0.75);
    }
    if (tier >= 2) pods(ctx, '#eef6fc', '#88a8c6', '#4fe3ff', '90,230,255', t);
    if (tier >= 3) {
      glow(ctx, 0, -15, 10, '255,225,140', 0.32 + 0.15 * Math.sin(t * 6));
      for (let q = -1; q <= 1; q += 2) { pathM(ctx, [1.5, -11.5, 4.8, -17.6, 3.4, -10.4], q); fo(ctx, '#ffe27a', 1.2); }
    }
    const H = [0, -19.5, 1.5, -13, 4.6, -4, 5.6, 6, 4, 11, -4, 11, -5.6, 6, -4.6, -4, -1.5, -13];
    path(ctx, H); fo(ctx, lin(ctx, -6, 0, 6, 0, [0, '#ffffff', 0.5, '#e3f0fa', 1, '#8aaccb']), 2.1);
    for (let q = -1; q <= 1; q += 2) {      // buz mavisi yan paneller
      pathM(ctx, [2.2, -9, 4.3, -3, 4.9, 6, 3.6, 9.6, 2.6, 9.6, 3, -2], q);
      fill(ctx, q < 0 ? 'rgba(130,200,245,0.55)' : 'rgba(70,130,195,0.6)');
    }
    ctx.fillStyle = '#38c9f2'; ctx.fillRect(-1.7, 2.5, 0.9, 8); ctx.fillRect(0.8, 2.5, 0.9, 8);
    for (let q = -1; q <= 1; q += 2) {      // tilki kulağı hava girişleri
      pathM(ctx, [2.0, 1.2, 4.3, -0.6, 4.1, 4.2], q); fo(ctx, '#1b2a3c', 1);
      pathM(ctx, [2.7, 1.4, 3.8, 0.5, 3.7, 3.1], q); fill(ctx, 'rgba(79,227,255,0.85)');
    }
    path(ctx, [0, -19.5, 0.9, -16.4, -0.9, -16.4]); fill(ctx, tier >= 3 ? '#ffe27a' : '#4fe3ff');
    const L = [4.8, -2.4, 5.35, 1.6, 5.5, 5.6, 4.5, 9.4];
    for (let i = 0; i < 4; i++) {           // kayan seyir ışıkları
      const a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 7 - i * 1.1));
      for (let q = -1; q <= 1; q += 2) {
        glow(ctx, q * L[i * 2], L[i * 2 + 1], 2.5, '80,230,255', 0.6 * a);
        circ(ctx, q * L[i * 2], L[i * 2 + 1], 0.55); fill(ctx, 'rgba(225,255,255,' + (0.45 + 0.55 * a) + ')');
      }
    }
    cockpit(ctx, 0, -7, 2.3, 5.4, [0, '#e6fdff', 0.4, '#55d6f5', 1, '#083456'], t, '#1a2a3c');
    if (tier >= 3) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let q = -1; q <= 1; q += 2) sparkle(ctx, q * 4.8, -17.6, 1.3 + 0.8 * Math.sin(t * 5 + q), 'rgba(255,250,220,0.9)');
      ctx.restore();
    }
  }

  /* ---------- 2 KIZIL ŞİMŞEK ---------- */
  function sled2(ctx, tier, t) {
    runners(ctx, { x: 9, y0: -5, y1: 11, metal: lin(ctx, 0, -5, 0, 11, [0, '#a3acbd', 1, '#454c5a']), hi: '#ff5a5a', strut: '#2a2f3a', struts: [-1, 5], sx: 5, tip: '#ff2a2a' });
    if (tier >= 1) for (let q = -1; q <= 1; q += 2) {
      const e = 13.4 + tier * 0.6;
      pathM(ctx, [7.2, 0, e, 4, e - 0.5, 11, 7.2, 9.5], q);
      fo(ctx, lin(ctx, q * 7, 0, q * e, 0, [0, '#2c323d', 1, '#0c0f14']), 1.8);
      ctx.lineJoin = 'round';
      line(ctx, [q * 7.9, 0.9, q * (e - 0.3), 4.5, q * (e - 0.7), 10.3], '#ff3b3b', 0.8);
    }
    if (tier >= 2) pods(ctx, '#353b46', '#0d1015', '#ff3b3b', '255,70,50', t);
    if (tier >= 3) crownSpike(ctx, -15.5, t, '#ffd83a', '255,205,60');
    const W = [0, -15.5, 3, -9, 8, 6, 7.5, 11, -7.5, 11, -8, 6, -3, -9];
    path(ctx, W); fo(ctx, lin(ctx, -8, 0, 8, 0, [0, '#3c424e', 0.5, '#1b1f27', 1, '#0a0c11']), 2.2);
    for (let q = -1; q <= 1; q += 2) {      // kırmızı yan paneller
      pathM(ctx, [1.6, -12, 7.5, 5.5, 7.1, 9.6, 4.2, 9.6, 2.4, -3.5], q);
      fill(ctx, lin(ctx, q * 1.6, -12, q * 7.5, 9, [0, '#ff6a55', 0.55, '#d81e26', 1, '#7a0a10']));
      line(ctx, [q * 1.0, -13.2, q * 2.3, -6], '#ffd83a', 0.7);
    }
    line(ctx, [-1.7, -11.6, -7.4, 5.3], 'rgba(255,200,180,0.8)', 0.55);
    path(ctx, [0, -14, 1.2, -9, 1.2, 10, -1.2, 10, -1.2, -9]); fill(ctx, '#0b0d12');
    for (let q = -1; q <= 1; q += 2) for (let k = 0; k < 3; k++)
      line(ctx, [q * 4.4, 0.6 + k * 1.6, q * 5.7, 1.2 + k * 1.6], '#3a0609', 0.6);
    // şimşek çizgisi
    const fl = 0.6 + 0.4 * Math.abs(Math.sin(t * 9) * Math.sin(t * 3.7 + 1));
    glow(ctx, 0.3, 4.6, 6.5, '255,220,60', 0.4 * fl);
    path(ctx, [1.6, -0.8, -1.9, 4.4, 0.1, 4.4, -1.3, 10, 2.4, 3.2, 0.4, 3.2, 2.6, -0.8]);
    fo(ctx, '#ffd83a', 1.1); fill(ctx, 'rgba(255,255,235,' + (0.55 * fl) + ')');
    for (let q = -1; q <= 1; q += 2) {      // ikiz egzoz
      ell(ctx, q * 3.9, 10.4, 1.9, 1.15); fo(ctx, '#1a1d24', 1);
      ell(ctx, q * 3.9, 10.5, 1.1, 0.6); fill(ctx, '#ff8a2a');
      glow(ctx, q * 3.9, 11, 3.2, '255,120,40', 0.4 + 0.3 * Math.sin(t * 20 + q));
    }
    cockpit(ctx, 0, -5.6, 2.1, 3.8, [0, '#ffd6c8', 0.4, '#e0403a', 1, '#2a0508'], t, '#0b0d12');
  }

  /* ---------- 3 MOR KUYRUKLU YILDIZ ---------- */
  function hull3(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -14.5);
    ctx.bezierCurveTo(4.5, -14.5, 7.4, -7, 7.4, 1); ctx.bezierCurveTo(7.4, 7.5, 4.8, 11, 0, 11);
    ctx.bezierCurveTo(-4.8, 11, -7.4, 7.5, -7.4, 1); ctx.bezierCurveTo(-7.4, -7, -4.5, -14.5, 0, -14.5);
    ctx.closePath();
  }
  function sled3(ctx, tier, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';     // ışıltı izi
    for (let i = 0; i < 6; i++) {
      const p = mod(t * 0.8 + i / 6, 1), q = i % 2 ? 1 : -1;
      const x = q * (2.4 + 2.4 * p + (i >> 1) * 0.9) + Math.sin(t * 3 + i) * 0.6, y = 10 + p * 8.5;
      sparkle(ctx, x, y, (1 - p) * 2, 'rgba(255,195,245,' + ((1 - p) * 0.9).toFixed(3) + ')');
    }
    ctx.restore();
    runners(ctx, { x: 8.5, y0: -5, y1: 10, metal: lin(ctx, 0, -5, 0, 10, [0, '#f2eaff', 1, '#a189d6']), hi: '#ffc2ef', strut: '#9a7fd0', struts: [-1, 5], sx: 5, tip: '#ff7ad9' });
    if (tier >= 1) for (let q = -1; q <= 1; q += 2) {   // taç yaprağı kanatçıklar
      ctx.beginPath(); ctx.moveTo(q * 6.6, 0);
      ctx.bezierCurveTo(q * (11 + tier), 1, q * (13.5 + tier), 7, q * (12 + tier), 10.5);
      ctx.bezierCurveTo(q * 9.5, 9.5, q * 7.5, 8.5, q * 6.6, 7.5); ctx.closePath();
      fo(ctx, lin(ctx, q * 6.6, 0, q * (13 + tier), 9, [0, '#dc90ff', 1, '#6a2bb0']), 1.8);
      ctx.beginPath(); ctx.moveTo(q * 7.4, 3); ctx.quadraticCurveTo(q * (10.5 + tier), 4.5, q * (11.6 + tier), 9.4);
      ctx.strokeStyle = 'rgba(255,150,230,0.8)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
    if (tier >= 2) pods(ctx, '#8257cc', '#2c1260', '#ff7ad9', '255,120,220', t);
    if (tier >= 3) {
      glow(ctx, 0, -14, 10, '255,170,240', 0.35 + 0.15 * Math.sin(t * 6));
      ctx.save(); ctx.translate(0, -16.4); ctx.rotate(t * 1.4);
      star(ctx, 0, 0, 4, 1.1, 3.6, 0); fo(ctx, '#fff3c4', 1.1); ctx.restore();
    }
    hull3(ctx); fo(ctx, rad(ctx, -2.5, -5, 1, 0, 0, 13, [0, '#f4bcff', 0.45, '#a44be0', 1, '#3d1480']), 2.2);
    ctx.save(); hull3(ctx); ctx.clip();
    ell(ctx, 0, 3.2, 9, 3.2); ctx.strokeStyle = 'rgba(255,95,200,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    ell(ctx, 0, 2.6, 9, 3.2); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.4; ctx.stroke();
    ctx.restore();
    ell(ctx, -3.3, -3.8, 1.5, 5.6, 0.25); fill(ctx, 'rgba(255,255,255,0.28)');
    const pu = 0.5 + 0.5 * Math.sin(t * 3);
    glow(ctx, 0, 4.6, 8, '255,130,230', 0.45 + 0.3 * pu);
    ctx.save(); ctx.translate(0, 4.6); ctx.rotate(t * 0.8);
    star(ctx, 0, 0, 5, 1.35, 3.4, -Math.PI / 2);
    fo(ctx, rad(ctx, 0, 0, 0, 0, 0, 3.4, [0, '#ffffff', 0.5, '#ffe3f7', 1, '#ff6fd0']), 1);
    ctx.restore();
    circ(ctx, 0, 4.6, 0.8 + 0.3 * pu); fill(ctx, '#ffffff');
    cockpit(ctx, 0, -6.5, 3.2, 3.7, [0, '#fbefff', 0.45, '#b77bff', 1, '#24104e'], t, '#2a1250');
    if (tier >= 3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; sparkle(ctx, 0, -20, 1.2 + Math.sin(t * 5), 'rgba(255,240,255,0.85)'); ctx.restore(); }
  }

  /* ---------- 4 ZÜMRÜT EJDER ---------- */
  function hull4(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -17.8);
    ctx.bezierCurveTo(1.6, -17.8, 2.6, -16.8, 2.9, -15); ctx.lineTo(3.9, -12.3); ctx.lineTo(3.1, -10.2);
    ctx.bezierCurveTo(5.8, -8, 6.6, -4, 6.6, 1); ctx.bezierCurveTo(6.6, 6.5, 4.6, 10.4, 0, 11.2);
    ctx.bezierCurveTo(-4.6, 10.4, -6.6, 6.5, -6.6, 1); ctx.bezierCurveTo(-6.6, -4, -5.8, -8, -3.1, -10.2);
    ctx.lineTo(-3.9, -12.3); ctx.lineTo(-2.9, -15); ctx.bezierCurveTo(-2.6, -16.8, -1.6, -17.8, 0, -17.8);
    ctx.closePath();
  }
  function sled4(ctx, tier, t) {
    const fl = Math.sin(t * 2.2) * 0.6;        // kanat zarı hafifçe çırpar
    for (let q = -1; q <= 1; q += 2) {
      pathM(ctx, [8.4, -6, 12.6, -3 + fl * 0.3, 14.6, 3.5 + fl, 12.6, 3, 13.4, 8.6 + fl, 10.8, 7.4, 9.6, 11, 8.4, 9], q);
      fo(ctx, lin(ctx, q * 8, 0, q * 14.5, 0, [0, '#33c97a', 1, '#0c5532']), 1.8);
      ctx.beginPath(); ctx.moveTo(q * 9, -5); ctx.lineTo(q * 14.6, 3.5 + fl); ctx.moveTo(q * 9, 0.5); ctx.lineTo(q * 13.4, 8.6 + fl);
      ctx.strokeStyle = '#08381f'; ctx.lineWidth = 0.75; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(q * 9.6, -4.6); ctx.lineTo(q * 12.4, -2.4 + fl * 0.3);
      ctx.strokeStyle = 'rgba(170,255,205,0.45)'; ctx.lineWidth = 0.5; ctx.stroke();
    }
    runners(ctx, { x: 9, y0: -6, y1: 11, metal: lin(ctx, 0, -6, 0, 11, [0, '#f6e7a8', 1, '#9a782a']), hi: '#fff6d0', strut: '#c9a74a', struts: [-2, 4], sx: 5, tip: '#e9d27a' });
    if (tier >= 1) for (let q = -1; q <= 1; q += 2) {   // kemik pençeler
      pathM(ctx, [8.4, -6.2, 11.5 + tier, -11.2 - tier * 0.5, 10.4, -5.4], q);
      fo(ctx, lin(ctx, q * 8.5, -6, q * (11.5 + tier), -11, [0, '#d8c48a', 1, '#fffbe8']), 1.2);
    }
    if (tier >= 2) pods(ctx, '#23854f', '#09301e', '#e9d27a', '120,255,160', t);
    hull4(ctx); fo(ctx, lin(ctx, -7, 0, 7, 0, [0, '#7ef2b2', 0.45, '#22a862', 1, '#0a462a']), 2.2);
    ctx.save(); hull4(ctx); ctx.clip();          // pullar
    ctx.lineWidth = 0.55;
    for (let r = 0; r < 8; r++) {
      const y = -8 + r * 2.5;
      for (let k = -3; k <= 2; k++) {
        const x = k * 2.6 + (r % 2 ? 1.3 : 0);
        if (Math.abs(x) > 6.8) continue;
        ctx.beginPath(); ctx.arc(x, y, 1.45, 0.15, Math.PI - 0.15); ctx.strokeStyle = 'rgba(5,48,26,0.6)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - 0.4, 1.0, 0.6, Math.PI - 0.6); ctx.strokeStyle = 'rgba(190,255,215,0.35)'; ctx.stroke();
      }
    }
    ell(ctx, -3, -1, 1.4, 6, 0.1); fill(ctx, 'rgba(220,255,235,0.22)');
    ctx.restore();
    path(ctx, [0, -17.4, 1.2, -15.4, 0, -12.4, -1.2, -15.4]); fill(ctx, 'rgba(8,58,33,0.5)');
    for (let q = -1; q <= 1; q += 2) {          // geriye kıvrık boynuzlar
      pathM(ctx, [2.5, -12.6, 6.3, -8.1, 3.5, -10.9], q); fo(ctx, lin(ctx, q * 2.5, -12.6, q * 6.3, -8, [0, '#fffaf0', 1, '#cbb67a']), 1);
      ell(ctx, q * 0.9, -16.6, 0.38, 0.6); fill(ctx, '#06281a');
    }
    const eg = 0.6 + 0.4 * Math.sin(t * 2.5);
    for (let q = -1; q <= 1; q += 2) {          // parlayan sürüngen gözler
      glow(ctx, q * 2.1, -13.6, 2.8, '255,220,60', 0.55 * eg);
      ell(ctx, q * 2.1, -13.6, 0.95, 0.62, q * 0.5); fill(ctx, '#ffe14a');
      ell(ctx, q * 2.1, -13.6, 0.22, 0.55); fill(ctx, '#2a1a00');
    }
    for (let i = 0; i < 4; i++) {               // sırt dikenleri
      const y = 1.6 + i * 2.4;
      path(ctx, [-1.05, y - 0.9, 1.05, y - 0.9, 0, y + 1.5]);
      fo(ctx, lin(ctx, -1, y, 1, y, [0, '#fff2b0', 1, '#c9a23a']), 0.9);
    }
    if (tier >= 3) {                            // ejder tacı
      glow(ctx, 0, -11.5, 9, '170,255,140', 0.32 + 0.15 * Math.sin(t * 6));
      path(ctx, [-2.3, -10.4, -1.5, -13.3, -0.6, -11, 0, -14.2, 0.6, -11, 1.5, -13.3, 2.3, -10.4]);
      fo(ctx, lin(ctx, 0, -14, 0, -10, [0, '#fff1a0', 1, '#d39a18']), 1);
      circ(ctx, 0, -11.1, 0.45); fill(ctx, '#2bff8a');
    }
    cockpit(ctx, 0, -4.6, 2.5, 3.4, [0, '#fff6c0', 0.45, '#f0b030', 1, '#4a2600'], t, '#08301c');
  }

  /* ---------- 5 ALTIN İMPARATOR ---------- */
  function hull5(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -15.5);
    ctx.bezierCurveTo(3.8, -13, 6.8, -7, 6.8, -0.5); ctx.lineTo(6.6, 7);
    ctx.quadraticCurveTo(6.3, 11, 3, 11.2); ctx.lineTo(-3, 11.2);
    ctx.quadraticCurveTo(-6.3, 11, -6.6, 7); ctx.lineTo(-6.8, -0.5);
    ctx.bezierCurveTo(-6.8, -7, -3.8, -13, 0, -15.5); ctx.closePath();
  }
  function hull5s(ctx, sx, sy, dy) { ctx.save(); ctx.translate(0, dy); ctx.scale(sx, sy); hull5(ctx); ctx.restore(); }
  const GOLD = [0, '#fff3b0', 0.35, '#f0c24a', 0.7, '#c58e18', 1, '#7a5008'];
  function sled5(ctx, tier, t) {
    const pu = 0.5 + 0.5 * Math.sin(t * 2.6);
    glow(ctx, 0, -1, 19, '255,205,110', 0.16 + 0.12 * pu);        // nabız gibi atan hale
    const ph = mod(t * 0.55, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ell(ctx, 0, -1, 7 + 8 * ph, 12 + 6 * ph); ctx.strokeStyle = 'rgba(255,225,150,' + ((1 - ph) * 0.45).toFixed(3) + ')';
    ctx.lineWidth = 0.3 + 1.2 * (1 - ph); ctx.stroke(); ctx.restore();
    runners(ctx, { x: 9, y0: -6, y1: 11, metal: lin(ctx, 0, -6, 0, 11, [0, '#fff4c4', 0.5, '#e0aa24', 1, '#8a5a08']), hi: '#ffffff', strut: '#f4ead2', struts: [-2, 4], sx: 5 });
    ctx.save(); ctx.lineCap = 'round';           // kıvrık kızak uçları
    for (let q = -1; q <= 1; q += 2) {
      ctx.beginPath();
      if (q > 0) ctx.arc(7.8, -6, 1.2, 0, Math.PI, true); else ctx.arc(-7.8, -6, 1.2, Math.PI, TAU, false);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.3; ctx.stroke(); ctx.strokeStyle = '#ffe07a'; ctx.lineWidth = 1.1; ctx.stroke();
      circ(ctx, q * 6.6, -6, 0.55); fill(ctx, '#fffdf0');
    }
    ctx.restore();
    if (tier >= 1) for (let q = -1; q <= 1; q += 2) {
      pathM(ctx, [6.6, 0, 12.5 + tier, 6, 13 + tier, 10, 10, 9.4, 6.6, 8.2], q);
      fo(ctx, lin(ctx, q * 6.6, 0, q * (13 + tier), 9, GOLD), 1.8);
      pathM(ctx, [7.5, 2.1, 11.3 + tier, 6.6, 11.6 + tier, 8.7, 7.5, 7.4], q); fill(ctx, '#fbf3de');
      ctx.beginPath(); ctx.moveTo(q * 8, 6.6); ctx.quadraticCurveTo(q * 9.5, 4.4, q * (10.8 + tier), 7.4);
      ctx.strokeStyle = '#c4911f'; ctx.lineWidth = 0.45; ctx.stroke();
    }
    if (tier >= 2) pods(ctx, '#fbf3de', '#c9b48a', '#d4202f', '255,80,90', t);
    hull5(ctx); fo(ctx, lin(ctx, -7, 0, 7, 0, GOLD), 2.2);
    hull5s(ctx, 0.76, 0.84, -0.4);
    fill(ctx, lin(ctx, -5, 0, 5, 0, [0, '#fffef8', 0.6, '#f4e9cf', 1, '#d6c39a']));
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#c4911f'; ctx.lineWidth = 0.45;   // filigran
    hull5s(ctx, 0.66, 0.75, -0.6); ctx.stroke();
    ctx.beginPath();
    for (let q = -1; q <= 1; q += 2) {
      ctx.moveTo(q * 0.6, 3.4); ctx.bezierCurveTo(q * 3.6, 2.4, q * 4.3, 5.8, q * 2.6, 6.5);
      ctx.bezierCurveTo(q * 1.6, 6.9, q * 1.3, 5.8, q * 2.1, 5.4);
      ctx.moveTo(q * 0.5, -10.2); ctx.bezierCurveTo(q * 2.4, -10.4, q * 3.3, -8.2, q * 2.1, -7.4);
      ctx.moveTo(q * 0.9, 8.4); ctx.quadraticCurveTo(q * 3.2, 7.9, q * 3.9, 9.6);
    }
    ctx.stroke(); ctx.restore();
    for (const y of [3.2, 6.2, 9.2]) { path(ctx, [0, y - 0.8, 0.6, y, 0, y + 0.8, -0.6, y]); fill(ctx, '#d4a019'); }
    for (let q = -1; q <= 1; q += 2) {          // yakut taşlar
      for (const y of [-1, 6.5]) {
        circ(ctx, q * 5.6, y, 0.85); fo(ctx, rad(ctx, q * 5.6 - 0.3, y - 0.3, 0.1, q * 5.6, y, 0.9, [0, '#ff9aa4', 0.5, '#d4202f', 1, '#6a0612']), 0.8);
        circ(ctx, q * 5.6 - 0.3, y - 0.35, 0.25); fill(ctx, '#ffffff');
      }
    }
    circ(ctx, 0, -15.6, 1.3); fo(ctx, lin(ctx, -1.3, -16, 1.3, -15, GOLD), 1);
    // değerli taş kokpit (faset safir)
    const C = [0, -9.2, 3.1, -6.2, 3.4, -2, 0, 1.8, -3.4, -2, -3.1, -6.2];
    path(ctx, C); fo(ctx, lin(ctx, -3.4, -9, 3.4, 2, GOLD), 2.4);
    const cx = 0, cy = -3.9, k = 0.78, cols = ['#9fe0ff', '#4d9cf0', '#1d4fae', '#2a6fd6', '#6fc0ff', '#143a8a'];
    const V = [];
    for (let i = 0; i < 6; i++) V.push(cx + (C[i * 2] - cx) * k, cy + (C[i * 2 + 1] - cy) * k);
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      path(ctx, [cx, cy, V[i * 2], V[i * 2 + 1], V[j * 2], V[j * 2 + 1]]); fill(ctx, cols[i]);
    }
    const T = [];
    for (let i = 0; i < 6; i++) T.push(cx + (V[i * 2] - cx) * 0.42, cy + (V[i * 2 + 1] - cy) * 0.42);
    path(ctx, T); fill(ctx, 'rgba(210,245,255,0.8)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gi = Math.floor(mod(t * 1.2, 6)), gf = Math.sin(mod(t * 1.2, 1) * Math.PI);
    sparkle(ctx, V[gi * 2], V[gi * 2 + 1], 1.9 * gf, 'rgba(255,255,255,0.95)');
    ctx.restore();
    if (tier >= 3) {                            // imparator tacı
      glow(ctx, 0, -16, 10, '255,220,120', 0.35 + 0.15 * Math.sin(t * 6));
      path(ctx, [-3, -14.4, -3.3, -18, -1.6, -16.4, 0, -19.6, 1.6, -16.4, 3.3, -18, 3, -14.4]);
      fo(ctx, lin(ctx, 0, -19.6, 0, -14.4, GOLD), 1.1);
      circ(ctx, 0, -15.6, 0.6); fill(ctx, '#d4202f');
      ctx.fillStyle = '#fffdf0';
      circ(ctx, -3.3, -18, 0.5); ctx.fill(); circ(ctx, 3.3, -18, 0.5); ctx.fill(); circ(ctx, 0, -19.6, 0.55); ctx.fill();
    }
  }

  const SLED_FN = [sled0, sled1, sled2, sled3, sled4, sled5];

  /* ---------- avatar yardımcıları ---------- */
  function blink(t, seed) {                     // ~4 sn'de bir kısa göz kırpma, 0..1
    const p = mod(t + seed, 4.1);
    return p < 0.16 ? Math.sin(p / 0.16 * Math.PI) : 0;
  }
  // beyazlı göz (insan, cadı)
  function eyeW(ctx, x, y, rx, ry, iris, ir, closed, lid) {
    const k = Math.max(0.07, 1 - closed);
    ctx.save(); ctx.translate(x, y);
    ctx.save(); ctx.scale(1, k);
    ell(ctx, 0, 0, rx, ry); fill(ctx, lin(ctx, 0, -ry, 0, ry, [0, '#dfe6ef', 1, '#ffffff']));
    ctx.save(); ell(ctx, 0, 0, rx, ry); ctx.clip();
    circ(ctx, 0, ry * 0.1, ir); fill(ctx, rad(ctx, 0, ry * 0.1 + ir * 0.4, 0, 0, ry * 0.1, ir, [0, iris[0], 1, iris[1]]));
    circ(ctx, 0, ry * 0.1, ir * 0.48); fill(ctx, '#0a0d12');
    ctx.fillStyle = 'rgba(40,20,30,0.18)'; ctx.fillRect(-rx, -ry, rx * 2, ry * 0.5);
    ctx.restore();
    circ(ctx, -ir * 0.38, -ir * 0.3, ir * 0.32); fill(ctx, '#ffffff');
    circ(ctx, ir * 0.36, ir * 0.42, ir * 0.14); fill(ctx, 'rgba(255,255,255,0.8)');
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry * k, 0, Math.PI * 1.04, Math.PI * 1.96);
    ctx.strokeStyle = lid; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
    if (closed > 0.5) { ctx.beginPath(); ctx.moveTo(-rx, 0); ctx.quadraticCurveTo(0, ry * 0.7, rx, 0); ctx.stroke(); }
    ctx.restore();
  }
  // parlak koyu göz (hayvanlar)
  function eyeG(ctx, x, y, rx, ry, closed, base) {
    const k = Math.max(0.07, 1 - closed);
    ctx.save(); ctx.translate(x, y);
    ctx.save(); ctx.scale(1, k);
    ell(ctx, 0, 0, rx, ry); fill(ctx, rad(ctx, -rx * 0.2, -ry * 0.2, 0, 0, 0, Math.max(rx, ry), [0, base[0], 1, base[1]]));
    circ(ctx, -rx * 0.32, -ry * 0.34, rx * 0.36); fill(ctx, '#ffffff');
    circ(ctx, rx * 0.34, ry * 0.32, rx * 0.15); fill(ctx, 'rgba(255,255,255,0.75)');
    ctx.restore();
    if (closed > 0.5) {
      ctx.beginPath(); ctx.moveTo(-rx, 0); ctx.quadraticCurveTo(0, ry * 0.6, rx, 0);
      ctx.strokeStyle = base[1]; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.restore();
  }
  function frame(ctx, x, y, r, t, bg, draw) {
    ctx.save(); ctx.translate(x, y);
    const s = Math.max(0.01, r / 40); ctx.scale(s, s);           // içeride 40 birim yarıçap
    ctx.save(); circ(ctx, 0, 0, 40); ctx.clip();
    ctx.fillStyle = rad(ctx, -8, -16, 2, 0, 0, 50, bg); ctx.fillRect(-40, -40, 80, 80);
    draw(ctx, t);
    ctx.fillStyle = rad(ctx, 0, 0, 27, 0, 0, 40, [0, 'rgba(0,0,20,0)', 1, 'rgba(0,0,20,0.3)']); ctx.fillRect(-40, -40, 80, 80);
    ctx.restore();
    const lw = Math.max(3.6, 2.2 / s), R = 40 - lw / 2;           // altın halka
    circ(ctx, 0, 0, R); ctx.lineWidth = lw;
    ctx.strokeStyle = lin(ctx, -40, -40, 40, 40, [0, '#fff6c2', 0.3, '#e8b430', 0.6, '#9a6a0c', 0.85, '#f6d26a', 1, '#b07e14']); ctx.stroke();
    const e = Math.max(0.8, 0.9 / s);
    ctx.lineWidth = e; ctx.strokeStyle = 'rgba(45,26,0,0.85)';
    circ(ctx, 0, 0, 40 - e / 2); ctx.stroke(); circ(ctx, 0, 0, 40 - lw); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R, -2.6, -1.7); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = lw * 0.32; ctx.stroke();
    ctx.restore();
  }
  function twinkles(ctx, t, pts, size, rgb) {
    for (let i = 0; i < pts.length; i += 2) {
      const a = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.5 + i * 1.7));
      sparkle(ctx, pts[i], pts[i + 1], size * (0.6 + 0.4 * a), 'rgba(' + rgb + ',' + a.toFixed(3) + ')');
    }
  }

  /* ---------- 0 KAPTAN DERYA ---------- */
  function av0(ctx, t) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';               // kar taneleri
    for (let i = 0; i < 9; i++) {
      const sx = -34 + i * 8.5 + Math.sin(t * 0.8 + i) * 2, sy = mod(i * 23 + t * 7, 84) - 42;
      circ(ctx, sx, sy, 0.8 + (i % 3) * 0.45); ctx.fill();
    }
    ell(ctx, 0, 50, 35, 22); fill(ctx, lin(ctx, 0, 28, 0, 72, [0, '#ef5a3c', 1, '#8a2214']));   // parka
    line(ctx, [0, 30, 0, 42], '#5a160c', 1.2);
    rrect(ctx, -1, 32, 2, 3, 0.6); fill(ctx, '#e0e4ea');
    ctx.save(); ctx.translate(-15, 38); star(ctx, 0, 0, 6, 1.3, 3.3, 0); fill(ctx, '#d6f2ff'); circ(ctx, 0, 0, 0.9); fill(ctx, '#2c7fc0'); ctx.restore();
    ell(ctx, 0, 1, 27, 30); fill(ctx, rad(ctx, -8, -12, 2, 0, 0, 32, [0, '#ea5a40', 0.7, '#b8331f', 1, '#741a0e']));   // kapüşon
    ctx.beginPath();                                        // kürk yaka
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU, bx = Math.cos(a) * 20.5, by = 2 + Math.sin(a) * 23.5, br = 5.3 + (i % 2) * 0.8;
      ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, TAU);
    }
    fill(ctx, rad(ctx, 0, 2, 15, 0, 2, 29, [0, '#b8996c', 0.35, '#fff7e8', 0.7, '#ead9b8', 1, '#a88a5c']));
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU + 0.12, c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(c * 20, 2 + s * 23); ctx.lineTo(c * 24.5, 2 + s * 28);
    }
    ctx.strokeStyle = 'rgba(150,118,78,0.45)'; ctx.lineWidth = 0.7; ctx.stroke();
    ell(ctx, 0, 4, 16.5, 19.5); fill(ctx, rad(ctx, 0, 2, 8, 0, 4, 20, [0, '#6b3a26', 1, '#2a140a']));
    ell(ctx, 0, 5, 13.5, 15.8); fill(ctx, rad(ctx, -4, 0, 1, 0, 5, 17, [0, '#ffe7d2', 0.6, '#f3bb96', 1, '#c47f5e']));   // yüz
    ctx.beginPath(); ctx.moveTo(-13.5, 1);                   // perçem
    ctx.bezierCurveTo(-13, -9, -5, -12.5, 0, -12.5); ctx.bezierCurveTo(6, -12.5, 13, -9, 13.5, 1);
    ctx.bezierCurveTo(11, -3, 8, -5.5, 5, -6); ctx.bezierCurveTo(3, -3.5, 0, -4, -2, -6.5);
    ctx.bezierCurveTo(-5, -4, -9, -3.5, -13.5, 1); ctx.closePath();
    fill(ctx, lin(ctx, 0, -12, 0, 0, [0, '#7d4c2d', 1, '#45240f']));
    ctx.beginPath(); ctx.moveTo(-16, -6); ctx.quadraticCurveTo(0, -12.5, 16, -6);   // gözlük kayışı
    ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 3.2; ctx.stroke();
    rrect(ctx, -2, -10.2, 4, 2.4, 1); fill(ctx, '#5c6878');
    for (let q = -1; q <= 1; q += 2) {
      const gx = q * 6.2, gy = -8.4;
      circ(ctx, gx, gy, 4.7); fill(ctx, lin(ctx, gx - 4, gy - 4, gx + 4, gy + 4, [0, '#eef3f8', 1, '#4f5b6b']));
      circ(ctx, gx, gy, 3.5); fill(ctx, rad(ctx, gx - 1, gy - 1.3, 0.3, gx, gy, 3.7, [0, '#ecfcff', 0.35, '#5fd0ff', 1, '#163f80']));
      ctx.beginPath(); ctx.arc(gx, gy, 2.5, 3.6, 4.8); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.lineCap = 'round';
    for (let q = -1; q <= 1; q += 2) {
      ctx.beginPath(); ctx.moveTo(q * 3, -1.8); ctx.quadraticCurveTo(q * 5.8, -3.4, q * 8.6, -1.6);
      ctx.strokeStyle = '#55301a'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    const b = blink(t, 0.3);
    for (let q = -1; q <= 1; q += 2) eyeW(ctx, q * 5.6, 2.6, 2.7, 2.5, ['#86bdf0', '#2a5c9c'], 1.9, b, '#3a1f12');
    ctx.beginPath(); ctx.moveTo(-0.3, 4.6); ctx.quadraticCurveTo(1.7, 8.4, -0.5, 9.1);
    ctx.strokeStyle = 'rgba(150,80,50,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    for (let q = -1; q <= 1; q += 2) { ell(ctx, q * 8.2, 8.6, 3.2, 2.2); fill(ctx, 'rgba(255,105,105,0.32)'); }
    ctx.fillStyle = 'rgba(150,80,40,0.55)';
    const F = [-8.5, 7, -7, 8.4, -9.6, 8.8, 8.5, 7, 7, 8.4, 9.6, 8.8];
    for (let i = 0; i < F.length; i += 2) { circ(ctx, F[i], F[i + 1], 0.45); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-4, 12.2); ctx.quadraticCurveTo(0, 16.6, 4, 12.2); ctx.quadraticCurveTo(0, 13.6, -4, 12.2);
    fill(ctx, '#9a3a2c');
    ctx.beginPath(); ctx.moveTo(-2.2, 14.3); ctx.quadraticCurveTo(0, 15.4, 2.2, 14.3); ctx.quadraticCurveTo(0, 13.8, -2.2, 14.3); fill(ctx, '#e0706a');
  }

  /* ---------- 1 PENGUEN POPO ---------- */
  function av1(ctx, t) {
    twinkles(ctx, t, [-28, -20, 27, -26, -31, 10, 30, 6, -18, -32, 20, -33], 2, '255,255,255');
    ell(ctx, 0, 48, 30, 24); fill(ctx, rad(ctx, -10, 30, 2, 0, 48, 32, [0, '#3d4a63', 1, '#0f141d']));
    ell(ctx, 0, 52, 17, 18); fill(ctx, rad(ctx, -4, 40, 1, 0, 52, 19, [0, '#ffffff', 1, '#cbd8e4']));
    ctx.save(); ctx.translate(24, 34); ctx.rotate(-0.5 + Math.sin(t * 3) * 0.2);   // el sallayan yüzgeç
    ell(ctx, 0, 7, 5, 11); fill(ctx, lin(ctx, -5, 0, 5, 0, [0, '#2c3650', 1, '#0d1119'])); ctx.restore();
    ctx.save(); ell(ctx, 0, 25, 19.5, 6.2); ctx.clip();                          // atkı
    ctx.fillStyle = lin(ctx, 0, 19, 0, 31, [0, '#ff6152', 1, '#b01f1a']); ctx.fillRect(-20, 18, 40, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 6; i++) ctx.fillRect(-18 + i * 7, 18, 2.6, 14);
    ctx.restore();
    ctx.save(); ctx.translate(10, 27.5); ctx.rotate(0.25 + Math.sin(t * 2) * 0.05);
    rrect(ctx, -3, 0, 6, 13, 1.5); fill(ctx, lin(ctx, -3, 0, 3, 0, [0, '#ff6152', 1, '#b01f1a']));
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-3, 4, 6, 1.8); ctx.fillRect(-3, 8, 6, 1.8);
    line(ctx, [-2, 13, -2, 15, 0, 13, 0, 15.2, 2, 13, 2, 15], '#ff6152', 0.8);
    ctx.restore();
    circ(ctx, 0, 2, 22); fill(ctx, rad(ctx, -7, -8, 2, 0, 2, 24, [0, '#4d5c7e', 0.6, '#1f2738', 1, '#0a0e16']));   // baş
    const mask = rad(ctx, 0, 6, 2, 0, 6, 17, [0, '#ffffff', 1, '#d2dfec']);
    ell(ctx, -6.8, 4.5, 8.2, 9.8, 0.15); fill(ctx, mask);
    ell(ctx, 6.8, 4.5, 8.2, 9.8, -0.15); fill(ctx, mask);
    ell(ctx, 0, 11, 12, 8.2); fill(ctx, mask);
    ctx.beginPath(); ctx.moveTo(-19.5, -7); ctx.bezierCurveTo(-19, -26, 19, -26, 19.5, -7); ctx.closePath();   // bere
    fill(ctx, lin(ctx, -20, 0, 20, 0, [0, '#5aa2f5', 0.5, '#2f7de1', 1, '#1a4f9e']));
    ctx.beginPath();
    for (let x = -15; x <= 15; x += 3.75) { ctx.moveTo(x, -8.5); ctx.quadraticCurveTo(x * 0.8, -16, x * 0.5, -21.5); }
    ctx.strokeStyle = 'rgba(10,40,90,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20.5, -9.5); ctx.quadraticCurveTo(0, -14.5, 20.5, -9.5); ctx.lineTo(20.8, -4.6);
    ctx.quadraticCurveTo(0, -9.6, -20.8, -4.6); ctx.closePath();
    fill(ctx, lin(ctx, 0, -13, 0, -5, [0, '#f6f9ff', 1, '#b8cae2']));
    ctx.beginPath();
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; ctx.moveTo(Math.cos(a) * 3.4 + 2.4, -25 + Math.sin(a) * 3.4); ctx.arc(Math.cos(a) * 3.4, -25 + Math.sin(a) * 3.4, 2.4, 0, TAU); }
    fill(ctx, rad(ctx, -1.5, -27, 0.5, 0, -25, 6, [0, '#ffffff', 1, '#c9d6e8']));
    const b = blink(t, 1.1);
    for (let q = -1; q <= 1; q += 2) eyeG(ctx, q * 6.4, 3.6, 2.9, 3.6, b, ['#3b4660', '#05070b']);
    for (let q = -1; q <= 1; q += 2) { ell(ctx, q * 11, 10.5, 2.8, 1.8); fill(ctx, 'rgba(255,120,150,0.45)'); }
    ctx.beginPath(); ctx.moveTo(-4.6, 9); ctx.quadraticCurveTo(0, 7.2, 4.6, 9); ctx.quadraticCurveTo(1.6, 14.8, 0, 15.2);
    ctx.quadraticCurveTo(-1.6, 14.8, -4.6, 9); ctx.closePath();
    fill(ctx, lin(ctx, 0, 7, 0, 15, [0, '#ffc760', 1, '#e46a16'])); ctx.strokeStyle = '#8a3c08'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 9.7); ctx.quadraticCurveTo(0, 11.6, 4, 9.7); ctx.stroke();
    ell(ctx, -1.6, 8.9, 1.4, 0.6); fill(ctx, 'rgba(255,255,255,0.6)');
  }

  /* ---------- 2 KUTUP AYISI BORA ---------- */
  function av2(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';     // kutup ışıkları
    for (let k = 0; k < 2; k++) {
      const o = Math.sin(t * 0.7 + k * 2) * 4;
      ctx.beginPath(); ctx.moveTo(-42, -10 + k * 10 + o);
      ctx.bezierCurveTo(-20, -30 + k * 8 - o, 10, -2 + k * 6 + o, 42, -24 + k * 10 - o); ctx.lineTo(42, -14 + k * 10 - o);
      ctx.bezierCurveTo(10, 8 + k * 6 + o, -20, -20 + k * 8 - o, -42, k * 10 + o); ctx.closePath();
      fill(ctx, lin(ctx, 0, -30, 0, 12, [0, 'rgba(80,255,180,0)', 0.5, k ? 'rgba(120,150,255,0.35)' : 'rgba(80,255,170,0.4)', 1, 'rgba(80,255,180,0)']));
    }
    ctx.restore();
    twinkles(ctx, t, [-26, -30, 14, -34, 30, -12, -32, 8], 1.4, '230,240,255');
    ell(ctx, 0, 52, 34, 22); fill(ctx, rad(ctx, -10, 34, 2, 0, 52, 36, [0, '#ffffff', 1, '#98acc2']));
    ctx.beginPath(); ctx.moveTo(-20, 24); ctx.quadraticCurveTo(0, 34, 20, 24); ctx.lineTo(21.5, 30.5);   // atkı
    ctx.quadraticCurveTo(0, 42, -21.5, 30.5); ctx.closePath();
    fill(ctx, lin(ctx, 0, 24, 0, 40, [0, '#5a95f5', 1, '#1b4aa8']));
    ctx.beginPath();
    for (let x = -16; x <= 16; x += 4) { ctx.moveTo(x, 27 + Math.abs(x) * -0.1 + (1 - (x * x) / 400) * 4); ctx.lineTo(x * 1.05, 32 + (1 - (x * x) / 400) * 5); }
    ctx.strokeStyle = 'rgba(10,30,90,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    for (let q = -1; q <= 1; q += 2) {          // kulaklar
      circ(ctx, q * 16, -14, 7.6); fill(ctx, rad(ctx, q * 15, -16, 1, q * 16, -14, 8, [0, '#ffffff', 1, '#b3c3d5']));
      circ(ctx, q * 16, -13.4, 4.2); fill(ctx, rad(ctx, q * 16, -14, 0.5, q * 16, -13.4, 4.4, [0, '#f6ccd4', 1, '#bf8896']));
    }
    ell(ctx, 0, 3, 23.5, 21); fill(ctx, rad(ctx, -7, -7, 2, 0, 3, 25, [0, '#ffffff', 0.55, '#e8eef6', 1, '#9cb0c6']));
    ctx.beginPath(); ctx.moveTo(-4.5, -17); ctx.quadraticCurveTo(-2.4, -22.8, 0, -17.6); ctx.quadraticCurveTo(2.6, -22.2, 4.8, -17);
    fill(ctx, '#f6f9fc');
    for (let q = -1; q <= 1; q += 2) { ell(ctx, q * 8.5, -4.8, 4.2, 1.4, q * -0.2); fill(ctx, 'rgba(120,145,175,0.35)'); }
    const b = blink(t, 2.2);
    for (let q = -1; q <= 1; q += 2) eyeG(ctx, q * 8.6, -0.5, 2.5, 2.9, b, ['#3a4456', '#06080c']);
    ell(ctx, 0, 10, 11.5, 8.6); fill(ctx, rad(ctx, -2, 7, 1, 0, 10, 12, [0, '#fffaf0', 1, '#cfc6b6']));
    for (let q = -1; q <= 1; q += 2) { ell(ctx, q * 12.5, 8, 3, 2); fill(ctx, 'rgba(255,140,160,0.3)'); }
    ctx.beginPath(); ctx.moveTo(-4.4, 4.6); ctx.quadraticCurveTo(0, 3, 4.4, 4.6); ctx.quadraticCurveTo(3.8, 8.6, 0, 9.4);
    ctx.quadraticCurveTo(-3.8, 8.6, -4.4, 4.6); ctx.closePath();
    fill(ctx, lin(ctx, 0, 3, 0, 9.5, [0, '#4a5262', 1, '#0b0d12']));
    ell(ctx, -1.4, 5.2, 1.5, 0.8, -0.2); fill(ctx, 'rgba(255,255,255,0.55)');
    ctx.beginPath(); ctx.moveTo(0, 9.4); ctx.lineTo(0, 11.6);
    ctx.moveTo(-4.2, 12); ctx.quadraticCurveTo(-2, 14.2, 0, 11.6); ctx.quadraticCurveTo(2, 14.2, 4.2, 12);
    ctx.strokeStyle = '#2a2e38'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.stroke();
    ctx.fillStyle = 'rgba(90,80,70,0.45)';
    const D = [-6.5, 9.5, -7.8, 11, -6, 12, 6.5, 9.5, 7.8, 11, 6, 12];
    for (let i = 0; i < D.length; i += 2) { circ(ctx, D[i], D[i + 1], 0.45); ctx.fill(); }
  }

  /* ---------- 3 BAYKUŞ ZEYNO ---------- */
  function eyeOwl(ctx, x, y, r, closed, look) {
    const k = Math.max(0.07, 1 - closed);
    ctx.save(); ctx.translate(x, y);
    ctx.save(); ctx.scale(1, k);
    circ(ctx, 0, 0, r + 0.9); fill(ctx, '#2a2d36');
    circ(ctx, 0, 0, r); fill(ctx, rad(ctx, 0, 1.5, 0.5, 0, 0, r, [0, '#fff7a8', 0.5, '#ffcf2a', 1, '#e08600']));
    circ(ctx, look, 0.2, r * 0.54); fill(ctx, '#07080b');
    circ(ctx, look - r * 0.3, -r * 0.33, r * 0.23); fill(ctx, '#ffffff');
    circ(ctx, look + r * 0.26, r * 0.3, r * 0.1); fill(ctx, 'rgba(255,255,255,0.8)');
    ctx.restore();
    if (closed > 0.4) {
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, r * 0.45, r, 0);
      ctx.strokeStyle = '#5a6070'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.restore();
  }
  function av3(ctx, t) {
    glow(ctx, 24, -22, 15, '255,240,170', 0.35);                 // ay
    circ(ctx, 24, -22, 7.5); fill(ctx, rad(ctx, 22, -24, 1, 24, -22, 7.5, [0, '#fffdf0', 1, '#efd982']));
    circ(ctx, 26, -20, 1.4); fill(ctx, 'rgba(200,170,90,0.35)'); circ(ctx, 21.5, -23.5, 1); fill(ctx, 'rgba(200,170,90,0.35)');
    twinkles(ctx, t, [-28, -24, -14, -33, 33, 2, -33, 4, 8, -36], 1.8, '255,250,230');
    ell(ctx, 0, 48, 30, 24); fill(ctx, rad(ctx, -8, 32, 2, 0, 48, 32, [0, '#ffffff', 1, '#c2cbda']));
    ctx.beginPath();
    const S = [-14, 33, -6, 36, 6, 34, 14, 37, -10, 41, 0, 40, 10, 42, -16, 45, 17, 46];
    for (let i = 0; i < S.length; i += 2) { ctx.moveTo(S[i] - 1.6, S[i + 1]); ctx.lineTo(S[i], S[i + 1] + 1.2); ctx.lineTo(S[i] + 1.6, S[i + 1]); }
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    for (let q = -1; q <= 1; q += 2) {          // kulak tüyleri
      pathM(ctx, [10.5, -15, 18.5, -23.5, 19.5, -11], q); fill(ctx, lin(ctx, q * 11, -12, q * 18, -23, [0, '#f2f5f9', 1, '#c4ccd8']));
    }
    ell(ctx, 0, 2, 25, 22.5); fill(ctx, rad(ctx, -7, -8, 2, 0, 2, 27, [0, '#ffffff', 0.6, '#edf0f5', 1, '#b2bccb']));
    ctx.fillStyle = '#353a45';                  // benekler
    const P = [-10, -14, -4, -17, 3, -16.5, 9, -13.5, -15, -8, 15, -8, 0, -12.5, -7, -10.5, 6, -10, -18, -2, 18, -2];
    for (let i = 0; i < P.length; i += 2) { path(ctx, [P[i] - 1.2, P[i + 1], P[i], P[i + 1] + 1, P[i] + 1.2, P[i + 1], P[i], P[i + 1] + 0.4]); ctx.fill(); }
    for (let q = -1; q <= 1; q += 2) {          // yüz diskleri
      const cx = q * 9.2;
      circ(ctx, cx, 1.5, 10.4); fill(ctx, rad(ctx, cx, 1.5, 3, cx, 1.5, 10.6, [0, '#ffffff', 0.8, '#f3f5f9', 1, '#cdd4df']));
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.moveTo(cx + Math.cos(a) * 7.2, 1.5 + Math.sin(a) * 7.2); ctx.lineTo(cx + Math.cos(a) * 10, 1.5 + Math.sin(a) * 10); }
      ctx.strokeStyle = 'rgba(140,150,170,0.35)'; ctx.lineWidth = 0.5; ctx.stroke();
    }
    const b = blink(t, 0.7), look = Math.sin(t * 0.5) * 0.7;
    for (let q = -1; q <= 1; q += 2) eyeOwl(ctx, q * 9.2, 1.5, 6.1, b, look);
    line(ctx, [-2.6, -6.4, 0, -3.2, 2.6, -6.4], '#c4ccd8', 1);
    ctx.beginPath(); ctx.moveTo(-2.6, 7.5); ctx.quadraticCurveTo(0, 6.4, 2.6, 7.5); ctx.quadraticCurveTo(1.4, 12, 0, 13.4);   // gaga
    ctx.quadraticCurveTo(-1.4, 12, -2.6, 7.5); ctx.closePath();
    fill(ctx, lin(ctx, 0, 6.5, 0, 13.4, [0, '#646a77', 1, '#15171c']));
    ell(ctx, -0.8, 8.4, 0.8, 1.6, 0.2); fill(ctx, 'rgba(255,255,255,0.4)');
    ctx.save(); ctx.translate(-16, -11.5); ctx.rotate(-0.4);       // pembe fiyonk
    path(ctx, [0, 0, -4.6, -2.8, -4.6, 2.8]); fill(ctx, '#ff7ab8');
    path(ctx, [0, 0, 4.6, -2.8, 4.6, 2.8]); fill(ctx, '#ff7ab8');
    path(ctx, [0, 0, -4.6, -2.8, -3.8, 0]); fill(ctx, 'rgba(255,255,255,0.35)');
    circ(ctx, 0, 0, 1.4); fill(ctx, '#e0508f');
    ctx.restore();
  }

  /* ---------- 4 FOK MİNO ---------- */
  function av4(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';     // sudan süzülen ışık
    for (let i = 0; i < 3; i++) {
      const x = -20 + i * 18 + Math.sin(t * 0.6 + i) * 3;
      path(ctx, [x - 3, -42, x + 3, -42, x + 12, 42, x + 2, 42]); fill(ctx, 'rgba(160,230,255,0.08)');
    }
    ctx.restore();
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 7; i++) {                // kabarcıklar
      const p = mod(t * 0.25 + i / 7, 1), x = -30 + i * 10 + Math.sin(t * 1.3 + i) * 2, y = 40 - p * 84, r = 1.2 + (i % 3) * 0.8;
      circ(ctx, x, y, r); ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * (1 - p * 0.6)).toFixed(3) + ')'; ctx.stroke();
      circ(ctx, x - r * 0.35, y - r * 0.35, r * 0.25); fill(ctx, 'rgba(255,255,255,0.6)');
    }
    ell(ctx, 0, 50, 32, 22); fill(ctx, rad(ctx, -8, 34, 2, 0, 50, 34, [0, '#c3cfdb', 1, '#5b6b80']));
    path(ctx, [-27, 32, -6, 30, 0, 42, 6, 30, 27, 32, 31, 46, -31, 46]);     // denizci yakası
    fill(ctx, lin(ctx, 0, 30, 0, 46, [0, '#2a55b0', 1, '#142d6a']));
    line(ctx, [-25, 34.4, -7, 32.6, -1.2, 42.5], '#ffffff', 1); line(ctx, [25, 34.4, 7, 32.6, 1.2, 42.5], '#ffffff', 1);
    path(ctx, [-3.4, 35, 3.4, 35, 0, 42]); fill(ctx, '#e23b3b');
    circ(ctx, 0, 34, 2.3); fill(ctx, rad(ctx, -0.6, 33.4, 0.2, 0, 34, 2.4, [0, '#ff7a6a', 1, '#b31f1f']));
    ell(ctx, 0, 1, 24.5, 22); fill(ctx, rad(ctx, -8, -8, 2, 0, 1, 26, [0, '#e2eaf2', 0.55, '#a8b6c6', 1, '#5f7086']));
    ctx.fillStyle = 'rgba(60,76,98,0.35)';
    const SP = [-14, -9, 2.2, 1.6, 12, -12, 1.8, 1.3, 16, -4, 1.4, 1, -17, 2, 1.3, 1, 6, -17, 1.5, 1.1, -7, -15, 1.1, 0.8];
    for (let i = 0; i < SP.length; i += 4) { ell(ctx, SP[i], SP[i + 1], SP[i + 2], SP[i + 3], 0.3); ctx.fill(); }
    for (let q = -1; q <= 1; q += 2) { ell(ctx, q * 8.8, -9.4, 1.6, 0.8, q * 0.3); fill(ctx, 'rgba(55,68,88,0.6)'); }
    const b = blink(t, 3.1);
    for (let q = -1; q <= 1; q += 2) eyeG(ctx, q * 9.4, -1.5, 5.2, 5.8, b, ['#33404f', '#020305']);
    for (let q = -1; q <= 1; q += 2) { ell(ctx, q * 13.5, 6.5, 3.2, 2); fill(ctx, 'rgba(255,130,160,0.32)'); }
    for (let q = -1; q <= 1; q += 2) {          // bıyık yastıkları
      ell(ctx, q * 4.4, 9.6, 5.4, 4.4); fill(ctx, rad(ctx, q * 4.4 - 1, 8.4, 0.5, q * 4.4, 9.6, 5.6, [0, '#ffffff', 1, '#c4d0dc']));
    }
    ctx.fillStyle = 'rgba(60,72,90,0.55)';
    for (let q = -1; q <= 1; q += 2) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { circ(ctx, q * (3 + c * 1.9), 8.6 + r * 2.2 + c * 0.2, 0.38); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-2.6, 5.4); ctx.quadraticCurveTo(0, 4.2, 2.6, 5.4); ctx.quadraticCurveTo(1.4, 8.2, 0, 8.4);
    ctx.quadraticCurveTo(-1.4, 8.2, -2.6, 5.4); ctx.closePath(); fill(ctx, '#1c222b');
    ell(ctx, -0.8, 5.5, 0.9, 0.45); fill(ctx, 'rgba(255,255,255,0.6)');
    ell(ctx, 0, 14.9, 1.2, 0.85); fill(ctx, '#f08aa0');
    ctx.beginPath(); ctx.moveTo(-2.6, 13.8); ctx.quadraticCurveTo(0, 15.8, 2.6, 13.8);
    ctx.strokeStyle = '#4a5568'; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();                            // bıyıklar
    for (let q = -1; q <= 1; q += 2) for (let k = 0; k < 3; k++) {
      ctx.moveTo(q * 8, 8.4 + k * 1.6); ctx.quadraticCurveTo(q * 13, 7.4 + k * 2.2, q * 17.5, 5.8 + k * 3.2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.55; ctx.stroke();
  }

  /* ---------- 5 BUZ CADISI AYZA ---------- */
  function flake(ctx, x, y, s, col) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, c = Math.cos(a) * s, d = Math.sin(a) * s; ctx.moveTo(x - c, y - d); ctx.lineTo(x + c, y + d); }
    ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke();
  }
  function av5(ctx, t) {
    const FL = [-28, -22, 26, -28, -32, 6, 31, 2, -20, -33, 14, -35];
    for (let i = 0; i < FL.length; i += 2) {
      const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.2 + i));
      flake(ctx, FL[i], FL[i + 1], 1.6 + (i % 3) * 0.5, 'rgba(200,232,255,' + a.toFixed(3) + ')');
    }
    ctx.beginPath(); ctx.moveTo(-17, -12);       // arka saç
    ctx.bezierCurveTo(-30, -2, -30, 24, -34, 44); ctx.lineTo(34, 44); ctx.bezierCurveTo(30, 24, 30, -2, 17, -12); ctx.closePath();
    fill(ctx, lin(ctx, -30, 0, 30, 0, [0, '#94a6d2', 0.3, '#eef4ff', 0.65, '#d4e0f6', 1, '#7f91c0']));
    ctx.beginPath();
    for (let q = -1; q <= 1; q += 2) for (let k = 0; k < 3; k++) {
      ctx.moveTo(q * (15 + k * 3), -6 + k * 2); ctx.bezierCurveTo(q * (24 + k), 6, q * (22 + k * 2), 22, q * (26 + k * 2), 40);
    }
    ctx.strokeStyle = 'rgba(110,130,185,0.45)'; ctx.lineWidth = 0.7; ctx.stroke();
    ell(ctx, 0, 52, 33, 22); fill(ctx, lin(ctx, 0, 30, 0, 74, [0, '#4f3eac', 1, '#150e3a']));   // pelerin
    for (let q = -1; q <= 1; q += 2) {          // buz yaka
      pathM(ctx, [5, 32, 13.5, 17, 16.5, 25, 23.5, 15.5, 26, 30, 22, 38], q);
      ctx.lineJoin = 'round'; ctx.lineWidth = 0.8; ctx.strokeStyle = '#1b2f6a'; ctx.stroke();
      fill(ctx, lin(ctx, q * 5, 15, q * 26, 38, [0, 'rgba(200,245,255,0.95)', 1, 'rgba(60,120,220,0.8)']));
    }
    rrect(ctx, -4.5, 13, 9, 15, 2); fill(ctx, lin(ctx, 0, 13, 0, 28, [0, '#94a8d2', 1, '#c2d2ee']));
    ell(ctx, 0, 2, 13.8, 16.8); fill(ctx, rad(ctx, -4, -3, 1, 0, 2, 17, [0, '#f6f9ff', 0.6, '#d6e2f6', 1, '#a2b5da']));
    ctx.beginPath(); ctx.moveTo(-14.5, 8);       // perçem
    ctx.bezierCurveTo(-16, -6, -9, -12.5, 0, -11.8); ctx.bezierCurveTo(8, -11.5, 14, -7, 14.5, 6);
    ctx.bezierCurveTo(12.5, -2, 9, -5.5, 4, -6.5); ctx.bezierCurveTo(0, -4, -6, -3, -9.5, -6.4);
    ctx.bezierCurveTo(-11.8, -3, -12.6, 2, -14.5, 8); ctx.closePath();
    fill(ctx, lin(ctx, -14, -12, 14, 4, [0, '#ffffff', 1, '#bccbea']));
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.quadraticCurveTo(-3, -6, 3, -7.5); ctx.moveTo(-12, -4); ctx.quadraticCurveTo(-11, -8, -6, -10.5);
    ctx.moveTo(10, -6); ctx.quadraticCurveTo(12.5, -2, 13, 3);
    ctx.strokeStyle = 'rgba(120,140,195,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
    glow(ctx, 0, -20, 17, '140,220,255', 0.32 + 0.2 * Math.sin(t * 2.4));   // kristal taç
    const CR = [-10.4, -10, 1.6, 8.5, 10.4, -10, 1.6, 8.5, -5.6, -11.5, 2, 13, 5.6, -11.5, 2, 13, 0, -11.8, 2.6, 19];
    for (let i = 0; i < CR.length; i += 4) {
      const x = CR[i], bs = CR[i + 1], w = CR[i + 2], h = CR[i + 3];
      path(ctx, [x, bs, x - w, bs - h * 0.35, x, bs - h, x + w, bs - h * 0.35]);
      ctx.lineJoin = 'round'; ctx.lineWidth = 0.7; ctx.strokeStyle = '#1b3f7a'; ctx.stroke();
      fill(ctx, lin(ctx, x - w, 0, x + w, 0, [0, '#ffffff', 0.5, '#aaeeff', 1, '#3a8fe0']));
      line(ctx, [x, bs, x, bs - h], 'rgba(255,255,255,0.65)', 0.4);
    }
    ctx.beginPath(); ctx.moveTo(-12, -9); ctx.quadraticCurveTo(0, -14.5, 12, -9);
    ctx.strokeStyle = lin(ctx, -12, 0, 12, 0, [0, '#9fb6d8', 0.5, '#ffffff', 1, '#8aa2cc']); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.stroke();
    path(ctx, [0, -13.6, 1.3, -11.8, 0, -10, -1.3, -11.8]); fill(ctx, '#41d6ff');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    sparkle(ctx, 0, -30.8, 2 + 1.3 * Math.sin(t * 4), 'rgba(230,250,255,0.95)');
    sparkle(ctx, -5.6, -24.5, 1 + 0.8 * Math.sin(t * 4 + 2), 'rgba(230,250,255,0.8)');
    ctx.restore();
    ctx.lineCap = 'round';
    for (let q = -1; q <= 1; q += 2) {
      ctx.beginPath(); ctx.moveTo(q * 2.5, -3.4); ctx.quadraticCurveTo(q * 6, -5.4, q * 9, -3.2);
      ctx.strokeStyle = '#7f98cc'; ctx.lineWidth = 0.9; ctx.stroke();
    }
    const b = blink(t, 0.9);
    for (let q = -1; q <= 1; q += 2) {
      eyeW(ctx, q * 5.6, 1.8, 3.3, 2.1, ['#c8f8ff', '#16a2dc'], 1.9, b, '#262b66');
      if (b < 0.5) line(ctx, [q * 8.7, 1.0, q * 10.3, -0.4], '#262b66', 0.8);
    }
    ctx.beginPath(); ctx.moveTo(0.2, 4.5); ctx.quadraticCurveTo(1.3, 7.5, -0.4, 8);
    ctx.strokeStyle = 'rgba(105,125,180,0.6)'; ctx.lineWidth = 0.7; ctx.stroke();
    for (let q = -1; q <= 1; q += 2) { ell(ctx, q * 8, 7, 3, 1.8); fill(ctx, 'rgba(140,190,255,0.3)'); }
    ctx.beginPath(); ctx.moveTo(-3, 11); ctx.quadraticCurveTo(-1, 9.9, 0, 10.5); ctx.quadraticCurveTo(1, 9.9, 3, 11);
    ctx.quadraticCurveTo(0, 13.4, -3, 11); ctx.closePath(); fill(ctx, lin(ctx, 0, 10, 0, 13, [0, '#ad84ec', 1, '#5a3fb0']));
    ell(ctx, -0.8, 11.8, 0.9, 0.35); fill(ctx, 'rgba(255,255,255,0.45)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    sparkle(ctx, 9.4, 6.2, 1.3 + 0.5 * Math.sin(t * 3), 'rgba(190,235,255,0.8)');
    ctx.restore();
  }

  const AV_BG = [
    [0, '#7cc8e6', 0.55, '#246a96', 1, '#0d2f4e'],
    [0, '#d6f6ff', 0.55, '#6cbde2', 1, '#2a6a9a'],
    [0, '#2b4080', 0.55, '#15214a', 1, '#080e26'],
    [0, '#8a76d0', 0.55, '#3d2d80', 1, '#1a1240'],
    [0, '#6fd2f0', 0.55, '#1878b8', 1, '#0a3a6c'],
    [0, '#4a4cae', 0.55, '#1e1c5c', 1, '#090a26'],
  ];
  const AV_FN = [av0, av1, av2, av3, av4, av5];

  function idx(id, n) { id = id | 0; return id >= 0 && id < n ? id : 0; }

  const COS = {
    SLEDS: [
      { id: 0, name: 'KEŞİF', price: 0, desc: 'Üslerin sadık turuncu kurye gemisi.' },
      { id: 1, name: 'KUTUP TİLKİSİ', price: 300, desc: 'İnce burunlu, buz kadar hafif yarışçı.' },
      { id: 2, name: 'KIZIL ŞİMŞEK', price: 600, desc: 'Kırmızı kama, sarı şimşek çizgisi.' },
      { id: 3, name: 'MOR KUYRUKLU YILDIZ', price: 1000, desc: 'Kalbinde parlayan bir yıldız taşır.' },
      { id: 4, name: 'ZÜMRÜT EJDER', price: 1600, desc: 'Pullu gövde, kanat gibi açılan motorlar.' },
      { id: 5, name: 'ALTIN İMPARATOR', price: 2500, desc: 'Altın ve fildişi; buzun hükümdarı.' },
    ],
    AVATARS: [
      { id: 0, name: 'KAPTAN DERYA', price: 0, desc: 'Kürk kapüşonlu, gözlüklü kâşif.' },
      { id: 1, name: 'PENGUEN POPO', price: 200, desc: 'Bereli, atkılı, hep neşeli.' },
      { id: 2, name: 'KUTUP AYISI BORA', price: 400, desc: 'İri, sakin ve buz gibi cesur.' },
      { id: 3, name: 'BAYKUŞ ZEYNO', price: 700, desc: 'Gece nöbetindeki kar baykuşu.' },
      { id: 4, name: 'FOK MİNO', price: 1100, desc: 'Denizci yakalı, meraklı fok.' },
      { id: 5, name: 'BUZ CADISI AYZA', price: 1800, desc: 'Kristal taçlı buzların büyücüsü.' },
    ],
    drawSled(ctx, id, tier, t) {
      tier = Math.max(0, Math.min(3, tier | 0)); t = +t || 0;
      ctx.save();
      SLED_FN[idx(id, SLED_FN.length)](ctx, tier, t);
      ctx.restore();
    },
    drawAvatar(ctx, id, x, y, r, t) {
      const i = idx(id, AV_FN.length);
      frame(ctx, x, y, r, +t || 0, AV_BG[i], AV_FN[i]);
    },
  };
  (typeof window !== 'undefined' ? window : globalThis).COS = COS;
})();
