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

  /* ---------- avatar yardımcıları ----------
     Portreler 40 birim yarıçaplı dairede çizilir; ışık sol üstten gelir,
     sağ kenarda pilotun imza renginde arka ışık (rim) vardır. */
  function blink(t, seed) {                     // ~4 sn'de bir kısa göz kırpma, 0..1
    const p = mod(t + seed, 4.3);
    return p < 0.18 ? Math.sin(p / 0.18 * Math.PI) : 0;
  }
  function rgba(rgb, a) { return 'rgba(' + rgb + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
  function hsh(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  // cel-shading: kalın kontur + taban + sert gölge hilali + sağ üst kenarda renkli arka ışık
  // o: b (taban), s (gölge), r (rim), sx/sy (gölge kayması), rw (rim kalınlığı), lw (kontur, 0 = yok), hi(ctx) (klip içinde ek çizim)
  function toon(ctx, shape, o) {
    const sx = o.sx == null ? 2.2 : o.sx, sy = o.sy == null ? 2.6 : o.sy, rw = o.rw == null ? 1.6 : o.rw;
    ctx.save();
    shape(ctx);
    if (o.lw !== 0) { ctx.lineJoin = 'round'; ctx.lineWidth = o.lw || 3; ctx.strokeStyle = OUT; ctx.stroke(); }
    ctx.fillStyle = o.s || o.b; ctx.fill();
    ctx.clip();
    if (o.r) {
      ctx.fillStyle = o.r; ctx.fill();
      ctx.save(); ctx.translate(-rw, rw * 0.45); shape(ctx); ctx.fillStyle = o.s || o.b; ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.translate(-sx, -sy); shape(ctx); ctx.fillStyle = o.b; ctx.fill(); ctx.restore();
    if (o.hi) o.hi(ctx);
    ctx.restore();
  }
  // sivrilen kaş: iç uç (x0,y0) kalın, dış uç (x1,y1) ince; bend < 0 yukarı kavis
  function brow(ctx, x0, y0, x1, y1, bend, w, col) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + bend;
    ctx.beginPath(); ctx.moveTo(x0, y0 - w * 0.5);
    ctx.quadraticCurveTo(mx, my - w * 0.62, x1, y1 - w * 0.08);
    ctx.quadraticCurveTo(mx, my + w * 0.3, x0, y0 + w * 0.5); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 0.9; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = col; ctx.fill();
  }
  // badem göz; q = taraf (-1 sol, 1 sağ; dış köşe +x). o: w, h, iris[2], ir, pr, lid (0..0.5), skew, skin, lash, lw, look, wing, white
  function heroEye(ctx, x, y, q, o, closed) {
    const w = o.w, h = o.h, k = Math.max(0.1, 1 - closed);
    const lid = o.lid || 0, cx = (o.skew || 0) * w, cy = 2 * h * (-0.97 + 1.6 * lid), ye = -h * 0.2;
    ctx.save(); ctx.translate(x, y); ctx.scale(q, k);
    ctx.beginPath(); ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w * 0.5, -h * 1.25, w * 0.55, -h * 1.3, w, ye);
    ctx.bezierCurveTo(w * 0.6, h * 0.95, -w * 0.5, h * 0.95, -w, 0); ctx.closePath();
    ctx.fillStyle = o.white || '#ffffff'; ctx.fill();
    ctx.save(); ctx.clip();
    const ix = (o.look || 0) * q, iy = h * 0.12, ir = o.ir;
    circ(ctx, ix, iy, ir); ctx.fillStyle = rad(ctx, ix, iy + ir * 0.55, 0, ix, iy, ir, [0, o.iris[0], 1, o.iris[1]]); ctx.fill();
    ctx.lineWidth = 0.45; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    if (o.pr !== 0) { circ(ctx, ix, iy, ir * (o.pr || 0.45)); ctx.fillStyle = '#05070c'; ctx.fill(); }
    circ(ctx, ix - ir * 0.38 * q, iy - ir * 0.42, ir * 0.34); ctx.fillStyle = '#ffffff'; ctx.fill();
    circ(ctx, ix + ir * 0.4 * q, iy + ir * 0.38, ir * 0.15); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-w - 1, -h * 3); ctx.lineTo(-w, 0); ctx.quadraticCurveTo(cx, cy, w, ye); ctx.lineTo(w + 1, -h * 3); ctx.closePath();
    ctx.fillStyle = o.skin; ctx.fill();                                   // göz kapağı
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(cx, cy, w, ye);
    ctx.lineTo(w, ye + h * 0.55); ctx.quadraticCurveTo(cx, cy + h * 1.1, -w, h * 0.55); ctx.closePath();
    ctx.fillStyle = 'rgba(30,15,40,0.22)'; ctx.fill();                    // kapak gölgesi
    ctx.restore();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = o.lash || OUT;
    ctx.beginPath(); ctx.moveTo(-w - 0.2, 0.1); ctx.quadraticCurveTo(cx, cy, w + 0.3, ye);
    if (o.wing) ctx.lineTo(w + o.wing, ye - o.wing * 0.8);
    ctx.lineWidth = o.lw || 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * 0.5, h * 0.66); ctx.quadraticCurveTo(w * 0.35, h * 0.86, w * 0.95, ye + h * 0.1);
    ctx.lineWidth = (o.lw || 1.3) * 0.42; ctx.stroke();
    ctx.restore();
  }
  // arka plan: dönen enerji ışınları
  function rays(ctx, t, rgb, n, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(0, -5); ctx.rotate(t * 0.12);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const ang = i / n * TAU, w = 0.07 + (i % 3) * 0.035;
      ctx.moveTo(0, 0); ctx.arc(0, 0, 62, ang - w, ang + w); ctx.closePath();
    }
    ctx.fillStyle = rad(ctx, 0, 0, 3, 0, 0, 56, [0, rgba(rgb, a), 0.45, rgba(rgb, a * 0.4), 1, rgba(rgb, 0)]);
    ctx.fill();
    ctx.restore();
  }
  function frame(ctx, x, y, r, t, P, draw) {
    ctx.save(); ctx.translate(x, y);
    const s = Math.max(0.01, r / 40); ctx.scale(s, s);           // içeride 40 birim yarıçap
    ctx.save(); circ(ctx, 0, 0, 40); ctx.clip();
    ctx.fillStyle = rad(ctx, 0, -8, 1, 0, -4, 54, P.bg); ctx.fillRect(-40, -40, 80, 80);
    rays(ctx, t, P.ray, 14, 0.5);
    glow(ctx, 0, -6, 30, P.halo, P.ha * (0.85 + 0.15 * Math.sin(t * 2.2)));
    draw(ctx, t);
    ctx.fillStyle = rad(ctx, 0, -4, 25, 0, -2, 41, [0, 'rgba(5,0,25,0)', 1, 'rgba(5,0,25,0.42)']); ctx.fillRect(-40, -40, 80, 80);
    ctx.globalCompositeOperation = 'lighter';                  // iç enerji çizgisi
    circ(ctx, 0, 0, 37.4); ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(P.ray, 0.5 + 0.2 * Math.sin(t * 3)); ctx.stroke();
    ctx.restore();
    const lw = Math.max(3.8, 2.2 / s), R = 40 - lw / 2;           // altın halka
    circ(ctx, 0, 0, R); ctx.lineWidth = lw;
    ctx.strokeStyle = lin(ctx, -40, -40, 40, 40, [0, '#fff6c2', 0.3, '#e8b430', 0.6, '#9a6a0c', 0.85, '#f6d26a', 1, '#b07e14']); ctx.stroke();
    const e = Math.max(0.8, 0.9 / s);
    ctx.lineWidth = e; ctx.strokeStyle = 'rgba(45,26,0,0.9)';
    circ(ctx, 0, 0, 40 - e / 2); ctx.stroke(); circ(ctx, 0, 0, 40 - lw); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R, -2.6, -1.7); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = lw * 0.32; ctx.stroke();
    if (s > 0.6) {                                                // büyük boyda halkada perçinler
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * 0.25 + i * Math.PI / 2, px = Math.cos(a) * R, py = Math.sin(a) * R;
        circ(ctx, px, py, lw * 0.3); ctx.fillStyle = rad(ctx, px - 0.4, py - 0.4, 0, px, py, lw * 0.3, [0, '#fffbe0', 1, '#a8740e']); ctx.fill();
        ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(45,26,0,0.9)'; ctx.stroke();
      }
    }
    ctx.restore();
  }
  function twinkles(ctx, t, pts, size, rgb) {
    for (let i = 0; i < pts.length; i += 2) {
      const a = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.5 + i * 1.7));
      sparkle(ctx, pts[i], pts[i + 1], size * (0.6 + 0.4 * a), rgba(rgb, a));
    }
  }
  function torso(ctx, top, wide) {                   // omuz silueti (alt kenarı daire dışında)
    ctx.beginPath(); ctx.moveTo(-48, 50); ctx.lineTo(-48, top + 15);
    ctx.quadraticCurveTo(-40, top + 2, -wide, top); ctx.lineTo(wide, top);
    ctx.quadraticCurveTo(40, top + 2, 48, top + 15); ctx.lineTo(48, 50); ctx.closePath();
  }
  function mline(ctx, pts, col, lw) {                 // yuvarlak uçlu çoklu çizgi (q-eğri yok)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; line(ctx, pts, col, lw);
  }

  /* ---------- 0 NOVA — yakıt uzmanı kâşif ---------- */
  function av0(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';         // yükselen yakıt kıvılcımları
    for (let i = 0; i < 11; i++) {
      const p = mod(t * 0.24 + i * 0.137, 1), x = -34 + mod(i * 23.3, 68) + Math.sin(t * 1.4 + i * 2) * 3;
      const y = 40 - p * 84, s = (1.1 + (i % 3) * 0.55) * (1 - p * 0.45), a = Math.sin(p * Math.PI);
      ctx.beginPath(); ctx.moveTo(x, y - s * 2.4);
      ctx.quadraticCurveTo(x + s, y - s * 0.2, x, y + s); ctx.quadraticCurveTo(x - s, y - s * 0.2, x, y - s * 2.4);
      ctx.fillStyle = rgba('255,190,90', 0.75 * a); ctx.fill();
    }
    ctx.restore();
    const br = Math.sin(t * 1.8) * 0.5;
    ctx.save(); ctx.translate(0, br);
    // parka
    toon(ctx, c => torso(c, 21, 18), { b: lin(ctx, 0, 20, 0, 42, [0, '#3189c0', 1, '#1d5584']), s: '#163d63', r: '#ffb24a', sx: 5, sy: 2, rw: 2 });
    for (let q = -1; q <= 1; q += 2) {                             // turuncu omuz şeridi
      pathM(ctx, [46, 36, 30, 27.5, 17, 27, 17, 30.5, 30, 31.5, 46, 40.5], q);
      ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
      fill(ctx, lin(ctx, 0, 27, 0, 34, [0, '#ffb04a', 1, '#e8601a']));
    }
    mline(ctx, [0, 24, 0, 41], OUT, 2.4); mline(ctx, [0, 24, 0, 41], '#9fb2c4', 0.9);   // fermuar
    rrect(ctx, -1.6, 27, 3.2, 4.4, 1); fo(ctx, '#e6ecf2', 1);
    toon(ctx, c => circ(c, -14.5, 32, 4.3), { b: '#ffa63a', s: '#d0560f', sx: 1, sy: 1, lw: 1.8 });   // yakıt rozeti
    ctx.beginPath(); ctx.moveTo(-14.5, 29.3); ctx.quadraticCurveTo(-12.3, 32.3, -12.9, 33.3);
    ctx.arc(-14.5, 33.1, 1.6, 0.1, Math.PI - 0.1); ctx.quadraticCurveTo(-16.7, 32.3, -14.5, 29.3); fill(ctx, '#ffffff');
    // kapüşon + kürk
    toon(ctx, c => ell(c, 0, -4, 26.5, 28), { b: '#3189c0', s: '#1a4a74', r: '#ffb24a', sx: 3, sy: 3, rw: 2 });
    ell(ctx, 0, -1, 16, 18); fill(ctx, rad(ctx, 0, -2, 4, 0, -1, 18, [0, '#25344a', 1, '#0d1420']));
    const fur = c => {
      c.beginPath();
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * TAU, bx = Math.cos(a) * 19.6, by = -2 + Math.sin(a) * 21.6, rr = 4.5 + (i % 2) * 0.9;
        c.moveTo(bx + rr, by); c.arc(bx, by, rr, 0, TAU);
      }
    };
    toon(ctx, fur, { b: '#fff4de', s: '#d2ae82', r: '#ffd27a', sx: 1.8, sy: 2.4, rw: 1.4, lw: 2.6 });
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * TAU + 0.14, c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(c * 21, -2 + s * 23); ctx.lineTo(c * 24.5, -2 + s * 26.8);
    }
    ctx.strokeStyle = 'rgba(150,110,70,0.5)'; ctx.lineWidth = 0.7; ctx.lineCap = 'round'; ctx.stroke();
    // yüz
    const face = c => {
      c.beginPath(); c.moveTo(-13, -5);
      c.bezierCurveTo(-13.6, 5, -10, 13.5, -4.5, 17); c.quadraticCurveTo(0, 19.2, 4.5, 17);
      c.bezierCurveTo(10, 13.5, 13.6, 5, 13, -5); c.bezierCurveTo(12, -16, -12, -16, -13, -5); c.closePath();
    };
    toon(ctx, face, { b: '#ffd3ae', s: '#e59a72', r: '#ffc060', sx: 2.6, sy: 1.6, rw: 1.4, lw: 2.4, hi: c => {
      ell(c, -8.2, 8.6, 3.3, 2); fill(c, 'rgba(255,100,80,0.3)'); ell(c, 8.2, 8.6, 3.3, 2); fill(c, 'rgba(255,100,80,0.3)');
      c.fillStyle = 'rgba(160,80,40,0.5)';
      const F = [-9.4, 7.2, -7.6, 8.2, -9.8, 9.2, 7.9, 7.4, 9.6, 8.4];
      for (let i = 0; i < F.length; i += 2) { circ(c, F[i], F[i + 1], 0.42); c.fill(); }
    } });
    // saç: yana taranmış perçem
    const hair = c => {
      c.beginPath(); c.moveTo(-13.8, 1);
      c.bezierCurveTo(-15.5, -12, -7, -19.5, 1, -18.5); c.bezierCurveTo(10, -18, 15.5, -11, 13.8, 0);
      c.bezierCurveTo(12.6, -4, 11.2, -6.5, 9.2, -8); c.bezierCurveTo(8.2, -5.4, 6.2, -4.2, 3.4, -3.8);
      c.bezierCurveTo(5, -5.8, 5, -8, 4.2, -9.6); c.bezierCurveTo(0, -7, -5, -5.4, -9.2, -6);
      c.bezierCurveTo(-11, -4.5, -12.6, -2, -13.8, 1); c.closePath();
    };
    toon(ctx, hair, { b: lin(ctx, 0, -18, 0, -2, [0, '#8a3e20', 1, '#5a2410']), s: '#3a140a', r: '#ff9a3a', sx: 2, sy: 1.2, lw: 2.2, hi: c => {
      c.beginPath(); c.moveTo(-10, -9); c.quadraticCurveTo(-3, -16.5, 6, -14.5);
      c.strokeStyle = 'rgba(255,180,120,0.55)'; c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke();
    } });
    // alına itilmiş uçuş gözlüğü
    ctx.beginPath(); ctx.moveTo(-19.5, -8.5); ctx.quadraticCurveTo(0, -18.5, 19.5, -8.5);
    ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 4.6; ctx.stroke();
    ctx.strokeStyle = '#5a4250'; ctx.lineWidth = 2.6; ctx.stroke();
    rrect(ctx, -2.4, -15.6, 4.8, 2.6, 1); fo(ctx, '#8a96a8', 1.4);
    for (let q = -1; q <= 1; q += 2) {
      const gx = q * 6.6, gy = -13.6;
      toon(ctx, c => circ(c, gx, gy, 5), { b: '#a9b4c4', s: '#4a5566', sx: 1.2, sy: 1.2, lw: 2.2 });
      circ(ctx, gx, gy, 3.6); fill(ctx, rad(ctx, gx - 1, gy - 1.4, 0.2, gx, gy, 3.8, [0, '#fff6c8', 0.35, '#ffb43a', 1, '#a8400a']));
      ctx.beginPath(); ctx.arc(gx, gy, 2.5, 3.5, 4.9); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.9; ctx.stroke();
      glow(ctx, gx, gy, 6, '255,170,60', 0.25 + 0.12 * Math.sin(t * 3 + q));
    }
    // kaşlar: sol kalkık (kendinden emin), sağ alçak
    brow(ctx, -2.4, -3.6, -10.8, -6.4, -1.9, 2.3, '#3e180c');
    brow(ctx, 2.4, -2.5, 10.8, -4.4, -0.7, 2.3, '#3e180c');
    const b = blink(t, 0.3);
    const E = { w: 3.5, h: 2.5, iris: ['#a6ecff', '#1f6cc0'], ir: 1.95, skin: '#ffd3ae', lw: 1.5, look: 0.35, wing: 0.7, skew: 0.3 };
    E.lid = 0.12; heroEye(ctx, -5.7, 1.2, -1, E, b);
    E.lid = 0.3; heroEye(ctx, 5.7, 1.2, 1, E, b);
    ctx.beginPath(); ctx.moveTo(0.3, 3.4); ctx.quadraticCurveTo(2.1, 7.2, -0.2, 8.2);       // burun
    ctx.strokeStyle = '#b8603e'; ctx.lineWidth = 0.95; ctx.lineCap = 'round'; ctx.stroke();
    ell(ctx, -0.9, 6.4, 0.7, 1.1, 0.3); fill(ctx, 'rgba(255,255,255,0.5)');
    // yan gülüş
    ctx.beginPath(); ctx.moveTo(-3.8, 12.3); ctx.quadraticCurveTo(0.4, 14.2, 4.7, 10.5);
    ctx.strokeStyle = '#6e2418'; ctx.lineWidth = 1.35; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4.1, 9.8); ctx.quadraticCurveTo(5.5, 10.4, 5.3, 11.8); ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.4, 14.6); ctx.quadraticCurveTo(0.8, 15.5, 2.7, 14.1);
    ctx.strokeStyle = 'rgba(160,70,50,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    // yara izi (sağ yanak)
    mline(ctx, [8.8, 3.9, 11.1, 8.9], '#c85a62', 1.1);
    mline(ctx, [9.0, 5.6, 10.6, 5.0, 9.8, 7.6, 11.3, 7.0], 'rgba(200,90,98,0.75)', 0.55);
    // kulaklık + mikrofon (sol)
    ctx.beginPath(); ctx.moveTo(-12.4, 6.4); ctx.quadraticCurveTo(-11.2, 13.6, -5.6, 13.9);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.stroke(); ctx.strokeStyle = '#4c566a'; ctx.lineWidth = 1.2; ctx.stroke();
    toon(ctx, c => ell(c, -5.2, 13.9, 1.6, 1.3), { b: '#3a4252', s: '#1a1e28', sx: 0.5, sy: 0.5, lw: 1.4 });
    toon(ctx, c => circ(c, -13.6, 3.6, 3.6), { b: '#3e4658', s: '#1c2130', r: '#ffb24a', sx: 1, sy: 1, rw: 0.8, lw: 2 });
    circ(ctx, -13.6, 3.6, 1.6); fill(ctx, '#ff9a2a');
    glow(ctx, -13.6, 3.6, 4.5, '255,160,60', 0.35 + 0.3 * Math.max(0, Math.sin(t * 4)));
    ctx.restore();
  }

  /* ---------- 1 ROKET — atom/hız manyağı penguen as ---------- */
  function av1(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';         // hız çizgileri
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const p = mod(t * 0.9 + i * 0.29, 1), y = -34 + i * 8.5 + (i % 2) * 2, x = 46 - p * 100, L = 8 + (i % 3) * 5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L, y - L * 0.35);
      ctx.strokeStyle = rgba('255,230,200', 0.55 * Math.sin(p * Math.PI)); ctx.lineWidth = 0.8 + (i % 2) * 0.6; ctx.stroke();
    }
    ctx.restore();
    twinkles(ctx, t, [-30, -18, 29, -24, -24, -31, 22, -32], 1.8, '255,240,210');
    const br = Math.sin(t * 2.2) * 0.5;
    ctx.save(); ctx.translate(0, br);
    // dalgalanan atkı ucu (arkada)
    const sw = t * 6;
    const tail = c => {
      c.beginPath();
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, x = 6 + u * 38, y = 19 - u * 15 + Math.sin(sw - u * 5) * u * 4.5;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      for (let i = 8; i >= 0; i--) {
        const u = i / 8, x = 6 + u * 38 + 1, y = 19 - u * 15 + Math.sin(sw - u * 5 + 0.5) * u * 4.5 + 6.5 - u * 2;
        c.lineTo(x, y);
      }
      c.closePath();
    };
    const stripes = lin(ctx, 6, 22, 44, 6, [0, '#ffd23a', 0.3, '#ffd23a', 0.3, '#ff3a2a', 0.4, '#ff3a2a', 0.4, '#ffd23a', 0.62, '#ffd23a', 0.62, '#ff3a2a', 0.72, '#ff3a2a', 0.72, '#ffd23a', 1, '#ffd23a']);
    toon(ctx, tail, { b: stripes, s: '#d0800c', sx: 0, sy: -1.6, lw: 2.4 });
    // gövde
    toon(ctx, c => torso(c, 20, 16), { b: '#2a3248', s: '#121726', r: '#ff6a4a', sx: 4, sy: 2, rw: 2 });
    toon(ctx, c => ell(c, 0, 44, 15, 19), { b: '#ffffff', s: '#c4d1e4', sx: 2.5, sy: 2, lw: 2 });
    // roket rozeti
    toon(ctx, c => circ(c, -15, 31, 4.6), { b: '#ff4a3a', s: '#b81a1a', sx: 1, sy: 1, lw: 1.8 });
    ctx.save(); ctx.translate(-15, 31); ctx.rotate(0.6);
    path(ctx, [0, -3.2, 1.2, -1.2, 1.2, 1.6, -1.2, 1.6, -1.2, -1.2]); fill(ctx, '#ffffff');
    path(ctx, [-1.2, 0.4, -2.2, 2.2, -1.2, 1.6]); fill(ctx, '#ffffff'); path(ctx, [1.2, 0.4, 2.2, 2.2, 1.2, 1.6]); fill(ctx, '#ffffff');
    path(ctx, [-0.7, 1.8, 0.7, 1.8, 0, 3.2 + Math.sin(t * 20) * 0.5]); fill(ctx, '#ffd23a');
    ctx.restore();
    // boyun atkısı
    const wrap = c => { c.beginPath(); c.moveTo(-18, 16.5); c.quadraticCurveTo(0, 25, 18, 16.5); c.lineTo(19, 23.5); c.quadraticCurveTo(0, 33, -19, 23.5); c.closePath(); };
    toon(ctx, wrap, { b: '#ffd23a', s: '#d8860e', sx: 2, sy: 1.5, lw: 2.4, hi: c => {
      c.fillStyle = '#ff3a2a'; for (let i = -2; i <= 2; i++) { c.save(); c.translate(i * 7.5, 24); c.rotate(-0.2); c.fillRect(-1.6, -10, 3.2, 20); c.restore(); }
    } });
    toon(ctx, c => ell(c, 9, 25, 3.6, 3), { b: '#ffd23a', s: '#d8860e', sx: 1, sy: 1, lw: 1.8 });
    // baş
    toon(ctx, c => circ(c, 0, -1, 20.5), { b: rad(ctx, -6, -9, 2, 0, -1, 22, [0, '#3e4a68', 1, '#1e2536']), s: '#0f1320', r: '#ff6a4a', sx: 3, sy: 2.4, rw: 1.8 });
    const mask = c => {
      c.beginPath(); c.moveTo(0, -5.5);
      c.bezierCurveTo(-4, -11.5, -15.5, -11, -16.2, -0.5); c.bezierCurveTo(-17, 8.5, -10, 16.4, 0, 17.2);
      c.bezierCurveTo(10, 16.4, 17, 8.5, 16.2, -0.5); c.bezierCurveTo(15.5, -11, 4, -11.5, 0, -5.5); c.closePath();
    };
    toon(ctx, mask, { b: '#ffffff', s: '#c6d3e6', sx: 2.4, sy: 1.8, lw: 1.4, hi: c => {
      ell(c, -11.2, 8.4, 2.8, 1.8); fill(c, 'rgba(255,110,140,0.4)'); ell(c, 11.2, 8.4, 2.8, 1.8); fill(c, 'rgba(255,110,140,0.4)');
    } });
    // pilot başlığı
    const cap = c => {
      c.beginPath(); c.moveTo(-21, 2);
      c.bezierCurveTo(-22.5, -17, -12, -25.5, 0, -25.5); c.bezierCurveTo(12, -25.5, 22.5, -17, 21, 2);
      c.lineTo(21, 9); c.quadraticCurveTo(18.5, 13, 15.8, 9.5); c.lineTo(15.8, -1);
      c.bezierCurveTo(13, -13.4, -13, -13.4, -15.8, -1); c.lineTo(-15.8, 9.5);
      c.quadraticCurveTo(-18.5, 13, -21, 9); c.closePath();
    };
    toon(ctx, cap, { b: lin(ctx, 0, -25, 0, 8, [0, '#a8643a', 1, '#7a4022']), s: '#4e2612', r: '#ff8a5a', sx: 2.6, sy: 1.6, rw: 1.6, lw: 2.6, hi: c => {
      c.beginPath(); c.moveTo(0, -25.5); c.lineTo(0, -12); c.strokeStyle = 'rgba(40,16,4,0.55)'; c.lineWidth = 0.8; c.stroke();
      c.beginPath(); c.moveTo(-9, -22); c.quadraticCurveTo(-4, -24.5, 2, -24); c.strokeStyle = 'rgba(255,210,170,0.5)'; c.lineWidth = 1.4; c.lineCap = 'round'; c.stroke();
    } });
    for (let q = -1; q <= 1; q += 2) { circ(ctx, q * 18.4, 7, 1.2); fo(ctx, '#e8c060', 0.9); }
    // başlıktaki gözlük
    ctx.beginPath(); ctx.moveTo(-21.5, -10); ctx.quadraticCurveTo(0, -20, 21.5, -10);
    ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 4.2; ctx.stroke(); ctx.strokeStyle = '#3a2216'; ctx.lineWidth = 2.4; ctx.stroke();
    for (let q = -1; q <= 1; q += 2) {
      const gx = q * 6.4, gy = -16.2;
      toon(ctx, c => circ(c, gx, gy, 5), { b: '#f2c04a', s: '#a8700e', sx: 1.2, sy: 1.2, lw: 2.2 });
      circ(ctx, gx, gy, 3.5); fill(ctx, rad(ctx, gx - 1, gy - 1.3, 0.2, gx, gy, 3.7, [0, '#e8ffff', 0.4, '#3ccaf0', 1, '#0c4a8a']));
      ctx.beginPath(); ctx.arc(gx, gy, 2.4, 3.5, 4.9); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.9; ctx.stroke();
    }
    rrect(ctx, -2.2, -17.6, 4.4, 2.4, 1); fo(ctx, '#c08a2a', 1.3);
    // kaşlar + gözler: sol kısık, sağ kalkık
    brow(ctx, -2.6, -2.4, -10.8, -4.4, -0.3, 2.4, '#0f1320');
    brow(ctx, 2.6, -4, 10.4, -6.3, -1.6, 2.4, '#0f1320');
    const b = blink(t, 1.1);
    const E = { w: 3.3, h: 3.2, iris: ['#5a6c96', '#0a0e18'], ir: 2.4, pr: 0.5, skin: '#ffffff', lw: 1.5, look: 0.5, skew: 0.2 };
    E.lid = 0.36; heroEye(ctx, -6.4, 2, -1, E, b);
    E.lid = 0.1; heroEye(ctx, 6.4, 2, 1, E, b);
    // sırıtan gaga
    ctx.beginPath(); ctx.moveTo(-4.6, 9.6); ctx.quadraticCurveTo(0, 11.2, 5.6, 9);
    ctx.quadraticCurveTo(4.2, 13.8, 0, 13.8); ctx.quadraticCurveTo(-3.8, 13.2, -4.6, 9.6); ctx.closePath();
    ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke(); fill(ctx, lin(ctx, 0, 9, 0, 14, [0, '#f07a1e', 1, '#b84a0a']));
    ctx.beginPath(); ctx.moveTo(-3.4, 11); ctx.quadraticCurveTo(0, 12.4, 4.4, 10.4); ctx.quadraticCurveTo(2, 13, -0.4, 12.9); ctx.closePath(); fill(ctx, '#ff7a8a');
    const beak = c => {
      c.beginPath(); c.moveTo(-6.6, 6.6); c.quadraticCurveTo(0, 3.6, 6.8, 6.2);
      c.quadraticCurveTo(8.4, 8.2, 6.6, 9.6); c.quadraticCurveTo(0, 11.4, -5.2, 9.8);
      c.quadraticCurveTo(-7.6, 8.6, -6.6, 6.6); c.closePath();
    };
    toon(ctx, beak, { b: lin(ctx, 0, 4, 0, 10, [0, '#ffd25a', 1, '#ff951e']), s: '#d8620e', sx: 1.4, sy: 1.2, lw: 2, hi: c => {
      ell(c, -2.4, 6, 2, 0.8, -0.1); fill(c, 'rgba(255,255,255,0.7)');
    } });
    ctx.beginPath(); ctx.moveTo(6.6, 9.6); ctx.quadraticCurveTo(8.2, 9.4, 8.4, 7.8);
    ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }

  /* ---------- 2 AYAZ — kalkan ustası kutup ayısı ---------- */
  function av2(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';         // kalkan altıgenleri
    ctx.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      ctx.save(); ctx.translate(0, -4); ctx.rotate(t * (k ? -0.15 : 0.1) + k * 0.5);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, R = 31 + k * 5; if (i) ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); else ctx.moveTo(R, 0); }
      ctx.closePath(); ctx.strokeStyle = rgba('170,250,255', 0.28 + 0.14 * Math.sin(t * 2 + k * 2)); ctx.lineWidth = 1.4 - k * 0.4; ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 7; i++) {                                  // süzülen buz kırıkları
      const p = mod(t * 0.12 + i / 7, 1), a = i * 0.9 + t * 0.2, x = Math.cos(i * 2.3) * 30, y = 36 - p * 76;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      path(ctx, [0, -2.2, 1.4, 0, 0, 2.2, -1.4, 0]); ctx.fillStyle = rgba('200,250,255', 0.55 * Math.sin(p * Math.PI)); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    const br = Math.sin(t * 1.4) * 0.6;
    ctx.save(); ctx.translate(0, br);
    // zırh
    toon(ctx, c => torso(c, 19, 17), { b: lin(ctx, 0, 18, 0, 42, [0, '#6f84a6', 1, '#46597a']), s: '#2c3852', r: '#8ff4ff', sx: 4, sy: 2, rw: 2 });
    for (let q = -1; q <= 1; q += 2) {                             // omuzluklar
      const sh = c => ell(c, q * 28, 30, 15, 10.5, q * -0.38);
      toon(ctx, sh, { b: lin(ctx, 0, 20, 0, 40, [0, '#9fb2cf', 1, '#5c7092']), s: '#34425e', r: '#8ff4ff', sx: 2.4, sy: 2.4, lw: 2.6, hi: c => {
        c.beginPath(); c.ellipse(q * 28, 34, 15, 10.5, q * -0.38, Math.PI * 1.1, Math.PI * 1.9);
        c.strokeStyle = 'rgba(20,30,50,0.6)'; c.lineWidth = 1; c.stroke();
        c.beginPath(); c.ellipse(q * 27, 27, 11, 6, q * -0.38, Math.PI * 1.15, Math.PI * 1.75);
        c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.2; c.lineCap = 'round'; c.stroke();
      } });
      circ(ctx, q * 21.5, 26.5, 1); fo(ctx, '#d8e2f0', 0.8);
    }
    const gor = c => { c.beginPath(); c.moveTo(-21, 16.5); c.quadraticCurveTo(0, 27, 21, 16.5); c.lineTo(23, 25); c.quadraticCurveTo(0, 37, -23, 25); c.closePath(); };
    toon(ctx, gor, { b: lin(ctx, 0, 18, 0, 34, [0, '#b8c8de', 1, '#71859f']), s: '#465a78', r: '#8ff4ff', sx: 2, sy: 1.6, lw: 2.6, hi: c => {
      c.beginPath(); c.moveTo(-19, 18.4); c.quadraticCurveTo(0, 28.2, 19, 18.4); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1; c.stroke();
    } });
    // kalkan amblemi (atımlı)
    const pu = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save(); ctx.translate(0, 31);
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; if (i) ctx.lineTo(Math.cos(a) * 5.4, Math.sin(a) * 5.4); else ctx.moveTo(Math.cos(a) * 5.4, Math.sin(a) * 5.4); }
    ctx.closePath(); fo(ctx, '#1a2a44', 2);
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; if (i) ctx.lineTo(Math.cos(a) * 3.6, Math.sin(a) * 3.6); else ctx.moveTo(Math.cos(a) * 3.6, Math.sin(a) * 3.6); }
    ctx.closePath(); fill(ctx, rad(ctx, -0.8, -1, 0.3, 0, 0, 4, [0, '#ffffff', 0.4, '#8ff8ff', 1, '#1aa8d8']));
    ctx.restore();
    glow(ctx, 0, 31, 9 + pu * 3, '120,240,255', 0.35 + 0.3 * pu);
    // kulaklar
    for (let q = -1; q <= 1; q += 2) {
      toon(ctx, c => circ(c, q * 15.5, -16.5, 6.8), { b: '#f4f8fc', s: '#a8bad2', r: '#8ff4ff', sx: 1.5, sy: 1.5, rw: 1.2, lw: 2.6 });
      circ(ctx, q * 15.5, -15.8, 3.5); fill(ctx, rad(ctx, q * 15.5, -16.5, 0.4, q * 15.5, -15.8, 3.6, [0, '#e8b8c4', 1, '#9a6c80']));
    }
    // baş: yanaklarda tüy kıvrımları
    const head = c => {
      c.beginPath(); c.moveTo(0, -21);
      c.bezierCurveTo(12, -21, 21, -14, 21, -2); c.lineTo(23.2, 2.6); c.lineTo(20.6, 4.8); c.lineTo(22.6, 9); c.lineTo(18.8, 10.6);
      c.bezierCurveTo(15.8, 16.2, 9, 19.2, 0, 19.2);
      c.bezierCurveTo(-9, 19.2, -15.8, 16.2, -18.8, 10.6); c.lineTo(-22.6, 9); c.lineTo(-20.6, 4.8); c.lineTo(-23.2, 2.6); c.lineTo(-21, -2);
      c.bezierCurveTo(-21, -14, -12, -21, 0, -21); c.closePath();
    };
    toon(ctx, head, { b: '#f2f7fc', s: '#a9bcd6', r: '#8ff4ff', sx: 3, sy: 2.4, rw: 1.8, lw: 3, hi: c => {
      c.beginPath(); c.moveTo(-3.5, -21.5); c.lineTo(-1.5, -17.5); c.lineTo(0.2, -21.5); c.lineTo(2, -17.8); c.lineTo(4, -21.5);
      c.strokeStyle = 'rgba(140,160,190,0.7)'; c.lineWidth = 0.8; c.lineJoin = 'round'; c.stroke();
      ell(c, -13, 6, 3, 1.8); fill(c, 'rgba(255,150,170,0.25)'); ell(c, 13, 6, 3, 1.8); fill(c, 'rgba(255,150,170,0.25)');
    } });
    // sert kaş çıkıntıları
    brow(ctx, -3.2, -4.4, -13.2, -8.8, 0.4, 3.2, '#4a5a76');
    brow(ctx, 3.2, -4.4, 13.2, -8.8, 0.4, 3.2, '#4a5a76');
    const b = blink(t, 2.2);
    const E = { w: 3.1, h: 2.3, iris: ['#c8fbff', '#1a78b0'], ir: 1.7, skin: '#f2f7fc', lw: 1.6, look: 0, lid: 0.4, skew: 0.55 };
    heroEye(ctx, -8.3, -1, -1, E, b); heroEye(ctx, 8.3, -1, 1, E, b);
    // sol gözün üstünden geçen yara
    mline(ctx, [-12.8, -11.8, -9.7, -4.4], OUT, 2.5); mline(ctx, [-12.8, -11.8, -9.7, -4.4], '#e2788e', 1.3);
    mline(ctx, [-7.6, 1.8, -5.6, 6.2], OUT, 2.4); mline(ctx, [-7.6, 1.8, -5.6, 6.2], '#e2788e', 1.2);
    mline(ctx, [-12.4, -8.6, -10.2, -9.4, -7.6, 4.4, -5.8, 3.8], 'rgba(180,70,90,0.8)', 0.6);
    // burun-ağız
    toon(ctx, c => ell(c, 0, 8.6, 11, 8.2), { b: '#fffaf0', s: '#d2c8b8', sx: 2, sy: 1.4, lw: 2 });
    ctx.beginPath(); ctx.moveTo(-4.8, 3); ctx.quadraticCurveTo(0, 1.2, 4.8, 3); ctx.quadraticCurveTo(4.3, 7, 0, 8.2);
    ctx.quadraticCurveTo(-4.3, 7, -4.8, 3); ctx.closePath();
    ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); fill(ctx, lin(ctx, 0, 1.5, 0, 8, [0, '#4a5264', 1, '#0b0d12']));
    ell(ctx, -1.6, 3.6, 1.6, 0.8, -0.2); fill(ctx, 'rgba(255,255,255,0.65)');
    ctx.beginPath(); ctx.moveTo(0, 8.2); ctx.lineTo(0, 10.8);
    ctx.moveTo(-5.4, 13.4); ctx.quadraticCurveTo(-2.4, 10.4, 0, 10.8); ctx.quadraticCurveTo(2.4, 10.4, 5.4, 13.4);
    ctx.strokeStyle = '#1e222c'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    path(ctx, [2.5, 12.5, 3.4, 10.3, 4.3, 12.2]); ctx.lineWidth = 0.6; ctx.strokeStyle = OUT; ctx.stroke(); fill(ctx, '#ffffff');   // diş
    // buz nefesi
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const p = mod(t * 0.55 + i / 4, 1), x = 6 + p * 22, y = 13 - p * 6 + Math.sin(t * 2 + i) * 1.2, r = 1.8 + p * 5.5;
      ctx.fillStyle = rad(ctx, x, y, 0, x, y, r, [0, rgba('235,252,255', 0.5 * (1 - p)), 1, 'rgba(235,252,255,0)']);
      circ(ctx, x, y, r); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  /* ---------- 3 VEGA — sisi delen kar baykuşu gözcü ---------- */
  function av3(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {                                  // sis bantları
      const x = mod(t * 3 + i * 31, 110) - 55, y = -26 + i * 22;
      ctx.save(); ctx.translate(x, y); ctx.scale(3.2, 1);
      ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, 9, [0, 'rgba(210,190,255,0.16)', 1, 'rgba(210,190,255,0)']);
      circ(ctx, 0, 0, 9); ctx.fill(); ctx.restore();
    }
    ctx.lineCap = 'round';                                          // HUD tarama halkaları
    for (let k = 0; k < 3; k++) {
      const a0 = t * (0.6 + k * 0.3) * (k % 2 ? -1 : 1) + k;
      ctx.beginPath(); ctx.arc(0, -3, 30 + k * 3.2, a0, a0 + 1.1 + k * 0.4);
      ctx.strokeStyle = rgba('120,250,255', 0.32 - k * 0.07); ctx.lineWidth = 1.1; ctx.stroke();
    }
    ctx.restore();
    twinkles(ctx, t, [-30, -20, -16, -33, 30, -10, -33, 6, 12, -35, 27, -27], 1.7, '255,245,220');
    const br = Math.sin(t * 1.6) * 0.5;
    ctx.save(); ctx.translate(0, br);
    // gövde / katlanmış kanatlar
    toon(ctx, c => torso(c, 18, 16), { b: '#f4f6fb', s: '#b4bdd2', r: '#d8b8ff', sx: 4, sy: 2, rw: 2, hi: c => {
      c.beginPath();
      const S = [-12, 28, -4, 31, 5, 29, 13, 32, -8, 37, 2, 36, 10, 38, -20, 33, 20, 34];
      for (let i = 0; i < S.length; i += 2) { c.moveTo(S[i] - 1.8, S[i + 1]); c.lineTo(S[i], S[i + 1] + 1.4); c.lineTo(S[i] + 1.8, S[i + 1]); }
      c.strokeStyle = '#2e3140'; c.lineWidth = 1.1; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
      for (let q = -1; q <= 1; q += 2) {
        c.beginPath();
        for (let k = 0; k < 3; k++) { c.moveTo(q * (24 + k * 5), 24 + k * 2); c.quadraticCurveTo(q * (27 + k * 5), 31 + k * 2, q * (24 + k * 5), 38); }
        c.strokeStyle = 'rgba(120,130,160,0.6)'; c.lineWidth = 0.9; c.stroke();
      }
    } });
    // gözcü kayışı
    ctx.beginPath(); ctx.moveTo(-26, 21); ctx.lineTo(-20, 19); ctx.lineTo(14, 44); ctx.lineTo(6, 44); ctx.closePath();
    fo(ctx, lin(ctx, -20, 20, 10, 44, [0, '#8a5a3a', 1, '#5a3420']), 1.8);
    rrect(ctx, -7, 29, 5, 4.4, 0.8); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 0.9; ctx.stroke();
    // kulak tüyleri (hafif sallanır)
    for (let q = -1; q <= 1; q += 2) {
      ctx.save(); ctx.translate(q * 12, -16); ctx.rotate(q * Math.sin(t * 1.3) * 0.05);
      toon(ctx, c => pathM(c, [-3, 0, 9.5, -14, 7, 4], q), { b: '#f4f6fb', s: '#a8b2c8', r: '#d8b8ff', sx: 1.2, sy: 1.2, rw: 1, lw: 2.4 });
      mline(ctx, [q * 1, -1, q * 7.5, -10], 'rgba(60,64,84,0.55)', 0.7);
      ctx.restore();
    }
    // baş
    const head = c => {
      c.beginPath(); c.moveTo(0, -22);
      c.bezierCurveTo(14, -22, 23, -14, 23, -1); c.bezierCurveTo(23, 12, 13, 20, 0, 20);
      c.bezierCurveTo(-13, 20, -23, 12, -23, -1); c.bezierCurveTo(-23, -14, -14, -22, 0, -22); c.closePath();
    };
    toon(ctx, head, { b: '#f6f8fc', s: '#b0bad0', r: '#d8b8ff', sx: 3, sy: 2.4, rw: 1.8, lw: 3, hi: c => {
      c.fillStyle = '#2e3140';
      const P = [-9, -17, -3, -19, 4, -18.5, 10, -15.5, -15, -10, 15.5, -10, 0.5, -14.5, -18.5, -2, 19, -2];
      for (let i = 0; i < P.length; i += 2) { path(c, [P[i] - 1.3, P[i + 1], P[i], P[i + 1] + 1.1, P[i] + 1.3, P[i + 1], P[i], P[i + 1] + 0.45]); c.fill(); }
    } });
    for (let q = -1; q <= 1; q += 2) {                              // yüz diskleri
      const cx = q * 8.8;
      circ(ctx, cx, 1, 9.8); ctx.fillStyle = rad(ctx, cx, 1, 3, cx, 1, 10, [0, '#ffffff', 0.85, '#f2f4fa', 1, '#d2d8e6']); ctx.fill();
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(110,118,150,0.7)'; ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.moveTo(cx + Math.cos(a) * 7.4, 1 + Math.sin(a) * 7.4); ctx.lineTo(cx + Math.cos(a) * 9.6, 1 + Math.sin(a) * 9.6); }
      ctx.strokeStyle = 'rgba(140,150,180,0.35)'; ctx.lineWidth = 0.5; ctx.stroke();
    }
    // parlayan kehribar gözler + sert V tüy kaşlar
    const b = blink(t, 0.7), k = Math.max(0.1, 1 - b), look = Math.sin(t * 0.6) * 0.8, pu = 0.5 + 0.5 * Math.sin(t * 2.6);
    for (let q = -1; q <= 1; q += 2) glow(ctx, q * 8.8, 1.5, 11, '255,190,60', 0.3 + 0.2 * pu);
    for (let q = -1; q <= 1; q += 2) {
      const ex = q * 8.8, ey = 1.5;
      ctx.save(); ctx.translate(ex, ey); ctx.scale(1, k);
      circ(ctx, 0, 0, 6.3); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.fillStyle = rad(ctx, 0, 1.6, 0.4, 0, 0, 6.3, [0, '#fff8b8', 0.45, '#ffc426', 1, '#e06400']); ctx.fillRect(-7, -7, 14, 14);
      circ(ctx, look, 0.3, 3); fill(ctx, '#06070a');
      circ(ctx, look - 1.6, -1.4, 1.3); fill(ctx, '#ffffff'); circ(ctx, look + 1.4, 1.6, 0.55); fill(ctx, 'rgba(255,255,255,0.85)');
      pathM(ctx, [-8, -8, 8, -8, 8, -6.4, -2, -0.6, -8, -1.8], q);   // üst kapak: iç taraf daha alçak
      ctx.fillStyle = '#f6f8fc'; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(q * -2.9, -1.1); ctx.lineTo(q * 6.4, -5.7);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
      toon(ctx, c => pathM(c, [1.2, -1.6, 17.5, -9.6, 16.4, -13, 2.2, -5.6], q), { b: '#ffffff', s: '#bcc4d8', sx: 0.6, sy: 0.8, lw: 1.8 });
    }
    // gaga
    ctx.beginPath(); ctx.moveTo(-2.5, 6.4); ctx.quadraticCurveTo(0, 5, 2.5, 6.4); ctx.quadraticCurveTo(1.7, 11, 0, 12.6);
    ctx.quadraticCurveTo(-1.7, 11, -2.5, 6.4); ctx.closePath();
    ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke(); fill(ctx, lin(ctx, 0, 5, 0, 12.6, [0, '#6c7280', 1, '#16181e']));
    ell(ctx, -0.8, 7.6, 0.7, 1.5, 0.2); fill(ctx, 'rgba(255,255,255,0.45)');
    mline(ctx, [-3.4, 6.2, -1.4, 7.6], '#c8cfe0', 0.8); mline(ctx, [3.4, 6.2, 1.4, 7.6], '#c8cfe0', 0.8);
    // HUD monokl (sağ göz)
    const mx = 8.8, my = 1.5, rot = t * 0.9;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    circ(ctx, mx, my, 8.2); ctx.fillStyle = rad(ctx, mx, my, 2, mx, my, 8.2, [0, 'rgba(90,240,255,0.04)', 1, 'rgba(90,240,255,0.22)']); ctx.fill();
    ctx.restore();
    mline(ctx, [mx + 7.6, my - 3, 20.5, -6.5, 22.5, -12], OUT, 2.2); mline(ctx, [mx + 7.6, my - 3, 20.5, -6.5, 22.5, -12], '#5a6478', 1);
    rrect(ctx, 18.6, -9.4, 4.4, 4.6, 1); fo(ctx, '#3a4256', 1.4);
    circ(ctx, 20.8, -7.1, 0.9); fill(ctx, pu > 0.5 ? '#7ff8ff' : '#2a8aa0');
    circ(ctx, mx, my, 8.2); ctx.lineWidth = 2.6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#6ff6ff'; ctx.stroke();
    ctx.save(); ctx.translate(mx, my); ctx.rotate(rot);
    ctx.beginPath(); ctx.arc(0, 0, 6.6, 0, 1.4); ctx.moveTo(-6.6, 0); ctx.arc(0, 0, 6.6, Math.PI, Math.PI + 1.4);
    ctx.strokeStyle = 'rgba(140,255,255,0.9)'; ctx.lineWidth = 0.8; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; ctx.moveTo(Math.cos(a) * 7.4, Math.sin(a) * 7.4); ctx.lineTo(Math.cos(a) * 9.4, Math.sin(a) * 9.4); }
    ctx.strokeStyle = '#6ff6ff'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';           // veri çubukları
    for (let i = 0; i < 3; i++) { ctx.fillStyle = rgba('120,250,255', 0.5 + 0.4 * Math.sin(t * 5 + i)); ctx.fillRect(17.4, 5 + i * 1.8, 2 + 2.5 * hsh(i + Math.floor(t * 4)), 0.9); }
    ctx.restore();
    ctx.restore();
  }

  /* ---------- 4 PUSULA — mıknatıslı fok kaptan ---------- */
  function bolt(ctx, x0, y0, x1, y1, seed, rgb, a) {           // titrek elektrik arkı
    const n = 5, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) { const u = i / n, j = (hsh(seed * 7 + i) - 0.5) * L * 0.35; ctx.lineTo(x0 + dx * u + nx * j, y0 + dy * u + ny * j); }
    ctx.lineTo(x1, y1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(rgb, a * 0.35); ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = rgba('255,255,255', a); ctx.lineWidth = 0.7; ctx.stroke();
  }
  function av4(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';         // manyetik alan çizgileri
    for (let q = -1; q <= 1; q += 2) for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.4 + k / 3, 1);
      ctx.beginPath(); ctx.ellipse(q * (12 + k * 6), -2, 10 + k * 6, 22 + k * 5, 0, 0, TAU);
      ctx.strokeStyle = rgba('150,255,220', 0.12 + 0.18 * Math.sin(ph * Math.PI)); ctx.lineWidth = 0.9; ctx.stroke();
    }
    const tk = Math.floor(t * 7);
    for (let i = 0; i < 3; i++) {
      const sd = tk * 3 + i;
      if (hsh(sd) < 0.45) continue;
      const a = hsh(sd + 0.5) * TAU, r0 = 25 + hsh(sd + 0.7) * 6;
      bolt(ctx, Math.cos(a) * r0, Math.sin(a) * r0 - 4, Math.cos(a + 0.5) * (r0 + 6), Math.sin(a + 0.5) * (r0 + 6) - 4, sd, i % 2 ? '255,110,220' : '110,240,255', 0.8);
    }
    ctx.restore();
    const br = Math.sin(t * 1.7) * 0.5;
    ctx.save(); ctx.translate(0, br);
    // kaptan ceketi
    toon(ctx, c => torso(c, 20, 15), { b: lin(ctx, 0, 20, 0, 42, [0, '#26407e', 1, '#16285a']), s: '#0e1a3e', r: '#7dffd2', sx: 4, sy: 2, rw: 2 });
    ctx.beginPath(); ctx.moveTo(-9, 19); ctx.lineTo(9, 19); ctx.lineTo(0, 36); ctx.closePath(); fill(ctx, '#7f93a8');   // boğaz
    for (let q = -1; q <= 1; q += 2) {                             // yakalar
      toon(ctx, c => pathM(c, [9, 18.5, 17, 20, 13, 30, 15.5, 33, 0, 40, 2.5, 33], q), { b: '#30509a', s: '#1c3270', sx: 1, sy: 1, lw: 2 });
      mline(ctx, [q * 9.6, 19.6, q * 3.2, 33.4, q * 0.6, 39], '#ffd04a', 0.9);
      toon(ctx, c => { c.save(); c.translate(q * 24.5, 26.5); c.rotate(q * 0.42); rrect(c, -6, -2.4, 12, 4.8, 2); c.restore(); }, { b: '#ffd24a', s: '#c08a10', sx: 0.6, sy: 0.8, lw: 1.8 });
      for (let i = 0; i < 4; i++) mline(ctx, [q * (20 + i * 2.4), 29.8 + i * 1.1, q * (20.2 + i * 2.4), 32 + i * 1.1], '#e8b028', 0.8);
      circ(ctx, q * 7.5, 36, 1.3); fo(ctx, '#ffd24a', 1);
    }
    // pusula kolye
    mline(ctx, [-6.5, 19.5, 0, 27.5, 6.5, 19.5], '#ffd24a', 0.8);
    toon(ctx, c => circ(c, 0, 31.5, 5.6), { b: '#ffd24a', s: '#b87e0c', r: '#fff6c0', sx: 1.2, sy: 1.2, rw: 0.8, lw: 2 });
    circ(ctx, 0, 31.5, 4.1); fill(ctx, rad(ctx, -1, 30.5, 0.3, 0, 31.5, 4.2, [0, '#ffffff', 1, '#d8e6e0']));
    const na = Math.sin(t * 1.3) * 0.5 + Math.sin(t * 7.1) * 0.08;
    ctx.save(); ctx.translate(0, 31.5); ctx.rotate(na);
    path(ctx, [0, -3.6, 1, 0, -1, 0]); fill(ctx, '#e8322a'); path(ctx, [0, 3.6, 1, 0, -1, 0]); fill(ctx, '#4a5870');
    circ(ctx, 0, 0, 0.6); fill(ctx, '#ffd24a');
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 31.5, 3.2, 3.6, 4.6); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.7; ctx.stroke();
    // baş
    const head = c => {
      c.beginPath(); c.moveTo(0, -17);
      c.bezierCurveTo(13, -17, 20.5, -9, 20.5, 2.5); c.bezierCurveTo(20.5, 13.5, 12, 20, 0, 20);
      c.bezierCurveTo(-12, 20, -20.5, 13.5, -20.5, 2.5); c.bezierCurveTo(-20.5, -9, -13, -17, 0, -17); c.closePath();
    };
    toon(ctx, head, { b: lin(ctx, 0, -16, 0, 20, [0, '#a8bccf', 1, '#8aa0b6']), s: '#5e738c', r: '#8dffd8', sx: 3, sy: 2.4, rw: 1.8, lw: 3, hi: c => {
      c.fillStyle = 'rgba(60,78,100,0.4)';
      const SP = [-15, -3, 2, 1.4, 15.5, -1, 1.6, 1.1, -16, 7, 1.3, 1, 16.5, 9, 1.4, 1, -9, 15.5, 1.2, 0.9];
      for (let i = 0; i < SP.length; i += 4) { ell(c, SP[i], SP[i + 1], SP[i + 2], SP[i + 3], 0.4); c.fill(); }
    } });
    brow(ctx, -3, -2.6, -11, -4.8, -1.2, 2.4, '#2c3a4e');
    brow(ctx, 3, -2, 11, -3.2, -0.5, 2.4, '#2c3a4e');
    const b = blink(t, 3.1);
    const E = { w: 4, h: 3.4, iris: ['#4a6080', '#05070b'], ir: 3.2, pr: 0.55, skin: '#a3b7ca', lw: 1.6, look: 0.4, skew: 0.15 };
    E.lid = 0.2; heroEye(ctx, -7.6, 2.4, -1, E, b);
    E.lid = 0.3; heroEye(ctx, 7.6, 2.4, 1, E, b);
    for (let q = -1; q <= 1; q += 2) { ell(ctx, q * 13.6, 8, 3, 1.8); fill(ctx, 'rgba(255,130,160,0.32)'); }
    for (let q = -1; q <= 1; q += 2) toon(ctx, c => ell(c, q * 4.4, 10.4, 5.2, 4.3), { b: '#e8eff5', s: '#aab9c9', sx: 1.4, sy: 1.2, lw: 1.6 });
    ctx.fillStyle = 'rgba(50,64,84,0.6)';
    for (let q = -1; q <= 1; q += 2) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { circ(ctx, q * (3.2 + c * 1.9), 9.6 + r * 2.1 + c * 0.2, 0.38); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-3.1, 5.4); ctx.quadraticCurveTo(0, 4, 3.1, 5.4); ctx.quadraticCurveTo(1.8, 8.6, 0, 8.9);
    ctx.quadraticCurveTo(-1.8, 8.6, -3.1, 5.4); ctx.closePath(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); fill(ctx, '#1a2028');
    ell(ctx, -1, 5.7, 1, 0.5); fill(ctx, 'rgba(255,255,255,0.65)');
    ctx.beginPath(); ctx.moveTo(-3.2, 14.6); ctx.quadraticCurveTo(-0.6, 16.4, 1.4, 14.9); ctx.quadraticCurveTo(3.6, 15.8, 5.6, 13.2);   // kurnaz gülüş
    ctx.strokeStyle = '#2a3444'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();                                                // bıyıklar
    for (let q = -1; q <= 1; q += 2) for (let kk = 0; kk < 3; kk++) { ctx.moveTo(q * 8.4, 9.4 + kk * 1.6); ctx.quadraticCurveTo(q * 14, 8.4 + kk * 2.2, q * 19, 6.6 + kk * 3.2); }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.6; ctx.stroke();
    // kaptan şapkası (hafif yan)
    ctx.save(); ctx.translate(0, -13); ctx.rotate(-0.09); ctx.translate(0, 13);
    ctx.beginPath(); ctx.moveTo(-15.5, -7.6); ctx.quadraticCurveTo(0, -3.6, 15.5, -7.6); ctx.quadraticCurveTo(0, -5.4, -15.5, -7.6);
    fill(ctx, 'rgba(20,30,50,0.35)');
    toon(ctx, c => { c.beginPath(); c.moveTo(-18, -16); c.bezierCurveTo(-25, -21, -17.5, -30, 1, -30); c.bezierCurveTo(19.5, -30, 26, -21, 18, -16); c.closePath(); },
      { b: '#f6f9fc', s: '#b6c4d6', r: '#8dffd8', sx: 2.4, sy: 1.4, rw: 1.4, lw: 2.6 });
    toon(ctx, c => { c.beginPath(); c.moveTo(-17.5, -17.6); c.quadraticCurveTo(0, -20.4, 17.5, -17.6); c.lineTo(17, -11.6); c.quadraticCurveTo(0, -14.2, -17, -11.6); c.closePath(); },
      { b: '#1e3068', s: '#101c44', sx: 1.6, sy: 0.6, lw: 2.4 });
    toon(ctx, c => { c.beginPath(); c.moveTo(-17.4, -12.2); c.quadraticCurveTo(0, -14.8, 17.4, -12.2); c.quadraticCurveTo(15.2, -6, 0, -5.7); c.quadraticCurveTo(-15.2, -6, -17.4, -12.2); c.closePath(); },
      { b: lin(ctx, 0, -14, 0, -6, [0, '#3a4258', 1, '#10141e']), s: '#080a10', sx: 1.6, sy: -1, lw: 2.4, hi: c => {
        c.beginPath(); c.moveTo(-11, -10.6); c.quadraticCurveTo(-4, -12, 3, -11.6); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.1; c.lineCap = 'round'; c.stroke();
      } });
    ctx.beginPath(); ctx.moveTo(-15, -13); ctx.quadraticCurveTo(0, -15.3, 15, -13);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.stroke();
    for (let q = -1; q <= 1; q += 2) { circ(ctx, q * 15, -13, 1.2); fo(ctx, '#ffd24a', 1); }
    circ(ctx, 0, -16.2, 3.4); fo(ctx, '#ffd24a', 1.6);              // pusula gülü amblemi
    star(ctx, 0, -16.2, 4, 0.9, 3, -Math.PI / 2); fill(ctx, '#1e3068');
    circ(ctx, 0, -16.2, 0.6); fill(ctx, '#e8322a');
    ctx.restore();
    // yörüngede manyetik kıvılcımlar
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const a = t * 1.6 + i * TAU / 4, x = Math.cos(a) * 25, y = Math.sin(a) * 8 + 26;
      sparkle(ctx, x, y, 1.6 + 0.6 * Math.sin(t * 6 + i), i % 2 ? 'rgba(255,140,230,0.9)' : 'rgba(140,250,255,0.9)');
    }
    ctx.restore();
    ctx.restore();
  }

  /* ---------- 5 AURORA — dron çağıran buz büyücüsü ---------- */
  function drone(ctx, x, y, s, t, i, a) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    glow(ctx, 0, 0, 5, '255,160,240', 0.35 * a);
    ctx.rotate(Math.sin(t * 3 + i) * 0.2);
    path(ctx, [0, -3.4, 3, 0, 0, 3.4, -3, 0]);
    ctx.lineJoin = 'round'; ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();
    fill(ctx, lin(ctx, -3, -3, 3, 3, [0, '#ffffff', 0.45, '#9ff0ff', 1, '#3a7ad8']));
    path(ctx, [0, -3.4, 3, 0, 0, 0]); fill(ctx, 'rgba(255,255,255,0.45)');
    mline(ctx, [-3, 0, -5.2, -0.8], OUT, 1.5); mline(ctx, [3, 0, 5.2, -0.8], OUT, 1.5);
    circ(ctx, 0, 0.2, 1.1); fill(ctx, i % 2 ? '#ff6ae0' : '#6affd8');
    ctx.restore();
  }
  function av5(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';         // kutup ışığı kurdeleleri
    const AC = ['110,255,190', '110,210,255', '255,130,230'];
    for (let k = 0; k < 3; k++) {
      const o = Math.sin(t * 0.8 + k * 2.1) * 4, y0 = -30 + k * 9;
      ctx.beginPath(); ctx.moveTo(-44, y0 + o);
      ctx.bezierCurveTo(-18, y0 - 12 - o, 12, y0 + 10 + o, 44, y0 - 6 - o); ctx.lineTo(44, y0 + 2 - o);
      ctx.bezierCurveTo(12, y0 + 18 + o, -18, y0 - 4 - o, -44, y0 + 8 + o); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, y0 - 10, 0, y0 + 14, [0, rgba(AC[k], 0), 0.5, rgba(AC[k], 0.32), 1, rgba(AC[k], 0)]); ctx.fill();
    }
    ctx.restore();
    twinkles(ctx, t, [-31, -12, 30, -16, -26, 8, 28, 10, -12, -35, 14, -34], 1.6, '255,230,255');
    const DR = [];
    for (let i = 0; i < 3; i++) {
      const a = t * 1.1 + i * TAU / 3, d = Math.sin(a);
      DR.push({ x: Math.cos(a) * 30, y: 4 + d * 20, d: d, i: i });   // eğik yörünge: önde göğüs, arkada taç hizası
    }
    for (const D of DR) if (D.d < 0) drone(ctx, D.x, D.y, 0.75 + 0.15 * D.d, t, D.i, 0.6);
    const br = Math.sin(t * 1.5) * 0.5, sw = Math.sin(t * 1.3);
    ctx.save(); ctx.translate(0, br);
    // arka saç
    const back = c => {
      c.beginPath(); c.moveTo(-13, -17);
      c.bezierCurveTo(-27, -11, -27 - sw, 8, -31 - sw * 2, 26); c.quadraticCurveTo(-30, 40, -22, 46); c.lineTo(22, 46);
      c.quadraticCurveTo(30, 40, 31 + sw * 2, 26); c.bezierCurveTo(27 + sw, 8, 27, -11, 13, -17); c.closePath();
    };
    toon(ctx, back, { b: lin(ctx, -30, 0, 30, 0, [0, '#a49ae8', 0.3, '#f0eeff', 0.7, '#d8d0fa', 1, '#8a80d6']), s: '#6a5cc0', r: '#ff9ae6', sx: 3, sy: 1, rw: 2, lw: 2.6 });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';         // parlayan saç telleri
    ctx.lineCap = 'round';
    for (let q = -1; q <= 1; q += 2) for (let k = 0; k < 3; k++) {
      const s2 = Math.sin(t * 1.6 + k + q) * 1.5, col = AC[(k + (q > 0 ? 1 : 0)) % 3], a = 0.5 + 0.3 * Math.sin(t * 2.4 + k * 1.7 + q);
      ctx.beginPath(); ctx.moveTo(q * (13 + k * 3), -13 + k * 2);
      ctx.bezierCurveTo(q * (23 + k + s2), 2, q * (21 + k * 2 - s2), 20, q * (25 + k * 2 + s2 + sw * 2), 40);
      ctx.strokeStyle = rgba(col, a * 0.35); ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    // pelerin + buz yaka
    for (let q = -1; q <= 1; q += 2) {
      toon(ctx, c => pathM(c, [6, 30, 12.5, 13, 16, 22, 23, 11, 26.5, 27, 22, 38], q), { b: lin(ctx, q * 6, 12, q * 26, 36, [0, '#e8fcff', 1, '#62a8f0']), s: '#3a70c8', r: '#ff9ae6', sx: q * 1.2, sy: 1.2, rw: 1, lw: 2 });
    }
    toon(ctx, c => torso(c, 22, 14), { b: lin(ctx, 0, 22, 0, 42, [0, '#6a3ec8', 1, '#2c1670']), s: '#22105a', r: '#ff8ae0', sx: 4, sy: 2, rw: 2 });
    toon(ctx, c => { c.beginPath(); c.moveTo(-4.5, 11); c.lineTo(4.5, 11); c.lineTo(5.5, 24); c.quadraticCurveTo(0, 27, -5.5, 24); c.closePath(); },
      { b: '#dfe6fb', s: '#a6b0de', sx: 1.6, sy: 0, lw: 2 });
    ctx.beginPath(); ctx.moveTo(-14, 22); ctx.quadraticCurveTo(0, 30, 14, 22);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.stroke(); ctx.strokeStyle = '#a8f0ff'; ctx.lineWidth = 1.2; ctx.stroke();
    const pu = 0.5 + 0.5 * Math.sin(t * 2.4);
    path(ctx, [0, 25.4, 3.2, 29.4, 0, 34, -3.2, 29.4]); fo(ctx, lin(ctx, -3, 26, 3, 34, [0, '#ffd0f6', 1, '#d03ab8']), 1.8);
    glow(ctx, 0, 29.6, 8, '255,120,230', 0.3 + 0.3 * pu);
    // yüz
    const face = c => {
      c.beginPath(); c.moveTo(-11.4, -6);
      c.bezierCurveTo(-12.2, 5, -8.4, 13, -3.2, 16.6); c.quadraticCurveTo(0, 18.2, 3.2, 16.6);
      c.bezierCurveTo(8.4, 13, 12.2, 5, 11.4, -6); c.bezierCurveTo(9.8, -15.6, -9.8, -15.6, -11.4, -6); c.closePath();
    };
    toon(ctx, face, { b: '#eef2ff', s: '#b8c0ec', r: '#ff9ae6', sx: 2.4, sy: 1.6, rw: 1.4, lw: 2.4, hi: c => {
      ell(c, -7.6, 7.6, 3, 1.7); fill(c, 'rgba(255,120,210,0.28)'); ell(c, 7.6, 7.6, 3, 1.7); fill(c, 'rgba(255,120,210,0.28)');
    } });
    // ön saç: yana taranmış perçem + yan tutamlar
    const hairC = lin(ctx, -14, -16, 14, 10, [0, '#ffffff', 0.6, '#dcd6ff', 1, '#a89ef0']);
    toon(ctx, c => { c.beginPath(); c.moveTo(-11.8, -7); c.bezierCurveTo(-16, 4, -15, 14, -17.5, 27); c.lineTo(-12.4, 24); c.bezierCurveTo(-11.8, 14, -11.2, 6, -10.2, -2); c.closePath(); },
      { b: hairC, s: '#8a7ed8', sx: 1, sy: 1, lw: 2 });
    toon(ctx, c => { c.beginPath(); c.moveTo(11.8, -7); c.bezierCurveTo(15.4, 2, 14.6, 10, 16, 19); c.lineTo(11.6, 16); c.bezierCurveTo(11.4, 10, 11, 4, 10.2, -2); c.closePath(); },
      { b: hairC, s: '#8a7ed8', r: '#ff9ae6', sx: 1, sy: 1, rw: 1, lw: 2 });
    const bang = c => {
      c.beginPath(); c.moveTo(-12.6, -3);
      c.bezierCurveTo(-14, -13, -7, -17.6, 0.5, -17); c.bezierCurveTo(8.5, -16.6, 13.6, -12, 12.8, -3);
      c.bezierCurveTo(11, -7, 9, -9, 6, -10); c.bezierCurveTo(4, -7, 0, -5.4, -4.4, -5);
      c.bezierCurveTo(-1, -7, 0, -9, 0.5, -10.2); c.bezierCurveTo(-3, -8.6, -7, -7, -9.6, -7.6);
      c.bezierCurveTo(-11, -6, -12, -4.8, -12.6, -3); c.closePath();
    };
    toon(ctx, bang, { b: hairC, s: '#8a7ed8', r: '#ff9ae6', sx: 1.6, sy: 1.2, rw: 1.2, lw: 2.2, hi: c => {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.beginPath(); c.moveTo(-9, -9); c.quadraticCurveTo(-2, -15, 7, -12.5);
      c.strokeStyle = rgba('120,255,220', 0.55 + 0.3 * pu); c.lineWidth = 1; c.lineCap = 'round'; c.stroke();
      c.beginPath(); c.moveTo(-11, -4.5); c.quadraticCurveTo(-8, -11, -1, -13.5);
      c.strokeStyle = rgba('255,140,230', 0.5 + 0.3 * (1 - pu)); c.stroke();
      c.restore();
    } });
    // kristal taç
    glow(ctx, 0, -22, 16, '150,230,255', 0.3 + 0.2 * pu);
    const CR = [-10.4, -12.2, 1.7, 7.5, 10.4, -12.2, 1.7, 7.5, -5.6, -14, 2.1, 11.5, 5.6, -14, 2.1, 11.5, 0, -14.6, 2.7, 17.5];
    for (let i = 0; i < CR.length; i += 4) {
      const x = CR[i], bs = CR[i + 1], w = CR[i + 2], h = CR[i + 3];
      path(ctx, [x, bs, x - w, bs - h * 0.35, x, bs - h, x + w, bs - h * 0.35]);
      fo(ctx, lin(ctx, x - w, 0, x + w, 0, [0, '#ffffff', 0.5, '#aef2ff', 1, '#3a8ae0']), 1.8);
      path(ctx, [x, bs, x - w, bs - h * 0.35, x, bs - h]); fill(ctx, 'rgba(255,255,255,0.45)');
    }
    ctx.beginPath(); ctx.moveTo(-12, -11.6); ctx.quadraticCurveTo(0, -16.6, 12, -11.6);
    ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.strokeStyle = lin(ctx, -12, 0, 12, 0, [0, '#9fb6d8', 0.5, '#ffffff', 1, '#8aa2cc']); ctx.lineWidth = 1.8; ctx.stroke();
    path(ctx, [0, -16.4, 1.5, -14.2, 0, -12, -1.5, -14.2]); fo(ctx, '#ff6ae0', 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    sparkle(ctx, 0, -32.6, 2 + 1.3 * Math.sin(t * 4), 'rgba(230,250,255,0.95)');
    sparkle(ctx, -5.6, -26, 1 + 0.8 * Math.sin(t * 4 + 2), 'rgba(230,250,255,0.8)');
    ctx.restore();
    // kaşlar + parlayan gözler
    brow(ctx, -2.2, -3.2, -9.8, -5.2, -1.7, 1.4, '#6a62b8');
    brow(ctx, 2.2, -2.6, 9.8, -3.8, -0.8, 1.4, '#6a62b8');
    const b = blink(t, 0.9);
    const E = { w: 3.6, h: 2.3, iris: ['#f0ffff', '#16bde6'], ir: 1.85, pr: 0.32, skin: '#eef2ff', lash: '#1e1650', lw: 1.6, look: 0.25, wing: 1.3, skew: 0.4 };
    E.lid = 0.14; heroEye(ctx, -5.4, 1.4, -1, E, b);
    E.lid = 0.26; heroEye(ctx, 5.4, 1.4, 1, E, b);
    if (b < 0.5) for (let q = -1; q <= 1; q += 2) glow(ctx, q * 5.4, 1.6, 5, '120,240,255', 0.45 + 0.25 * pu);
    ctx.beginPath(); ctx.moveTo(0.2, 4.4); ctx.quadraticCurveTo(1.3, 7.4, -0.4, 8);
    ctx.strokeStyle = 'rgba(110,110,190,0.7)'; ctx.lineWidth = 0.8; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, 11); ctx.quadraticCurveTo(-1, 10.2, 0, 10.7); ctx.quadraticCurveTo(1.4, 10, 3.6, 10.2);   // dudak, sağa kıvrık
    ctx.quadraticCurveTo(0.6, 13.4, -3, 11); ctx.closePath();
    ctx.lineWidth = 1; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke(); fill(ctx, lin(ctx, 0, 10, 0, 13, [0, '#c06ae8', 1, '#7a34b8']));
    ell(ctx, -0.6, 11.7, 1, 0.35); fill(ctx, 'rgba(255,255,255,0.5)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    sparkle(ctx, 9.2, 5.8, 1.3 + 0.5 * Math.sin(t * 3), 'rgba(190,240,255,0.9)');
    ctx.restore();
    ctx.restore();
    for (const D of DR) if (D.d >= 0) drone(ctx, D.x, D.y, 0.85 + 0.15 * D.d, t, D.i, 1);
  }

  const AV_BG = [   // bg: radyal duraklar, ray: ışın rengi, halo: baş arkası parıltı, ha: parıltı gücü
    { bg: [0, '#ffd77a', 0.35, '#ff8a2a', 0.75, '#b0300a', 1, '#420c04'], ray: '255,214,140', halo: '255,190,90', ha: 0.5 },
    { bg: [0, '#ffa27a', 0.35, '#f23a32', 0.75, '#9a0c1e', 1, '#34040e'], ray: '255,200,160', halo: '255,150,100', ha: 0.5 },
    { bg: [0, '#6ee4ff', 0.4, '#1a8ad6', 0.8, '#0a3a86', 1, '#041232'], ray: '190,250,255', halo: '140,235,255', ha: 0.32 },
    { bg: [0, '#c890ff', 0.4, '#7a3ad8', 0.8, '#2e1070', 1, '#0c0428'], ray: '220,190,255', halo: '255,200,120', ha: 0.3 },
    { bg: [0, '#8ef5d0', 0.4, '#16b08c', 0.8, '#06605a', 1, '#022224'], ray: '190,255,225', halo: '150,255,210', ha: 0.38 },
    { bg: [0, '#ffa8ec', 0.4, '#d23ab8', 0.8, '#521288', 1, '#12042a'], ray: '255,200,245', halo: '255,150,235', ha: 0.42 },
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
      { id: 0, name: 'NOVA', price: 0, desc: 'Kürk kapüşonlu, gözlüklü kâşif pilot.' },
      { id: 1, name: 'ROKET', price: 200, desc: 'Atkılı, bereli, durmadan gaza basar.' },
      { id: 2, name: 'AYAZ', price: 400, desc: 'İri, sakin, buz gibi cesur kutup ayısı.' },
      { id: 3, name: 'VEGA', price: 700, desc: 'Gece nöbetini kaçırmayan kar baykuşu.' },
      { id: 4, name: 'PUSULA', price: 1100, desc: 'Denizci yakalı, rotayı hiç şaşırmaz.' },
      { id: 5, name: 'AURORA', price: 1800, desc: 'Kristal taçlı, kutup ışıklarının sahibi.' },
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
