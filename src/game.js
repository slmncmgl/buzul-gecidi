/* Buzul Geçidi — oyun motoru */
(function () {
  'use strict';

  const LV = window.Level;
  const W = LV.W, H = 640, ROW = LV.ROW, GATE = LV.GATE_HALF, NSEC = LV.DEFS.length;
  const PSY = 500;                                   // oyuncunun ekrandaki y konumu
  const SPEED_MIN = 80, SPEED_CRUISE = 150, SPEED_MAX = 270;
  const HEAT_DRAIN = 3.6, HEAT_CHARGE = 60;
  const PTS = { mine: 30, boat: 60, skim: 100, turret: 150, orb: 20 };
  const SIZE = { mine: [7, 7], boat: [12, 6], skim: [10, 5], turret: [10, 10] };
  const FONT = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", sans-serif';

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
    { water1: '#17344d', water2: '#0c2236', streak: '#41708f', snow: '#e6dde7', snow2: '#f8f1f5', ice: '#9fd3e6', tree: '#27504a', aur1: '#ff9a7a', aur2: '#c56bd6' }, // alacakaranlık
    { water1: '#0c2037', water2: '#06121f', streak: '#2a5078', snow: '#c6d4e8', snow2: '#e0e9f5', ice: '#7fb8dd', tree: '#1c3a44', aur1: '#4fd6ff', aur2: '#5a7dff' }, // gece
    { water1: '#08272d', water2: '#04151a', streak: '#22645f', snow: '#c9ecdf', snow2: '#e6fbf2', ice: '#6fe0c0', tree: '#17403a', aur1: '#57ffa8', aur2: '#b06bff' }, // aurora
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
    stats: { deaths: [], gates: 0 }
  };
  const P = { x: W / 2, wy: 40, vx: 0, speed: SPEED_CRUISE, inv: 0, fireCd: 0, tilt: 0 };
  let shots = [], ents = [], orbs = [], parts = [], pops = [];
  let armed = {};
  let muted = store('bg_muted') === '1';

  const sy = (wy) => PSY - (wy - P.wy);

  // ------------------------------------------------------------ girdi
  const keys = {};
  const inp = { left: false, right: false, up: false, down: false, fire: false };
  const touch = { on: false, id: null, lx: 0, y0: 0, y: 0, dx: 0 };
  // Fare: oyun başladığı andaki konum (0,0) kabul edilir; mx sağ/sol, my ileri/geri sapmadır
  const mouse = { active: false, down: false, mx: 0, my: 0 };
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
    if (e.repeat) return;
    firstGesture();
    if (e.code === 'Enter' || e.code === 'Space') {
      if (G.mode === 'title' || (G.mode === 'gameover' && G.overT > 0.8)) startGame();
      else if (G.mode === 'paused') togglePause();
      e.preventDefault();
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
      if (isMouse) mouse.active = true;         // fareyle başlatan fareyle oynar
      startGame();
      if (isMouse) return;
    } else if (G.mode === 'paused') {
      if (isMouse && !mouse.active) { mouse.active = true; mouse.mx = P.x - W / 2; mouse.my = 0; }
      togglePause();
      return;
    } else if (!isMouse && p.x > W - 52 && p.y > 26 && p.y < 70) { togglePause(); return; }
    if (isMouse) {
      if (G.mode !== 'playing') return;
      if (!mouse.active) { mouse.active = true; mouse.mx = P.x - W / 2; mouse.my = 0; }
      lockPointer();
      mouse.down = true;
      return;
    }
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
    const k = W / (canvas.getBoundingClientRect().width || W);
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
      A.stopEngine(); A.setCharging(false); A.setLowHeat(false); A.pause();
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
        hw: sz[0], hh: sz[1], hp: sp.type === 'turret' ? 2 : 1,
        cd: 0.7, rate: 2.3 / (1 + 0.15 * s.loop), hard: 1 + 0.15 * s.loop,
        flash: 0, ph: hash(sp.y) * 6.28, ang: Math.PI / 2, dead: false
      });
    }
  }
  function rearm() { ents.length = 0; armed = {}; arm(G.sec); arm(G.sec + 1); }

  function setBanner(k) {
    const loop = Math.floor(k / NSEC);
    G.banner.t = 0;
    G.banner.a = 'ETAP ' + (k % NSEC + 1) + (loop ? '  ·  TUR ' + (loop + 1) : '');
    G.banner.b = LV.DEFS[k % NSEC].name;
  }

  function startGame() {
    G.mode = 'playing'; G.score = 0; G.lives = 3; G.sec = 0; G.heat = 100; G.nextLife = 10000;
    G.checkpoint = 40; G.newHi = false; G.shake = 0; G.flash = 0;
    G.stats.deaths = []; G.stats.gates = 0;
    P.x = W / 2; P.wy = 40; P.vx = 0; P.speed = SPEED_CRUISE; P.inv = 1.5; P.fireCd = 0.35; P.tilt = 0;
    shots.length = 0; orbs.length = 0; parts.length = 0; pops.length = 0;
    mouse.mx = 0; mouse.my = 0; mouse.down = false;      // farenin şu anki konumu sıfır noktası
    if (mouse.active) lockPointer();
    rearm(); setBanner(0);
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
    G.deathMsg = why === 'freeze' ? 'ISI BİTTİ — DONDUN' : 'KIZAK PARÇALANDI';
    G.stats.deaths.push({ why: why, sec: G.sec, wy: Math.round(P.wy), x: Math.round(P.x) });
    if (why === 'freeze') { boom(P.x, P.wy, 26, ['#ffffff', '#bfe9ff', '#7fc8ff', '#e8f7ff'], 90); A.play('freeze'); }
    else { boom(P.x, P.wy, 34, ['#ffffff', '#ffd27a', '#ff8a3c', '#ff5a36'], 150); A.play('playerDie'); }
    A.stopEngine(); A.setCharging(false); A.setLowHeat(false);
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

    if (touch.on && !cfg.auto) {
      const mv = clamp(touch.dx * 1.15, -320 * dt, 320 * dt);
      P.x += mv; touch.dx -= mv / 1.15;
      P.vx = approach(P.vx, clamp(mv / Math.max(dt, 0.001), -175, 175), 1400 * dt);
      inp.up = touch.y0 - touch.y > 34; inp.down = touch.y - touch.y0 > 34; inp.fire = true;
    } else if (mouse.active && !cfg.auto) {
      // kızak, farenin sıfır noktasına göre sağ/sol sapmasını izler; ok tuşları da aynı hedefi kaydırır
      if (inp.left) mouse.mx -= 175 * dt;
      if (inp.right) mouse.mx += 175 * dt;
      mouse.mx = clamp(mouse.mx, 4 - W / 2, W / 2 - 4);
      const nx = approach(P.x, W / 2 + mouse.mx, 420 * dt);
      P.vx = approach(P.vx, clamp((nx - P.x) / Math.max(dt, 0.001), -175, 175), 1500 * dt);
      P.x = nx;
      if (mouse.down) inp.fire = true;
    } else {
      const ax = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      P.vx = approach(P.vx, ax * 175, 1500 * dt);
      P.x += P.vx * dt;
    }
    P.x = clamp(P.x, 4, W - 4);
    P.tilt += (P.vx / 175 - P.tilt) * Math.min(1, dt * 12);

    let target = inp.up ? SPEED_MAX : inp.down ? SPEED_MIN : SPEED_CRUISE;
    if (mouse.active && !cfg.auto && !touch.on && !inp.up && !inp.down) {
      // fare ileri: hızlan, geri: yavaşla; sıfır noktası civarı seyir hızı
      const m = mouse.my, span = MOUSE_R - MOUSE_DEAD;
      if (m > MOUSE_DEAD) target = SPEED_CRUISE + (SPEED_MAX - SPEED_CRUISE) * (m - MOUSE_DEAD) / span;
      else if (m < -MOUSE_DEAD) target = SPEED_CRUISE - (SPEED_CRUISE - SPEED_MIN) * (-m - MOUSE_DEAD) / span;
    }
    P.speed = approach(P.speed, target, 230 * dt);
    P.wy += P.speed * dt;
    P.inv = Math.max(0, P.inv - dt);
    P.fireCd -= dt;

    const s01 = (P.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
    A.setEngine(s01);

    // motor izi
    if (Math.random() < 0.5 + s01 * 0.5) part(P.x + rand(-2, 2), P.wy - 12, rand(-8, 8), -rand(30, 70), rand(0.15, 0.4), rand(1, 2.2), '#ffcf8a', true);

    // ateş
    if (inp.fire && P.fireCd <= 0 && shots.length < 3) {
      shots.push({ x: P.x, wy: P.wy + 14, v: 440 + P.speed });
      P.fireCd = 0.2;
      A.play('shoot');
    }

    // ısı
    const s = sec(G.sec);
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
      G.heat = Math.min(100, G.heat + HEAT_CHARGE * dt);
      if (Math.random() < 0.6) part(P.x + rand(-9, 9), P.wy + rand(-8, 10), rand(-10, 10), rand(10, 50), rand(0.3, 0.7), rand(1.5, 3), '#ffd9a0', true);
    }
    G.charging = charging;
    A.setCharging(charging);
    A.setLowHeat(G.heat < 25);
    if (G.heat <= 0) { G.heat = 0; die('freeze'); return; }

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

  function kill(e, byShot) {
    e.dead = true;
    const c = e.type === 'mine' ? ['#ffffff', '#cfeaff', '#ff6a5a', '#9fd3e6'] : ['#ffffff', '#ffd27a', '#d58bff', '#ff7ad1'];
    boom(e.x, e.wy, e.type === 'turret' ? 26 : 16, c, e.type === 'turret' ? 130 : 100);
    G.shake = Math.max(G.shake, e.type === 'turret' ? 5 : 3);
    A.play('explode');
    if (byShot) { addScore(PTS[e.type]); pop(e.x, e.wy + 10, '+' + PTS[e.type]); }
  }

  function updateEnts(dt) {
    const playing = G.mode === 'playing';
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i], y = sy(e.wy);
      if (e.dead || y > H + 90) { ents.splice(i, 1); continue; }
      if (y < -40) continue;
      e.flash = Math.max(0, e.flash - dt);

      if (e.type === 'boat') {
        e.x += e.vx * dt;
        if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
        else if (e.x > e.maxX) { e.x = e.maxX; e.vx = -Math.abs(e.vx); }
      } else if (e.type === 'skim') {
        e.x += e.vx * dt;
        if (e.x > W + 30 && e.vx > 0) e.vx = -e.vx;
        else if (e.x < -30 && e.vx < 0) e.vx = -e.vx;
      } else if (e.type === 'turret') {
        e.ang = Math.atan2(y - PSY, P.x - e.x);          // namlu oyuncuya döner (matematik açısı, y yukarı)
        if (playing && y > 8 && y < PSY - 90) {
          e.cd -= dt;
          if (e.cd <= 0) {
            const dx = P.x - e.x, dy = (P.wy + P.speed * 0.3) - e.wy, len = Math.hypot(dx, dy) || 1, v = 112 * e.hard;
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
          e.hp--;
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
      if (sy(s.wy) < -14) { shots.splice(i, 1); continue; }
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
      f.y += (f.v + speed * 0.55 * f.s * 0.6) * dt; f.x += f.d * dt;
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
    G.banner.t += dt;
    let scroll = 0;

    if (G.mode === 'title') {
      P.wy += 55 * dt; scroll = 55;
      palUpdate(dt, PALS[LV.DEFS[LV.sectionAtRow(Math.floor(P.wy / ROW)) % NSEC].pal]);
      A.stopEngine();
    } else if (G.mode === 'playing') {
      updatePlayer(dt);
      updateShots(dt); updateEnts(dt); updateOrbs(dt);
      scroll = P.speed;
      palUpdate(dt, PALS[sec(G.sec).def.pal]);
    } else if (G.mode === 'dying') {
      updateEnts(dt); updateOrbs(dt);
      G.deathT -= dt;
      if (G.deathT <= 0) afterDeath();
    } else if (G.mode === 'gameover') {
      G.overT += dt;
      updateEnts(dt);
      A.stopEngine();
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
  function poly(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
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
        const x = o.x, y = sy(o.y), s = o.s;
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
          glow(x, y - 3, 16, '255,200,110', 0.28 + 0.06 * Math.sin(G.t * 3 + o.y));
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
    }
  }

  function drawShots() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i], y = sy(s.wy);
      glow(s.x, y, 9, '255,220,140', 0.7);
      const g = ctx.createLinearGradient(0, y, 0, y + 18);
      g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g; ctx.fillRect(s.x - 1.5, y, 3, 18);
    }
    ctx.restore();
    ctx.fillStyle = '#fffbe8';
    for (let i = 0; i < shots.length; i++) ctx.fillRect(shots[i].x - 1.5, sy(shots[i].wy) - 5, 3, 9);
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
    g.addColorStop(0, 'rgba(255,232,180,0.2)'); g.addColorStop(1, 'rgba(255,232,180,0)');
    ctx.fillStyle = g;
    poly([x - 3, y - 10, x - 36 + t * 26, y - 140, x + 36 + t * 26, y - 140, x + 3, y - 10]);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y); ctx.rotate(t * 0.2); ctx.scale(1 - Math.abs(t) * 0.16, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(3, 5, 9, 12, 0, 0, 6.3); ctx.fill();
    // itici alevi
    const fl = 6 + (P.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN) * 13 + Math.random() * 3;
    ctx.fillStyle = '#ffb347'; poly([-3.2, 10, 3.2, 10, 0, 10 + fl]);
    ctx.fillStyle = '#fff6da'; poly([-1.6, 10, 1.6, 10, 0, 10 + fl * 0.55]);
    // kızak ayakları
    ctx.strokeStyle = '#222c3a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8.5, -5); ctx.lineTo(-8.5, 11); ctx.moveTo(8.5, -5); ctx.lineTo(8.5, 11); ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-8.5, 3); ctx.lineTo(-4, 4); ctx.moveTo(8.5, 3); ctx.lineTo(4, 4); ctx.stroke();
    ctx.lineCap = 'butt';
    // gövde
    ctx.fillStyle = '#f26a1b'; poly([0, -14, 6, -2, 6.5, 8, 3, 11, -3, 11, -6.5, 8, -6, -2]);
    ctx.fillStyle = '#ff9a4d'; poly([0, -14, -6, -2, -6.5, 8, -3, 11, 0, 11]);
    ctx.fillStyle = '#fff1dc'; ctx.fillRect(-4.5, 5, 9, 1.8);
    ctx.fillStyle = '#16212f'; ctx.beginPath(); ctx.ellipse(0, -2, 3.2, 5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#9fe6ff'; ctx.beginPath(); ctx.ellipse(-0.9, -3.4, 1.2, 2.2, 0, 0, 6.3); ctx.fill();
    ctx.restore();

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
    g.addColorStop(0, 'rgba(2,6,12,0)'); g.addColorStop(1, 'rgba(2,6,12,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (G.flash > 0) { ctx.fillStyle = 'rgba(255,236,190,' + (G.flash * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  function miniShip(x, y) {
    ctx.fillStyle = '#f26a1b'; poly([x, y - 7, x + 4, y + 5, x - 4, y + 5]);
    ctx.fillStyle = '#ff9a4d'; poly([x, y - 7, x - 4, y + 5, x, y + 5]);
  }

  function drawHud() {
    // üst şerit
    const g = ctx.createLinearGradient(0, 0, 0, 58);
    g.addColorStop(0, 'rgba(3,9,16,0.75)'); g.addColorStop(1, 'rgba(3,9,16,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 58);
    text('PUAN', 12, 15, 10, 'rgba(190,215,240,0.8)', 'left', 500);
    text(String(G.score).padStart(6, '0'), 12, 36, 24, '#ffffff', 'left', 700);
    const loop = Math.floor(G.sec / NSEC);
    text('ETAP ' + (G.sec % NSEC + 1) + '/' + NSEC + (loop ? '  ·  TUR ' + (loop + 1) : ''), W / 2, 15, 10, 'rgba(190,215,240,0.8)', 'center', 500);
    text(LV.DEFS[G.sec % NSEC].name.toLocaleUpperCase('tr'), W / 2, 33, 15, '#ffe9b8', 'center', 700);
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
    const lvl = P.speed < 115 ? 1 : P.speed < 200 ? 2 : 3;
    for (let i = 0; i < 3; i++) {
      const x = bx + bw + 22 + i * 0, y = by + 12 - i * 7;
      ctx.strokeStyle = i < lvl ? '#ffe9b8' : 'rgba(190,215,240,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 5); ctx.lineTo(x + 6, y); ctx.stroke();
    }
    text('HIZ', bx + bw + 46, by + 10, 10, 'rgba(190,215,240,0.8)', 'center', 500);

    if (low && G.mode === 'playing') text('SICAK KAYNAK BUL!', W / 2, H - 42, 13, blink ? '#ff6a5a' : '#ffd0c8', 'center', 700);

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

  function drawTitle() {
    dim(0.68);
    const y0 = 150;
    text('KUZEY HATTI ISI KURYESİ', W / 2, y0 - 44, 13, '#ffcf8a', 'center', 500);
    text('BUZUL', W / 2, y0 + 10, 66, '#ffffff', 'center', 700);
    text('GEÇİDİ', W / 2, y0 + 66, 66, '#ff9a4d', 'center', 700);
    miniShip(W / 2, y0 + 96);

    const lines = [
      'Kızağının ısısı bitmeden fiyordu geç.',
      'Sıcak kaynakların üstünden yavaş geçersen',
      'daha çok ısı toplarsın. Her fener bir kayıt noktası.'
    ];
    for (let i = 0; i < lines.length; i++) text(lines[i], W / 2, y0 + 138 + i * 19, 14, 'rgba(225,238,250,0.92)', 'center', 500);

    const cy = y0 + 222;
    const rows = IS_TOUCH
      ? [['SÜRÜKLE', 'yön'], ['YUKARI / AŞAĞI', 'hızlan / yavaşla'], ['DOKUNURKEN', 'otomatik ateş']]
      : [['←  →', 'yön'], ['↑  ↓', 'hızlan / yavaşla'], ['BOŞLUK', 'işaret fişeği'], ['FARE', 'yön + hız, tık: ateş'], ['P  ·  M', 'duraklat  ·  ses']];
    for (let i = 0; i < rows.length; i++) {
      text(rows[i][0], W / 2 - 10, cy + i * 21, 15, '#ffe9b8', 'right', 700);
      text(rows[i][1], W / 2 + 10, cy + i * 21, 15, 'rgba(225,238,250,0.92)', 'left', 500);
    }
    if (Math.floor(G.t * 1.6) % 2 === 0) text(IS_TOUCH ? 'BAŞLAMAK İÇİN DOKUN' : 'ENTER YA DA TIKLA', W / 2, H - 96, 20, '#ffffff', 'center', 700);
    if (G.hi > 0) text('EN İYİ  ' + String(G.hi).padStart(6, '0'), W / 2, H - 64, 14, '#ffcf8a', 'center', 500);
  }

  function drawGameOver() {
    dim(Math.min(0.62, G.overT * 1.2));
    const loop = Math.floor(G.sec / NSEC);
    text('YOLCULUK BİTTİ', W / 2, 210, 40, '#ffffff', 'center', 700);
    text('ETAP ' + (G.sec % NSEC + 1) + ' · ' + LV.DEFS[G.sec % NSEC].name + (loop ? ' · TUR ' + (loop + 1) : ''), W / 2, 240, 15, '#ffcf8a', 'center', 500);
    text('PUAN', W / 2, 296, 12, 'rgba(190,215,240,0.85)', 'center', 500);
    text(String(G.score).padStart(6, '0'), W / 2, 338, 46, '#ffffff', 'center', 700);
    text(G.newHi ? 'YENİ REKOR!' : 'EN İYİ  ' + String(G.hi).padStart(6, '0'), W / 2, 368, 15, G.newHi ? '#7dffb0' : '#ffcf8a', 'center', 700);
    if (G.overT > 0.8 && Math.floor(G.t * 1.6) % 2 === 0) text(IS_TOUCH ? 'YENİDEN: DOKUN' : 'YENİDEN: ENTER YA DA TIKLA', W / 2, 440, 20, '#ffffff', 'center', 700);
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
    drawDeco();
    drawGates();
    if (G.mode !== 'title') {
      drawEnts(); drawShots(); drawOrbs();
      if (G.mode === 'playing' || G.mode === 'paused') drawPlayer();
    }
    drawParts();
    drawSnow();
    drawPops();
    ctx.restore();
    drawVignette();
    if (G.mode === 'title') drawTitle();
    else {
      drawHud();
      if (G.mode === 'gameover') drawGameOver();
      else if (G.mode === 'paused') {
        dim(0.55);
        text('DURAKLADI', W / 2, 300, 40, '#ffffff', 'center', 700);
        text(IS_TOUCH ? 'devam etmek için dokun' : mouse.active ? 'devam etmek için tıkla' : 'devam etmek için P ya da ENTER', W / 2, 330, 15, '#ffcf8a', 'center', 500);
        text(muted ? 'ses kapalı (M)' : 'ses açık (M)', W / 2, 354, 13, 'rgba(190,215,240,0.85)', 'center', 500);
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
    counts: function () { return { ents: ents.length, shots: shots.length, orbs: orbs.length, parts: parts.length }; }
  };
})();
