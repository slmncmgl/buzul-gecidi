// Buzul Geçidi · Etap Haritası
// Dikey, kıvrımlı buz yolu üzerinde 100 etap. Aşağıda etap 1, yukarıda etap 100 (ana üs).
// game.js ile arayüz: window.MAP = { init, open, draw, pointerDown, pointerMove, pointerUp, key, wheel, selected }.
// Çizimde yalnız görünür düğümler dolaşılır; yol tek bir polyline olarak çizilir.
(function () {
  'use strict';

  // ---- sabitler ---------------------------------------------------------
  const MAXLV = 100, BOSS_EVERY = 10;
  const STEP = 64;                 // iki etap arası dikey mesafe (dünya px)
  const PAD_TOP = 120;             // etap 100'ün dünya y'si
  const PAD_BOTTOM = 170;          // etap 1'in altında kalan boşluk
  const VIEW_TOP = 70, VIEW_BOT = 495;         // başlık ile kart arası görünür bant
  const VIEW_MID = (VIEW_TOP + VIEW_BOT) / 2;  // odaklanırken düğümün geleceği ekran y'si
  const WORLD_H = (MAXLV - 1) * STEP + PAD_TOP + PAD_BOTTOM;
  const TAP_SLOP = 8;              // bundan az kayma = dokunma
  const NODE_R = 9, BOSS_R = 16;

  const BTN = {
    start: { x: 40, y: 540, w: 280, h: 42 },
    back: { x: 110, y: 596, w: 140, h: 36 },
  };
  const COL = {
    panel: 'rgba(8,18,30,0.8)', gold: '#ffd95a', orange: '#f26a1b', cream: '#ffe9b8', mint: '#7dffb0',
    red: '#ff8f80', white: '#ffffff', dimText: 'rgba(190,215,240,0.45)',
  };
  const CHAPTER_NAMES = [
    'Kıyı Buzulu', 'Donmuş Fiyort', 'Sis Vadisi', 'Kristal Mağaralar', 'Kutup Fırtınası',
    'Kayan Buz Tabakası', 'Mavi Yarıklar', 'Aysberg Geçidi', 'Kuzey Işıkları', 'Ana Üs Yolu',
  ];

  // ---- durum ------------------------------------------------------------
  let UI = null, W = 360, H = 640;
  let scroll = 0;            // ekranın üst kenarının dünya y'si
  let target = null;         // yumuşak kaydırma hedefi (null = yok)
  let vel = 0;               // atalet hızı (px/sn)
  let sel = 1;
  let lastT = null;
  let down = false, dragged = false, consumed = false;
  let p0 = { x: 0, y: 0 }, pLast = { x: 0, y: 0 }, scroll0 = 0;
  let stCache = null;        // son draw/open'da gelen st (klavye için)

  // ---- yardımcılar ------------------------------------------------------
  const fin = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
  const maxScroll = () => Math.max(0, WORLD_H - H);
  const clampScroll = (s) => clamp(fin(s, 0), 0, maxScroll());
  const clampK = (k) => clamp(Math.round(fin(k, 1)), 1, MAXLV);
  const isBossK = (st, k) => st && typeof st.isBoss === 'function' ? !!st.isBoss(k) : k % BOSS_EVERY === 0;
  const starsK = (st, k) => st && typeof st.stars === 'function' ? clamp(Math.round(fin(st.stars(k), 0)), 0, 3) : 0;
  const costK = (st, k) => st && typeof st.cost === 'function' ? Math.max(0, Math.round(fin(st.cost(k), 0))) : 0;
  const nameK = (st, k) => (st && typeof st.name === 'function' && st.name(k)) || ('Etap ' + k);
  const bossNameK = (st, k) => (st && typeof st.bossName === 'function') ? (st.bossName(k) || null) : null;
  const bestK = (st) => clamp(Math.round(fin(st && st.best, 0)), 0, MAXLV);
  const frontierK = (st) => Math.min(MAXLV, bestK(st) + 1);
  const isLocked = (st, k) => k > frontierK(st);
  const canStart = (st, k) => !isLocked(st, k) && (costK(st, k) === 0 || fin(st && st.coins, 0) >= costK(st, k));

  // dünya koordinatları: kesirli k de kabul eder (yolun ara noktaları için)
  const wy = (k) => PAD_TOP + (MAXLV - k) * STEP;
  const wx = (k) => W / 2 + 78 * Math.sin(k * 0.52) + 24 * Math.sin(k * 1.37 + 1.1);
  const sy = (k) => wy(k) - scroll;
  const kAtScreenY = (y) => MAXLV - (y + scroll - PAD_TOP) / STEP;

  function focusOn(k, instant) {
    const t = clampScroll(wy(k) - VIEW_MID);
    if (instant) { scroll = t; target = null; } else target = t;
    vel = 0;
  }
  function ensureVisible(k) {
    const y = sy(k);
    if (y < VIEW_TOP + 40 || y > VIEW_BOT - 40) focusOn(k, false);
  }
  function hitNode(p) {
    const kc = kAtScreenY(p.y);
    let best = null, bd = 1e9;
    for (let k = Math.max(1, Math.floor(kc) - 1); k <= Math.min(MAXLV, Math.ceil(kc) + 1); k++) {
      const dx = p.x - wx(k), dy = p.y - sy(k), d = dx * dx + dy * dy;
      const r = (k % BOSS_EVERY === 0 ? BOSS_R : NODE_R) + 14;
      if (d < r * r && d < bd) { bd = d; best = k; }
    }
    return best;
  }
  function startResult(st) {
    const s = st || stCache;
    return canStart(s, sel) ? { action: 'start', k: sel } : null;
  }

  // ---- çizim parçaları --------------------------------------------------
  function star(ctx, x, y, r, color) {
    ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }
  function hex(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }
  function lockGlyph(ctx, x, y, c) {
    ctx.fillStyle = c; ctx.fillRect(x - 4, y - 1, 8, 6);
    ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y - 1.5, 2.8, Math.PI, 0); ctx.stroke();
  }
  function bossGlyph(ctx, x, y, c) {    // küçük boynuzlu maske
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y - 5); ctx.lineTo(x, y + 5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x - 3, y - 2); ctx.lineTo(x - 7, y - 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x + 7, y - 2); ctx.lineTo(x + 3, y - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b1a2a'; ctx.fillRect(x - 3, y - 3.5, 2, 1.5); ctx.fillRect(x + 1, y - 3.5, 2, 1.5);
  }
  function homeGlyph(ctx, x, y, c) {    // ana üs: kubbe + anten
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y + 2, 7, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 9, y + 2, 18, 3);
    ctx.fillRect(x - 0.75, y - 10, 1.5, 6);
    ctx.fillStyle = '#ff8f80'; ctx.fillRect(x - 1.5, y - 12, 3, 3);
  }
  function beacon(ctx, x, y, t, lit) {  // fener işareti: küçük kule + ışık
    ctx.fillStyle = lit ? 'rgba(230,245,255,0.9)' : 'rgba(150,180,210,0.45)';
    ctx.fillRect(x - 1.2, y - 7, 2.4, 6);
    const tw = lit ? 0.6 + 0.4 * Math.sin(t * 5 + x) : 0.3;
    ctx.fillStyle = 'rgba(255,217,90,' + tw + ')'; ctx.fillRect(x - 2, y - 9.5, 4, 2.5);
  }

  function drawBackdrop(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#061120'); g.addColorStop(0.55, '#0b1f33'); g.addColorStop(1, '#0a1626');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // paralaks yıldızlar (iki katman)
    for (let i = 0; i < 70; i++) {
      const par = i < 40 ? 0.25 : 0.5, sz = i < 40 ? 1.2 : 1.8;
      const x = hash(i * 3.1) * W, base = hash(i * 7.7 + 2) * H;
      const y = (((base - scroll * par) % H) + H) % H;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.6 + hash(i) * 1.6) + i));
      ctx.fillStyle = 'rgba(220,235,255,' + (tw * (i < 40 ? 0.55 : 0.85)).toFixed(2) + ')';
      ctx.fillRect(x, y, sz, sz);
    }
    // buz kanyonu duvarları (dünya ile kayar)
    const seg = 48, j0 = Math.floor(scroll / seg) - 1, j1 = Math.ceil((scroll + H) / seg) + 1;
    for (let side = 0; side < 2; side++) {
      ctx.beginPath();
      const edge = side ? W : 0, dir = side ? -1 : 1;
      ctx.moveTo(edge, (j0 * seg) - scroll);
      for (let j = j0; j <= j1; j++) {
        const y = j * seg - scroll, off = 14 + 26 * hash(j * 2.3 + side * 51);
        ctx.lineTo(edge + dir * off, y);
        ctx.lineTo(edge + dir * (off - 8 - 10 * hash(j * 5.1 + side)), y + seg * 0.5);
      }
      ctx.lineTo(edge, (j1 * seg) - scroll);
      ctx.closePath();
      ctx.fillStyle = 'rgba(120,175,225,0.10)'; ctx.fill();
      ctx.strokeStyle = 'rgba(170,215,255,0.28)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  function drawPath(ctx, kLo, kHi) {
    const a = Math.max(0.5, kLo - 1), b = Math.min(MAXLV, kHi + 1), n = Math.max(2, Math.ceil((b - a) * 4));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const k = a + (b - a) * i / n, x = wx(k), y = sy(k);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(90,150,210,0.35)'; ctx.lineWidth = 24; ctx.stroke();
    ctx.strokeStyle = 'rgba(170,215,250,0.45)'; ctx.lineWidth = 14; ctx.stroke();
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = -scroll * 0.5;
    ctx.strokeStyle = 'rgba(240,250,255,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  function drawChapterBands(ctx, kLo, kHi) {
    const cLo = Math.max(1, Math.floor((kLo - 1) / BOSS_EVERY) + 1), cHi = Math.min(10, Math.floor((kHi - 1) / BOSS_EVERY) + 2);
    for (let c = cLo; c <= cHi; c++) {
      const kFirst = (c - 1) * BOSS_EVERY + 1, y = sy(kFirst) + STEP * 0.5;
      if (y < -30 || y > H + 30) continue;
      ctx.fillStyle = 'rgba(8,18,30,0.55)'; ctx.fillRect(0, y - 11, W, 22);
      ctx.fillStyle = 'rgba(255,217,90,0.5)'; ctx.fillRect(0, y - 11, W, 1); ctx.fillRect(0, y + 10, W, 1);
      UI.text('BÖLÜM ' + c + ' · ETAP ' + kFirst + '–' + (kFirst + BOSS_EVERY - 1), 14, y + 4, 12, COL.gold, 'left', 700);
      UI.text(CHAPTER_NAMES[c - 1] || '', W - 14, y + 4, 11, COL.cream, 'right', 500);
    }
  }

  function drawNode(ctx, t, st, k, best, frontier) {
    const x = wx(k), y = sy(k), boss = isBossK(st, k), home = k === MAXLV;
    const passed = k <= best, cur = k === frontier, locked = isLocked(st, k), selected = k === sel;
    const side = wx(k) < W / 2 ? 1 : -1;      // etiket yola göre dış tarafa
    const r = boss ? BOSS_R : NODE_R;

    if (selected) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; UI.glow(x, y, r + 26, '255,217,90', 0.35); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(x, y, r + 9, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    if (cur) {
      const pu = 1 + 0.18 * Math.sin(t * 4);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; UI.glow(x, y, r + 18 * pu, '255,200,80', 0.45); ctx.restore();
      ctx.strokeStyle = COL.gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 4 + 3 * pu, 0, 6.3); ctx.stroke();
    }

    // gövde
    if (boss) {
      ctx.fillStyle = locked ? 'rgba(60,75,95,0.9)' : passed ? '#2a6f8f' : '#b84a16';
      hex(ctx, x, y, r); ctx.fill();
      ctx.strokeStyle = locked ? 'rgba(150,170,195,0.45)' : passed ? COL.mint : COL.cream; ctx.lineWidth = 2; ctx.stroke();
      if (home) homeGlyph(ctx, x, y, locked ? 'rgba(190,215,240,0.5)' : COL.white);
      else bossGlyph(ctx, x, y, locked ? 'rgba(190,215,240,0.5)' : COL.cream);
    } else {
      ctx.fillStyle = locked ? 'rgba(55,70,90,0.9)' : passed ? '#2b7a9a' : '#f26a1b';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
      ctx.strokeStyle = locked ? 'rgba(150,170,195,0.4)' : passed ? COL.mint : 'rgba(255,233,184,0.9)'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.stroke();
      beacon(ctx, x, y - r - 1, t, !locked);
    }
    if (locked) lockGlyph(ctx, x, y + (boss ? 0 : 1), 'rgba(200,220,240,0.7)');

    // geçilen etaplar: yıldızlar
    if (passed) {
      const n = starsK(st, k), yy = y + r + 9;
      for (let i = 0; i < 3; i++) star(ctx, x - 9 + i * 9, yy, 3.6, i < n ? COL.gold : 'rgba(255,255,255,0.18)');
    }

    // etiketler
    const lx = x + side * (r + 14);
    UI.text(String(k), lx, y + 4, boss ? 14 : 12, locked ? COL.dimText : COL.white, side > 0 ? 'left' : 'right', 700);
    if (boss) {
      const bn = home ? 'ANA ÜS' : (bossNameK(st, k) || 'BEKÇİ');
      UI.text(home ? bn : 'BEKÇİ · ' + bn, lx, y + 18, 11, locked ? COL.dimText : COL.orange, side > 0 ? 'left' : 'right', 700);
    }
    // bedava başlama rozeti: kontrol noktası bekçileri (k <= bossCp) ve 1. etap
    const bossCp = fin(st && st.bossCp, 0);
    if (!locked && costK(st, k) === 0 && ((boss && k <= bossCp) || k === 1) && k !== MAXLV) {
      const bx = lx + (side > 0 ? 0 : -46), by = y - r - (boss ? 12 : 16);
      ctx.fillStyle = 'rgba(125,255,176,0.18)'; ctx.beginPath(); ctx.roundRect(bx, by - 9, 46, 13, 4); ctx.fill();
      ctx.strokeStyle = COL.mint; ctx.lineWidth = 1; ctx.stroke();
      UI.text('BEDAVA', bx + 23, by + 1, 9, COL.mint, 'center', 700);
    }
  }

  function drawHeader(ctx, st, best, totalStars) {
    ctx.fillStyle = COL.panel; ctx.fillRect(0, 0, W, 64);
    ctx.fillStyle = 'rgba(255,217,90,0.35)'; ctx.fillRect(0, 63, W, 1);
    UI.text('ETAP HARİTASI', 16, 32, 24, COL.white, 'left', 700);
    UI.text('EN İYİ: ETAP ' + best, 16, 52, 12, COL.cream, 'left', 500);
    star(ctx, W - 16 - 7, 27, 7, COL.gold);
    UI.text(totalStars + '/' + (MAXLV * 3), W - 30, 32, 16, COL.gold, 'right', 700);
    UI.coinIcon(W - 16 - 6, 48, 5, 1);
    UI.text(Math.round(fin(st && st.coins, 0)) + ' altın', W - 30, 52, 12, COL.gold, 'right', 700);
  }

  function drawCard(ctx, st, best) {
    const k = sel, boss = isBossK(st, k), locked = isLocked(st, k), cost = costK(st, k), coins = fin(st && st.coins, 0);
    ctx.fillStyle = COL.panel; ctx.beginPath(); ctx.roundRect(12, 500, W - 24, 90, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,90,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();

    // 1. satır: ETAP n · ad
    const head = 'ETAP ' + k;
    ctx.font = '700 20px ' + (UI.FONT || 'sans-serif');
    const hw = ctx.measureText(head).width;
    UI.text(head, 24, 523, 20, COL.gold, 'left', 700);
    const name = k === MAXLV ? 'Ana Üs' : nameK(st, k);
    ctx.font = '500 15px ' + (UI.FONT || 'sans-serif');
    const nw = ctx.measureText(name).width, maxNW = W - 24 - (24 + hw + 10) - 70;
    UI.text(name, 24 + hw + 10, 523, nw > maxNW ? Math.max(9, 15 * maxNW / nw) : 15, COL.cream, 'left', 500);
    if (locked) UI.text('KİLİTLİ', W - 24, 523, 12, COL.red, 'right', 700);
    else if (k === best + 1 && k <= MAXLV) UI.text('SIRADAKİ', W - 24, 523, 12, COL.mint, 'right', 700);

    // 2. satır: yıldızlar · bekçi · bedel
    const n = k <= best ? starsK(st, k) : 0;
    for (let i = 0; i < 3; i++) star(ctx, 30 + i * 13, 534, 5, i < n ? COL.gold : 'rgba(255,255,255,0.2)');
    let x2 = 72;
    if (boss) {
      const bn = k === MAXLV ? 'SON SAVUNMA' : (bossNameK(st, k) || '?');
      UI.text('BEKÇİ: ' + bn, x2, 538, 12, COL.orange, 'left', 700);
    } else if (k <= best) UI.text('Geçildi', x2, 538, 12, COL.mint, 'left', 500);
    else if (!locked) UI.text('Fener hazır', x2, 538, 12, COL.cream, 'left', 500);
    else UI.text('Önce ' + (best + 1) + '. etabı geç', x2, 538, 12, COL.dimText, 'left', 500);
    const costTxt = cost === 0 ? 'BEDAVA' : cost + ' altın', costCol = cost === 0 ? COL.mint : coins >= cost ? COL.gold : COL.red;
    if (cost > 0) UI.coinIcon(W - 24 - 6 - ctx.measureText(costTxt).width * 0.75 - 10, 534, 4.5, 1);
    UI.text(costTxt, W - 24, 538, 12, costCol, 'right', 700);

    const ok = canStart(st, k);
    UI.button(BTN.start, 'BAŞLA', locked ? 'KİLİTLİ' : costTxt, true, ok, 0);
    UI.button(BTN.back, 'GERİ', null, false, true, 0);
    if (!UI.IS_TOUCH) UI.text('↑↓ seç · PgUp/PgDn ±10 · Enter başla · Esc geri', W / 2, 636, 10, 'rgba(190,215,240,0.55)', 'center', 500);
  }

  // ---- fizik ------------------------------------------------------------
  function step(t) {
    let dt = lastT === null ? 1 / 60 : t - lastT;
    if (!isFinite(dt) || dt < 0) dt = 1 / 60;
    dt = Math.min(dt, 0.05); lastT = fin(t, 0);
    if (down) return;
    if (target !== null) {
      const d = target - scroll;
      if (Math.abs(d) < 0.5) { scroll = target; target = null; }
      else scroll += d * Math.min(1, dt * 9);
    } else if (Math.abs(vel) > 2) {
      scroll += vel * dt;
      vel *= Math.pow(0.03, dt);
      const c = clampScroll(scroll);
      if (c !== scroll) { scroll = c; vel = 0; }
    } else vel = 0;
    scroll = clampScroll(scroll);
  }

  // ---- genel API --------------------------------------------------------
  const MAP = {
    init(ui) {
      UI = ui || UI;
      W = fin(ui && ui.W, 360); H = fin(ui && ui.H, 640);
    },
    open(st) {
      stCache = st || stCache;
      const best = bestK(st), last = clamp(Math.round(fin(st && st.last, 0)), 0, MAXLV);
      sel = last >= 1 ? last : Math.max(1, Math.min(best + 1, MAXLV));
      focusOn(sel, true);
      down = false; dragged = false; consumed = false; vel = 0; target = null; lastT = null;
    },
    draw(ctx, ui, t, st) {
      if (ui) UI = ui;
      if (!UI || !ctx) return;
      stCache = st || stCache;
      t = fin(t, 0);
      step(t);
      const best = bestK(st), frontier = frontierK(st);
      let totalStars = 0;
      for (let k = 1; k <= best; k++) totalStars += starsK(st, k);

      ctx.save();
      drawBackdrop(ctx, t);
      // görünür düğüm aralığı
      const kHi = clampK(Math.ceil(kAtScreenY(-60))), kLo = clampK(Math.floor(kAtScreenY(H + 60)));
      drawPath(ctx, kLo, kHi);
      drawChapterBands(ctx, kLo, kHi);
      for (let k = kLo; k <= kHi; k++) drawNode(ctx, t, st, k, best, frontier);
      // kart ile başlık arasına hafif karartma kenarları
      const gTop = ctx.createLinearGradient(0, 64, 0, 110); gTop.addColorStop(0, 'rgba(6,17,32,0.85)'); gTop.addColorStop(1, 'rgba(6,17,32,0)');
      ctx.fillStyle = gTop; ctx.fillRect(0, 64, W, 46);
      const gBot = ctx.createLinearGradient(0, 455, 0, 500); gBot.addColorStop(0, 'rgba(6,17,32,0)'); gBot.addColorStop(1, 'rgba(6,17,32,0.9)');
      ctx.fillStyle = gBot; ctx.fillRect(0, 455, W, 45);
      ctx.fillStyle = 'rgba(6,17,32,0.9)'; ctx.fillRect(0, 500, W, H - 500);
      drawHeader(ctx, st, best, totalStars);
      drawCard(ctx, st, best);
      ctx.restore();
    },
    pointerDown(p, st) {
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
      stCache = st || stCache;
      down = true; dragged = false; consumed = false; vel = 0; target = null;
      p0 = { x: p.x, y: p.y }; pLast = { x: p.x, y: p.y }; scroll0 = scroll;
      if (UI && UI.inBtn(p, BTN.back)) { consumed = true; down = false; return { action: 'close' }; }
      if (UI && UI.inBtn(p, BTN.start)) { consumed = true; down = false; return startResult(st); }
      if (p.y < 64 || p.y >= 500) { down = false; return null; }   // başlık/kart üstünde sürükleme yok
      return null;
    },
    pointerMove(p) {
      if (!down || !p || !isFinite(p.x) || !isFinite(p.y)) return;
      const dy = p.y - pLast.y;
      if (!dragged && Math.abs(p.y - p0.y) + Math.abs(p.x - p0.x) > TAP_SLOP) dragged = true;
      if (dragged) {
        scroll = clampScroll(scroll - dy);
        vel = 0.75 * vel + 0.25 * (-dy * 60);     // ~60 fps varsayımı ile px/sn
        vel = clamp(vel, -4000, 4000);
      }
      pLast = { x: p.x, y: p.y };
    },
    pointerUp(p, st) {
      stCache = st || stCache;
      if (!down) return null;
      down = false;
      if (consumed) return null;
      if (dragged) { if (Math.abs(vel) < 40) vel = 0; return null; }
      vel = 0;
      const pt = (p && isFinite(p.x) && isFinite(p.y)) ? p : pLast;
      const k = hitNode(pt);
      if (k !== null) { sel = k; ensureVisible(k); }
      return null;
    },
    key(code, st) {
      stCache = st || stCache;
      const s = st || stCache;
      let d = 0;
      if (code === 'ArrowUp' || code === 'KeyW' || code === 'w' || code === 'W') d = 1;
      else if (code === 'ArrowDown' || code === 'KeyS' || code === 's' || code === 'S') d = -1;
      else if (code === 'PageUp') d = 10;
      else if (code === 'PageDown') d = -10;
      else if (code === 'Enter' || code === 'Space' || code === ' ' || code === 'NumpadEnter') return startResult(s);
      else if (code === 'Escape' || code === 'Backspace') return { action: 'close' };
      if (d) { sel = clampK(sel + d); focusOn(sel, false); }
      return null;
    },
    wheel(dy) {
      dy = fin(dy, 0);
      target = null; vel = 0;
      scroll = clampScroll(scroll + clamp(dy, -200, 200));
    },
    selected() { return sel; },
    // test/ayıklama
    _state() { return { scroll, target, vel, sel, worldH: WORLD_H, step: STEP }; },
  };

  window.MAP = MAP;
})();
