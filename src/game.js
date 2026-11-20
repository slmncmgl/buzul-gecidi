/* Buzul Geçidi — oyun motoru */
(function () {
  'use strict';

  const LV = window.Level;
  const W = LV.W, H = 640, ROW = LV.ROW, GATE = LV.GATE_HALF, NSEC = LV.DEFS.length;
  const PSY = 500;                                   // oyuncunun ekrandaki y konumu
  const SPEED_MIN = 80, SPEED_CRUISE = 150, SPEED_MAX = 270;
  const HEAT_DRAIN = 3.6, HEAT_CHARGE = 60;
  const PTS = { mine: 30, boat: 60, skim: 100, turret: 150, orb: 20, ice: 10, hunter: 120, boss: 2500 };
  const SIZE = { mine: [7, 7], boat: [12, 6], skim: [10, 5], turret: [10, 10], ice: [9, 7], hunter: [9, 8], beam: [0, 4], whirl: [0, 0], boss: [34, 14] };
  // Etap ilerledikçe akış hızlanır; devam etmenin altın bedeli de etapla artar
  const speedMul = (k) => Math.min(1.75, 1 + 0.025 * (k % NSEC) + 0.12 * Math.floor(k / NSEC));
  const contCost = (k) => Math.min(200, 20 + 10 * k);
  // Yaylım atışı: ateşi basılı tutunca şarj olur, bırakınca yelpaze şeklinde ateşler, sonra bir süre kapanır
  const NUKE_CD = 60, NUKE_BOSS_DMG = 8;       // nükleer patlama: ekranı temizler, dakikada bir
  const BLAST_CD = 10, BLAST_CHARGE = 1.2, BLAST_HOLD = 0.18, BLAST_MIN = 0.25;
  const FONT = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", sans-serif';

  // Sürüm: index.html'deki betik adresinin ?v= değeri. Her yayında o sayı artar; ekranda görünür.
  const VERSION = (function () {
    const m = /[?&]v=(\d+)/.exec((document.currentScript && document.currentScript.src) || '');
    return m ? 'v' + m[1] : 'v?';
  })();
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);
  const cfg = { auto: params.has('auto'), god: params.has('god') };   // test anahtarları
  const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Ses modülü yoksa ya da hata verirse oyun sessizce devam eder
  const NOP = function () {};
  const rawAudio = window.GameAudio || {};
  const A = new Proxy({}, {
    get: function (_, name) {
      const fn = rawAudio[name];
      if (typeof fn !== 'function') return NOP;
      return function () { try { return fn.apply(rawAudio, arguments); } catch (e) { /* yut */ } };
    }
  });

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* gizli sekme vb. */ }
    return null;
  }

  // ------------------------------------------------------------ yardımcılar
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const approach = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);
  const rand = (a, b) => a + Math.random() * (b - a);
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  // ------------------------------------------------------------ renk paletleri
  function hex(s) { const n = parseInt(s.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const PALS = [
    { water1: '#4596bd', water2: '#2c73a0', streak: '#9bd6ee', snow: '#eef4fa', snow2: '#ffffff', ice: '#bfe9f7', tree: '#2f6b4a', aur1: '#ffffff', aur2: '#c8f0ff' }, // gündüz
    { water1: '#17344d', water2: '#0c2236', streak: '#41708f', snow: '#e6dde7', snow2: '#f8f1f5', ice: '#9fd3e6', tree: '#27504a', aur1: '#ff9a7a', aur2: '#c56bd6' }, // akşamüstü
    { water1: '#0c2037', water2: '#06121f', streak: '#2a5078', snow: '#c6d4e8', snow2: '#e0e9f5', ice: '#7fb8dd', tree: '#1c3a44', aur1: '#4fd6ff', aur2: '#5a7dff' }, // gece
    { water1: '#08272d', water2: '#04151a', streak: '#22645f', snow: '#c9ecdf', snow2: '#e6fbf2', ice: '#6fe0c0', tree: '#17403a', aur1: '#57ffa8', aur2: '#b06bff' }, // aurora gecesi
    { water1: '#2b375b', water2: '#182040', streak: '#5a6a9e', snow: '#f4e1d4', snow2: '#fff4ec', ice: '#ffc2a0', tree: '#3a4a52', aur1: '#ffb36b', aur2: '#ff7aa8' }  // şafak
  ].map(function (p) { const o = {}; for (const k in p) o[k] = hex(p[k]); return o; });
  const pal = {}, col = {};
  for (const k in PALS[0]) { pal[k] = PALS[0][k].slice(); }
  function palUpdate(dt, target) {
    const f = Math.min(1, dt * 1.4);
    for (const k in pal) {
      const c = pal[k], t = target[k];
      c[0] += (t[0] - c[0]) * f; c[1] += (t[1] - c[1]) * f; c[2] += (t[2] - c[2]) * f;
      col[k] = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
    }
  }
  function rgba(k, a) { const c = pal[k]; return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  palUpdate(1, PALS[0]);
  // Her paletin karanlık miktarı (0 gündüz, 1 gece): gece görüş daralır, ışıklar öne çıkar
  const PAL_NIGHT = [0, 0.35, 1, 0.85, 0.3];
  function setPal(dt, idx) {
    palUpdate(dt * 0.6, PALS[idx]);
    G.night += (PAL_NIGHT[idx] - G.night) * Math.min(1, dt * 0.85);
  }

  // ------------------------------------------------------------ arazi
  const secCache = new Map();
  let lastSec = null;
  function sec(k) {
    let s = secCache.get(k);
    if (!s) {
      s = LV.generate(k);
      secCache.set(k, s);
      if (secCache.size > 8) secCache.forEach(function (_, key) { if (Math.abs(key - k) > 4) secCache.delete(key); });
    }
    return s;
  }
  function rowAt(g, out) {
    if (g < 0) { out.L = W / 2 - GATE; out.R = W / 2 + GATE; out.IL = out.IR = 0; return out; }
    let s = lastSec;
    if (!s || g < s.g0 || g >= s.g0 + s.N) s = lastSec = sec(LV.sectionAtRow(g));
    const i = g - s.g0;
    out.L = s.L[i]; out.R = s.R[i]; out.IL = s.IL[i]; out.IR = s.IR[i];
    return out;
  }
  const TA = {}, TB = {}, TC = {}, T1 = {}, T2 = {}, T0 = {};
  function terrain(wy, out) {
    const g = wy / ROW, i = Math.floor(g), f = g - i;
    rowAt(i, TA); rowAt(i + 1, TB);
    out.L = TA.L + (TB.L - TA.L) * f;
    out.R = TA.R + (TB.R - TA.R) * f;
    const n = f < 0.5 ? TA : TB;
    out.IL = n.IL; out.IR = n.IR;
    return out;
  }
  function solid(x, wy) {
    const t = terrain(wy, TC);
    return x < t.L || x > t.R || (t.IR > t.IL && x > t.IL && x < t.IR);
  }

  // ------------------------------------------------------------ durum
  const G = {
    mode: 'title', t: 0, score: 0, hi: parseInt(store('bg_hi') || '0', 10) || 0, newHi: false,
    lives: 3, sec: 0, heat: 100, nextLife: 10000, checkpoint: 40,
    shake: 0, deathT: 0, deathMsg: '', overT: 0, charging: false,
    banner: { t: 9, a: '', b: '' }, flash: 0,
    coins: parseInt(store('bg_coins') || '0', 10) || 0,      // cüzdan: tarayıcıda saklanır
    best: parseInt(store('bg_stage') || '0', 10) || 0,       // ulaşılan en uzak etap (0 tabanlı)
    runCoins: 0, sm: 1, fog: 0, wind: 0, windWarn: 0, windT: 0, deny: 0, sensT: 0,
    blastCd: 0, readyT: 0, night: 0, boss: null, rapid: false, nukeCd: 0, nukeT: 0,
    stats: { deaths: [], gates: 0 }
  };
  const P = { x: W / 2, wy: 40, vx: 0, speed: SPEED_CRUISE, inv: 0, fireCd: 0, tilt: 0, holdT: 0, charge: 0 };
  let shots = [], ents = [], orbs = [], parts = [], pops = [], coinsL = [];
  let armed = {};
  let muted = store('bg_muted') === '1';

  const sy = (wy) => PSY - (wy - P.wy);

  // ------------------------------------------------------------ girdi
  const keys = {};
  const inp = { left: false, right: false, up: false, down: false, fire: false };
  const touch = { on: false, id: null, lx: 0, y0: 0, y: 0, dx: 0 };
  // Fare: oyun başladığı andaki konum (0,0) kabul edilir; mx sağ/sol, my ileri/geri sapmadır
  const mouse = { active: false, down: false, mx: 0, my: 0, sens: 0.35, level: 1 };
  // Fare hassasiyeti: 9 kademe, klavyede 1–9 ile seçilir, tarayıcıda saklanır (1.0 = imleçle birebir)
  const SENS_LEVELS = [0.35, 0.45, 0.55, 0.7, 0.85, 1, 1.2, 1.45, 1.7], SENS_DEFAULT = 1;
  function setSensLevel(n) {
    mouse.level = clamp(Math.round(n) || SENS_DEFAULT, 1, 9);
    mouse.sens = SENS_LEVELS[mouse.level - 1];
    store('bg_sens_lv2', String(mouse.level));
    G.sensT = 1.6;
  }
  function setSens(step) { setSensLevel(mouse.level + step); }
  (function () {
    const v = parseInt(store('bg_sens_lv2'), 10);
    mouse.level = v >= 1 && v <= 9 ? v : SENS_DEFAULT;
    mouse.sens = SENS_LEVELS[mouse.level - 1];
  })();
  const MOUSE_R = 64, MOUSE_DEAD = 12;      // ileri/geri menzili ve ölü bölge (mantıksal px)
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'fire', KeyJ: 'fire', KeyZ: 'fire'
  };

  function firstGesture() { A.init(); A.setMuted(muted); }

  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const m = KEYMAP[e.code];
    if (m) { keys[m] = true; e.preventDefault(); }
    // fare hassasiyeti: her an 1–9 (ya da − / +), duraklatılmışken ← / →
    const dg = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (dg && !e.repeat) { setSensLevel(+dg[1]); e.preventDefault(); return; }
    if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') { setSens(-1); e.preventDefault(); return; }
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { setSens(1); e.preventDefault(); return; }
    if (G.mode === 'paused' && (m === 'left' || m === 'right')) { setSens(m === 'left' ? -1 : 1); return; }
    if (e.repeat) return;
    firstGesture();
    if (e.code === 'Enter' || e.code === 'Space') {
      if (G.mode === 'title' || (G.mode === 'gameover' && G.overT > 0.8)) startGame(0);
      else if (G.mode === 'paused') togglePause();
      e.preventDefault();
    } else if (e.code === 'KeyX' || e.code === 'KeyN') {
      nuke();
    } else if (e.code === 'KeyC') {
      if (G.mode === 'title') tryContinue(G.best);
      else if (G.mode === 'gameover' && G.overT > 0.8) tryContinue(G.sec);
    } else if (e.code === 'KeyP') {
      togglePause();
    } else if (e.code === 'Escape') {
      if (G.mode === 'playing') togglePause();
    } else if (e.code === 'KeyM') {
      muted = !muted; A.setMuted(muted); store('bg_muted', muted ? '1' : '0');
    }
  });
  window.addEventListener('keyup', function (e) { const m = KEYMAP[e.code]; if (m) keys[m] = false; });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; mouse.down = false; });

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  canvas.addEventListener('pointerdown', function (e) {
    firstGesture();
    const p = toLogical(e), isMouse = e.pointerType === 'mouse';
    e.preventDefault();
    if (G.mode === 'title' || (G.mode === 'gameover' && G.overT > 0.8)) {
      const act = menuAction(p);
      if (!act) return;
      if (isMouse) mouse.active = true;         // fareyle başlatan fareyle oynar
      let ok = true;
      if (act === 'new') startGame(0);
      else ok = tryContinue(act === 'cont-title' ? G.best : G.sec);
      if (isMouse || !ok) return;
    } else if (G.mode === 'paused') {
      if (inBtn(p, BTN.sensMinus)) { setSens(-1); return; }
      if (inBtn(p, BTN.sensPlus)) { setSens(1); return; }
      if (isMouse && !mouse.active) { mouse.active = true; mouse.mx = P.x - W / 2; mouse.my = 0; }
      togglePause();
      return;
    } else if (!isMouse && p.x > W - 52 && p.y > 26 && p.y < 70) { togglePause(); return; }
    if (isMouse) {
      if (G.mode !== 'playing') return;
      if (e.button === 2) { nuke(); return; }            // sağ tık: nükleer patlama
      if (!mouse.active) { mouse.active = true; mouse.mx = P.x - W / 2; mouse.my = 0; }
      lockPointer();
      mouse.down = true;
      return;
    }
    if (touch.on && e.pointerId !== touch.id) { nuke(); return; }   // ikinci parmak: nükleer patlama
    touch.on = true; touch.id = e.pointerId; touch.lx = p.x; touch.y0 = p.y; touch.y = p.y; touch.dx = 0;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!touch.on || e.pointerId !== touch.id) return;
    const p = toLogical(e);
    touch.dx += p.x - touch.lx; touch.lx = p.x; touch.y = p.y;
  });
  function touchEnd(e) {
    if (e.pointerType === 'mouse') { mouse.down = false; return; }
    if (e.pointerId === touch.id) touch.on = false;
  }
  window.addEventListener('mouseup', function () { mouse.down = false; });

  // Fare kilidi: imleç gizlenir, fare pencere kenarına takılmaz. Kilit alınamazsa da oyun çalışır.
  function lockPointer() {
    if (document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(NOP); } catch (e) { /* yut */ }
  }
  function unlockPointer() {
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
  }
  document.addEventListener('pointerlockchange', function () {
    if (document.pointerLockElement === canvas) return;
    mouse.down = false;
    if (G.mode === 'playing' && mouse.active) togglePause();    // Esc ile kilitten çıkıldı
  });
  document.addEventListener('mousemove', function (e) {
    if (!mouse.active || G.mode !== 'playing') return;
    const k = W / (canvas.getBoundingClientRect().width || W) * mouse.sens;
    mouse.mx = clamp(mouse.mx + (e.movementX || 0) * k, 4 - W / 2, W / 2 - 4);
    mouse.my = clamp(mouse.my - (e.movementY || 0) * k, -MOUSE_R, MOUSE_R);
  });
  canvas.addEventListener('pointerup', touchEnd);
  canvas.addEventListener('pointercancel', touchEnd);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'playing' && !cfg.auto) togglePause();
  });

  function togglePause() {
    if (G.mode === 'playing') {
      G.mode = 'paused'; mouse.down = false;
      A.stopEngine(); A.setCharging(false); A.setLowHeat(false); A.setWind(0); A.pause();
      unlockPointer();
    } else if (G.mode === 'paused') {
      G.mode = 'playing'; A.resume();
      if (mouse.active) lockPointer();
    }
  }

  // ------------------------------------------------------------ oyun akışı
  function arm(k) {
    if (armed[k]) return;
    armed[k] = true;
    const s = sec(k);
    for (let i = 0; i < s.spawns.length; i++) {
      const sp = s.spawns[i], sz = SIZE[sp.type];
      ents.push({
        type: sp.type, x: sp.x, wy: sp.y, vx: sp.vx || 0, minX: sp.minX, maxX: sp.maxX,
        hw: sz[0], hh: sz[1], hp: sp.type === 'turret' ? 2 : sp.type === 'ice' ? 1 + Math.min(1, s.loop) : 1,
        cd: 0.7, rate: 2.3 / (1 + 0.15 * s.loop), hard: 1 + 0.15 * s.loop,
        flash: 0, ph: hash(sp.y + sp.x) * 6.28, ang: Math.PI / 2, dead: false
      });
      const e = ents[ents.length - 1];
      if (sp.type === 'beam') { e.hw = (sp.maxX - sp.minX) / 2; e.hp = 1e9; e.period = sp.period; e.bph = sp.ph; e.on = false; e.warn = false; }
      else if (sp.type === 'whirl') { e.hp = 1e9; e.r = sp.r; }
      else if (sp.type === 'boss') { e.hp = e.maxHp = 28 + 14 * s.loop; e.scr = -60; e.on = false; e.flee = false; e.cd = 1.6; e.cd2 = 4; e.arenaEnd = s.arenaEnd; }
    }
    for (let i = 0; i < s.coins.length; i++) {
      const c = s.coins[i];
      coinsL.push({ x: c.x, wy: c.y, v: c.v, ph: hash(c.y) * 6.28 });
    }
  }
  function rearm() { ents.length = 0; coinsL.length = 0; armed = {}; G.boss = null; arm(G.sec); arm(G.sec + 1); }

  // Menü düğmeleri (mantıksal koordinat)
  const BTN = {
    titleNew: { x: 40, y: 478, w: 280, h: 36 }, titleCont: { x: 40, y: 522, w: 280, h: 36 },
    overA: { x: 40, y: 398, w: 280, h: 38 }, overB: { x: 40, y: 446, w: 280, h: 38 },
    sensMinus: { x: 76, y: 418, w: 46, h: 36 }, sensPlus: { x: 238, y: 418, w: 46, h: 36 }
  };
  const inBtn = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  function menuAction(p) {
    if (G.mode === 'title') return (G.best > 0 && inBtn(p, BTN.titleCont)) ? 'cont-title' : 'new';
    if (G.sec > 0) return inBtn(p, BTN.overA) ? 'cont' : inBtn(p, BTN.overB) ? 'new' : null;
    return inBtn(p, BTN.overA) ? 'new' : null;
  }
  // Altın harcayıp k. etabın başından devam et (puan sıfırlanır)
  function tryContinue(k) {
    const cost = contCost(k);
    if (k < 1 || G.coins < cost) { G.deny = 0.5; A.play('deny'); return false; }
    G.coins -= cost; store('bg_coins', String(G.coins));
    A.play('buy');
    startGame(k);
    return true;
  }

  function setBanner(k) {
    const loop = Math.floor(k / NSEC);
    G.banner.t = 0;
    G.banner.a = 'ETAP ' + (k % NSEC + 1) + (loop ? '  ·  TUR ' + (loop + 1) : '');
    G.banner.b = LV.info(k).name;
  }

  function startGame(k) {
    k = k > 0 ? k : 0;
    G.mode = 'playing'; G.score = 0; G.lives = 3; G.sec = k; G.heat = 100; G.nextLife = 10000;
    G.checkpoint = k ? sec(k - 1).gateY + 24 : 40; G.newHi = false; G.shake = 0; G.flash = 0;
    G.runCoins = 0; G.wind = 0; G.windWarn = 0; G.windT = 0; G.deny = 0;
    G.blastCd = 0; G.readyT = 0; P.holdT = 0; P.charge = 0; G.nukeCd = 0; G.nukeT = 0;
    G.stats.deaths = []; G.stats.gates = 0;
    P.x = W / 2; P.wy = G.checkpoint; P.vx = 0; P.speed = SPEED_CRUISE; P.inv = 1.5; P.fireCd = 0.35; P.tilt = 0;
    shots.length = 0; orbs.length = 0; parts.length = 0; pops.length = 0;
    mouse.mx = 0; mouse.my = 0; mouse.down = false;      // farenin şu anki konumu sıfır noktası
    if (mouse.active) lockPointer();
    rearm(); setBanner(k);
    A.resume(); A.play('start'); A.startMusic();
  }

  function addScore(n) {
    G.score += n;
    while (G.score >= G.nextLife) {
      G.nextLife += 10000;
      if (G.lives < 6) { G.lives++; A.play('extraLife'); pop(P.x, P.wy + 40, '+1 KIZAK', '#7dffb0'); }
    }
  }

  function die(why) {
    if (G.mode !== 'playing') return;
    G.mode = 'dying'; G.deathT = 1.5; G.shake = 9;
    G.deathMsg = why === 'freeze' ? 'ISI BİTTİ — DONDUN' : why === 'beam' ? 'IŞIK ÇİTİNE ÇARPTIN' : why === 'whirl' ? 'GİRDABA KAPILDIN' : 'KIZAK PARÇALANDI';
    G.stats.deaths.push({ why: why, sec: G.sec, wy: Math.round(P.wy), x: Math.round(P.x) });
    if (why === 'freeze') { boom(P.x, P.wy, 26, ['#ffffff', '#bfe9ff', '#7fc8ff', '#e8f7ff'], 90); A.play('freeze'); }
    else { boom(P.x, P.wy, 34, ['#ffffff', '#ffd27a', '#ff8a3c', '#ff5a36'], 150); A.play('playerDie'); }
    A.stopEngine(); A.setCharging(false); A.setLowHeat(false); A.setWind(0); A.setWeaponCharge(0);
    P.charge = 0; P.holdT = 0;
  }

  function afterDeath() {
    G.lives--;
    if (G.lives <= 0) {
      G.mode = 'gameover'; G.overT = 0;
      if (G.score > G.hi) { G.hi = G.score; G.newHi = true; store('bg_hi', String(G.hi)); }
      A.stopMusic();
      mouse.down = false; unlockPointer();
      return;
    }
    P.x = W / 2; P.wy = G.checkpoint; P.vx = 0; P.speed = SPEED_CRUISE; P.inv = 1.8; P.fireCd = 0.3; P.tilt = 0;
    G.heat = 100; shots.length = 0; orbs.length = 0;
    mouse.mx = 0; mouse.my = 0;                          // yeniden doğunca sıfır noktası da yenilenir
    G.blastCd = 0; P.holdT = 0; P.charge = 0;            // yeni kızak, yaylım hazır
    rearm();
    G.mode = 'playing';
  }

  // ------------------------------------------------------------ parçacıklar
  function part(x, wy, vx, vy, life, size, color, glow) {
    if (parts.length > 420) parts.shift();
    parts.push({ x: x, wy: wy, vx: vx, vy: vy, life: life, max: life, size: size, color: color, glow: !!glow });
  }
  function boom(x, wy, n, colors, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = rand(0.2, 1) * spd;
      part(x, wy, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.9), rand(1.5, 3.5), colors[i % colors.length], true);
    }
  }
  function pop(x, wy, text, color) { pops.push({ x: clamp(x, 34, W - 34), wy: wy, text: text, life: 1.1, color: color || '#ffe9b8' }); }

  // ------------------------------------------------------------ otomatik pilot (yalnızca test: ?auto)
  function segOf(t, x, out) {
    if (t.IR > t.IL) {
      if (x <= (t.IL + t.IR) / 2) { out.a = t.L; out.b = t.IL; } else { out.a = t.IR; out.b = t.R; }
    } else { out.a = t.L; out.b = t.R; }
    return out;
  }
  const SG0 = {}, SG1 = {};
  function autopilot() {
    const s0 = segOf(terrain(P.wy + 24, T1), P.x, SG0);
    const s1 = segOf(terrain(P.wy + 60 + P.speed * 0.45, T2), P.x, SG1);
    let tx = (s1.a + s1.b) / 2, slow = false;
    const narrow = (s1.b - s1.a) < 70;
    const vs = sec(G.sec).vents.concat(sec(G.sec + 1).vents);
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i], dy = v.y - P.wy;
      if (dy > -44 && dy < 240 && G.heat < 88 && v.x > s1.a - 10 && v.x < s1.b + 10 && Math.abs(v.x - P.x) < 40 + dy * 0.45) {
        tx = v.x; slow = dy < 130; break;
      }
    }
    // gövdenin arkası da adayı geçene kadar aynı geçitte kal
    const sb = segOf(terrain(P.wy - 12, T2), P.x, SG1);
    const lo = Math.max(s0.a, sb.a), hi = Math.min(s0.b, sb.b);
    if (hi - lo > 36) tx = clamp(tx, lo + 17, hi - 17); else tx = (lo + hi) / 2;
    const fx = P.x + P.vx * 0.11;          // durma mesafesini hesaba kat
    inp.left = fx > tx + 2; inp.right = fx < tx - 2;
    inp.down = slow || Math.abs(tx - P.x) > 34 || narrow;
    inp.up = false; inp.fire = true;
  }

  // ------------------------------------------------------------ güncelleme
  function updatePlayer(dt) {
    if (cfg.auto) autopilot();
    else {
      inp.left = !!keys.left; inp.right = !!keys.right; inp.up = !!keys.up; inp.down = !!keys.down; inp.fire = !!keys.fire;
    }

    const s = sec(G.sec);
    const sm = G.sm = speedMul(G.sec), vMin = SPEED_MIN * sm, vCr = SPEED_CRUISE * sm, vMax = SPEED_MAX * sm;
    const lat = 126 * Math.sqrt(sm);     // klavye yan hızı (180 fazla sıçratıyordu)

    // rüzgâr: önce uyarı, sonra birkaç saniyelik yan itiş
    const w0 = s.info.wind || 0;
    if (w0) {
      G.windT += dt;
      const c = G.windT % 6.5, dir = hash(Math.floor(G.windT / 6.5) + G.sec * 7.3) < 0.5 ? -1 : 1;
      const env = c < 1.4 ? 0 : c < 2 ? (c - 1.4) / 0.6 : c < 4.2 ? 1 : c < 4.8 ? (4.8 - c) / 0.6 : 0;
      G.wind = w0 * dir * env * (1 + 0.15 * s.loop);
      G.windWarn = c > 0.2 && c < 4.8 ? dir : 0;
    } else { G.wind = 0; G.windWarn = 0; G.windT = 0; }
    A.setWind(Math.min(1, Math.abs(G.wind) / 60));

    if (touch.on && !cfg.auto) {
      const mv = clamp(touch.dx * 1.15, -320 * dt, 320 * dt);
      P.x += mv + G.wind * dt; touch.dx -= mv / 1.15;
      P.vx = approach(P.vx, clamp(mv / Math.max(dt, 0.001), -175, 175), 1400 * dt);
      inp.up = touch.y0 - touch.y > 34; inp.down = touch.y - touch.y0 > 34; inp.fire = true;
    } else if (mouse.active && !cfg.auto) {
      // kızak, farenin sıfır noktasına göre sağ/sol sapmasını izler; ok tuşları da aynı hedefi kaydırır
      if (inp.left) mouse.mx -= lat * dt;
      if (inp.right) mouse.mx += lat * dt;
      mouse.mx += G.wind * dt;
      mouse.mx = clamp(mouse.mx, 4 - W / 2, W / 2 - 4);
      const nx = approach(P.x, W / 2 + mouse.mx, 420 * dt);
      P.vx = approach(P.vx, clamp((nx - P.x) / Math.max(dt, 0.001), -175, 175), 1500 * dt);
      P.x = nx;
      if (mouse.down) inp.fire = true;
    } else {
      const ax = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      P.vx = approach(P.vx, ax * lat, 1500 * dt);
      P.x += (P.vx + G.wind) * dt;
    }
    P.x = clamp(P.x, 4, W - 4);
    P.tilt += (P.vx / 175 - P.tilt) * Math.min(1, dt * 12);

    let target = inp.up ? vMax : inp.down ? vMin : vCr;
    if (mouse.active && !cfg.auto && !touch.on && !inp.up && !inp.down) {
      // fare ileri: hızlan, geri: yavaşla; sıfır noktası civarı seyir hızı
      const m = mouse.my, span = MOUSE_R - MOUSE_DEAD;
      if (m > MOUSE_DEAD) target = vCr + (vMax - vCr) * (m - MOUSE_DEAD) / span;
      else if (m < -MOUSE_DEAD) target = vCr - (vCr - vMin) * (-m - MOUSE_DEAD) / span;
    }
    G.rapid = false;
    for (let k = G.sec; k <= G.sec + 1 && !G.rapid; k++) {
      const rp = sec(k).rapids;
      for (let i = 0; i < rp.length; i++) if (P.wy > rp[i].y0 && P.wy < rp[i].y1) { G.rapid = true; break; }
    }
    if (G.rapid) target = Math.max(target, vMax * 1.05);     // akıntı sürükler, yavaşlanamaz
    P.speed = approach(P.speed, target, 230 * sm * dt);
    P.wy += P.speed * dt;
    P.inv = Math.max(0, P.inv - dt);
    P.fireCd -= dt;

    const s01 = clamp((P.speed - vMin) / (vMax - vMin), 0, 1);
    A.setEngine(s01);

    // motor izi
    if (Math.random() < 0.5 + s01 * 0.5) part(P.x + rand(-2, 2), P.wy - 12, rand(-8, 8), -rand(30, 70), rand(0.15, 0.4), rand(1, 2.2), '#ffcf8a', true);

    // ateş
    if (G.blastCd > 0) {
      G.blastCd -= dt;
      if (G.blastCd <= 0) { G.blastCd = 0; G.readyT = 1.2; A.play('blastReady'); }
    }
    G.readyT = Math.max(0, G.readyT - dt);
    if (G.nukeCd > 0) { G.nukeCd -= dt; if (G.nukeCd <= 0) { G.nukeCd = 0; A.play('blastReady'); pop(P.x, P.wy + 40, 'NÜKLEER HAZIR', '#7dffb0'); } }
    const autoRelease = touch.on || cfg.auto;       // dokunmatikte ve otomatik pilotta dolunca kendi ateşler
    if (inp.fire) {
      P.holdT += dt;
      if (G.blastCd <= 0 && P.holdT > BLAST_HOLD) {
        // yaylım hazırsa basılı tutmak şarj eder (bu sırada tekli atış yok)
        P.charge = Math.min(1, P.charge + dt / BLAST_CHARGE);
        if (autoRelease && P.charge >= 1) fireBlast();
      } else if (P.fireCd <= 0 && normalShots() < 3) {
        shots.push({ x: P.x, wy: P.wy + 14, v: 440 + P.speed, vx: 0, dmg: 1 });
        P.fireCd = 0.2;
        A.play('shoot');
      }
    } else {
      if (P.charge >= BLAST_MIN) fireBlast();
      P.charge = 0; P.holdT = 0;
    }
    A.setWeaponCharge(P.charge);

    // ısı
    G.heat -= HEAT_DRAIN * s.def.drain * (1 + 0.1 * s.loop) * dt;
    let charging = false;
    for (let k = G.sec; k <= G.sec + 1 && !charging; k++) {
      const vs = sec(k).vents;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (Math.abs(P.x - v.x) < v.hw + 6 && Math.abs(P.wy - v.y) < v.hl + 9) { charging = true; break; }
      }
    }
    if (charging) {
      G.heat = Math.min(100, G.heat + HEAT_CHARGE * sm * dt);
      if (Math.random() < 0.6) part(P.x + rand(-9, 9), P.wy + rand(-8, 10), rand(-10, 10), rand(10, 50), rand(0.3, 0.7), rand(1.5, 3), '#ffd9a0', true);
    }
    G.charging = charging;
    A.setCharging(charging);
    A.setLowHeat(G.heat < 25);
    if (G.heat <= 0) { G.heat = 0; die('freeze'); return; }

    // altınlar
    for (let i = coinsL.length - 1; i >= 0; i--) {
      const c = coinsL[i];
      if (Math.abs(P.x - c.x) < 12 + c.v && Math.abs(P.wy - c.wy) < 14 + c.v) {
        coinsL.splice(i, 1);
        G.coins += c.v; G.runCoins += c.v; store('bg_coins', String(G.coins));
        addScore(10 * c.v);
        A.play(c.v > 1 ? 'bigCoin' : 'coin');
        if (c.v > 1) pop(c.x, c.wy + 12, '+' + c.v + ' ALTIN', '#ffd95a');
        for (let q = 0; q < 4 + c.v; q++) part(c.x, c.wy, rand(-50, 50), rand(-20, 70), rand(0.25, 0.5), rand(1.2, 2.4), '#ffe27a', true);
      } else if (sy(c.wy) > H + 40) coinsL.splice(i, 1);
    }

    // kıyıya ya da adaya çarpma
    if (solid(P.x - 5, P.wy - 7) || solid(P.x + 5, P.wy - 7) || solid(P.x - 5, P.wy + 6) || solid(P.x + 5, P.wy + 6) || solid(P.x, P.wy + 11)) {
      die('crash'); return;
    }

    // fener kapısı
    const gy = s.gateY;
    if (P.wy >= gy) {
      const bonus = 500 + Math.round(G.heat) * 5;
      addScore(bonus);
      pop(W / 2, gy + 46, 'FENER  +' + bonus, '#ffe9b8');
      G.heat = Math.min(100, G.heat + 25);
      G.checkpoint = gy + 24;
      G.sec++; G.stats.gates++; G.flash = 0.35;
      if (G.sec > G.best) { G.best = G.sec; store('bg_stage', String(G.best)); }
      if (G.sec % NSEC === 0) { addScore(5000); pop(W / 2, gy + 80, 'TUR TAMAM  +5000', '#7dffb0'); A.play('lapDone'); }
      else A.play('gate');
      arm(G.sec + 1);
      setBanner(G.sec);
      for (let i = 0; i < 22; i++) {
        const sx = i % 2 ? W / 2 - GATE : W / 2 + GATE;
        part(sx, gy, rand(-40, 40), rand(-20, 90), rand(0.4, 1), rand(1.5, 3), i % 3 ? '#ffe9b8' : '#7dffb0', true);
      }
    }
  }

  function normalShots() { let n = 0; for (let i = 0; i < shots.length; i++) if (!shots[i].pellet) n++; return n; }
  // Şarj seviyesine göre 5–11 fişek, yelpaze açısı ±16°–±42°; tam şarjda fişekler çift hasar verir
  function fireBlast() {
    const c = P.charge, n = 5 + Math.round(c * 6), half = (16 + 26 * c) * Math.PI / 180, v = 470;
    for (let i = 0; i < n; i++) {
      const a = -half + 2 * half * i / (n - 1);
      shots.push({ x: P.x, wy: P.wy + 14, v: Math.cos(a) * v + P.speed, vx: Math.sin(a) * v, dmg: c >= 1 ? 2 : 1, pellet: true });
    }
    for (let i = 0; i < 16; i++) part(P.x + rand(-6, 6), P.wy + 14, rand(-110, 110), rand(40, 190), rand(0.2, 0.45), rand(1.5, 3), i % 2 ? '#fff6da' : '#ffcf8a', true);
    G.blastCd = BLAST_CD; G.shake = Math.max(G.shake, 3 + 3 * c);
    P.charge = 0; P.fireCd = 0.25;
    A.setWeaponCharge(0); A.play('blast');
  }

  // Işık çiti ve girdap: vurulamaz, zamanlama ve yön ister
  function hazard(e, dt, playing) {
    if (e.type === 'beam') {
      const t = (G.t + e.bph) % e.period;
      e.on = t < e.period * 0.55; e.warn = !e.on && t > e.period - 0.45;
      if (playing && e.on && P.inv <= 0 && !cfg.god && Math.abs(P.wy - e.wy) < 9 && P.x > e.minX - 2 && P.x < e.maxX + 2) die('beam');
    } else if (playing) {
      const dx = e.x - P.x, dy = e.wy - P.wy, d = Math.hypot(dx, dy);
      if (d < e.r && d > 0.5) {
        const pull = 95 * (1 - d / e.r) * e.hard * dt * dx / d;
        P.x += pull;
        if (mouse.active) mouse.mx += pull;
      }
      if (d < 9 && P.inv <= 0 && !cfg.god) die('whirl');
    }
  }

  // Bekçi: tur sonundaki geniş alanda kızağın önünde süzülür, ateş eder, avcı salar.
  // Alan bitene kadar indirilemezse kaçar; yol her durumda açılır.
  function bossUpdate(e, dt, playing) {
    if (!playing) return false;
    if (!e.on) { e.on = true; e.scr = -60; G.boss = e; pop(W / 2, P.wy + 260, 'BEKÇİ GELİYOR', '#ff8f80'); A.play('orb'); }
    if (e.flee || P.wy > e.arenaEnd) {
      if (!e.flee) { e.flee = true; pop(W / 2, P.wy + 220, 'BEKÇİ KAÇTI', '#ff8f80'); }
      e.scr -= 240 * dt;
      if (e.scr < -36) { e.dead = true; G.boss = null; }
    } else e.scr += (120 - e.scr) * Math.min(1, dt * 1.4);
    e.wy = P.wy + PSY - e.scr;
    const t = terrain(e.wy, T2);
    e.x = clamp(W / 2 + Math.sin(G.t * 0.9 + e.ph) * 84, t.L + 46, t.R - 46);
    if (e.flee) return false;
    e.cd -= dt; e.cd2 -= dt;
    if (e.cd <= 0 && e.scr > 70) {
      const n = e.hard > 1.2 ? 5 : 3, base = Math.atan2(PSY - e.scr, P.x - e.x), v = 135 * e.hard;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.3;
        orbs.push({ x: e.x, wy: e.wy - 12, vx: Math.cos(a) * v, vy: P.speed - Math.sin(a) * v });
      }
      e.cd = 1.9 / e.hard;
      A.play('orb');
    }
    if (e.cd2 <= 0 && e.scr > 70) {
      ents.push({ type: 'hunter', x: e.x, wy: e.wy - 22, vx: 0, hw: 9, hh: 8, hp: 1, cd: 0, rate: 1, hard: e.hard, flash: 0, ph: G.t, ang: 0, dead: false });
      e.cd2 = 5.5 / e.hard;
    }
    return true;
  }
  function bossDown(e) {
    G.boss = null;
    for (let q = 0; q < 3; q++) boom(e.x + rand(-26, 26), e.wy + rand(-10, 10), 30, ['#ffffff', '#ffd27a', '#d58bff', '#ff5a36'], 170);
    G.shake = 11; G.flash = 0.4;
    // ödül: önüne altın saçılır
    for (let q = 0; q < 26; q++) {
      const cx = e.x + rand(-110, 110), cy = e.wy - rand(40, 330);
      if (!solid(cx - 12, cy) && !solid(cx + 12, cy)) coinsL.push({ x: cx, wy: cy, v: q % 9 === 0 ? 5 : 1, ph: rand(0, 6) });
    }
    pop(W / 2, P.wy + 240, 'BEKÇİ YENİLDİ', '#7dffb0');
    A.play('extraLife');
  }

  // Nükleer patlama: ekrandaki düşmanları ve mermileri siler (girdap ve ışık çiti kalır, bekçi hasar alır)
  function nuke() {
    if (G.mode !== 'playing') return;
    if (G.nukeCd > 0) { A.play('deny'); return; }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], y = sy(e.wy);
      if (e.dead || y < -30 || y > H + 30 || e.type === 'whirl' || e.type === 'beam') continue;
      if (e.type === 'boss') {
        if (e.flee) continue;
        e.hp -= NUKE_BOSS_DMG; e.flash = 0.3;
        if (e.hp <= 0) kill(e, true);
      } else kill(e, true);
    }
    for (let i = 0; i < orbs.length; i++) boom(orbs[i].x, orbs[i].wy, 6, ['#ffffff', '#ff7ad1'], 70);
    orbs.length = 0;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * 6.283, v = rand(120, 420);
      part(P.x, P.wy, Math.cos(a) * v, Math.sin(a) * v + P.speed, rand(0.4, 0.9), rand(2, 4), i % 3 ? '#fff6da' : '#ffb347', true);
    }
    G.nukeCd = NUKE_CD; G.nukeT = 0.8; G.flash = 0.7; G.shake = 13;
    A.play('nuke');
  }

  function kill(e, byShot) {
    e.dead = true;
    if (e.type === 'boss') bossDown(e);
    const c = e.type === 'mine' ? ['#ffffff', '#cfeaff', '#ff6a5a', '#9fd3e6']
      : e.type === 'ice' ? ['#ffffff', '#dff4ff', '#a8dcff', '#7fc8ff']
      : e.type === 'hunter' ? ['#ffffff', '#ffd27a', '#ff6a5a', '#ff3d55'] : ['#ffffff', '#ffd27a', '#d58bff', '#ff7ad1'];
    boom(e.x, e.wy, e.type === 'turret' ? 26 : e.type === 'ice' ? 9 : 16, c, e.type === 'turret' ? 130 : 100);
    G.shake = Math.max(G.shake, e.type === 'turret' ? 5 : 3);
    A.play(e.type === 'ice' ? 'shatter' : 'explode');
    if (byShot) { addScore(PTS[e.type]); if (e.type !== 'ice') pop(e.x, e.wy + 10, '+' + PTS[e.type]); }
  }

  function updateEnts(dt) {
    const playing = G.mode === 'playing';
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i], y = sy(e.wy);
      if (e.dead || y > H + 90) { ents.splice(i, 1); continue; }
      if (y < -40) continue;
      e.flash = Math.max(0, e.flash - dt);
      if (e.type === 'beam' || e.type === 'whirl') { hazard(e, dt, playing); continue; }
      if (e.type === 'boss' && !bossUpdate(e, dt, playing)) continue;

      if (e.type === 'boat') {
        e.x += e.vx * dt;
        if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
        else if (e.x > e.maxX) { e.x = e.maxX; e.vx = -Math.abs(e.vx); }
      } else if (e.type === 'skim') {
        e.x += e.vx * dt;
        if (e.x > W + 30 && e.vx > 0) e.vx = -e.vx;
        else if (e.x < -30 && e.vx < 0) e.vx = -e.vx;
      } else if (e.type === 'hunter') {
        // avcı: oyuncunun hizasına kayarak üstüne gelir
        if (playing) {
          e.wy -= 34 * e.hard * dt;
          e.x = approach(e.x, P.x, 58 * e.hard * dt);
        }
      } else if (e.type === 'turret') {
        e.ang = Math.atan2(y - PSY, P.x - e.x);          // namlu oyuncuya döner (matematik açısı, y yukarı)
        if (playing && y > 8 && y < PSY - 90) {
          e.cd -= dt;
          if (e.cd <= 0) {
            const dx = P.x - e.x, dy = (P.wy + P.speed * 0.3) - e.wy, len = Math.hypot(dx, dy) || 1, v = 112 * e.hard * (0.85 + 0.15 * G.sm);
            orbs.push({ x: e.x, wy: e.wy, vx: dx / len * v, vy: dy / len * v });
            e.cd = e.rate;
            A.play('orb');
          }
        }
      }
      if (!playing) continue;

      for (let j = shots.length - 1; j >= 0; j--) {
        const s = shots[j];
        if (Math.abs(s.x - e.x) < e.hw + 2 && Math.abs(s.wy - e.wy) < e.hh + 6) {
          shots.splice(j, 1);
          e.hp -= s.dmg || 1;
          if (e.hp <= 0) kill(e, true);
          else { e.flash = 0.14; A.play('hit'); boom(s.x, s.wy, 5, ['#ffffff', '#ffd27a'], 60); }
          break;
        }
      }
      if (e.dead) continue;
      if (P.inv <= 0 && !cfg.god && Math.abs(P.x - e.x) < e.hw + 5 && Math.abs(P.wy - e.wy) < e.hh + 8) {
        kill(e, false);
        die('crash');
      }
    }
  }

  function updateShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.wy += s.v * dt;
      if (s.vx) s.x += s.vx * dt;
      if (sy(s.wy) < -14 || s.x < -12 || s.x > W + 12) { shots.splice(i, 1); continue; }
      if (solid(s.x, s.wy)) {
        boom(s.x, s.wy, 4, ['#ffffff', '#cfeaff'], 50);
        shots.splice(i, 1);
      }
    }
  }

  function updateOrbs(dt) {
    const playing = G.mode === 'playing';
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      o.x += o.vx * dt; o.wy += o.vy * dt;
      const y = sy(o.wy);
      if (y > H + 20 || y < -60 || o.x < -20 || o.x > W + 20) { orbs.splice(i, 1); continue; }
      if (!playing) continue;
      let gone = false;
      for (let j = shots.length - 1; j >= 0; j--) {
        const s = shots[j];
        if (Math.abs(s.x - o.x) < 8 && Math.abs(s.wy - o.wy) < 11) {
          shots.splice(j, 1); orbs.splice(i, 1); gone = true;
          boom(o.x, o.wy, 8, ['#ffffff', '#ff7ad1', '#d58bff'], 70);
          addScore(PTS.orb); pop(o.x, o.wy + 8, '+' + PTS.orb);
          A.play('hit');
          break;
        }
      }
      if (gone) continue;
      if (P.inv <= 0 && !cfg.god && Math.abs(P.x - o.x) < 8 && Math.abs(P.wy - o.wy) < 11) {
        orbs.splice(i, 1);
        die('crash');
      }
    }
  }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.wy += p.vy * dt;
      p.vx *= 1 - 1.8 * dt; p.vy *= 1 - 1.8 * dt;
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].life -= dt;
      if (pops[i].life <= 0) pops.splice(i, 1);
    }
  }

  const flakes = [];
  for (let i = 0; i < 44; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, s: rand(0.8, 2), v: rand(20, 60), d: rand(-12, 12) });
  function updateSnow(dt, speed) {
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.y += (f.v + speed * 0.55 * f.s * 0.6) * dt; f.x += (f.d + G.wind * 3.2 * f.s * 0.6) * dt;
      if (f.y > H + 4) { f.y = -4; f.x = Math.random() * W; }
      if (f.x < -4) f.x = W + 4; else if (f.x > W + 4) f.x = -4;
    }
  }

  let cursorHidden = false;
  function update(dt) {
    G.t += dt;
    const hide = mouse.active && G.mode === 'playing';
    if (hide !== cursorHidden) { cursorHidden = hide; canvas.style.cursor = hide ? 'none' : ''; }
    G.shake = Math.max(0, G.shake - dt * 22);
    G.flash = Math.max(0, G.flash - dt);
    G.deny = Math.max(0, G.deny - dt);
    G.nukeT = Math.max(0, G.nukeT - dt);
    G.sensT = Math.max(0, G.sensT - dt);
    G.banner.t += dt;
    let scroll = 0;

    if (G.mode === 'title') {
      P.wy += 55 * dt; scroll = 55;
      setPal(dt, LV.info(LV.sectionAtRow(Math.floor(P.wy / ROW))).pal);
      G.fog *= 1 - Math.min(1, dt * 2); G.wind = 0;
      A.stopEngine(); A.setWind(0);
    } else if (G.mode === 'playing') {
      updatePlayer(dt);
      updateShots(dt); updateEnts(dt); updateOrbs(dt);
      scroll = P.speed;
      setPal(dt, sec(G.sec).info.pal);
      G.fog += ((sec(G.sec).info.fog || 0) - G.fog) * Math.min(1, dt * 0.9);
    } else if (G.mode === 'dying') {
      updateEnts(dt); updateOrbs(dt);
      G.deathT -= dt;
      if (G.deathT <= 0) afterDeath();
    } else if (G.mode === 'gameover') {
      G.overT += dt;
      updateEnts(dt);
      A.stopEngine(); A.setWind(0);
    } else if (G.mode === 'paused') {
      return;
    }
    updateParts(dt);
    updateSnow(dt, scroll);
  }

  // ------------------------------------------------------------ çizim
  let px = 1;
  function resize() {
    // yan paneller görünüyorsa onların kapladığı yeri düş
    let used = 0;
    document.querySelectorAll('.side').forEach(function (el) { if (el.offsetParent !== null) used += el.offsetWidth + 40; });
    const vh = window.innerHeight, vw = window.innerWidth - used - (used ? 32 : 0);
    const ch = Math.max(200, Math.min(vh, vw * H / W)), cw = ch * W / H;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    px = cw * dpr / W;
    canvas.width = Math.round(W * px); canvas.height = Math.round(H * px);
  }
  window.addEventListener('resize', resize);

  function text(s, x, y, size, color, align, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.fillStyle = 'rgba(3,9,16,0.7)';
    ctx.fillText(s, x + 1, y + 1.5);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }
  let ROUND = 0;                 // > 0 iken poly() köşeleri bu kalınlıkta yuvarlatır
  const ES = 0.99, PS = 0.91;    // düşman ve kızak çizim ölçeği (çarpışma kutuları aynı kalır)
  function poly(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
    if (ROUND) { ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = ROUND; ctx.stroke(); }
  }
  function glow(x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + color + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + color + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawWater() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, col.water1); g.addColorStop(1, col.water2);
    ctx.fillStyle = g;
    ctx.fillRect(-12, -12, W + 24, H + 24);

    // suya vuran ışık şeritleri
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 3; b++) {
      const baseX = W * (0.18 + 0.32 * b), ph = b * 2.1 + G.t * 0.22 + P.wy * 0.0035, wd = 26 + b * 9;
      const xs = [];
      ctx.beginPath();
      for (let y = -20, i = 0; y <= H + 20; y += 40, i++) {
        xs[i] = baseX + Math.sin(y * 0.008 + ph) * 52 + Math.sin(y * 0.021 - ph * 1.3) * 18;
        if (i === 0) ctx.moveTo(xs[i] - wd, y); else ctx.lineTo(xs[i] - wd, y);
      }
      for (let y = H + 20, i = xs.length - 1; i >= 0; y -= 40, i--) ctx.lineTo(xs[i] + wd, y);
      ctx.closePath();
      ctx.fillStyle = rgba(b % 2 ? 'aur2' : 'aur1', 0.075);
      ctx.fill();
    }
    ctx.restore();

    // akıntı çizgileri
    const cell = 48, c0 = Math.floor((P.wy - (H - PSY)) / cell) - 1, c1 = Math.floor((P.wy + PSY) / cell) + 1;
    ctx.strokeStyle = rgba('streak', 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = c0; c <= c1; c++) {
      for (let q = 0; q < 3; q++) {
        const hx = hash(c * 3.1 + q * 17.7) * W, hy = c * cell + hash(c * 9.7 + q * 3.3) * cell, len = 8 + hash(c + q * 5.5) * 22;
        const y = sy(hy);
        ctx.moveTo(hx, y); ctx.lineTo(hx, y - len);
      }
    }
    ctx.stroke();

    // hızlı akıntı: ileri akan oklar
    const sA = LV.sectionAtRow(Math.max(0, Math.floor((P.wy - (H - PSY)) / ROW))), sB = LV.sectionAtRow(Math.max(0, Math.ceil((P.wy + PSY) / ROW)));
    for (let k = sA; k <= sB; k++) {
      const rp = sec(k).rapids;
      for (let i = 0; i < rp.length; i++) {
        if (rp[i].y1 < P.wy - (H - PSY) || rp[i].y0 > P.wy + PSY) continue;
        ctx.strokeStyle = 'rgba(235,250,255,0.34)'; ctx.lineWidth = 2;
        ctx.beginPath();
        const off = (G.t * 140) % 44;
        for (let wy = rp[i].y0 + off; wy < rp[i].y1; wy += 44) {
          const y = sy(wy);
          if (y < -10 || y > H + 10) continue;
          const t = terrain(wy, T2);
          for (let x = t.L + 22; x < t.R - 14; x += 34) {
            if (t.IR > t.IL && x > t.IL - 12 && x < t.IR + 12) continue;
            ctx.moveTo(x - 7, y + 6); ctx.lineTo(x, y - 3); ctx.lineTo(x + 7, y + 6);
          }
        }
        ctx.stroke();
      }
    }
  }

  const vr = { n: 0, y: [], L: [], R: [], IL: [], IR: [], gA: 0, gB: 0 };
  function collectRows() {
    const gA = Math.floor((P.wy - (H - PSY)) / ROW) - 3, gB = Math.ceil((P.wy + PSY) / ROW) + 3;
    let n = 0;
    for (let g = gA; g <= gB; g++, n++) {
      rowAt(g, T0);
      vr.y[n] = sy(g * ROW); vr.L[n] = T0.L; vr.R[n] = T0.R; vr.IL[n] = T0.IL; vr.IR[n] = T0.IR;
    }
    vr.n = n; vr.gA = gA; vr.gB = gB;
  }
  function sidePath(arr, off, wall, close) {
    ctx.beginPath();
    if (close) ctx.moveTo(wall, vr.y[0]);
    for (let i = 0; i < vr.n; i++) {
      if (i === 0 && !close) ctx.moveTo(arr[i] + off, vr.y[i]); else ctx.lineTo(arr[i] + off, vr.y[i]);
    }
    if (close) { ctx.lineTo(wall, vr.y[vr.n - 1]); ctx.closePath(); }
  }
  function islandPath(a, b, shrink) {
    const ma = (vr.IL[a] + vr.IR[a]) / 2, mb = (vr.IL[b] + vr.IR[b]) / 2;
    ctx.beginPath();
    ctx.moveTo(ma, vr.y[a] + ROW * 0.8 - shrink);
    for (let i = a; i <= b; i++) ctx.lineTo(Math.min(vr.IL[i] + shrink, (vr.IL[i] + vr.IR[i]) / 2), vr.y[i]);
    ctx.lineTo(mb, vr.y[b] - ROW * 0.8 + shrink);
    for (let i = b; i >= a; i--) ctx.lineTo(Math.max(vr.IR[i] - shrink, (vr.IL[i] + vr.IR[i]) / 2), vr.y[i]);
    ctx.closePath();
  }

  function drawBanks() {
    ctx.lineJoin = 'round';
    // su altındaki buz rafı
    ctx.fillStyle = rgba('ice', 0.2);
    sidePath(vr.L, 7, -20, true); ctx.fill();
    sidePath(vr.R, -7, W + 20, true); ctx.fill();
    // kar
    ctx.fillStyle = col.snow;
    sidePath(vr.L, 0, -20, true); ctx.fill();
    sidePath(vr.R, 0, W + 20, true); ctx.fill();
    ctx.fillStyle = col.snow2;
    sidePath(vr.L, -11, -20, true); ctx.fill();
    sidePath(vr.R, 11, W + 20, true); ctx.fill();
    // buz kenarı
    ctx.strokeStyle = col.ice; ctx.lineWidth = 2.2;
    sidePath(vr.L, 0, 0, false); ctx.stroke();
    sidePath(vr.R, 0, 0, false); ctx.stroke();

    // adalar
    let a = -1;
    for (let i = 0; i <= vr.n; i++) {
      const has = i < vr.n && vr.IR[i] > vr.IL[i];
      if (has && a < 0) a = i;
      else if (!has && a >= 0) {
        const b = i - 1;
        ctx.save(); ctx.translate(0, 0);
        ctx.fillStyle = rgba('ice', 0.2); islandPath(a, b, -6); ctx.fill();
        ctx.fillStyle = col.snow; islandPath(a, b, 0); ctx.fill();
        ctx.strokeStyle = col.ice; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.fillStyle = col.snow2; islandPath(a, b, 8); ctx.fill();
        ctx.restore();
        a = -1;
      }
    }
  }

  function drawDeco() {
    const yLo = P.wy - (H - PSY) - 6, yHi = P.wy + PSY + 24;
    const kA = LV.sectionAtRow(Math.max(0, vr.gA)), kB = LV.sectionAtRow(Math.max(0, vr.gB));
    for (let k = kB; k >= kA; k--) {
      const dd = sec(k).deco;
      for (let i = 0; i < dd.length; i++) {
        const o = dd[i];
        if (o.y > yHi) continue;
        if (o.y < yLo) break;
        const x = o.x, y = sy(o.y), s = o.s * 0.9;
        if (o.k === 0) {
          ctx.fillStyle = 'rgba(20,40,60,0.16)';
          ctx.beginPath(); ctx.ellipse(x + 3.5 * s, y + 1, 5.5 * s, 2.4 * s, 0, 0, 6.3); ctx.fill();
          ctx.fillStyle = col.tree;
          poly([x, y - 14 * s, x + 5.5 * s, y, x - 5.5 * s, y]);
          ctx.fillStyle = col.snow2;
          poly([x, y - 14 * s, x + 2.6 * s, y - 7.5 * s, x - 2.6 * s, y - 7.5 * s]);
        } else if (o.k === 1) {
          ctx.fillStyle = 'rgba(20,40,60,0.16)';
          ctx.beginPath(); ctx.ellipse(x + 2, y + 1, 6 * s, 2.5 * s, 0, 0, 6.3); ctx.fill();
          ctx.fillStyle = '#6f8098';
          poly([x - 5 * s, y, x - 3 * s, y - 5 * s, x + 2 * s, y - 6.5 * s, x + 5.5 * s, y - 2 * s, x + 4 * s, y]);
          ctx.fillStyle = '#a9b8cc';
          poly([x - 3 * s, y - 5 * s, x + 2 * s, y - 6.5 * s, x + 1 * s, y - 3 * s]);
        } else {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          glow(x, y - 3, 16, '255,200,110', (0.28 + 0.06 * Math.sin(G.t * 3 + o.y)) * (0.15 + 0.85 * G.night));
          ctx.restore();
          ctx.fillStyle = '#5a3a2c'; ctx.fillRect(x - 7, y - 7, 14, 7);
          ctx.fillStyle = col.snow2; poly([x - 9, y - 6.5, x, y - 13, x + 9, y - 6.5]);
          ctx.fillStyle = '#ffd98a'; ctx.fillRect(x - 1.5, y - 5, 3, 3);
        }
      }
    }
  }

  function drawVents() {
    const yLo = P.wy - (H - PSY) - 50, yHi = P.wy + PSY + 50;
    const kA = LV.sectionAtRow(Math.max(0, vr.gA)), kB = LV.sectionAtRow(Math.max(0, vr.gB));
    for (let k = kA; k <= kB; k++) {
      const vs = sec(k).vents;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (v.y < yLo || v.y > yHi) continue;
        const x = v.x, y = sy(v.y), pulse = 0.5 + 0.5 * Math.sin(G.t * 3.2 + v.y);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(x, y); ctx.scale(1, 2.1);
        glow(0, 0, 30, '255,160,70', 0.34 + pulse * 0.12);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,186,104,' + (0.42 + pulse * 0.14) + ')';
        ctx.beginPath(); ctx.roundRect(x - v.hw, y - v.hl, v.hw * 2, v.hl * 2, v.hw); ctx.fill();
        ctx.strokeStyle = 'rgba(255,232,190,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
        // yükselen sıcak kabarcıklar
        ctx.fillStyle = 'rgba(255,244,214,0.9)';
        for (let q = 0; q < 5; q++) {
          const ph = (G.t * 0.55 + q * 0.2 + hash(v.y + q)) % 1;
          const bx = x + (hash(v.y * 1.7 + q * 9.1) - 0.5) * (v.hw * 1.3), by = y + v.hl - 6 - ph * (v.hl * 2 - 12);
          const r = 1.2 + 1.3 * Math.sin(ph * Math.PI);
          ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.3); ctx.fill();
        }
      }
    }
  }

  function drawGates() {
    const kA = LV.sectionAtRow(Math.max(0, vr.gA)), kB = LV.sectionAtRow(Math.max(0, vr.gB));
    for (let k = kA; k <= kB; k++) {
      const s = sec(k), y = sy(s.gateY);
      if (y < -30 || y > H + 30) continue;
      const passed = G.mode !== 'title' && k < G.sec;
      const rgb = passed ? '125,255,176' : '255,214,130';
      const xl = W / 2 - GATE - 3, xr = W / 2 + GATE + 3, pulse = 0.55 + 0.45 * Math.sin(G.t * 5);
      // ışık hattı
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.35 + 0.3 * pulse) + ')';
      ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -G.t * 22;
      ctx.beginPath(); ctx.moveTo(xl + 5, y); ctx.lineTo(xr - 5, y); ctx.stroke();
      ctx.setLineDash([]);
      for (let q = 0; q < 2; q++) {
        const x = q ? xr : xl;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(x, y - 9, 30, rgb, 0.4 + 0.25 * pulse);
        ctx.restore();
        ctx.fillStyle = 'rgba(20,40,60,0.2)';
        ctx.beginPath(); ctx.ellipse(x + 3, y + 2, 7, 3, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#2a3646'; ctx.fillRect(x - 3, y - 12, 6, 14);
        ctx.fillStyle = '#e9eef6'; ctx.fillRect(x - 3, y - 6, 6, 3);
        ctx.fillStyle = 'rgb(' + rgb + ')'; ctx.fillRect(x - 3.5, y - 17, 7, 6);
        ctx.fillStyle = '#2a3646'; poly([x - 5, y - 17, x, y - 22, x + 5, y - 17]);
      }
      text('ETAP ' + ((k + 1) % NSEC + 1), xr + 12, y + 3, 11, 'rgba(' + rgb + ',0.95)', 'left', 700);
    }
  }

  function drawEnts() {
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], y = sy(e.wy);
      if (y < -30 || y > H + 30 || e.dead) continue;
      const x = e.x, fl = e.flash > 0;
      const big = e.type === 'mine' || e.type === 'boat' || e.type === 'skim' || e.type === 'hunter' || e.type === 'turret';
      if (big) { ctx.save(); ctx.translate(x, y); ctx.scale(ES, ES); ctx.translate(-x, -y); }
      if (e.type === 'mine') {
        const bob = Math.sin(G.t * 2.4 + e.ph) * 1.2, yy = y + bob;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x + 2, yy + 3, 8, 5, 0, 0, 6.3); ctx.fill();
        ctx.strokeStyle = '#dff1ff'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let q = 0; q < 6; q++) {
          const a = q * 1.047 + e.ph + G.t * 0.4;
          ctx.moveTo(x + Math.cos(a) * 4, yy + Math.sin(a) * 4);
          ctx.lineTo(x + Math.cos(a) * 9.5, yy + Math.sin(a) * 9.5);
        }
        ctx.stroke();
        ctx.fillStyle = '#b9d6ea'; ctx.beginPath(); ctx.arc(x, yy, 6, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.arc(x - 1.5, yy - 1.5, 3.2, 0, 6.3); ctx.fill();
        const blink = Math.sin(G.t * 6 + e.ph) > 0.2;
        ctx.fillStyle = blink ? '#ff4d4d' : '#7a2a35';
        ctx.beginPath(); ctx.arc(x, yy, 2, 0, 6.3); ctx.fill();
        if (blink) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, yy, 9, '255,80,80', 0.5); ctx.restore(); }
      } else if (e.type === 'boat') {
        const d = e.vx >= 0 ? 1 : -1;
        // dümen suyu
        ctx.strokeStyle = 'rgba(210,235,255,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - d * 12, y - 3); ctx.lineTo(x - d * 24, y - 6);
        ctx.moveTo(x - d * 12, y + 3); ctx.lineTo(x - d * 24, y + 6);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(x + 2, y + 4, 12, 5, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = fl ? '#ffffff' : '#8a4fd6';
        poly([x + d * 14, y, x + d * 6, y - 6, x - d * 11, y - 6, x - d * 13, y, x - d * 11, y + 6, x + d * 6, y + 6]);
        ctx.fillStyle = fl ? '#ffffff' : '#c59cff';
        poly([x + d * 14, y, x + d * 6, y - 6, x - d * 11, y - 6, x - d * 12, y - 1, x + d * 5, y - 1]);
        ctx.fillStyle = '#2a1d47'; ctx.fillRect(x - d * 6 - 4, y - 3, 8, 6);
        ctx.fillStyle = '#ff7ad1'; ctx.fillRect(x - d * 6 - 1.5, y - 1.5, 3, 3);
      } else if (e.type === 'skim') {
        const d = e.vx >= 0 ? 1 : -1, hov = Math.sin(G.t * 9 + e.ph) * 1;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        poly([x + d * 9 + 5, y + 9, x - d * 9 + 5, y + 3, x - d * 9 + 5, y + 15]);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(x - d * 10, 0, x - d * 40, 0);
        g.addColorStop(0, 'rgba(255,122,209,0.5)'); g.addColorStop(1, 'rgba(255,122,209,0)');
        ctx.fillStyle = g; ctx.fillRect(Math.min(x - d * 10, x - d * 40), y - 1.5 + hov, 30, 3);
        ctx.restore();
        ctx.fillStyle = fl ? '#ffffff' : '#ff5fb8';
        poly([x + d * 12, y + hov, x - d * 9, y - 7 + hov, x - d * 5, y + hov, x - d * 9, y + 7 + hov]);
        ctx.fillStyle = '#ffd0ec';
        poly([x + d * 12, y + hov, x - d * 9, y - 7 + hov, x - d * 5, y + hov]);
        ctx.fillStyle = '#3a1640'; ctx.beginPath(); ctx.arc(x + d * 1, y + hov, 2, 0, 6.3); ctx.fill();
      } else if (e.type === 'beam') {
        const flick = Math.floor(G.t * 16) % 2 === 0;
        if (e.on) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,60,110,0.3)'; ctx.lineWidth = 9;
          ctx.beginPath(); ctx.moveTo(e.minX, y); ctx.lineTo(e.maxX, y); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,170,190,0.95)'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(e.minX, y + (flick ? 0.6 : -0.6)); ctx.lineTo(e.maxX, y + (flick ? -0.6 : 0.6)); ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = e.warn ? (flick ? 'rgba(255,120,150,0.8)' : 'rgba(255,120,150,0.25)') : 'rgba(255,150,170,0.22)';
          ctx.lineWidth = 1.2; ctx.setLineDash([3, 7]);
          ctx.beginPath(); ctx.moveTo(e.minX, y); ctx.lineTo(e.maxX, y); ctx.stroke();
          ctx.setLineDash([]);
        }
        for (let q = 0; q < 2; q++) {
          const px0 = q ? e.maxX : e.minX;
          ctx.fillStyle = '#2a3140'; ctx.fillRect(px0 - 4, y - 7, 8, 14);
          ctx.fillStyle = e.on ? '#ff5a7d' : e.warn && flick ? '#ffb0c0' : '#6b4a58';
          ctx.fillRect(px0 - 2, y - 3, 4, 6);
        }
      } else if (e.type === 'whirl') {
        ctx.fillStyle = 'rgba(2,10,20,0.35)';
        ctx.beginPath(); ctx.arc(x, y, e.r * 0.42, 0, 6.3); ctx.fill();
        ctx.lineCap = 'round';
        for (let q = 0; q < 4; q++) {
          const rr = e.r * (0.22 + q * 0.24), a0 = -G.t * (3.2 - q * 0.6) + q * 1.7 + e.ph;
          ctx.strokeStyle = 'rgba(210,240,255,' + (0.62 - q * 0.12) + ')'; ctx.lineWidth = 2.2 - q * 0.3;
          ctx.beginPath(); ctx.arc(x, y, rr, a0, a0 + 2.3); ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, rr, a0 + 3.14, a0 + 5.0); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        ctx.fillStyle = '#04101c'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.3); ctx.fill();
      } else if (e.type === 'boss') {
        const hpf = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(x + 5, y + 10, 40, 16, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = fl ? '#ffffff' : '#2b3446';
        poly([x - 38, y - 4, x - 24, y - 15, x + 24, y - 15, x + 38, y - 4, x + 26, y + 13, x, y + 19, x - 26, y + 13]);
        ctx.fillStyle = fl ? '#ffffff' : '#4a5873';
        poly([x - 38, y - 4, x - 24, y - 15, x + 24, y - 15, x + 38, y - 4, x + 20, y - 1, x - 20, y - 1]);
        ctx.fillStyle = '#8a4fd6'; ctx.fillRect(x - 34, y - 2, 10, 5); ctx.fillRect(x + 24, y - 2, 10, 5);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(x, y + 5, 20, hpf > 0.4 ? '255,90,170' : '255,70,60', 0.55 + 0.25 * Math.sin(G.t * (hpf > 0.4 ? 5 : 12)));
        ctx.restore();
        ctx.fillStyle = hpf > 0.4 ? '#ff5fb8' : '#ff5a4d';
        ctx.beginPath(); ctx.arc(x, y + 5, 6.5, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#fff0fa'; ctx.beginPath(); ctx.arc(x - 1.5, y + 3.5, 2.6, 0, 6.3); ctx.fill();
      } else if (e.type === 'ice') {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x - 8, y - 4, 18, 13);
        ctx.fillStyle = fl ? '#ffffff' : (e.hp > 1 ? '#8fcdf5' : '#bfe6ff');
        ctx.beginPath(); ctx.roundRect(x - 9, y - 7, 18, 14, 3); ctx.fill();
        ctx.fillStyle = '#f2fbff';
        poly([x - 8, y - 6, x + 3, y - 6, x - 3, y + 1, x - 8, y + 2]);
        ctx.strokeStyle = 'rgba(70,140,190,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 2, y - 7); ctx.lineTo(x - 1, y - 1); ctx.lineTo(x + 4, y + 2); ctx.lineTo(x + 2, y + 7); ctx.stroke();
      } else if (e.type === 'hunter') {
        const wob = Math.sin(G.t * 11 + e.ph) * 1.2;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        poly([x + 5, y + 20, x + 14, y + 3, x - 4, y + 3]);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(x, y - 8, 12, '255,90,80', 0.5);
        ctx.restore();
        ctx.fillStyle = fl ? '#ffffff' : '#e8324a';
        poly([x + wob, y + 11, x + 10, y - 8, x + wob * 0.5, y - 3, x - 10, y - 8]);
        ctx.fillStyle = fl ? '#ffffff' : '#ff8a7a';
        poly([x + wob, y + 11, x - 10, y - 8, x + wob * 0.5, y - 3]);
        ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(x + wob * 0.6, y + 1, 2.2, 0, 6.3); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 12, 9, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#39465a'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.3); ctx.fill();
        ctx.fillStyle = fl ? '#ffffff' : '#5c6d86'; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.3); ctx.fill();
        const ax = Math.cos(e.ang), ay = -Math.sin(e.ang);
        ctx.strokeStyle = '#1b2431'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ax * 12, y + ay * 12); ctx.stroke();
        ctx.lineCap = 'butt';
        const warn = e.cd < 0.5 && y > 8 && y < PSY - 90;
        ctx.fillStyle = warn ? '#ff5a5a' : (e.hp > 1 ? '#ff9fe0' : '#ffb347');
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.3); ctx.fill();
        if (warn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y, 14, '255,80,80', 0.6); ctx.restore(); }
      }
      if (big) ctx.restore();
    }
  }

  function coinIcon(x, y, r, squash) {
    ctx.fillStyle = '#b97a12';
    ctx.beginPath(); ctx.ellipse(x, y + 1, r * squash, r, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffcf3d';
    ctx.beginPath(); ctx.ellipse(x, y, r * squash, r, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.ellipse(x - r * 0.25 * squash, y - r * 0.25, r * 0.42 * squash, r * 0.42, 0, 0, 6.3); ctx.fill();
  }
  function drawCoins() {
    for (let i = 0; i < coinsL.length; i++) {
      const c = coinsL[i], y = sy(c.wy);
      if (y < -20 || y > H + 20) continue;
      const big = c.v > 1, r = big ? 7.1 : 4.5, squash = 0.35 + 0.65 * Math.abs(Math.cos(G.t * 3.2 + c.ph));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(c.x, y, big ? 20 : 11, '255,205,70', big ? 0.5 : 0.3);
      ctx.restore();
      coinIcon(c.x, y, r, squash);
    }
  }
  function drawFog() {
    if (G.fog < 0.02) return;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    g.addColorStop(0, 'rgba(168,188,206,' + (0.97 * G.fog) + ')');
    g.addColorStop(0.55, 'rgba(168,188,206,' + (0.8 * G.fog) + ')');
    g.addColorStop(1, 'rgba(168,188,206,0)');
    ctx.fillStyle = g; ctx.fillRect(-12, -12, W + 24, H * 0.62 + 12);
    // süzülen sis bulutları
    ctx.fillStyle = 'rgba(200,214,226,' + (0.1 * G.fog) + ')';
    for (let q = 0; q < 5; q++) {
      const fx = ((G.t * (8 + q * 3) + q * 97) % (W + 160)) - 80, fy = 250 + q * 34 + Math.sin(G.t * 0.5 + q) * 12;
      ctx.beginPath(); ctx.ellipse(fx, fy, 90, 22, 0, 0, 6.3); ctx.fill();
    }
  }

  function drawNight() {
    const n = G.night;
    if (n < 0.03) return;
    const playing = G.mode !== 'title';
    // kızağın çevresi ve önü aydınlık, uzaklar karanlık
    const cx = playing ? P.x : W / 2, cy = PSY - 70;
    const g = ctx.createRadialGradient(cx, cy, 50, cx, cy, 300);
    g.addColorStop(0, 'rgba(3,8,22,' + (playing ? 0 : 0.2 * n) + ')');
    g.addColorStop(0.45, 'rgba(3,8,22,' + (0.3 * n) + ')');
    g.addColorStop(1, 'rgba(3,8,22,' + (0.62 * n) + ')');
    ctx.fillStyle = g; ctx.fillRect(-12, -12, W + 24, H + 24);

    // ışık kaynakları karanlığı deler
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const kA = LV.sectionAtRow(Math.max(0, vr.gA)), kB = LV.sectionAtRow(Math.max(0, vr.gB));
    for (let k = kA; k <= kB; k++) {
      const s = sec(k), vs = s.vents;
      for (let i = 0; i < vs.length; i++) {
        const y = sy(vs[i].y);
        if (y > -50 && y < H + 50) glow(vs[i].x, y, 40, '255,170,80', 0.32 * n);
      }
      const gy = sy(s.gateY);
      if (gy > -40 && gy < H + 40) {
        const rgb = playing && k < G.sec ? '125,255,176' : '255,214,130';
        glow(W / 2 - GATE - 3, gy - 9, 40, rgb, 0.4 * n); glow(W / 2 + GATE + 3, gy - 9, 40, rgb, 0.4 * n);
      }
    }
    if (playing) {
      for (let i = 0; i < coinsL.length; i++) {
        const y = sy(coinsL[i].wy);
        if (y > -20 && y < H + 20) glow(coinsL[i].x, y, coinsL[i].v > 1 ? 16 : 10, '255,205,70', 0.4 * n);
      }
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i], y = sy(e.wy);
        if (y < -30 || y > H + 30 || e.dead) continue;
        if (e.type === 'whirl') glow(e.x, y, 30, '150,210,255', 0.16 * n);
        else if (e.type === 'beam') { glow(e.minX, y, 16, '255,90,130', 0.45 * n); glow(e.maxX, y, 16, '255,90,130', 0.45 * n); }
        else if (e.type === 'boss') glow(e.x, y, 54, '255,110,190', 0.4 * n);
        else if (e.type === 'mine') glow(e.x, y, 12, '255,90,90', 0.4 * n);
        else if (e.type === 'hunter') glow(e.x, y, 18, '255,80,70', 0.45 * n);
        else if (e.type === 'ice') glow(e.x, y, 12, '190,230,255', 0.2 * n);
        else if (e.type === 'turret') glow(e.x, y, 16, '255,150,220', 0.35 * n);
        else glow(e.x, y, 16, '255,122,209', 0.35 * n);
      }
      for (let i = 0; i < shots.length; i++) glow(shots[i].x, sy(shots[i].wy), 18, '255,220,140', 0.45 * n);
      for (let i = 0; i < orbs.length; i++) glow(orbs[i].x, sy(orbs[i].wy), 18, '255,90,170', 0.5 * n);
    }
    ctx.restore();
  }

  // Günün saati: gündüz güneş, gece hilal
  function todIcon(x, y) {
    if (G.night < 0.5) {
      const dim = 1 - G.night;
      ctx.strokeStyle = 'rgba(255,217,90,' + (0.5 + 0.5 * dim) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4; ctx.moveTo(x + Math.cos(a) * 4.6, y + Math.sin(a) * 4.6); ctx.lineTo(x + Math.cos(a) * 6.6, y + Math.sin(a) * 6.6); }
      ctx.stroke();
      ctx.fillStyle = G.night > 0.2 ? '#ffb36b' : '#ffd95a';
      ctx.beginPath(); ctx.arc(x, y, 3.3, 0, 6.3); ctx.fill();
    } else {
      ctx.fillStyle = '#e8f0ff';
      ctx.beginPath(); ctx.arc(x, y, 4.6, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgb(6,14,24)';
      ctx.beginPath(); ctx.arc(x + 2.4, y - 1.2, 4, 0, 6.3); ctx.fill();
    }
  }

  function drawShots() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i], y = sy(s.wy);
      const ux = s.vx || 0, uy = -(s.v - P.speed), ul = Math.hypot(ux, uy) || 1, tx = -ux / ul * 18, ty = -uy / ul * 18;
      glow(s.x, y, s.pellet ? 8 : 9, s.dmg > 1 ? '255,170,110' : '255,220,140', 0.7);
      const g = ctx.createLinearGradient(s.x, y, s.x + tx, y + ty);
      g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x + tx, y + ty); ctx.stroke();
    }
    ctx.restore();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#fffbe8';
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      if (s.pellet) { ctx.beginPath(); ctx.arc(s.x, sy(s.wy), 2.2, 0, 6.3); ctx.fill(); }
      else ctx.fillRect(s.x - 1.5, sy(s.wy) - 5, 3, 9);
    }
  }

  function drawOrbs() {
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i], y = sy(o.wy);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(o.x, y, 13, '255,90,170', 0.75);
      ctx.restore();
      ctx.fillStyle = '#ff5fb8'; ctx.beginPath(); ctx.arc(o.x, y, 4.2, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#fff0fa'; ctx.beginPath(); ctx.arc(o.x, y, 2, 0, 6.3); ctx.fill();
    }
  }

  function drawPlayer() {
    if (P.inv > 0 && Math.floor(G.t * 14) % 2 === 0) return;
    const x = P.x, y = PSY, t = P.tilt;
    // far ışığı
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, y - 10, 0, y - 140);
    g.addColorStop(0, 'rgba(255,232,180,' + (0.05 + 0.27 * G.night) + ')'); g.addColorStop(1, 'rgba(255,232,180,0)');
    ctx.fillStyle = g;
    poly([x - 3, y - 10, x - 36 + t * 26, y - 140, x + 36 + t * 26, y - 140, x + 3, y - 10]);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y); ctx.rotate(t * 0.2); ctx.scale(PS * (1 - Math.abs(t) * 0.16), PS);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(3, 5, 9, 12, 0, 0, 6.3); ctx.fill();
    // itici alevi
    const fl = 6 + clamp((P.speed / G.sm - SPEED_MIN) / (SPEED_MAX - SPEED_MIN), 0, 1) * 13 + Math.random() * 3;
    ctx.fillStyle = '#ffb347'; poly([-3.2, 10, 3.2, 10, 0, 10 + fl]);
    ctx.fillStyle = '#fff6da'; poly([-1.6, 10, 1.6, 10, 0, 10 + fl * 0.55]);
    // kızak ayakları
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#141c28'; ctx.lineWidth = 4.2;       // koyu dış hat: gündüz açık suda seçilsin
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-9, 11); ctx.moveTo(9, -6); ctx.lineTo(9, 11); ctx.stroke();
    ctx.strokeStyle = '#dbe6f2'; ctx.lineWidth = 2.4;       // açık metal: gece de görünsün
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-9, 11); ctx.moveTo(9, -6); ctx.lineTo(9, 11); ctx.stroke();
    ctx.strokeStyle = '#8fa3ba'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-9, 3); ctx.lineTo(-4, 4); ctx.moveTo(9, 3); ctx.lineTo(4, 4); ctx.moveTo(-9, -2); ctx.lineTo(-4, -1); ctx.moveTo(9, -2); ctx.lineTo(4, -1); ctx.stroke();
    ctx.lineCap = 'butt';
    // gövde
    ctx.fillStyle = '#f26a1b'; poly([0, -14, 6, -2, 6.5, 8, 3, 11, -3, 11, -6.5, 8, -6, -2]);
    ctx.fillStyle = '#ff9a4d'; poly([0, -14, -6, -2, -6.5, 8, -3, 11, 0, 11]);
    ctx.fillStyle = '#fff1dc'; ctx.fillRect(-4.5, 5, 9, 1.8);
    ctx.fillStyle = '#16212f'; ctx.beginPath(); ctx.ellipse(0, -2, 3.2, 5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#9fe6ff'; ctx.beginPath(); ctx.ellipse(-0.9, -3.4, 1.2, 2.2, 0, 0, 6.3); ctx.fill();
    ctx.restore();

    if (P.charge > 0) {
      const c = P.charge, full = c >= 1, pulse = full ? 0.7 + 0.3 * Math.sin(G.t * 22) : 1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(x, y - 12, 10 + 12 * c, full ? '255,250,220' : '255,200,120', (0.35 + 0.4 * c) * pulse);
      ctx.restore();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(190,215,240,0.25)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 19, 0, 6.3); ctx.stroke();
      ctx.strokeStyle = full ? 'rgba(255,255,255,' + pulse + ')' : '#ffcf8a';
      ctx.beginPath(); ctx.arc(x, y, 19, -Math.PI / 2, -Math.PI / 2 + c * Math.PI * 2); ctx.stroke();
      ctx.lineCap = 'butt';
    }

    if (G.charging) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(x, y, 26, '255,190,110', 0.35 + 0.15 * Math.sin(G.t * 18));
      ctx.restore();
    }
  }

  function drawParts() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], a = p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + a * 0.5);
      ctx.fillRect(p.x - s / 2, sy(p.wy) - s / 2, s, s);
    }
    ctx.restore();
  }
  function drawSnow() {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < flakes.length; i++) { const f = flakes[i]; ctx.fillRect(f.x, f.y, f.s, f.s); }
  }
  function drawPops() {
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i], a = Math.min(1, p.life * 2.2);
      ctx.globalAlpha = a;
      text(p.text, p.x, sy(p.wy) - (1.1 - p.life) * 26, 15, p.color, 'center', 700);
    }
    ctx.globalAlpha = 1;
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H * 0.6, H * 0.28, W / 2, H * 0.55, H * 0.78);
    g.addColorStop(0, 'rgba(2,6,12,0)'); g.addColorStop(1, 'rgba(2,6,12,' + (0.2 + 0.35 * G.night) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (G.flash > 0) { ctx.fillStyle = 'rgba(255,236,190,' + (G.flash * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  function miniShip(x, y) {
    ctx.fillStyle = '#f26a1b'; poly([x, y - 7, x + 4, y + 5, x - 4, y + 5]);
    ctx.fillStyle = '#ff9a4d'; poly([x, y - 7, x - 4, y + 5, x, y + 5]);
  }

  function drawHud() {
    // üst şerit
    const g = ctx.createLinearGradient(0, 0, 0, 74);
    g.addColorStop(0, 'rgba(3,9,16,0.8)'); g.addColorStop(1, 'rgba(3,9,16,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 74);
    text('PUAN', 12, 15, 10, 'rgba(190,215,240,0.8)', 'left', 500);
    text(String(G.score).padStart(6, '0'), 12, 36, 24, '#ffffff', 'left', 700);
    coinIcon(18, 50, 5, 1);
    text(String(G.coins), 28, 55, 15, '#ffd95a', 'left', 700);
    const loop = Math.floor(G.sec / NSEC);
    const stageLbl = 'ETAP ' + (G.sec % NSEC + 1) + '/' + NSEC + (loop ? '  ·  TUR ' + (loop + 1) : '');
    text(stageLbl, W / 2, 15, 10, 'rgba(190,215,240,0.8)', 'center', 500);
    todIcon(W / 2 - ctx.measureText(stageLbl).width / 2 - 11, 11.5);
    text(LV.info(G.sec).name.toLocaleUpperCase('tr'), W / 2, 33, 15, '#ffe9b8', 'center', 700);
    text('KIZAK', W - 12, 15, 10, 'rgba(190,215,240,0.8)', 'right', 500);
    const spare = Math.max(0, G.lives - (G.mode === 'dying' ? 1 : 0));
    for (let i = 0; i < spare; i++) miniShip(W - 17 - i * 13, 29);
    if (IS_TOUCH) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(W - 27, 46, 4, 13); ctx.fillRect(W - 19, 46, 4, 13);
    }

    // alt: ısı göstergesi
    const g2 = ctx.createLinearGradient(0, H - 58, 0, H);
    g2.addColorStop(0, 'rgba(3,9,16,0)'); g2.addColorStop(1, 'rgba(3,9,16,0.8)');
    ctx.fillStyle = g2; ctx.fillRect(0, H - 58, W, 58);
    const bx = 62, bw = 198, by = H - 27, bh = 11, f = clamp(G.heat / 100, 0, 1);
    const low = G.heat < 25, blink = low && Math.floor(G.t * 6) % 2 === 0;
    text('ISI', bx - 10, by + 10, 14, blink ? '#ff6a5a' : '#ffffff', 'right', 700);
    // yaylım atışı: bekleme süresi dolarken dolar, hazır olunca parlar, şarj edilirken turuncuya döner
    {
      const ready = G.blastCd <= 0, yb = by - 11, fr = ready ? 1 : 1 - G.blastCd / BLAST_CD;
      const flashOn = G.readyT > 0 && Math.floor(G.t * 10) % 2 === 0;
      text('YAYLIM', bx - 10, yb + 6, 9, ready ? '#ffe9b8' : 'rgba(190,215,240,0.7)', 'right', 700);
      ctx.fillStyle = 'rgba(8,18,30,0.85)'; ctx.fillRect(bx - 1, yb - 1, bw + 2, 6);
      ctx.fillStyle = ready ? (flashOn ? '#ffffff' : '#ffe27a') : 'rgba(127,184,221,0.75)';
      ctx.fillRect(bx, yb, bw * fr, 4);
      if (P.charge > 0) { ctx.fillStyle = P.charge >= 1 ? '#ffffff' : '#ff9a4d'; ctx.fillRect(bx, yb, bw * P.charge, 4); }
      if (!ready) text(Math.ceil(G.blastCd) + ' sn', bx + bw + 8, yb + 6, 9, 'rgba(190,215,240,0.8)', 'left', 700);
    }
    // nükleer patlama göstergesi
    {
      const ready = G.nukeCd <= 0, yn = by - 20, fr = ready ? 1 : 1 - G.nukeCd / NUKE_CD;
      text('NÜKLEER', bx - 10, yn + 6, 9, ready ? '#7dffb0' : 'rgba(190,215,240,0.7)', 'right', 700);
      ctx.fillStyle = 'rgba(8,18,30,0.85)'; ctx.fillRect(bx - 1, yn - 1, bw + 2, 6);
      ctx.fillStyle = ready ? (Math.floor(G.t * 3) % 2 ? '#7dffb0' : '#c8ffe0') : 'rgba(125,255,176,0.45)';
      ctx.fillRect(bx, yn, bw * fr, 4);
      if (!ready) text(Math.ceil(G.nukeCd) + ' sn', bx + bw + 8, yn + 6, 9, 'rgba(190,215,240,0.8)', 'left', 700);
    }
    ctx.fillStyle = 'rgba(8,18,30,0.85)';
    ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 7); ctx.fill();
    const cr = Math.round(92 + (255 - 92) * f), cg = Math.round(200 + (170 - 200) * f), cb = Math.round(255 + (60 - 255) * f);
    ctx.fillStyle = blink ? '#ff6a5a' : 'rgb(' + cr + ',' + cg + ',' + cb + ')';
    if (f > 0.01) { ctx.beginPath(); ctx.roundRect(bx, by, Math.max(bh, bw * f), bh, 5.5); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(bx + 4, by + 2, Math.max(0, bw * f - 8), 2.5);
    ctx.fillStyle = 'rgba(3,9,16,0.55)';
    for (let i = 1; i < 4; i++) ctx.fillRect(bx + bw * i / 4 - 0.5, by, 1, bh);
    ctx.strokeStyle = G.charging ? 'rgba(255,214,150,0.95)' : 'rgba(190,215,240,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 7); ctx.stroke();
    // hız okları
    const lvl = P.speed < 115 * G.sm ? 1 : P.speed < 200 * G.sm ? 2 : 3;
    for (let i = 0; i < 3; i++) {
      const x = bx + bw + 22 + i * 0, y = by + 12 - i * 7;
      ctx.strokeStyle = i < lvl ? '#ffe9b8' : 'rgba(190,215,240,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 5); ctx.lineTo(x + 6, y); ctx.stroke();
    }
    text('HIZ', bx + bw + 46, by + 10, 10, 'rgba(190,215,240,0.8)', 'center', 500);

    if (low && G.mode === 'playing') text('SICAK KAYNAK BUL!', W / 2, H - 60, 13, blink ? '#ff6a5a' : '#ffd0c8', 'center', 700);

    if (G.rapid && G.mode === 'playing') text('HIZLI AKINTI  ›››', W / 2, 108, 15, '#e6f8ff', 'center', 700);
    if (G.boss && !G.boss.dead && !G.boss.flee) {
      const b = G.boss, bw2 = 190, bx2 = (W - bw2) / 2, f2 = clamp(b.hp / b.maxHp, 0, 1);
      text('BEKÇİ', W / 2, 72, 11, '#ff9fe0', 'center', 700);
      ctx.fillStyle = 'rgba(8,18,30,0.85)'; ctx.fillRect(bx2 - 1, 76, bw2 + 2, 7);
      ctx.fillStyle = f2 > 0.4 ? '#ff5fb8' : '#ff5a4d'; ctx.fillRect(bx2, 77, bw2 * f2, 5);
    }
    if (G.windWarn && G.mode === 'playing') {
      const active = Math.abs(G.wind) > 4;
      if (active || Math.floor(G.t * 7) % 2 === 0) {
        text(G.windWarn > 0 ? 'RÜZGÂR  › › ›' : '‹ ‹ ‹  RÜZGÂR', W / 2, 92, 16, active ? '#ffffff' : '#ffcf8a', 'center', 700);
      }
    }

    if (G.sensT > 0 && G.mode !== 'paused') {
      ctx.globalAlpha = Math.min(1, G.sensT * 2);
      text('FARE HASSASİYETİ  ' + mouse.level + ' / 9', W / 2, 116, 15, '#ffe9b8', 'center', 700);
      ctx.globalAlpha = 1;
    }

    // etap başlığı
    const bt = G.banner.t;
    if (bt < 2.8 && G.mode !== 'gameover') {
      const a = clamp(bt * 3, 0, 1) * clamp((2.8 - bt) * 2, 0, 1);
      ctx.globalAlpha = a;
      text(G.banner.a, W / 2, 196 - (1 - a) * 8, 15, '#ffe9b8', 'center', 500);
      text(G.banner.b.toLocaleUpperCase('tr'), W / 2, 230 - (1 - a) * 8, 34, '#ffffff', 'center', 700);
      ctx.globalAlpha = 1;
    }
    if (G.mode === 'dying') {
      ctx.globalAlpha = clamp((1.5 - G.deathT) * 3, 0, 1);
      text(G.deathMsg, W / 2, 300, 24, '#ffffff', 'center', 700);
      ctx.globalAlpha = 1;
    }
  }

  function dim(a) { ctx.fillStyle = 'rgba(4,10,18,' + a + ')'; ctx.fillRect(0, 0, W, H); }

  function button(b, label, sub, primary, enabled, shakeX) {
    const x = b.x + (shakeX || 0);
    ctx.fillStyle = primary ? (enabled ? '#f26a1b' : 'rgba(120,130,145,0.55)') : 'rgba(8,18,30,0.8)';
    ctx.beginPath(); ctx.roundRect(x, b.y, b.w, b.h, 9); ctx.fill();
    ctx.strokeStyle = primary ? 'rgba(255,220,180,0.7)' : (enabled ? 'rgba(255,217,90,0.9)' : 'rgba(190,215,240,0.35)');
    ctx.lineWidth = 1.4; ctx.stroke();
    const cy = b.y + b.h / 2 + 6;
    if (sub) {
      text(label, x + 14, cy, 17, enabled ? '#ffffff' : 'rgba(225,238,250,0.6)', 'left', 700);
      text(sub, x + b.w - 14, cy, 15, !enabled ? '#ff8f80' : primary ? '#fff3c4' : '#ffd95a', 'right', 700);
    } else text(label, x + b.w / 2, cy, 17, '#ffffff', 'center', 700);
  }
  function contLabel(k) {
    const loop = Math.floor(k / NSEC);
    return 'DEVAM · ETAP ' + (k % NSEC + 1) + (loop ? ' · TUR ' + (loop + 1) : '');
  }

  function drawTitle() {
    dim(0.68);
    const y0 = 132;
    text('KUZEY HATTI ISI KURYESİ', W / 2, y0 - 44, 13, '#ffcf8a', 'center', 500);
    text('BUZUL', W / 2, y0 + 10, 66, '#ffffff', 'center', 700);
    text('GEÇİDİ', W / 2, y0 + 66, 66, '#ff9a4d', 'center', 700);
    miniShip(W / 2, y0 + 96);

    const lines = [
      'Kızağının ısısı bitmeden fiyordu geç.',
      'Sıcak kaynakların üstünden yavaş geçersen',
      'daha çok ısı toplarsın. Topladığın altınla',
      'kaldığın etaptan devam edebilirsin.'
    ];
    for (let i = 0; i < lines.length; i++) text(lines[i], W / 2, y0 + 134 + i * 18, 14, 'rgba(225,238,250,0.92)', 'center', 500);

    const cy = y0 + 226;
    const rows = IS_TOUCH
      ? [['SÜRÜKLE', 'yön'], ['YUKARI / AŞAĞI', 'hızlan / yavaşla'], ['DOKUNURKEN', 'otomatik ateş'], ['İKİNCİ PARMAK', 'nükleer patlama']]
      : [['←  →', 'yön'], ['↑  ↓', 'hızlan / yavaşla'], ['BOŞLUK / TIK', 'ateş'], ['BASILI TUT', 'şarj et, bırak: yaylım'], ['X / SAĞ TIK', 'nükleer patlama (60 sn)'], ['FARE', 'yön + hız  ·  1–9 hassasiyet'], ['P  ·  M', 'duraklat  ·  ses']];
    for (let i = 0; i < rows.length; i++) {
      text(rows[i][0], W / 2 - 10, cy + i * 17.5, 14, '#ffe9b8', 'right', 700);
      text(rows[i][1], W / 2 + 10, cy + i * 17.5, 14, 'rgba(225,238,250,0.92)', 'left', 500);
    }

    const blink = Math.floor(G.t * 1.6) % 2 === 0;
    button(BTN.titleNew, IS_TOUCH ? 'YENİ OYUN' : (blink ? 'YENİ OYUN  ·  ENTER' : 'YENİ OYUN'), null, true, true);
    if (G.best > 0) {
      const cost = contCost(G.best), can = G.coins >= cost;
      const sh = G.deny > 0 ? Math.sin(G.deny * 60) * 4 : 0;
      button(BTN.titleCont, contLabel(G.best), (IS_TOUCH ? '' : 'C  ·  ') + cost + ' altın', false, can, sh);
    } else {
      text('Fenerlere ulaştıkça buradan devam seçeneği açılır.', W / 2, BTN.titleCont.y + 22, 13, 'rgba(190,215,240,0.8)', 'center', 500);
    }
    coinIcon(48, H - 52, 5.5, 1);
    text(String(G.coins) + ' altın', 58, H - 47, 15, '#ffd95a', 'left', 700);
    if (G.hi > 0) text('EN İYİ  ' + String(G.hi).padStart(6, '0'), W - 42, H - 47, 14, '#ffcf8a', 'right', 500);
  }

  function drawGameOver() {
    dim(Math.min(0.66, G.overT * 1.2));
    const loop = Math.floor(G.sec / NSEC);
    text('YOLCULUK BİTTİ', W / 2, 190, 40, '#ffffff', 'center', 700);
    text('ETAP ' + (G.sec % NSEC + 1) + ' · ' + LV.info(G.sec).name + (loop ? ' · TUR ' + (loop + 1) : ''), W / 2, 218, 15, '#ffcf8a', 'center', 500);
    text('PUAN', W / 2, 262, 12, 'rgba(190,215,240,0.85)', 'center', 500);
    text(String(G.score).padStart(6, '0'), W / 2, 304, 46, '#ffffff', 'center', 700);
    text(G.newHi ? 'YENİ REKOR!' : 'EN İYİ  ' + String(G.hi).padStart(6, '0'), W / 2, 332, 15, G.newHi ? '#7dffb0' : '#ffcf8a', 'center', 700);
    coinIcon(W / 2 - 78, 361, 5.5, 1);
    text('bu yolculukta +' + G.runCoins + '  ·  toplam ' + G.coins, W / 2 - 68, 366, 14, '#ffd95a', 'left', 700);
    if (G.overT <= 0.8) return;
    if (G.sec > 0) {
      const cost = contCost(G.sec), can = G.coins >= cost;
      const sh = G.deny > 0 ? Math.sin(G.deny * 60) * 4 : 0;
      button(BTN.overA, contLabel(G.sec), (IS_TOUCH ? '' : 'C  ·  ') + cost + ' altın', true, can, sh);
      button(BTN.overB, IS_TOUCH ? 'BAŞTAN BAŞLA' : 'BAŞTAN BAŞLA  ·  ENTER', null, false, true);
      text(can ? 'Devam edince puan sıfırlanır, 3 kızakla etabın başından başlarsın.' : 'Devam için ' + (cost - G.coins) + ' altın daha gerekli.',
        W / 2, BTN.overB.y + BTN.overB.h + 22, 12.5, can ? 'rgba(190,215,240,0.85)' : '#ff8f80', 'center', 500);
    } else {
      button(BTN.overA, IS_TOUCH ? 'YENİDEN BAŞLA' : 'YENİDEN BAŞLA  ·  ENTER', null, true, true);
    }
  }

  function render() {
    ctx.setTransform(px, 0, 0, px, 0, 0);
    ctx.textBaseline = 'alphabetic';
    ctx.save();
    if (G.shake > 0.2) ctx.translate((Math.random() - 0.5) * G.shake * 1.6, (Math.random() - 0.5) * G.shake * 1.6);
    drawWater();
    collectRows();
    drawVents();
    drawBanks();
    ROUND = 1.6; drawDeco(); ROUND = 0;
    drawGates();
    if (G.mode !== 'title') {
      drawCoins(); ROUND = 2.2; drawEnts(); ROUND = 0; drawShots(); drawOrbs();
      if (G.mode === 'playing' || G.mode === 'paused') { ROUND = 2; drawPlayer(); ROUND = 0; }
    }
    drawNight();
    drawParts();
    if (G.nukeT > 0) {                        // genişleyen şok halkası
      const k = 1 - G.nukeT / 0.8, r = 20 + k * 620;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,240,200,' + (0.9 * (1 - k)) + ')'; ctx.lineWidth = 14 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(P.x, PSY, r, 0, 6.3); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,150,70,' + (0.6 * (1 - k)) + ')'; ctx.lineWidth = 30 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(P.x, PSY, r * 0.82, 0, 6.3); ctx.stroke();
      ctx.restore();
    }
    drawFog();
    drawSnow();
    drawPops();
    ctx.restore();
    drawVignette();
    if (G.mode !== 'playing' && G.mode !== 'dying') text(VERSION, W - 8, H - 6, 11, 'rgba(210,228,245,0.85)', 'right', 700);
    if (G.mode === 'title') drawTitle();
    else {
      drawHud();
      if (G.mode === 'gameover') drawGameOver();
      else if (G.mode === 'paused') {
        dim(0.55);
        text('DURAKLADI', W / 2, 300, 40, '#ffffff', 'center', 700);
        text(IS_TOUCH ? 'devam etmek için dokun' : mouse.active ? 'devam etmek için tıkla' : 'devam etmek için P ya da ENTER', W / 2, 330, 15, '#ffcf8a', 'center', 500);
        text(muted ? 'ses kapalı (M)' : 'ses açık (M)', W / 2, 354, 13, 'rgba(190,215,240,0.85)', 'center', 500);
        // fare hassasiyeti ayarı
        text('FARE HASSASİYETİ', W / 2, 406, 13, '#ffcf8a', 'center', 500);
        button(BTN.sensMinus, '−', null, false, mouse.level > 1);
        button(BTN.sensPlus, '+', null, false, mouse.level < 9);
        const bx0 = BTN.sensMinus.x + BTN.sensMinus.w + 10, bw0 = BTN.sensPlus.x - 10 - bx0, by0 = BTN.sensMinus.y + 27;
        text(mouse.level + ' / 9', W / 2, by0 - 9, 20, '#ffffff', 'center', 700);
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = i < mouse.level ? '#ffd95a' : 'rgba(190,215,240,0.3)';
          ctx.fillRect(bx0 + i * (bw0 / 9) + 1, by0 - (i === mouse.level - 1 ? 2 : 0), bw0 / 9 - 2, i === mouse.level - 1 ? 7 : 3);
        }
        text(IS_TOUCH ? 'düğmelere dokun' : '1 – 9 tuşlarıyla ayarla (oyun sırasında da)', W / 2, 476, 12.5, 'rgba(190,215,240,0.85)', 'center', 500);
      }
    }
  }

  // ------------------------------------------------------------ döngü
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.034, Math.max(0, (ts - last) / 1000));
    last = ts;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 20px "Barlow Condensed"').catch(NOP);
    document.fonts.load('500 20px "Barlow Condensed"').catch(NOP);
  }
  requestAnimationFrame(function (ts) { last = ts; requestAnimationFrame(frame); });

  // Test kancası: konsoldan __bg.step(600) ile kare kare ilerletilebilir
  window.__bg = {
    G: G, P: P, cfg: cfg, start: startGame, render: render,
    mouse: mouse,
    step: function (n, dt) { for (let i = 0; i < n; i++) update(dt || 1 / 60); },
    version: VERSION, setSens: setSens, setSensLevel: setSensLevel, startAt: startGame, keys: keys, tryContinue: tryContinue, btn: BTN,
    counts: function () { return { ents: ents.length, shots: shots.length, orbs: orbs.length, parts: parts.length, coins: coinsL.length }; }
  };
})();
