/* Buzul Geçidi — oyun motoru */
(function () {
  'use strict';

  const LV = window.Level;
  const W = LV.W, H = 640, ROW = LV.ROW, GATE = LV.GATE_HALF, NSEC = LV.DEFS.length;
  const PSY = 500;                                   // oyuncunun ekrandaki y konumu
  const SPEED_MIN = 80, SPEED_CRUISE = 150, SPEED_MAX = 270;
  const HEAT_DRAIN = 3.6, HEAT_CHARGE = 60;
  const PTS = { mine: 30, boat: 60, skim: 100, turret: 150, orb: 20, ice: 10, hunter: 120, boss: 2500, wasp: 140, sub: 180, crystal: 160, shard: 25, mortar: 200 };
  const SIZE = { mine: [8, 8], boat: [12, 6], skim: [10, 5], turret: [10, 10], ice: [9, 7], hunter: [9, 8], beam: [0, 4], whirl: [0, 0], boss: [34, 14], wasp: [9, 8], sub: [13, 7], crystal: [10, 10], shard: [6, 6], mortar: [12, 8] };
  const NEWHP = { wasp: 2, sub: 3, crystal: 3, shard: 1, mortar: 4 };      // 50. etaptan sonra gelen düşmanlar
  // Etap ilerledikçe akış hızlanır; devam etmenin altın bedeli de etapla artar
  const speedMul = (k) => k <= 50 ? Math.min(1.5, 1 + 0.01 * k) : Math.min(1.65, 1.5 + 0.003 * (k - 50));
  const MAXLV = 100;     // hedef: 100. etap
  const contCost = (k) => k <= G.bossCp ? 0 : Math.min(200, 20 + 10 * k);
  // Yaylım atışı: ateşi basılı tutunca şarj olur, bırakınca yelpaze şeklinde ateşler, sonra bir süre kapanır
  // Silah gücü: düşmanlardan %10 şansla düşen güçlendirme başına +%20; bir turda en fazla +%100 (5 adet)
  const MAG_DROP = 0.0225, MAG_MAX = 3, MAG_R = [0, 43, 58, 75], MAG_T = [0, 6, 9, 12];      // mıknatıs: %5 düşer; 3 kademe: çekim yarıçapı ve süresi (sn)
  const WING_DROP = 0.0225, WING_MAX = 3, SHIELD_MAX = 1, SHIELD_SHARE = 0.25;      // kanat yardımcıları: %5 (3 kademe); güçlendirmelerin dörtte biri kalkan
  const POWER_DROP = 0.09, POWER_MAX = 16, BOSS_EVERY = 10;      // silah 16 kademe
  const shotCount = () => G.power >= 9 ? 4 : G.power >= 6 ? 3 : G.power >= 4 ? 2 : 1;
  const fireRate = () => Math.min(9.5, 3 + 1.5 * Math.min(G.power, 3) + 0.2 * Math.max(0, G.power - 3)) * (G.sled === 2 ? 1.15 : 1);      // Kızıl Şimşek: +%15      // atış/sn: 1-3. kademe hızlandırır
  const blastCdMax = () => Math.max(5, BLAST_CD * (1 - 0.04 * G.power)) * (G.sled === 1 ? 0.75 : 1);      // Kutup Tilkisi: −%25
  const nukeCdMax = () => Math.max(30, NUKE_CD * (1 - 0.05 * G.power)) * (G.av === 1 ? 0.6 : 1);      // Roket: −%40
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
    palUpdate(dt * 0.11, PALS[idx]);                                     // gün ↔ gece geçişi ~7 sn'ye yayılır
    G.night += (PAL_NIGHT[idx] - G.night) * Math.min(1, dt * 0.15);
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
  // Gemi ve pilot kartları: açılma seviyesi, rol etiketleri, özel yaylım ve artı
  const SHIP_INFO = [
    { req: 1, tags: ['DENGELİ'], sp: 'Klasik saçma: güçlendikçe 2-3-4 dalga', pa: 'Her işe yarar' },
    { req: 2, tags: ['HIZLI', 'DELİCİ'], sp: 'Buz mızrağı: düz hatta her şeyi deler', pa: 'Yaylım %25 daha çabuk dolar' },
    { req: 4, tags: ['SALDIRI', 'ZİNCİR'], sp: 'Zincir şimşek: düşmandan düşmana seker', pa: 'Atış hızı +%15' },
    { req: 6, tags: ['SAVUNMA', 'KONTROL'], sp: 'Yıldız halkası: 360° patlama, mermileri siler', pa: 'Kalkan daha sık düşer' },
    { req: 8, tags: ['ALAN', 'BEKÇİ AVCISI'], sp: 'Ejder nefesi: önüne alev püskürtür', pa: 'Bekçilere +%25 hasar' },
    { req: 10, tags: ['ÖZEL', 'ZENGİN'], sp: 'Altın füze yağmuru: güdümlü füzeler', pa: 'Toplanan altın +%20' }
  ];
  const PILOT_INFO = [
    { req: 1, tags: ['YAKIT'], pa: 'İstasyonlardan %40 fazla yakıt alır', pa2: 'Yakıtı %15 daha yavaş biter' },
    { req: 2, tags: ['NÜKLEER'], pa: 'Nükleer bekleme süresi %40 kısa', pa2: 'Nükleer bekçilere 2 kat hasar verir' },
    { req: 3, tags: ['TANK', 'KALKAN'], pa: 'Her cana kalkanla başlar', pa2: 'Oyuna 4 gemiyle başlar' },
    { req: 5, tags: ['GÖZCÜ', 'HAVA'], pa: 'Rüzgârdan hiç etkilenmez', pa2: 'Sis ve gece karanlığı çok azalır' },
    { req: 7, tags: ['MIKNATIS'], pa: '2. kademe mıknatısla başlar', pa2: 'Her cana mıknatısla döner' },
    { req: 9, tags: ['DRON'], pa: '2. kademe dronlarla başlar', pa2: 'Her cana dronlarla döner' }
  ];
  const LV_MIN = [0, 10, 25, 45, 70, 100, 140, 190, 250, 320];      // pilot seviyesi: toplam uçuş dakikası
  const pilotLevel = () => { let l = 1; for (let i = 1; i < LV_MIN.length; i++) if (G.fly / 60 >= LV_MIN[i]) l = i + 1; return l; };
  const lvProgress = () => { const l = pilotLevel(); if (l >= LV_MIN.length) return 1; return clamp((G.fly / 60 - LV_MIN[l - 1]) / (LV_MIN[l] - LV_MIN[l - 1]), 0, 1); };
  const loadJ = (k, d) => { try { const v = JSON.parse(store(k) || 'null'); return Array.isArray(v) ? v : d; } catch (_) { return d; } };
  const G = {
    sled: parseInt(store('bg_sled') || '0', 10) || 0, av: parseInt(store('bg_av') || '0', 10) || 0,      // mağaza: seçili kızak ve avatar
    fly: parseFloat(store('bg_fly') || '0') || 0, flySave: 5, lvSeen: 0, breath: 0, goldAcc: 0,      // toplam uçuş süresi (sn)
    ownS: loadJ('bg_sleds', [0]), ownA: loadJ('bg_avs', [0]), stTab: 0, stCur: 0, stKb: false, stDeny: -1, stBuyT: 9,
    mode: 'title', t: 0, score: 0, hi: parseInt(store('bg_hi') || '0', 10) || 0, newHi: false,
    lives: 3, sec: 0, heat: 100, nextLife: 10000, checkpoint: 40,
    shake: 0, deathT: 0, deathMsg: '', overT: 0, charging: false,
    banner: { t: 9, a: '', b: '' }, flash: 0,
    coins: parseInt(store('bg_coins') || '0', 10) || 0,      // cüzdan: tarayıcıda saklanır
    best: parseInt(store('bg_stage') || '0', 10) || 0,
    last: parseInt(store('bg_last') || store('bg_stage') || '0', 10) || 0,
    bossCp: parseInt(store('bg_bosscp') || '0', 10) || 0,      // son yenilen bekçiden sonraki etap: oradan bedava başlanır
    chapT: 9, chapN: 1,       // ulaşılan en uzak etap (0 tabanlı)
    runCoins: 0, sm: 1, fog: 0, wind: 0, windWarn: 0, windT: 0, deny: 0, sensT: 0,
    power: 0, powerBase: 0, blastEcho: null,
    blastCd: 0, readyT: 0, night: 0, boss: null, rapid: false, nukeCd: 0, nukeT: 0,
    stats: { deaths: [], gates: 0 }
  };
  const P = { x: W / 2, wy: 40, vx: 0, speed: SPEED_CRUISE, inv: 0, fireCd: 0, tilt: 0, holdT: 0, charge: 0 };
  let shots = [], ents = [], orbs = [], parts = [], pops = [], coinsL = [], shells = [], bolts = [], rings = [], lasers = [], novas = [], walls = [];
  let armed = {};
  let muted = store('bg_muted') === '1';

  const sy = (wy) => PSY - (wy - P.wy);

  // ------------------------------------------------------------ girdi
  const keys = {};
  const inp = { left: false, right: false, up: false, down: false, fire: false };
  const touch = { on: false, id: null, lx: 0, y0: 0, y: 0, dx: 0 };
  // dokunmatik düğmeler: yaylım (dokun ya da basılı tutup şarj et) ve nükleer; dokunmatikte tekli ateş otomatiktir
  const tb = { seen: false, blastId: null, rel: false };
  const TBTN = { blast: { x: 82, y: H - 78, r: 30 }, nuke: { x: 40, y: H - 156, r: 26 } };      // ikisi de solda: üstte nükleer, altta (merkeze yakın) yaylım
  const inTB = (p, c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r + 8;
  // Fare: oyun başladığı andaki konum (0,0) kabul edilir; mx sağ/sol, my ileri/geri sapmadır
  const mouse = { active: false, down: false, mx: 0, my: 0, sens: 0.35, level: 1 };
  // Fare hassasiyeti: 9 kademe, klavyede 1–9 ile seçilir, tarayıcıda saklanır (1.0 = imleçle birebir)
  const SENS_LEVELS = [0.12, 0.16, 0.2, 0.26, 0.33, 0.42, 0.55, 0.75, 1], SENS_DEFAULT = 2;
  function setSensLevel(n) {
    mouse.level = clamp(Math.round(n) || SENS_DEFAULT, 1, 9);
    mouse.sens = SENS_LEVELS[mouse.level - 1];
    store('bg_sens_lv3', String(mouse.level));
    G.sensT = 1.6;
  }
  function setSens(step) { setSensLevel(mouse.level + step); }
  (function () {
    const v = parseInt(store('bg_sens_lv3'), 10);
    mouse.level = v >= 1 && v <= 9 ? v : SENS_DEFAULT;
    mouse.sens = SENS_LEVELS[mouse.level - 1];
  })();
  const MOUSE_R = 64, MOUSE_DEAD = 12;      // ileri/geri menzili ve ölü bölge (mantıksal px)
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'fire', KeyJ: 'fire', KeyZ: 'fire'
  };

  // Test hilesi: 1 + 3 + 5 tuşları 3 sn basılı tutulursa bir sonraki bekçinin alanının hemen öncesine atlar
  const digits = {};
  let sensBeforeCombo = 0, comboT = 0;
  function jumpToBoss() {
    const playing = G.mode === 'playing' || G.mode === 'dying' || G.mode === 'paused';
    let k = (playing ? Math.floor(G.sec / BOSS_EVERY) : 0) * BOSS_EVERY + BOSS_EVERY - 1;
    const bossY = function (kk) { const sp = sec(kk).spawns; for (let i = 0; i < sp.length; i++) if (sp[i].type === 'boss') return sp[i].y; return sec(kk).gateY - 4000; };
    if (playing && G.sec === k && P.wy > bossY(k) - 700) k += BOSS_EVERY;      // bu bekçi geçildiyse sıradakine
    if (G.mode === 'paused') togglePause();
    startGame(k);
    const y = bossY(k) - 380 - 520, t = terrain(y, T1);
    P.wy = y; P.x = (t.L + t.R) / 2; G.checkpoint = y; mouse.mx = P.x - W / 2;
    G.cheated = true;
    G.power = Math.max(G.power, 6);      // test: o etaba gelmiş biri kadar güçlü başla
    if (sensBeforeCombo) setSensLevel(sensBeforeCombo);
    G.sensT = 0;
    pop(P.x, P.wy + 120, 'TEST: BEKÇİYE ATLANDI', '#7dffb0');
  }

  function firstGesture() { A.init(); A.setMuted(muted); }

  // ------------------------------------------------------------ oyun kolu (Gamepad API, standart dizilim)
  // Sol çubuk / yön tuşları: yön ve hız · RT / LT: hızlan / yavaşla · A: ateş (basılı tut: yaylım)
  // X, B ya da RB: nükleer · Y: altınla devam · Start: başlat / duraklat · Back: ses
  const pad = { gp: null, ax: 0, up: false, down: false, fire: false, prev: [] };
  function padRumble(ms, strong) {
    try {
      const v = pad.gp && pad.gp.vibrationActuator;
      if (v && v.playEffect) v.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 });
    } catch (err) { /* titreşim yoksa sessizce geç */ }
  }
  function pollPad() {
    pad.ax = 0; pad.up = pad.down = pad.fire = false; pad.gp = null;
    let list = [];
    try { list = navigator.getGamepads ? navigator.getGamepads() : []; } catch (err) { return; }
    let gp = null;
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected && list[i].buttons.length >= 4) { gp = list[i]; break; }
    if (!gp) { pad.prev.length = 0; return; }
    pad.gp = gp;
    const b = function (i) { const q = gp.buttons[i]; return !!(q && (q.pressed || q.value > 0.35)); };
    const hit = [];
    for (let i = 0; i < 16; i++) { const now = b(i); hit[i] = now && !pad.prev[i]; pad.prev[i] = now; }
    let x = gp.axes[0] || 0;
    const y = gp.axes[1] || 0;
    x = Math.abs(x) < 0.18 ? 0 : (x - Math.sign(x) * 0.18) / 0.82;       // ölü bölge
    if (b(14)) x = -1; else if (b(15)) x = 1;
    pad.ax = x;
    pad.up = y < -0.5 || b(12) || b(7);
    pad.down = y > 0.5 || b(13) || b(6);
    pad.fire = b(0);
    if (G.mode === 'playing' && mouse.active && (x || pad.up || pad.down || pad.fire)) mouse.active = false;   // kolu tutan kolla oynar
    if (G.mode === 'shop') {      // kol: A silahsız, Y alınabilen en iyisi
      if (hit[0]) shopPick(0);
      else if (hit[3]) { let b = 0; for (let i = 0; i < SHOP.length; i++) if (G.coins >= SHOP[i].c) b = i; shopPick(b); }
      return;
    }
    if (G.mode === 'store') {      // kol: yön tuşları gezinir, A al/seç, LB/RB sekme, B geri
      if (hit[14]) storeKey('left'); else if (hit[15]) storeKey('right'); else if (hit[12]) storeKey('up'); else if (hit[13]) storeKey('down');
      if (hit[0]) storeKey('pick'); if (hit[4]) storeKey('tab0'); if (hit[5]) storeKey('tab1'); if (hit[1] || hit[8]) storeKey('back');
      return;
    }
    if (G.mode === 'title' && hit[2]) { openStore(); return; }
    if (hit[0] || hit[9]) {
      firstGesture();
      if (G.mode === 'title' || (G.mode === 'gameover' && G.overT > 0.8)) startGame(0);
      else if (G.mode === 'paused' || hit[9]) togglePause();
    }
    if (hit[1] || hit[2] || hit[5]) nuke();
    if (hit[3]) {
      firstGesture();
      if (G.mode === 'title') tryContinue(G.last);
      else if (G.mode === 'gameover' && G.overT > 0.8) tryContinue(G.sec);
    }
    if (hit[8]) { muted = !muted; A.setMuted(muted); store('bg_muted', muted ? '1' : '0'); }
  }

  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const m = KEYMAP[e.code];
    if (m) { keys[m] = true; e.preventDefault(); }
    // fare hassasiyeti: her an 1–9 (ya da − / +), duraklatılmışken ← / →
    if (e.code === 'KeyB') digits.b = true;      // B'yi 3 sn basılı tut: bekçiye atla (1+3+5 ile aynı)
    const dg = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (G.mode === 'shop') {
      if (dg && !e.repeat && +dg[1] <= SHOP.length) shopPick(+dg[1] - 1);
      else if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) shopPick(0);
      e.preventDefault(); return;
    }
    if (G.mode === 'store') {
      const sk = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
        Enter: 'pick', Space: 'pick', KeyQ: 'tab0', KeyE: 'tab1', Escape: 'back', Backspace: 'back', KeyT: 'back' }[e.code];
      if (dg && !e.repeat && +dg[1] <= 6) { G.stKb = true; storePick(+dg[1] - 1); }
      else if (e.code === 'KeyB' && !e.repeat) storeBuy();
      else if (sk && !e.repeat) storeKey(sk);
      e.preventDefault(); return;
    }
    if (G.mode === 'title' && e.code === 'KeyT' && !e.repeat) { openStore(); e.preventDefault(); return; }
    if (dg && !e.repeat) {
      if (!digits[1] && !digits[3] && !digits[5]) sensBeforeCombo = mouse.level;   // 1+3+5 hilesi hassasiyeti bozmasın
      digits[+dg[1]] = true;
      setSensLevel(+dg[1]); e.preventDefault(); return;
    }
    if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') { setSens(-1); e.preventDefault(); return; }
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { setSens(1); e.preventDefault(); return; }
    if (G.mode === 'paused' && (m === 'left' || m === 'right')) { setSens(m === 'left' ? -1 : 1); return; }
    if (e.repeat) return;
    firstGesture();
    tb.seen = false;
    if (e.code === 'Enter' || e.code === 'Space') {
      if (G.mode === 'title' || (G.mode === 'gameover' && G.overT > 0.8)) startGame(0);
      else if (G.mode === 'paused') togglePause();
      e.preventDefault();
    } else if (e.code === 'KeyX' || e.code === 'KeyN') {
      nuke();
    } else if (e.code === 'KeyC') {
      if (G.mode === 'title') tryContinue(G.last);
      else if (G.mode === 'gameover' && G.overT > 0.8) tryContinue(G.sec);
    } else if (e.code === 'KeyP') {
      togglePause();
    } else if (e.code === 'Escape') {
      if (G.mode === 'playing') togglePause();
    } else if (e.code === 'KeyM') {
      muted = !muted; A.setMuted(muted); store('bg_muted', muted ? '1' : '0');
    }
  });
  window.addEventListener('keyup', function (e) {
    const m = KEYMAP[e.code]; if (m) keys[m] = false;
    const dg = /^(?:Digit|Numpad)([1-9])$/.exec(e.code); if (dg) digits[+dg[1]] = false;
    if (e.code === 'KeyB') digits.b = false;
  });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; mouse.down = false; digits[1] = digits[3] = digits[5] = digits.b = false; });

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  canvas.addEventListener('pointerdown', function (e) {
    firstGesture();
    const p = toLogical(e), isMouse = e.pointerType === 'mouse';
    e.preventDefault();
    if (G.mode === 'shop') {
      for (let i = 0; i < SHOP.length; i++) if (inBtn(p, shopBtn(i))) { if (isMouse) mouse.active = true; shopPick(i); break; }
      return;
    }
    if (G.mode === 'store') {
      for (let q = 0; q < 2; q++) if (inBtn(p, STORE_TAB[q])) { storeTab(q); return; }
      for (let i = 0; i < storeList().length; i++) if (inBtn(p, storeCard(i))) { G.stKb = false; storePick(i); return; }
      if (stFocusBuy()) { if (inBtn(p, BTN.storeBuy)) storeBuy(); else if (inBtn(p, BTN.storeBack2)) closeStore(); }
      else if (inBtn(p, BTN.storeBack)) closeStore();
      return;
    }
    if (G.mode === 'title' && inBtn(p, BTN.store)) { openStore(); return; }
    if ((G.mode === 'title' || G.mode === 'paused' || G.mode === 'gameover') && inBtn(p, BTN.mute)) { toggleMute(); return; }
    if (G.mode === 'title' || (G.mode === 'gameover' && G.overT > 0.8)) {
      const act = menuAction(p);
      if (!act) return;
      if (isMouse) mouse.active = true;         // fareyle başlatan fareyle oynar
      let ok = true;
      if (act === 'new') startGame(0);
      else ok = tryContinue(act === 'cont-title' ? G.last : G.sec);
      if (isMouse || !ok) return;
    } else if (G.mode === 'paused') {
      if (inBtn(p, BTN.sensMinus)) { setSens(-1); return; }
      if (inBtn(p, BTN.sensPlus)) { setSens(1); return; }
      if (isMouse && !mouse.active) { mouse.active = true; mouse.mx = P.x - W / 2; mouse.my = 0; }
      togglePause();
      return;
    } else if (!isMouse && p.x > W - 52 && p.y > 26 && p.y < 70) { togglePause(); return; }
    if (isMouse) {
      tb.seen = false;
      if (G.mode !== 'playing') return;
      if (e.button === 2) { nuke(); return; }            // sağ tık: nükleer patlama
      if (!mouse.active) { mouse.active = true; mouse.mx = P.x - W / 2; mouse.my = 0; }
      lockPointer();
      mouse.down = true;
      return;
    }
    tb.seen = true;
    if (G.mode === 'playing') {
      if (inTB(p, TBTN.nuke)) { nuke(); return; }
      if (inTB(p, TBTN.blast)) { tb.blastId = e.pointerId; return; }
    }
    if (touch.on && e.pointerId !== touch.id) return;
    touch.on = true; touch.id = e.pointerId; touch.lx = p.x; touch.y0 = p.y; touch.y = p.y; touch.dx = 0;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!touch.on || e.pointerId !== touch.id) return;
    const p = toLogical(e);
    touch.dx += p.x - touch.lx; touch.lx = p.x; touch.y = p.y;
  });
  function touchEnd(e) {
    if (e.pointerType === 'mouse') { mouse.down = false; return; }
    if (e.pointerId === tb.blastId) { tb.blastId = null; tb.rel = true; }
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
    const s = sec(k), tier = Math.floor(k / BOSS_EVERY);      // geçilen her 10 etap bir kademe zorlaştırır
    for (let i = 0; i < s.spawns.length; i++) {
      const sp = s.spawns[i], sz = SIZE[sp.type];
      ents.push({
        type: sp.type, x: sp.x, wy: sp.y, vx: sp.vx || 0, minX: sp.minX, maxX: sp.maxX,
        hw: sz[0], hh: sz[1], hp: NEWHP[sp.type] ? NEWHP[sp.type] + Math.max(0, Math.floor((tier - 5) / 2)) : sp.type === 'turret' ? 2 + Math.min(2, tier) : sp.type === 'ice' ? 1 + Math.min(1, tier) : (sp.type === 'hunter' || sp.type === 'boat') ? 1 + Math.min(1, Math.floor(tier / 2)) : 1,
        vol: tier >= 7 ? 4 : tier >= 3 ? 3 : tier >= 1 ? 2 : 1, up: k >= 50, sub: sp.type === 'sub' ? 1 : 0, subT: hash(sp.x + sp.y * 3) * 4, armed: !!NEWHP[sp.type] || (sp.type === 'boat' && k >= 4) || (sp.type === 'hunter' && k >= 14) || (sp.type === 'skim' && k >= 24),      // 5. etaptan botlar, 15'ten avcılar, 25'ten kayıcılar ateş eder      // kule yaylım ateşi; ileri kademelerde botlar da ateş eder
        cd: 0.7, rate: 2.3 / (1 + 0.08 * tier), hard: 1 + 0.08 * tier,
        flash: 0, ph: hash(sp.y + sp.x) * 6.28, ang: Math.PI / 2, dead: false
      });
      const e = ents[ents.length - 1];
      if (sp.type === 'beam') { e.hw = (sp.maxX - sp.minX) / 2; e.hp = 1e9; e.onT = sp.period * 0.55; e.period = sp.period + 2; e.bph = sp.ph;   // açık süre aynı, kapalı süre +2 sn
        e.on = false; e.warn = false; }
      else if (sp.type === 'whirl') { e.hp = 1e9; e.r = sp.r; }
      else if (sp.type === 'boss') { e.baseHp = 200 + 110 * tier; e.hp = e.maxHp = e.baseHp; e.kind = tier % 10; e.cd3 = 4.5; e.ulti = 0; e.lunge = 0; e.spin = 0; e.scr = -60; e.on = false; e.flee = false; e.cd = 1.6; e.cd2 = 4; e.arenaEnd = s.arenaEnd; }
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
    mute: { x: W - 52, y: 10, w: 42, h: 34 }, store: { x: 10, y: 10, w: 112, h: 34 }, storeBack: { x: 110, y: 596, w: 140, h: 36 }, storeBuy: { x: 24, y: 596, w: 196, h: 36 }, storeBack2: { x: 230, y: 596, w: 106, h: 36 },
    sensMinus: { x: 76, y: 418, w: 46, h: 36 }, sensPlus: { x: 238, y: 418, w: 46, h: 36 }
  };
  const inBtn = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  function menuAction(p) {
    if (G.mode === 'title') return (G.last > 0 && inBtn(p, BTN.titleCont)) ? 'cont-title' : 'new';
    if (G.sec > 0 && !G.won) return inBtn(p, BTN.overA) ? 'cont' : inBtn(p, BTN.overB) ? 'new' : null;
    return inBtn(p, BTN.overA) ? 'new' : null;
  }
  // Altın harcayıp k. etabın başından devam et (puan sıfırlanır)
  // altın yetmezse son yenilen bekçinin ardından bedava başla
  const SHOP = [{ lv: 0, c: 0 }, { lv: 3, c: 40 }, { lv: 5, c: 80 }, { lv: 7, c: 130 }, { lv: 10, c: 200 }];
  const shopBtn = (i) => ({ x: 40, y: 236 + i * 48, w: 280, h: 40 });
  function shopPick(i) {
    const o = SHOP[i];
    if (!o || G.coins < o.c) { G.deny = 0.5; A.play('deny'); return; }
    G.coins -= o.c; store('bg_coins', String(G.coins));
    startGame(G.shopK);
    if (o.lv) { G.power = G.powerBase = o.lv; A.play('powerUp'); pop(P.x, P.wy + 40, 'SİLAH KUŞANDIN', '#ff9a4d'); }
  }
  function drawShop() {
    dim(0.78);
    text('SİLAH KUŞAN', W / 2, 150, 32, '#ffffff', 'center', 700);
    text('Etap ' + (G.shopK + 1) + ' başlamadan altınla silah seç', W / 2, 178, 13, 'rgba(190,215,240,0.85)', 'center', 500);
    coinIcon(W / 2 - 40, 206, 5.5, 1); text(G.coins + ' altın', W / 2 - 30, 211, 15, '#ffd95a', 'left', 700);
    const NM = { 0: 'SİLAHSIZ BAŞLA', 3: 'HIZLI ATIŞ III', 5: 'ÇİFT YAYLIM', 7: 'ÜÇLÜ ATIŞ+', 10: 'ÜÇLÜ YAYLIM' };
    for (let i = 0; i < SHOP.length; i++) {
      const o = SHOP[i], can = G.coins >= o.c, sh = G.deny > 0 ? Math.sin(G.deny * 60) * 2 : 0;
      button(shopBtn(i), (IS_TOUCH ? '' : (i + 1) + '  ·  ') + (o.lv ? 'SEVİYE ' + o.lv + '  ' + NM[o.lv] : NM[0]), o.c ? o.c + ' altın' : 'BEDAVA', i === 0, can, can ? 0 : sh);
    }
  }
  function contK(k) { return G.coins >= contCost(k) || G.bossCp < 1 ? k : Math.min(k, G.bossCp); }
  function tryContinue(k) {
    k = contK(k);
    const cost = contCost(k);
    if (k < 1 || G.coins < cost) { G.deny = 0.5; A.play('deny'); return false; }
    G.coins -= cost; store('bg_coins', String(G.coins));
    A.play('buy');
    G.shopK = k; G.shopFrom = G.mode; G.mode = 'shop';      // devam öncesi: altınla silah kuşan
    mouse.down = false;
    return true;
  }

  // ---- Mağaza: altınla kızak ve avatar
  const STORE_TAB = [{ x: 24, y: 76, w: 150, h: 30 }, { x: 186, y: 76, w: 150, h: 30 }];
  const storeCard = (i) => ({ x: 24 + (i % 2) * 162, y: 114 + Math.floor(i / 2) * 134, w: 150, h: 126 });
  const stInfo = (i) => (G.stTab ? PILOT_INFO : SHIP_INFO)[i] || { req: 1, tags: [], pa: '' };
  const stLocked = (i, it) => !stOwned(it) && pilotLevel() < stInfo(i).req;
  const storeList = () => window.COS ? (G.stTab ? COS.AVATARS : COS.SLEDS) : [];
  const stOwned = (it) => (G.stTab ? G.ownA : G.ownS).indexOf(it.id) >= 0;
  const stEquipped = () => { const L = storeList(), c = G.stTab ? G.av : G.sled; for (let i = 0; i < L.length; i++) if (L[i].id === c) return i; return 0; };
  const stFocusBuy = () => { const it = storeList()[G.stCur]; return it && !stOwned(it) ? it : null; };      // odaktaki alınmamış ürün: satın al düğmesi görünür
  function openStore() { G.mode = 'store'; G.stCur = stEquipped(); G.stKb = false; A.play('hit'); }
  function closeStore() { G.mode = 'title'; }
  function storeTab(q) { if (G.stTab !== q) { G.stTab = q; G.stCur = stEquipped(); A.play('hit'); } }
  function stEquip(it) { if (G.stTab) { G.av = it.id; store('bg_av', String(it.id)); } else { G.sled = it.id; store('bg_sled', String(it.id)); } }
  function storePick(i) {      // karta dokunmak: sahipsen kuşanır, değilse sadece seçer (satın almaz)
    const it = storeList()[i];
    if (!it) return;
    G.stCur = i;
    if (stOwned(it)) { stEquip(it); A.play('powerUp'); } else A.play('hit');
  }
  function storeBuy() {
    const it = stFocusBuy();
    if (!it) return;
    if (stLocked(G.stCur, it) || G.coins < it.price) { G.deny = 0.5; G.stDeny = G.stCur; A.play('deny'); return; }
    G.coins -= it.price; store('bg_coins', String(G.coins));
    const own = G.stTab ? G.ownA : G.ownS;
    own.push(it.id); store(G.stTab ? 'bg_avs' : 'bg_sleds', JSON.stringify(own));
    stEquip(it); G.stBuyT = 0; A.play('buy'); A.play('extraLife');
  }
  function storeKey(code) {      // klavye / kol: oklar gezinir, Enter alır ya da seçer, Q/E sekme, Esc geri
    const n = storeList().length;
    G.stKb = true;
    if (code === 'left') G.stCur = Math.max(0, G.stCur - 1);
    else if (code === 'right') G.stCur = Math.min(n - 1, G.stCur + 1);
    else if (code === 'up') G.stCur = Math.max(0, G.stCur - 2);
    else if (code === 'down') G.stCur = Math.min(n - 1, G.stCur + 2);
    else if (code === 'pick') { if (stFocusBuy()) storeBuy(); else storePick(G.stCur); }
    else if (code === 'tab0') storeTab(0);
    else if (code === 'tab1') storeTab(1);
    else if (code === 'back') closeStore();
  }
  function fitText(s, x, y, size, maxW, color, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
    const w = ctx.measureText(s).width;
    text(s, x, y, w > maxW ? Math.max(7, size * maxW / w) : size, color, 'center', weight);
  }
  function drawStore() {
    dim(0.86);
    text('MAĞAZA', W / 2, 36, 26, '#ffffff', 'center', 700);
    coinIcon(24 + 6, 58, 5, 1); text(G.coins + ' altın', 24 + 14, 63, 14, '#ffd95a', 'left', 700);
    {      // pilot seviyesi ve ilerleme
      const lv = pilotLevel(), bx = 196, bw = 140;
      text('PİLOT SV ' + lv + (lv >= LV_MIN.length ? ' · EN ÜST' : ''), bx + bw, 58, 12, '#ffe9b8', 'right', 700);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, 63, bw, 4);
      ctx.fillStyle = '#ffd95a'; ctx.fillRect(bx, 63, bw * lvProgress(), 4);
    }
    for (let q = 0; q < 2; q++) {
      const b = STORE_TAB[q], on = G.stTab === q;
      ctx.fillStyle = on ? '#f26a1b' : 'rgba(8,18,30,0.8)'; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
      ctx.strokeStyle = on ? 'rgba(255,220,180,0.8)' : 'rgba(190,215,240,0.35)'; ctx.lineWidth = 1.4; ctx.stroke();
      text((q ? 'PİLOTLAR' : 'GEMİLER') + (IS_TOUCH ? '' : q ? '  ·  E' : '  ·  Q'), b.x + b.w / 2, b.y + 21, 15, on ? '#ffffff' : 'rgba(225,238,250,0.75)', 'center', 700);
    }
    const L = storeList(), own = G.stTab ? G.ownA : G.ownS, cur = G.stTab ? G.av : G.sled;
    if (!L.length) text('Yükleniyor…', W / 2, 320, 15, '#ffffff', 'center', 500);
    for (let i = 0; i < L.length; i++) {
      const it = L[i], c = storeCard(i), has = own.indexOf(it.id) >= 0, sel = cur === it.id, can = G.coins >= it.price, lock = stLocked(i, it);
      const sh = G.deny > 0 && G.stDeny === i ? Math.sin(G.deny * 60) * 3 : 0, x = c.x + sh, px = x + c.w / 2, py = c.y + 48;
      const bg = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
      bg.addColorStop(0, sel ? 'rgba(70,46,16,0.96)' : 'rgba(18,36,56,0.94)'); bg.addColorStop(1, sel ? 'rgba(28,16,6,0.96)' : 'rgba(6,14,24,0.94)');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x, c.y, c.w, c.h, 12); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.roundRect(x + 2, c.y + 2, c.w - 4, c.h - 4, 10); ctx.clip();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(px, py, 48, sel ? '255,200,90' : has ? '110,230,170' : '110,170,255', sel ? 0.28 : 0.16); ctx.restore();
      if (G.stTab) COS.drawAvatar(ctx, it.id, px, py, 38, G.t + i * 0.7);
      else {
        ctx.translate(px, py + 2); ctx.scale(2.1, 2.1);
        COS.drawSled(ctx, it.id, sel ? Math.floor(G.t / 1.3) % 4 : 0, G.t + i * 0.7);      // seçili kızak güç kademelerini sırayla gösterir
      }
      ctx.restore();
      if (sel && G.stBuyT < 1.2) {      // satın alma parıltısı
        const k = G.stBuyT / 1.2;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,230,150,' + (1 - k) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py, 20 + 60 * k, 0, 6.3); ctx.stroke(); ctx.restore();
      }
      const kb = G.stCur === i && !sel;
      ctx.strokeStyle = kb ? '#ffffff' : sel ? '#ffd95a' : has ? 'rgba(125,255,176,0.55)' : 'rgba(190,215,240,0.3)';
      ctx.lineWidth = sel || kb ? 2.4 : 1.3; ctx.beginPath(); ctx.roundRect(x, c.y, c.w, c.h, 12); ctx.stroke();
      if (kb && !has) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.roundRect(x, c.y, c.w, c.h, 12); ctx.fill(); }
      if (lock) {      // kilitli: karart, kilit simgesi
        ctx.fillStyle = 'rgba(4,10,18,0.55)'; ctx.beginPath(); ctx.roundRect(x, c.y, c.w, c.h, 12); ctx.fill();
        ctx.strokeStyle = '#c9d6e4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py - 4, 6, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#c9d6e4'; ctx.fillRect(px - 8, py - 4, 16, 12); ctx.fillStyle = '#26323f'; ctx.fillRect(px - 1, py, 2, 5);
      }
      fitText(it.name, px, c.y + 101, 14, c.w - 12, lock ? 'rgba(225,238,250,0.6)' : '#ffffff', 700);
      if (sel) text('SEÇİLİ', px, c.y + 118, 12.5, '#7dffb0', 'center', 700);
      else if (has) text('SEÇ', px, c.y + 118, 12.5, '#ffe9b8', 'center', 700);
      else if (lock) text('PİLOT SV ' + stInfo(i).req + ' GEREKLİ', px, c.y + 118, 11.5, '#9fb2c8', 'center', 700);
      else { coinIcon(px - 20, c.y + 114, 4.5, 1); text(String(it.price), px - 12, c.y + 118.5, 13.5, can ? '#ffd95a' : '#ff8f80', 'left', 700); }
    }
    if (L[G.stCur]) {      // ayrıntı paneli: rol etiketleri, özel yaylım, artı
      const inf = stInfo(G.stCur), y0 = 520;
      ctx.fillStyle = 'rgba(8,18,30,0.85)'; ctx.beginPath(); ctx.roundRect(24, y0, 312, 68, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(190,215,240,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      let tx = 32;
      for (let q = 0; q < inf.tags.length; q++) {
        ctx.font = '700 10.5px ' + FONT; const tw = ctx.measureText(inf.tags[q]).width + 12;
        ctx.fillStyle = G.stTab ? 'rgba(160,120,255,0.3)' : 'rgba(255,140,60,0.3)'; ctx.beginPath(); ctx.roundRect(tx, y0 + 7, tw, 16, 8); ctx.fill();
        text(inf.tags[q], tx + tw / 2, y0 + 19, 10.5, '#ffffff', 'center', 700); tx += tw + 5;
      }
      if (!G.stTab) { fitText('ÖZEL: ' + inf.sp, W / 2, y0 + 40, 12, 300, '#ffe9b8', 700); fitText('ARTI: ' + inf.pa, W / 2, y0 + 58, 12, 300, 'rgba(190,215,240,0.9)', 500); }
      else { fitText('YETENEK: ' + inf.pa, W / 2, y0 + 40, 12, 300, '#e6dcff', 700); fitText('+ ' + (inf.pa2 || ''), W / 2, y0 + 58, 12, 300, '#e6dcff', 700); }
    }
    const fb = stFocusBuy();
    if (fb) {
      const lk = stLocked(G.stCur, fb), can = !lk && G.coins >= fb.price, sh = G.deny > 0 ? Math.sin(G.deny * 60) * 3 : 0;
      button(BTN.storeBuy, lk ? 'KİLİTLİ' : IS_TOUCH ? 'SATIN AL' : 'SATIN AL · B', lk ? 'SV ' + stInfo(G.stCur).req : fb.price + ' altın', true, can, can ? 0 : sh);
      button(BTN.storeBack2, 'GERİ', null, false, true);
    } else button(BTN.storeBack, IS_TOUCH ? 'GERİ' : 'GERİ  ·  ESC', null, false, true);
  }
  function drawStoreBtn() {      // ana menü sol üst: mağaza düğmesi + seçili avatar
    const b = BTN.store, pulse = 0.55 + 0.25 * Math.sin(G.t * 3);
    ctx.fillStyle = 'rgba(8,18,30,0.75)'; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,90,' + pulse + ')'; ctx.lineWidth = 1.4; ctx.stroke();
    if (window.COS) COS.drawAvatar(ctx, G.av, b.x + 17, b.y + b.h / 2, 13, G.t);
    text(IS_TOUCH ? 'MAĞAZA' : 'MAĞAZA · T', b.x + 35, b.y + 23, 15, '#ffe9b8', 'left', 700);
    text('PİLOT SV ' + pilotLevel(), b.x + 2, b.y + b.h + 15, 11, '#ffe9b8', 'left', 700);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(b.x + 2, b.y + b.h + 20, b.w - 4, 3);
    ctx.fillStyle = '#ffd95a'; ctx.fillRect(b.x + 2, b.y + b.h + 20, (b.w - 4) * lvProgress(), 3);
  }

  function setBanner(k) {
    const loop = Math.floor(k / NSEC);
    G.banner.t = 0;
    G.banner.a = 'ETAP ' + (k + 1);
    G.banner.b = LV.info(k).name;
  }

  function startGame(k) {
    k = k > 0 ? k : 0;
    G.won = false;
    G.last = k; store('bg_last', String(k));
    G.mode = 'playing'; G.score = 0; G.lives = G.av === 2 ? 4 : 3;      // Ayaz: 4 gemi
    G.sec = k; G.heat = 100; G.nextLife = 10000;
    G.checkpoint = k ? sec(k - 1).gateY + 24 : 40; G.newHi = false; G.shake = 0; G.flash = 0;
    G.cheated = false;
    G.power = 0; G.powerBase = 0; G.blastEcho = null; G.shield = 0; G.wing = 0; G.wingCd = 0; G.mag = 0; G.magOn = 0; G.windPf = 0; G.skate = 0; G.onLand = false;
    G.runCoins = 0; G.wind = 0; G.windWarn = 0; G.windT = 0; G.deny = 0;
    G.blastCd = 0; G.readyT = 0; P.holdT = 0; P.charge = 0; G.nukeCd = 0; G.nukeT = 0;
    G.stats.deaths = []; G.stats.gates = 0; G.breath = 0; bolts.length = 0; rings.length = 0; clearUltis();
    pilotStart();
    P.x = W / 2; P.wy = G.checkpoint; P.vx = 0; P.speed = SPEED_CRUISE; P.inv = 1.5; P.fireCd = 0.35; P.tilt = 0;
    shots.length = 0; orbs.length = 0; shells.length = 0; parts.length = 0; pops.length = 0;
    mouse.mx = 0; mouse.my = 0; mouse.down = false;      // farenin şu anki konumu sıfır noktası
    if (mouse.active) lockPointer();
    rearm(); setBanner(k);
    A.resume(); A.play('start'); A.startMusic();
  }

  function addScore(n) {
    G.score += n;
    while (G.score >= G.nextLife) {
      G.nextLife += 10000;
      if (G.lives < 6) { G.lives++; A.play('extraLife'); pop(P.x, P.wy + 40, '+1 GEMİ', '#7dffb0'); }
    }
  }

  function die(why, hard) {
    if (G.mode !== 'playing') return;
    if (G.shield > 0 && !hard && (why === 'crash' || why === 'beam' || why.indexOf('ulti:') === 0)) {      // kalkan: düşman, mermi ve ışık çitini bir kez emer (kıyı ve girdap hariç)
      G.shield--; P.inv = 1.3; G.flash = Math.max(G.flash, 0.3); G.shake = Math.max(G.shake, 6); padRumble(200, 0.6);
      boom(P.x, P.wy, 18, ['#ffffff', '#bfe4ff', '#5fb4ff'], 130);
      pop(P.x, P.wy + 40, G.shield ? 'KALKAN −1' : 'KALKAN KIRILDI', '#8fd0ff'); A.play('shatter');
      return;
    }
    G.mode = 'dying'; G.deathT = 1.5; G.shake = 9; padRumble(450, 1);
    G.deathMsg = why.indexOf('ulti:') === 0 ? why.slice(5) : why === 'freeze' ? (G.heat <= 0 ? 'YAKIT BİTTİ — DÜŞTÜN' : 'BUZA SAPLANDIN') : why === 'beam' ? 'IŞIK ÇİTİNE ÇARPTIN' : why === 'whirl' ? 'GİRDABA KAPILDIN' : 'GEMİ PARÇALANDI';
    G.stats.deaths.push({ why: why, sec: G.sec, wy: Math.round(P.wy), x: Math.round(P.x) });
    if (why === 'freeze') { boom(P.x, P.wy, 26, ['#ffffff', '#bfe9ff', '#7fc8ff', '#e8f7ff'], 90); A.play('freeze'); }
    else { boom(P.x, P.wy, 34, ['#ffffff', '#ffd27a', '#ff8a3c', '#ff5a36'], 150); A.play('playerDie'); }
    A.stopEngine(); A.setCharging(false); A.setLowHeat(false); A.setWind(0); A.setWeaponCharge(0);
    P.charge = 0; P.holdT = 0; G.windPf = 0; G.skate = 0; G.onLand = false; G.landT = 0;      // rüzgâr kalkanı ve paten ölünce gider
  }

  function pilotStart() {      // pilot pasifleri: Ayaz kalkan, Pusula mıknatıs, Aurora dron
    if (G.av === 2) G.shield = Math.max(G.shield, 1);
    if (G.av === 3) G.windPf = 1;      // Vega: rüzgâr işlemez
    if (G.av === 4) G.mag = Math.max(G.mag, 2);
    if (G.av === 5) G.wing = Math.max(G.wing, 2);
  }

  function afterDeath() {
    G.lives--;
    if (G.lives <= 0) {
      G.mode = 'gameover'; G.overT = 0;
      if (G.score > G.hi && !G.cheated) { G.hi = G.score; G.newHi = true; store('bg_hi', String(G.hi)); }
      A.stopMusic();
      mouse.down = false; unlockPointer();
      return;
    }
    P.x = W / 2; P.wy = G.checkpoint; P.vx = 0; P.speed = SPEED_CRUISE; P.inv = 1.8; P.fireCd = 0.3; P.tilt = 0;
    G.heat = 100; shots.length = 0; orbs.length = 0; shells.length = 0; clearUltis();
    mouse.mx = 0; mouse.my = 0;                          // yeniden doğunca sıfır noktası da yenilenir
    G.blastCd = 0; P.holdT = 0; P.charge = 0; G.breath = 0;            // yeni kızak, yaylım hazır
    pilotStart();
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
  function pop(x, wy, text, color) { pops.push({ x: clamp(x, 70, W - 70), wy: wy, text: text, life: 1.1, color: color || '#ffe9b8' }); }

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
      inp.left = !!keys.left; inp.right = !!keys.right; inp.up = !!keys.up || pad.up; inp.down = !!keys.down || pad.down; inp.fire = !!keys.fire || pad.fire;
    }

    const s = sec(G.sec);
    const sm = G.sm = speedMul(G.sec), vMin = SPEED_MIN * sm, vCr = SPEED_CRUISE * sm, vMax = SPEED_MAX * sm;
    const lat = 126 * Math.sqrt(sm) * Math.sqrt(mouse.sens / SENS_LEVELS[SENS_DEFAULT - 1]);     // klavye yan hızı (180 fazla sıçratıyordu)

    // rüzgâr: önce uyarı, sonra birkaç saniyelik yan itiş
    const w0 = s.info.wind || 0;
    if (w0) {
      G.windT += dt;
      const c = G.windT % 6.5, dir = hash(Math.floor(G.windT / 6.5) + G.sec * 7.3) < 0.5 ? -1 : 1;
      const env = c < 1.2 ? 0 : c < 1.6 ? (c - 1.2) / 0.4 : c < 2.8 ? 1 : c < 3.2 ? (3.2 - c) / 0.4 : 0;      // 1,2 sn uyarı, ~1,6 sn esinti
      G.wind = G.windPf ? 0 : w0 * dir * env * (1 + 0.15 * s.loop);
      G.windWarn = c > 0.2 && c < 3.2 ? dir : 0;
    } else { G.wind = 0; G.windWarn = 0; G.windT = 0; }
    if (G.gust && G.gust.t > 0) {      // bekçi fırtınası: güçlü yan rüzgâr (Vega etkilenmez)
      G.gust.t -= dt;
      if (!G.windPf) { G.wind += G.gust.dir * 125 * Math.min(1, G.gust.t * 2, (2.6 - G.gust.t) * 3); G.windWarn = G.gust.dir; }
    }
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
      const ax = pad.ax || (inp.right ? 1 : 0) - (inp.left ? 1 : 0);      // kol çubuğu oransal, klavye tam
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
    if (G.onLand) target = Math.min(target, vMin * 0.55);      // karada belirgin yavaşla
    P.speed = approach(P.speed, target, (G.onLand ? 600 : 230) * sm * dt);
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
    if (G.breath > 0) {      // ejder nefesi: kısa ömürlü alev parçacıkları
      G.breath -= dt; G.breathAcc = (G.breathAcc || 0) + dt * 42;
      while (G.breathAcc >= 1) {
        G.breathAcc--;
        const a = rand(-0.38, 0.38), v = rand(250, 330);
        shots.push({ x: P.x + rand(-3, 3), wy: P.wy + 14, v: Math.cos(a) * v + P.speed, vx: Math.sin(a) * v, dmg: 1 + Math.floor(G.power / 6), pellet: true, flame: true, life: 0.42, pierce: 1 });
      }
    }
    if (G.blastEcho) { G.blastEcho.t -= dt; if (G.blastEcho.t <= 0) { blastFx(G.blastEcho.c); A.play('blast'); if (--G.blastEcho.n > 0) G.blastEcho.t = 0.16; else G.blastEcho = null; } }
    if (G.nukeCd > 0) { G.nukeCd -= dt; if (G.nukeCd <= 0) { G.nukeCd = 0; A.play('blastReady'); pop(P.x, P.wy + 40, 'NÜKLEER HAZIR', '#7dffb0'); } }
    if (G.wing) wingFire(dt);
    const autoRelease = cfg.auto;       // otomatik pilotta dolunca kendi ateşler
    const shootNormal = function () {
      if (P.fireCd > 0 || normalShots() >= 60) return;
      const n = shotCount(), dm = 1 + Math.floor(G.power / 5) + (G.power >= POWER_MAX ? 1 : 0);       // +%50: çift, +%100: üçlü, +%125: çift hasar, +%200: dörtlü, +%250: üç kat hasar
      const pierce = G.power >= 13 ? 1 : 0;
      for (let i = 0; i < n; i++) shots.push({ x: P.x + (i - (n - 1) / 2) * 9, wy: P.wy + 14, v: 440 + P.speed, vx: 0, dmg: dm, pierce: pierce });
      if (G.power >= 11) for (let q = -1; q <= 1; q += 2) shots.push({ x: P.x + q * 12, wy: P.wy + 10, v: 410 + P.speed, vx: q * (G.power >= 15 ? 150 : 110), dmg: dm, pierce: pierce, side: true });
      if (G.power >= 15) for (let q = -1; q <= 1; q += 2) shots.push({ x: P.x + q * 14, wy: P.wy + 10, v: 430 + P.speed, vx: q * 55, dmg: dm, pierce: pierce, side: true });
      P.fireCd = 1 / fireRate();
      A.play(n > 1 ? 'shoot2' : 'shoot');
    };
    if (tb.seen && !cfg.auto) {
      // dokunmatik: tekli ateş hep otomatik; yaylım yalnızca düğmeyle (dokun: hemen, basılı tut: şarj et, bırak: at)
      if (tb.rel) {
        tb.rel = false;
        if (G.blastCd <= 0) { P.charge = Math.max(P.charge, BLAST_MIN); fireBlast(); } else A.play('deny');
      } else if (tb.blastId !== null && G.blastCd <= 0) P.charge = Math.min(1, P.charge + dt / BLAST_CHARGE);
      else { P.charge = 0; shootNormal(); }
    } else if (inp.fire) {
      P.holdT += dt;
      if (G.blastCd <= 0 && P.holdT > BLAST_HOLD) {
        // yaylım hazırsa basılı tutmak şarj eder (bu sırada tekli atış yok)
        P.charge = Math.min(1, P.charge + dt / BLAST_CHARGE);
        if (autoRelease && P.charge >= 1) fireBlast();
      } else shootNormal();
    } else {
      if (P.charge >= BLAST_MIN) fireBlast();
      P.charge = 0; P.holdT = 0;
    }
    A.setWeaponCharge(P.charge);

    // ısı
    G.heat -= HEAT_DRAIN * s.def.drain * (1 + 0.1 * s.loop) * dt * (G.av === 0 ? 0.85 : 1);      // Nova: yakıt yavaş biter
    let charging = false;
    for (let k = G.sec; k <= G.sec + 1 && !charging; k++) {
      const vs = sec(k).vents;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (Math.abs(P.x - v.x) < v.hw + 6 && Math.abs(P.wy - v.y) < v.hl + 9) { charging = true; break; }
      }
    }
    if (charging) {
      G.heat = Math.min(100, G.heat + HEAT_CHARGE * sm * dt * (G.av === 0 ? 1.4 : 1));      // Nova: +%40 yakıt
      if (Math.random() < 0.6) part(P.x + rand(-9, 9), P.wy + rand(-8, 10), rand(-10, 10), rand(10, 50), rand(0.3, 0.7), rand(1.5, 3), '#ffd9a0', true);
    }
    if (charging && !G.charging) A.play('vent');
    G.charging = charging;
    A.setCharging(charging);
    A.setLowHeat(G.heat < 25);
    if (G.heat <= 0) { G.heat = 0; die('freeze'); return; }

    // altınlar
    if (G.magOn > 0) G.magOn = Math.max(0, G.magOn - dt);
    for (let i = coinsL.length - 1; i >= 0; i--) {
      const c = coinsL[i];
      if (c.pullT !== undefined && !c.pull && (c.pullT -= dt) <= 0) c.pull = true;
      if (G.mag > 0 && !c.pull && Math.hypot(c.x - P.x, (c.wy - P.wy) * 0.8) < MAG_R[G.mag]) c.pull = true;      // mıknatıs açıkken yaklaşan her şey çekilir
      if (c.pull) {
        const dx = P.x - c.x, dy = P.wy - c.wy, d = Math.hypot(dx, dy) || 1;
        c.pv = Math.min(900, (c.pv || 120) + 1400 * dt);
        const st = Math.min(d, c.pv * dt);
        c.x += dx / d * st; c.wy += dy / d * st + P.speed * dt;
      }
      const pr = c.pw ? 9 : 0;      // güçlendirmeler yarım gemi uzaklıktan da toplanır
      if (Math.abs(P.x - c.x) < 12 + c.v + pr && Math.abs(P.wy - c.wy) < 14 + c.v + pr) {
        coinsL.splice(i, 1);
        if (c.pw) { if (c.k === 'mag') magnetUp(); else if (c.k === 'wd') windUp(); else if (c.k === 'sk') skateUp(); else if (c.k === 'sh') shieldUp(); else if (c.k === 'wing') wingUp(); else powerUp(); continue; }
        let gv = c.v; if (G.sled === 5) { G.goldAcc += gv * 0.2; const ex = Math.floor(G.goldAcc); G.goldAcc -= ex; gv += ex; }      // Altın İmparator: +%20
        G.coins += gv; G.runCoins += gv; store('bg_coins', String(G.coins));
        addScore(10 * c.v);
        A.play(c.v > 1 ? 'bigCoin' : 'coin');
        if (c.v > 1) pop(c.x, c.wy + 12, '+' + c.v + ' ALTIN', '#ffd95a');
        for (let q = 0; q < 4 + c.v; q++) part(c.x, c.wy, rand(-50, 50), rand(-20, 70), rand(0.25, 0.5), rand(1.2, 2.4), '#ffe27a', true);
      } else if (sy(c.wy) > H + 40) coinsL.splice(i, 1);
    }

    // kıyıya ya da adaya çarpma
    const wasLand = G.onLand; G.onLand = false;
    if (solid(P.x - 5, P.wy - 7) || solid(P.x + 5, P.wy - 7) || solid(P.x - 5, P.wy + 6) || solid(P.x + 5, P.wy + 6) || solid(P.x, P.wy + 11)) {
      if (!G.skate) { die('crash', true); return; }
      G.onLand = true;      // buz pateni: karada yavaşça kayarak geçer
      G.landT = (G.landT || 0) + dt;
      if (G.landT > 5) { G.skate = 0; G.landT = 0; G.onLand = false; die('freeze'); return; }
      if (Math.random() < 0.7) part(P.x + rand(-7, 7), P.wy - 10, rand(-40, 40), -rand(20, 60), rand(0.3, 0.6), rand(1.5, 3), '#ffffff', false);
    }

    if (wasLand && !G.onLand) { G.skate = 0; G.landT = 0; pop(P.x, P.wy + 34, 'SÜZÜLME BİTTİ', '#e9f3ff'); }      // her paten bir kez geçirir
    // fener kapısı
    const gy = s.gateY;
    if (P.wy >= gy) {
      const bonus = 500 + Math.round(G.heat) * 5;
      addScore(bonus);
      pop(W / 2, gy + 46, 'FENER  +' + bonus, '#ffe9b8');
      G.heat = Math.min(100, G.heat + 25);
      G.checkpoint = gy + 24;
      G.sec++; G.stats.gates++; G.flash = 0.35;
      if (G.sec > G.best && !G.cheated) { G.best = G.sec; store('bg_stage', String(G.best)); }
      if (!G.cheated) { G.last = G.sec; store('bg_last', String(G.last)); }      // menüdeki devam: son oyunda varılan etap
      if (G.sec >= MAXLV) {      // 50 etap bitti: oyun kazanıldı
        G.won = true; G.mode = 'gameover'; G.overT = 0;
        if (G.score > G.hi && !G.cheated) { G.hi = G.score; G.newHi = true; store('bg_hi', String(G.hi)); }
        if (!G.cheated) { G.last = 0; store('bg_last', '0'); }
        A.stopMusic(); A.stopEngine(); A.play('lapDone'); mouse.down = false; unlockPointer();
        return;
      }
      if (G.sec % NSEC === 0) { G.powerBase = G.power; addScore(5000); pop(W / 2, gy + 80, '+5000', '#7dffb0'); A.play('lapDone'); }
      else A.play('gate');
      arm(G.sec + 1);
      setBanner(G.sec);
      for (let i = 0; i < 22; i++) {
        const sx = i % 2 ? W / 2 - GATE : W / 2 + GATE;
        part(sx, gy, rand(-40, 40), rand(-20, 90), rand(0.4, 1), rand(1.5, 3), i % 3 ? '#ffe9b8' : '#7dffb0', true);
      }
    }
  }

  function normalShots() { let n = 0; for (let i = 0; i < shots.length; i++) if (!shots[i].pellet && !shots[i].homing && !shots[i].side) n++; return n; }
  // Şarj seviyesine göre 5–11 fişek, yelpaze açısı ±16°–±42°; tam şarjda fişekler çift hasar verir
  function pellets(c) {
    const n = 5 + Math.round(c * 6) + Math.min(8, G.power), half = (16 + 26 * c) * Math.PI / 180, v = 470;
    const dm = (c >= 1 ? 2 : 1) + Math.floor(G.power / 5);
    for (let i = 0; i < n; i++) {
      const a = -half + 2 * half * i / (n - 1);
      shots.push({ x: P.x, wy: P.wy + 14, v: Math.cos(a) * v + P.speed, vx: Math.sin(a) * v, dmg: dm, pellet: true });
    }
  }
  function powerUp() {
    if (G.power >= POWER_MAX) { overNuke(); return; }
    G.power++;
    const NAMES = { 1: 'HIZLI ATIŞ', 2: 'HIZLI ATIŞ II', 3: 'HIZLI ATIŞ III', 4: 'ÇİFT ATIŞ', 5: 'ÇİFT YAYLIM', 6: 'ÜÇLÜ ATIŞ', 9: 'DÖRTLÜ ATIŞ', 10: 'ÜÇLÜ YAYLIM', 11: 'ÇAPRAZ ATIŞ', 13: 'DELİCİ MERMİ', 15: 'YELPAZE ATIŞ', 16: 'TAM GÜÇ' };
    const msg = NAMES[G.power] || 'SİLAH GÜÇLENDİ';
    pop(P.x, P.wy + 34, msg, '#ff9a4d');
    G.flash = Math.max(G.flash, 0.2);
    A.play('powerUp');
  }
  // sınırdaki güçlendirme tekrar alınırsa bedava nükleer patlar (bekleme süresine dokunmaz)
  function overNuke() {      // taşma: ekrandaki düşmanlara güdümlü misil yağmuru (sarsıntısız)
    const c = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], y = sy(e.wy);
      if (e.dead || e.type === 'beam' || e.type === 'whirl' || y < 0 || y > PSY - 10) continue;
      c.push(e);
    }
    for (let i = 0; i < 7; i++) {      // 7 misil: 6 sn gemi çevresinde döner, düşman çıktıkça dalar
      const q = i % 2 ? 1 : -1;
      shots.push({ x: P.x + q * 17, wy: P.wy + 4, v: P.speed + 120, vx: q * (80 + i * 14), dmg: 3, homing: true, tgt: c.length > i ? c[i] : null, loiter: 6, orbA: i * 0.8976 });
    }
    pop(P.x, P.wy + 34, 'MİSİL YAĞMURU', '#7dffb0'); A.play('orb');
  }
  function skateUp() {
    if (G.skate) { overNuke(); return; }
    G.skate = 1; pop(P.x, P.wy + 34, 'SÜZÜLME MOTORU', '#e9f3ff'); G.flash = Math.max(G.flash, 0.2); A.play('powerUp');
  }
  function windUp() {
    if (G.windPf) { overNuke(); return; }
    G.windPf = 1; pop(P.x, P.wy + 34, 'RÜZGÂR KALKANI', '#9ff5e8'); G.flash = Math.max(G.flash, 0.2); A.play('powerUp');
  }
  function magnetUp() {
    if (G.mag >= MAG_MAX) { overNuke(); return; }
    G.mag = Math.min(MAG_MAX, G.mag + 1);
    const R = MAG_R[G.mag];
    let n = 0;
    for (let i = 0; i < coinsL.length; i++) {
      const c = coinsL[i];
      if (!c.pull && Math.hypot(c.x - P.x, (c.wy - P.wy) * 0.8) < R) { c.pull = true; n++; }
    }
    G.magT = 0.6;
    pop(P.x, P.wy + 34, 'MIKNATIS ' + G.mag, '#ff7ad1');
    G.flash = Math.max(G.flash, 0.15); A.play('powerUp');
  }
  function shieldUp() {
    if (G.shield >= SHIELD_MAX) { overNuke(); return; }
    G.shield++;
    pop(P.x, P.wy + 34, G.shield > 1 ? 'ÇİFT KALKAN' : 'KALKAN', '#8fd0ff'); G.flash = Math.max(G.flash, 0.2); A.play('powerUp');
  }
  function wingUp() {
    if (G.wing >= WING_MAX) { overNuke(); return; }
    G.wing = Math.min(WING_MAX, G.wing + 1); G.wingCd = 0.4;
    pop(P.x, P.wy + 34, G.wing === 1 ? 'YARDIMCI DRONLAR' : G.wing === 2 ? 'DRONLAR HIZLANDI' : 'DRONLAR TAM GÜÇ', '#7dffb0'); G.flash = Math.max(G.flash, 0.2); A.play('powerUp');
  }
  // Kanat yardımcıları: iki yanda uçar, en yakın düşmanlara güdümlü misil atar. 1: 1,4 sn'de bir · 2: 0,9 sn · 3: çift misil, 3 hasar. Can kaybedince gitmez.
  function wingFire(dt) {
    G.wingCd -= dt;
    if (G.wingCd > 0) return;
    const c = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], y = sy(e.wy);
      if (e.dead || e.type === 'beam' || e.type === 'whirl' || y < 10 || y > PSY - 20) continue;
      c.push(e);
    }
    if (!c.length) { G.wingCd = 0.2; return; }
    c.sort(function (p, q) { return Math.hypot(p.x - P.x, p.wy - P.wy) - Math.hypot(q.x - P.x, q.wy - P.wy); });
    // soldaki yardımcı soldaki hedefe, sağdaki sağdakine
    const a = c[0], b = c[1] || c[0], l = a.x <= b.x ? a : b, r = a.x <= b.x ? b : a;
    const dmg = G.wing >= 3 ? 3 : 2, per = G.wing >= 3 ? 2 : 1;
    for (let q = 0; q < per; q++) {
      const t1 = q ? (c[2] || l) : l, t2 = q ? (c[3] || r) : r;
      shots.push({ x: P.x - 17, wy: P.wy + 4 - q * 6, v: P.speed + 200, vx: -70 - q * 40, dmg: dmg, homing: true, tgt: t1 });
      shots.push({ x: P.x + 17, wy: P.wy + 4 - q * 6, v: P.speed + 200, vx: 70 + q * 40, dmg: dmg, homing: true, tgt: t2 });
    }
    G.wingCd = G.wing >= 2 ? 0.9 : 1.4; A.play('orb');
  }
  // Gemiye göre özel yaylım
  function blastFx(c) {
    const k = G.sled;
    if (k === 1) {      // buz mızrağı: delici düz hatlar
      const lanes = c >= 1 ? 5 : c > 0.4 ? 3 : 1, dm = 2 + Math.floor(G.power / 4) + (c >= 1 ? 1 : 0);
      G.fxFlash = 0.14; G.fxCol = '160,230,255';
      for (let i = 0; i < lanes; i++) for (let q = 0; q < 4; q++) shots.push({ x: P.x + (i - (lanes - 1) / 2) * 8, wy: P.wy + 14 + q * 14, v: 720 + P.speed, vx: 0, dmg: dm, pierce: 99, pellet: true, lance: true });
    } else if (k === 2) {      // zincir şimşek
      const n = 4 + Math.round(c * 2) + Math.floor(G.power / 6), dm = 3 + Math.floor(G.power / 4) + (c >= 1 ? 2 : 0), hit = [];
      let fx = P.x, fw = P.wy + 14;
      for (let q = 0; q < n; q++) {
        let best = null, bd = 230;
        for (let i = 0; i < ents.length; i++) {
          const e = ents[i], y = sy(e.wy);
          if (e.dead || e.type === 'beam' || e.type === 'whirl' || e.sub > 0.5 || (e.type === 'boss' && e.flee) || y < 0 || y > H || hit.indexOf(e) >= 0) continue;
          const d = Math.hypot(e.x - fx, e.wy - fw);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        bolts.push({ x1: fx, w1: fw, x2: best.x, w2: best.wy, life: 0.5 });
        boom(best.x, best.wy, 10, ['#ffffff', '#fff3a0', '#ffd23a'], 110);
        hit.push(best); best.hp -= dm;
        if (best.hp <= 0) kill(best, true); else best.flash = 0.14;
        fx = best.x; fw = best.wy;
      }
      if (!hit.length) bolts.push({ x1: P.x, w1: P.wy + 14, x2: P.x + rand(-40, 40), w2: P.wy + 220, life: 0.4 });
      G.fxFlash = 0.18; G.fxCol = '255,240,150'; G.shake = Math.max(G.shake, 4);
    } else if (k === 3) {      // yıldız halkası: her yöne fişek, yakındaki mermileri siler
      const n = 18 + Math.round(c * 10), v = 420, dm = 1 + Math.floor(G.power / 5) + (c >= 1 ? 1 : 0), R = 110 + 60 * c;
      for (let i = 0; i < n; i++) { const a = i / n * 6.2832; shots.push({ x: P.x, wy: P.wy, v: Math.cos(a) * v + P.speed, vx: Math.sin(a) * v, dmg: dm, pellet: true, star: true }); }
      for (let i = orbs.length - 1; i >= 0; i--) if (Math.hypot(orbs[i].x - P.x, orbs[i].wy - P.wy) < R) { boom(orbs[i].x, orbs[i].wy, 6, ['#ffffff', '#ffb8f0'], 70); orbs.splice(i, 1); }
      rings.push({ x: P.x, wy: P.wy, R: R, life: 0.6 }); rings.push({ x: P.x, wy: P.wy, R: R * 1.5, life: 0.75 });
      G.fxFlash = 0.2; G.fxCol = '255,170,240'; G.shake = Math.max(G.shake, 5);
    } else if (k === 4) {      // ejder nefesi
      G.breath = Math.max(G.breath, 1.1 + 0.6 * c); G.fxFlash = 0.12; G.fxCol = '255,150,60';
    } else if (k === 5) {      // altın füze yağmuru
      const n = 6 + Math.round(c * 6) + Math.floor(G.power / 4), dm = 2 + Math.floor(G.power / 5), tg = [];
      for (let i = 0; i < ents.length; i++) { const e = ents[i], y = sy(e.wy); if (!e.dead && e.type !== 'beam' && e.type !== 'whirl' && y > 0 && y < PSY - 20) tg.push(e); }
      G.fxFlash = 0.15; G.fxCol = '255,215,100';
      for (let i = 0; i < n; i++) { const a = -0.9 + 1.8 * i / Math.max(1, n - 1); shots.push({ x: P.x + Math.sin(a) * 10, wy: P.wy + 10, v: P.speed + 220, vx: Math.sin(a) * 260, dmg: dm, homing: true, gold: true, tgt: tg.length ? tg[i % tg.length] : null }); }
    } else pellets(c);
  }
  function fireBlast() {
    const c = P.charge;
    blastFx(c);
    if (G.power >= 5) G.blastEcho = { t: 0.16, c: c, n: G.power >= POWER_MAX ? 3 : G.power >= 10 ? 2 : 1 };      // yaylım 5'te çift, 10'da üçlü, 16'da dörtlü gider
    for (let i = 0; i < 16; i++) part(P.x + rand(-6, 6), P.wy + 14, rand(-110, 110), rand(40, 190), rand(0.2, 0.45), rand(1.5, 3), i % 2 ? '#fff6da' : '#ffcf8a', true);
    G.blastCd = blastCdMax(); G.shake = Math.max(G.shake, 3 + 3 * c);
    P.charge = 0; P.fireCd = 0.25;
    A.setWeaponCharge(0); A.play('blast');
  }

  // Işık çiti ve girdap: vurulamaz, zamanlama ve yön ister
  function hazard(e, dt, playing) {
    if (e.type === 'beam') {
      const t = (G.t + e.bph) % e.period;
      e.on = t < e.onT; e.warn = !e.on && t > e.period - 0.45;
      if (playing) for (let j = shots.length - 1; j >= 0; j--) {        // uçtaki kulelerden birini vur: çit kalıcı olarak söner
        const s = shots[j];
        if (Math.abs(s.wy - e.wy) < 9 && (Math.abs(s.x - e.minX) < 7 || Math.abs(s.x - e.maxX) < 7)) {
          shots.splice(j, 1);
          e.dead = true;
          boom(Math.abs(s.x - e.minX) < 7 ? e.minX : e.maxX, e.wy, 16, ['#ffffff', '#ffb0c0', '#ff5a7d'], 110);
          G.shake = Math.max(G.shake, 4); A.play('explode');
          addScore(80); pop(e.x, e.wy + 12, 'ÇİT KAPANDI  +80', '#ffb0c0');
          return;
        }
      }
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
  const BOSS_NAMES = ['GÖZCÜ', 'BUZ ÖRÜMCEĞİ', 'FIRTINA KARTALI', 'BUZ KALESİ', 'KUZEY KRALI', 'BUZ YILANI', 'KRİSTAL GÖZ', 'KAR DEVİ', 'GÖLGE KUZGUN', 'BUZULUN TANRISI'];
  function mkEnt(type, x, wy, hard, o) {
    const sz = SIZE[type], e = { type: type, x: x, wy: wy, vx: 0, hw: sz[0], hh: sz[1], hp: NEWHP[type] || 1, cd: 0.8, rate: 1, hard: hard, flash: 0,
      ph: Math.random() * 6.28, ang: 0, dead: false, armed: true, up: true, sub: 0 };
    if (o) for (const q in o) e[q] = o[q];
    ents.push(e); return e;
  }
  function bossUpdate(e, dt, playing) {
    if (!playing) return false;
    if (!e.on) {
      e.on = true; e.scr = -60; G.boss = e; pop(W / 2, P.wy + 260, BOSS_NAMES[e.kind || 0] + ' GELİYOR', '#ff8f80'); A.play('orb');
      e.maxHp = e.hp = Math.round(e.baseHp * (1 + 0.1 * G.power + 0.12 * G.wing));      // can: silah gücüne ve dronlara göre katsayı
    }
    if (e.flee || P.wy > e.arenaEnd) {
      if (!e.flee) { e.flee = true; pop(W / 2, P.wy + 220, 'BEKÇİ KAÇTI', '#ff8f80'); clearUltis(); e.lg = null; e.ult = null; e.ulti = 0; e.lunge = 0; }
      e.scr -= 240 * dt;
      if (e.scr < -36) { e.dead = true; G.boss = null; }
    } else {
      let scrT = 120;
      if (e.lg) {      // atılım: hızla kızağın üstüne iner, sonra geri çekilir
        const g = e.lg; g.t += dt;
        const ph = g.t < 0.4 ? g.t / 0.4 : g.t < 0.55 ? 1 : g.t < 1.3 ? 1 - (g.t - 0.55) / 0.75 : 0;
        e.lunge = ph; scrT = 120 + (PSY - 6 - 120) * ph;
        if (g.t >= 1.3) { e.lg = null; e.lunge = 0; }
      }
      e.scr += (scrT - e.scr) * Math.min(1, dt * (e.lg ? 10 : 1.4));
    }
    e.wy = P.wy + PSY - e.scr;
    const t = terrain(e.wy, T2);
    const swayX = W / 2 + Math.sin(G.t * 0.9 + e.ph) * (e.kind === 5 ? 110 : 84);
    if (e.lg) e.x = clamp(approach(e.x, e.lg.lx, 520 * dt), t.L + 30, t.R - 30);      // atılımda hedef: başlangıçtaki kızak konumu
    else if (e.tx != null) { e.tx = approach(e.tx, swayX, 22 * dt); e.x = clamp(e.tx, t.L + 46, t.R - 46); }      // kuzgun ışınlandıktan sonra yavaşça yörüngesine döner
    else e.x = clamp(swayX, t.L + 46, t.R - 46);
    if (e.flee) return false;
    e.cd -= dt; e.cd2 -= dt; e.cd3 -= dt;
    const base = Math.atan2(PSY - e.scr, P.x - e.x), rage = e.hp < e.maxHp * 0.4 ? 1.35 : 1, tier = Math.floor(G.sec / BOSS_EVERY);
    const shoot = (a, v) => orbs.push({ x: e.x, wy: e.wy - 12, vx: Math.cos(a) * v, vy: P.speed - Math.sin(a) * v });
    e.spin = (e.spin || 0) + dt * (e.kind === 1 ? 2.6 : 1.2) * rage;
    if (e.lg && e.lg.ring && !e.lg.shot && e.lg.t >= 0.4) { e.lg.shot = true; for (let q = 0; q < 12; q++) shoot(q * Math.PI / 6 + e.spin, 150 * e.hard); A.play('orb'); }
    // --- özel saldırı (ulti): şarj, sonra bekçiye özgü büyük saldırı
    if (!e.ult && e.cd3 <= 0 && e.scr > 70 && !e.lg) {
      const uk = e.kind === 9 ? [0, 4, 6, 5][(e.uc = ((e.uc || 0) + 1) % 4)] : e.kind;
      e.ult = { k: uk, t: 0, fired: false, dur: uk === 8 ? 3.8 : uk === 4 ? 1.4 : 1.1 };
      pop(W / 2, P.wy + 200, ULTI_NAMES[e.kind], '#ff8f80'); A.play('blastReady'); G.shake = Math.max(G.shake, 3);
    }
    if (e.ult) {
      const u = e.ult; u.t += dt; e.ulti = clamp(u.t / 0.9, 0, 1);
      if (u.t >= 0.9 && !u.fired) { u.fired = true; ultiFire(e, u, t, shoot, rage, tier); }
      if (u.fired) ultiTick(e, u, t, shoot, rage);
      if (u.t >= 0.9 + u.dur) { e.ult = null; e.ulti = 0; e.cd3 = Math.max(4.2, 7.5 - 0.3 * tier) / rage; }
    }
    if (e.cd <= 0 && e.scr > 70 && !e.ult) {
      const v = 135 * e.hard, k = e.kind === 4 ? Math.floor(G.t / 4) % 4 : e.kind === 9 ? 5 + Math.floor(G.t / 4) % 4 : e.kind;      // 5. ve 10. bekçi önceki desenleri sırayla dener
      if (k === 0) {      // Gözcü: oyuncuya yelpaze
        const n = e.hard > 1.2 ? 5 : 3;
        for (let i = 0; i < n; i++) shoot(base + (i - (n - 1) / 2) * 0.3, v);
        e.cd = 1.9 / e.hard / rage;
      } else if (k === 1) {      // Örümcek: dönen çift spiral
        for (let q = 0; q < 2; q++) shoot(Math.PI / 2 + Math.sin(e.spin) * 1.1 + q * 0.5 - 0.25, v * 0.9);
        e.cd = 0.22 / rage;
      } else if (k === 2) {      // Kartal: geniş yaylım + nişanlı ikili
        if ((e.burst = ((e.burst || 0) + 1) % 3) === 0) { for (let i = 0; i < 11; i++) shoot(Math.PI / 2 + (i - 5) * 0.2, v * 0.85); e.cd = 1.4 / rage; }
        else { shoot(base - 0.06, v * 1.25); shoot(base + 0.06, v * 1.25); e.cd = 0.45 / rage; }
      } else if (k === 3) {      // Kale: aşağı yarım halka dalgası, her seferinde kayık
        const off = (e.wave = ((e.wave || 0) + 1) % 2) * 0.13;
        for (let i = 0; i <= 12; i++) shoot(0.13 + off + i * (Math.PI - 0.26) / 12 - 0.065, v * 0.75);
        e.cd = 1.5 / e.hard / rage;
      } else if (k === 5) {      // Buz Yılanı: birbirine dolanan iki dalgalı akış
        const sw = Math.sin(e.spin * 1.6) * 0.75;
        shoot(Math.PI / 2 + sw - 0.18, v * 0.95); shoot(Math.PI / 2 - sw + 0.18, v * 0.95);
        e.cd = 0.17 / rage;
      } else if (k === 6) {      // Kristal Göz: dönen altı kollu sarmal, arada hızlı nişanlı üçlü
        if ((e.burst = ((e.burst || 0) + 1) % 8) === 0) { for (let q = -1; q <= 1; q++) shoot(base + q * 0.05, v * 1.4); e.cd = 0.5 / rage; }
        else { for (let q = 0; q < 6; q++) shoot(e.spin * 1.3 + q * Math.PI / 3, v * 0.8); e.cd = 0.34 / rage; }
      } else if (k === 7) {      // Kar Devi: havada parçalanan kaya + nişanlı ikili
        if ((e.burst = ((e.burst || 0) + 1) % 3) === 0) {
          orbs.push({ x: e.x, wy: e.wy - 16, vx: (P.x - e.x) * 0.3, vy: P.speed - v * 0.6, big: true, hp: 4, split: 1.05 });
          e.cd = 1.1 / rage;
        } else { shoot(base - 0.08, v * 1.2); shoot(base + 0.08, v * 1.2); e.cd = 0.55 / rage; }
      } else if (k === 8) {      // Gölge Kuzgun: ışınlan, nişanlı beşli, sonra tam halka
        const st = e.burst = ((e.burst || 0) + 1) % 3;
        if (st === 1) {
          for (let q = 0; q < 14; q++) part(e.x + rand(-30, 30), e.wy + rand(-12, 12), rand(-60, 60), P.speed + rand(-40, 40), rand(0.3, 0.6), rand(2, 4), '#9a6bff', true);
          e.tx = rand(t.L + 50, t.R - 50); e.cd = 0.45 / rage;
        } else if (st === 2) { for (let q = -2; q <= 2; q++) shoot(base + q * 0.13, v * 1.1); e.cd = 0.6 / rage; }
        else { for (let q = 0; q < 12; q++) shoot(q * Math.PI / 6 + e.spin, v * 0.7); e.cd = 1.3 / rage; }
      }
      A.play('orb');
    }
    if (e.cd2 <= 0 && e.scr > 70) {
      if (e.kind >= 5) mkEnt('wasp', e.x, e.wy - 22, e.hard, { hp: 1 });      // yeni bekçiler eşekarısı salar
      else ents.push({ type: 'hunter', x: e.x, wy: e.wy - 22, vx: 0, hw: 9, hh: 8, hp: 1, cd: 0, rate: 1, hard: e.hard, flash: 0, ph: G.t, ang: 0, dead: false });
      e.cd2 = 5.5 / e.hard;
    }
    return true;
  }
  const ULTI_NAMES = ['RADAR SÜPÜRMESİ', 'ÖRÜMCEK ATILIMI', 'FIRTINA', 'BOMBARDIMAN', 'DON DALGASI', 'KUYRUK SÜPÜRMESİ', 'ÖLÜM BAKIŞI', 'YER SARSINTISI', 'KARANLIK', 'YARGI'];
  function clearUltis() { lasers.length = 0; novas.length = 0; walls.length = 0; G.gust = null; G.dark = 0; }
  function startLunge(e, ring) { e.lg = { t: 0, lx: P.x, ring: !!ring, shot: false }; A.play('bigExplode'); }
  function novaCast(e, th, gaps) {      // don dalgası: halkada iki-üç açıklık var, oradan geçilir
    const ga = [], base = rand(0, 6.28);
    for (let q = 0; q < gaps; q++) ga.push(base + q * 6.283 / gaps);
    novas.push({ x: e.x, wy: e.wy, r: 14, v: 190, th: th, gaps: ga, gw: 0.8, life: 3 });
  }
  function ultiFire(e, u, t, shoot, rage, tier) {
    const k = u.k;
    if (k === 0) {      // Gözcü: radar ışını arenayı bir uçtan öbürüne süpürür
      const dir = (e.sw = !e.sw) ? 1 : -1;
      lasers.push({ e: e, ang: Math.PI / 2 + dir * 1.05, sweep: -dir * 2.1 / 1.7, warn: 0.6, dur: 1.7, len: 620, w: 7, t: 0, col: '255,90,90' });
      u.dur = 2.4;
    } else if (k === 1) {      // Örümcek: atılım, dipte halka
      startLunge(e, true); u.dur = 1.4;
    } else if (k === 2) {      // Kartal: fırtına + tüy yağmuru
      const dir = Math.random() < 0.5 ? -1 : 1;
      G.gust = { dir: dir, t: 2.6 };
      for (let q = 0; q < 9; q++) orbs.push({ x: rand(t.L + 10, t.R - 10), wy: P.wy + 540 + q * 2, vx: dir * 45, vy: P.speed - 150 - q * 16 });      // tüyler art arda iner
      u.dur = 2.8;
    } else if (k === 3) {      // Kale: bombardıman + buz duvarı
      for (let q = 0; q < 6; q++) { const T = 1.1 + q * 0.12; shells.push({ sx: e.x, swy: e.wy, x: clamp(P.x + rand(-70, 70), 16, W - 16), wy: P.wy + P.speed * T + rand(-40, 40), t: T, T: T }); }
      const wy = P.wy + 210, tt = terrain(wy, T2), cnt = Math.floor((tt.R - tt.L - 6) / 20), x0 = tt.L + (tt.R - tt.L - (cnt - 1) * 20) / 2;
      for (let b = 0; b < cnt; b++) mkEnt('ice', x0 + b * 20, wy, e.hard, { hp: 2 });
      u.dur = 1.8;
    } else if (k === 4) {      // Kral: don dalgası (ikinci dalga ultiTick'te)
      novaCast(e, 9, 2); u.n2 = true; u.dur = 2.2;
    } else if (k === 5) {      // Yılan: kuyruk süpürmesi, tek geçit
      const tt = terrain(e.wy - 70, T2);
      walls.push({ wy: e.wy - 70, L: tt.L, R: tt.R, gx: rand(tt.L + 50, tt.R - 50), gw: 78, v: 115, life: 6 });
      u.dur = 1.2;
    } else if (k === 6) {      // Göz: bakış ışını kızağı izler, kilitlenir, ateşler
      lasers.push({ e: e, ang: Math.PI / 2, sweep: 0, warn: 1.0, dur: 0.6, len: 640, w: 9, t: 0, track: true, col: '255,120,220' });
      u.dur = 1.8;
    } else if (k === 7) {      // Dev: yer sarsıntısı, kaya yağmuru, dalga
      G.shake = 12; novaCast(e, 7, 3);
      for (let q = 0; q < 7; q++) orbs.push({ x: rand(t.L + 20, t.R - 20), wy: P.wy + 545 + q * 2, vx: rand(-20, 20), vy: P.speed - 120 - q * 20, big: true, hp: 4 });
      u.dur = 2.4;
    } else if (k === 8) {      // Kuzgun: karanlık; ışınlanıp nişan alır, sonunda dalar (ultiTick)
      G.dark = 3.8; u.dur = 3.8;
    }
  }
  function ultiTick(e, u, t, shoot, rage) {
    const k = u.k, ft = u.t - 0.9;      // ateşlemeden bu yana geçen süre
    if (k === 4 && u.n2 && ft > 0.7) { u.n2 = false; novaCast(e, 9, 2); }
    if (k === 8) {
      const base = Math.atan2(PSY - e.scr, P.x - e.x);
      if (!u.s1 && ft > 0.9) { u.s1 = true; e.tx = rand(t.L + 50, t.R - 50); for (let q = -1; q <= 1; q++) shoot(base + q * 0.12, 160 * e.hard); A.play('orb'); }
      if (!u.s2 && ft > 1.8) { u.s2 = true; e.tx = rand(t.L + 50, t.R - 50); for (let q = -1; q <= 1; q++) shoot(base + q * 0.12, 160 * e.hard); A.play('orb'); }
      if (!u.s3 && ft > 2.5) { u.s3 = true; startLunge(e, false); }
    }
  }
  function updateUltis(dt) {
    G.dark = Math.max(0, (G.dark || 0) - dt);
    const live = P.inv <= 0 && !cfg.god && G.mode === 'playing';
    for (let i = lasers.length - 1; i >= 0; i--) {
      const L = lasers[i], e = L.e; L.t += dt;
      if (e.dead || e.flee || L.t > L.warn + L.dur) { lasers.splice(i, 1); continue; }
      const x0 = e.x, y0 = e.scr - 4;
      if (L.track && L.t < L.warn) L.ang = Math.atan2(PSY - y0, P.x - x0);
      else if (L.t >= L.warn) L.ang += L.sweep * dt;
      L.on = L.t >= L.warn;
      if (L.on && live) {      // nokta-doğru parçası uzaklığı
        const cx = Math.cos(L.ang), cy = Math.sin(L.ang), px = P.x - x0, py = PSY - y0, pr = clamp(px * cx + py * cy, 0, L.len);
        if (Math.hypot(px - cx * pr, py - cy * pr) < L.w + 7) die('ulti:IŞINA YAKALANDIN');
      }
    }
    for (let i = novas.length - 1; i >= 0; i--) {
      const n = novas[i]; n.r += n.v * dt; n.life -= dt;
      if (n.life <= 0 || n.r > 560) { novas.splice(i, 1); continue; }
      if (live) {
        const dx = P.x - n.x, dy = P.wy - n.wy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        let inGap = false;
        for (let q = 0; q < n.gaps.length; q++) { let da = Math.abs(((a - n.gaps[q]) % 6.283 + 9.425) % 6.283 - 3.1416); if (da < n.gw / 2) inGap = true; }
        if (!inGap && Math.abs(d - n.r) < n.th + 8) die('ulti:DON DALGASINA YAKALANDIN');
      }
    }
    for (let i = walls.length - 1; i >= 0; i--) {
      const w = walls[i]; w.wy -= w.v * dt; w.life -= dt;
      if (w.life <= 0 || w.wy < P.wy - 80) { walls.splice(i, 1); continue; }
      if (live && Math.abs(P.wy - w.wy) < 11 && P.x > w.L && P.x < w.R && Math.abs(P.x - w.gx) > w.gw / 2) die('ulti:KUYRUK SÜPÜRMESİNE ÇARPTIN');
    }
  }
  function drawUltis() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < lasers.length; i++) {
      const L = lasers[i], e = L.e, x0 = e.x, y0 = e.scr - 4, x1 = x0 + Math.cos(L.ang) * L.len, y1 = y0 + Math.sin(L.ang) * L.len;
      if (!L.on) {      // uyarı: ince kesik çizgi, gittikçe parlar
        const k = L.t / L.warn;
        ctx.strokeStyle = 'rgba(' + L.col + ',' + (0.25 + 0.5 * k) + ')'; ctx.lineWidth = 1.5 + k; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -G.t * 60;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        glow(x0, y0, 16 + 14 * k, L.col, 0.5 + 0.4 * k);
      } else {
        const fl = 0.8 + 0.2 * Math.sin(G.t * 40);
        ctx.strokeStyle = 'rgba(' + L.col + ',' + (0.35 * fl) + ')'; ctx.lineWidth = L.w * 3.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(' + L.col + ',' + (0.9 * fl) + ')'; ctx.lineWidth = L.w * 1.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * fl) + ')'; ctx.lineWidth = L.w * 0.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        glow(x0, y0, 34, L.col, 0.9);
      }
    }
    for (let i = 0; i < novas.length; i++) {
      const n = novas[i], y = sy(n.wy), a = Math.min(1, n.life / 0.8);
      for (let w = 0; w < 2; w++) {
        ctx.strokeStyle = w ? 'rgba(255,255,255,' + (0.9 * a) + ')' : 'rgba(150,220,255,' + (0.5 * a) + ')'; ctx.lineWidth = w ? n.th * 0.9 : n.th * 2.6;
        ctx.beginPath();
        for (let q = 0; q < n.gaps.length; q++) {      // açıklıklar arasındaki yaylar (dünya açısı; ekran y ters)
          const a0 = n.gaps[q] + n.gw / 2, a1 = n.gaps[(q + 1) % n.gaps.length] - n.gw / 2 + (q + 1 >= n.gaps.length ? 6.283 : 0);
          ctx.moveTo(n.x + Math.cos(a0) * n.r, y - Math.sin(a0) * n.r);
          for (let s2 = 1; s2 <= 24; s2++) { const an = a0 + (a1 - a0) * s2 / 24; ctx.lineTo(n.x + Math.cos(an) * n.r, y - Math.sin(an) * n.r); }
        }
        ctx.stroke();
      }
    }
    for (let i = 0; i < walls.length; i++) {      // yılan gövdesi: geçit dışında halkalı kuyruk
      const w = walls[i], y = sy(w.wy), bob = Math.sin(G.t * 6) * 2;
      for (let x = w.L + 8; x < w.R - 6; x += 13) {
        if (Math.abs(x - w.gx) < w.gw / 2) continue;
        const yy = y + Math.sin(x * 0.12 + G.t * 7) * 3 + bob;
        glow(x, yy, 12, '120,200,255', 0.35);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#2f6f99'; ctx.beginPath(); ctx.arc(x, yy, 7, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#9fdcff'; ctx.beginPath(); ctx.arc(x - 2, yy - 2, 3.5, 0, 6.3); ctx.fill();
        ctx.strokeStyle = '#0b2538'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, yy, 7, 0, 6.3); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
      }
      ctx.strokeStyle = 'rgba(125,255,176,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);      // geçit işareti
      ctx.beginPath(); ctx.moveTo(w.gx - w.gw / 2, y - 12); ctx.lineTo(w.gx - w.gw / 2, y + 12); ctx.moveTo(w.gx + w.gw / 2, y - 12); ctx.lineTo(w.gx + w.gw / 2, y + 12); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    if (G.dark > 0) {      // kuzgunun karanlığı: yalnız kızağın çevresi görünür
      const a = Math.min(1, G.dark * 2, (3.8 - G.dark) * 2.5) * 0.93;
      const g = ctx.createRadialGradient(P.x, PSY, 60, P.x, PSY, 170);
      g.addColorStop(0, 'rgba(8,2,20,0)'); g.addColorStop(1, 'rgba(8,2,20,' + a + ')');
      ctx.fillStyle = g; ctx.fillRect(-12, -12, W + 24, H + 24);
      if (G.boss) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(G.boss.x, G.boss.scr, 30, '255,60,60', 0.8 * a); ctx.restore(); }      // sadece gözleri parlar
    }
  }
  function bossDown(e) {
    G.boss = null; clearUltis();
    for (let q = 0; q < 3; q++) boom(e.x + rand(-26, 26), e.wy + rand(-10, 10), 30, ['#ffffff', '#ffd27a', '#d58bff', '#ff5a36'], 170);
    G.shake = 11; G.flash = 0.4;
    // ödül: önüne altın saçılır
    for (let q = 0; q < 26; q++) {
      const cx = e.x + rand(-110, 110), cy = e.wy - rand(40, 330);
      coinsL.push({ x: cx, wy: cy, v: q % 9 === 0 ? 5 : 1, ph: rand(0, 6), pullT: 0.7 + q * 0.035 });      // kısa süre sonra gemiye çekilir
    }
    pop(W / 2, P.wy + 240, 'BEKÇİ YENİLDİ', '#7dffb0'); G.bossMagT = 2.6;
    G.chapT = 0; G.chapN = Math.floor(G.sec / BOSS_EVERY) + 2;
    if (!G.cheated && G.sec + 1 > G.bossCp) { G.bossCp = G.sec + 1; store('bg_bosscp', String(G.bossCp)); }
    A.play('extraLife');
  }

  // Nükleer patlama: ekrandaki düşmanları, ışık çitlerini ve mermileri siler (girdap kalır, bekçi hasar alır)
  function nuke(free) {
    if (G.mode !== 'playing') return;
    if (G.nukeCd > 0 && !free) { A.play('deny'); return; }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], y = sy(e.wy);
      if (e.dead || y < -30 || y > H + 30 || e.type === 'whirl') continue;
      if (e.type === 'beam') {      // ışık çiti de patlar
        e.dead = true;
        for (let q = 0; q <= 6; q++) boom(e.minX + (e.maxX - e.minX) * q / 6, e.wy, 8, ['#ffffff', '#ffb0c0', '#ff5a7d'], 80);
        addScore(80); pop(e.x, e.wy + 12, 'ÇİT YOK EDİLDİ  +80', '#ffb0c0');
        continue;
      }
      if (e.type === 'boss') {
        if (e.flee) continue;
        e.hp -= (NUKE_BOSS_DMG + 2 * G.power) * (G.av === 1 ? 2 : 1); e.flash = 0.3;      // Roket: bekçiye 2 kat
        if (e.hp <= 0) kill(e, true);
      } else kill(e, true);
    }
    for (let i = 0; i < orbs.length; i++) boom(orbs[i].x, orbs[i].wy, 6, ['#ffffff', '#ff7ad1'], 70);
    orbs.length = 0; shells.length = 0;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * 6.283, v = rand(120, 420);
      part(P.x, P.wy, Math.cos(a) * v, Math.sin(a) * v + P.speed, rand(0.4, 0.9), rand(2, 4), i % 3 ? '#fff6da' : '#ffb347', true);
    }
    padRumble(600, 0.9);
    if (!free) G.nukeCd = nukeCdMax();
    G.nukeT = 0.8; G.flash = 0.7; G.shake = 13;
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
    A.play(e.type === 'ice' ? 'shatter' : e.type === 'turret' || e.type === 'boss' ? 'bigExplode' : 'explode');
    if (e.type === 'crystal' && byShot) for (let q = 0; q < 3; q++) mkEnt('shard', e.x + (q - 1) * 6, e.wy, e.hard, { vx: (q - 1) * 130 });
    if (byShot && e.type !== 'ice' && e.type !== 'boss' && e.type !== 'shard' && !solid(e.x, e.wy)) {
      const r = Math.random();
      let k = null;
      if (r < WING_DROP) k = 'wing';
      else if (r >= 0.30 && r < 0.319) k = 'wd';
      else if (r >= 0.34 && r < 0.359) k = 'sk';                                         // %4: buz pateni                                         // %4: rüzgâr kalkanı
      else if (r >= WING_DROP + POWER_DROP && r < WING_DROP + POWER_DROP + MAG_DROP) k = 'mag';           // %5: mıknatıs                        // %5: kanat yardımcıları
      else if (r < WING_DROP + POWER_DROP) {                                            // %20: silah ya da (dörtte bir) kalkan
        const wantSh = Math.random() < (G.sled === 3 ? 0.42 : SHIELD_SHARE) || G.power >= POWER_MAX;
        k = wantSh && G.shield < SHIELD_MAX ? 'sh' : G.power < POWER_MAX ? 'pw' : Math.random() < 0.5 ? 'sh' : 'pw';
      }
      if (k) coinsL.push({ x: e.x, wy: e.wy, v: 0, pw: true, k: k, ph: 0 });
    }
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
        if (e.armed && playing && y > 8 && y < PSY - 110) {       // silahlı bot: dümdüz aşağı ateş eder
          e.cd -= dt;
          if (e.cd <= 0) { if (e.up) { orbs.push({ x: e.x - 4, wy: e.wy - 8, vx: -26, vy: -105 * e.hard }); orbs.push({ x: e.x + 4, wy: e.wy - 8, vx: 26, vy: -105 * e.hard }); } else orbs.push({ x: e.x, wy: e.wy - 8, vx: 0, vy: -105 * e.hard }); e.cd = 2.4 / e.hard; A.play('orb'); }
        }
      } else if (e.type === 'skim') {
        e.x += e.vx * dt;
        if (e.x > W + 30 && e.vx > 0) e.vx = -e.vx;
        else if (e.x < -30 && e.vx < 0) e.vx = -e.vx;
        if (e.armed && playing && y > 8 && y < PSY - 110 && e.x > 10 && e.x < W - 10) {      // kayıcı: geçerken aşağı bırakır
          e.cd -= dt;
          if (e.cd <= 0) { orbs.push({ x: e.x, wy: e.wy - 6, vx: e.vx * 0.3, vy: -95 * e.hard }); if (e.up) orbs.push({ x: e.x, wy: e.wy - 6, vx: -e.vx * 0.3, vy: -80 * e.hard }); e.cd = 1.8 / e.hard; A.play('orb'); }
        }
      } else if (e.type === 'hunter') {
        // avcı: oyuncunun hizasına kayarak üstüne gelir
        if (playing) {
          e.wy -= 34 * e.hard * dt;
          e.x = approach(e.x, P.x, 58 * e.hard * dt);
          if (e.armed && y > 8 && y < PSY - 120) {      // avcı: oyuncuya nişanlı tek atış
            e.cd -= dt;
            if (e.cd <= 0) {
              const dx = P.x - e.x, dy = P.wy - e.wy, d = Math.hypot(dx, dy) || 1, v = 100 * e.hard;
              const a0 = Math.atan2(dy, dx), nn = e.up ? 1 : 0; for (let q = -nn; q <= nn; q++) orbs.push({ x: e.x, wy: e.wy - 6, vx: Math.cos(a0 + q * 0.16) * v, vy: Math.sin(a0 + q * 0.16) * v }); e.cd = 2.6 / e.hard; A.play('orb');
            }
          }
        }
      } else if (e.type === 'wasp') {      // eşekarısı: zikzakla iner, üçlü yelpaze atar
        if (playing) {
          e.wy -= 26 * e.hard * dt;
          const tt = terrain(e.wy, T2);
          e.x = clamp(e.x + Math.cos(G.t * 3.2 + e.ph) * 110 * dt + (P.x - e.x) * 0.3 * dt, tt.L + 12, tt.R - 12);
          if (y > 8 && y < PSY - 120) {
            e.cd -= dt;
            if (e.cd <= 0) {
              const a0 = Math.atan2(P.wy - e.wy, P.x - e.x), v = 95 * e.hard;
              for (let q = -1; q <= 1; q++) orbs.push({ x: e.x, wy: e.wy - 6, vx: Math.cos(a0 + q * 0.28) * v, vy: Math.sin(a0 + q * 0.28) * v });
              e.cd = 2.3 / e.hard; A.play('orb');
            }
          }
        }
      } else if (e.type === 'sub') {      // denizaltı: dalar (vurulamaz), çıkar, halka atar
        e.x += e.vx * dt;
        if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); } else if (e.x > e.maxX) { e.x = e.maxX; e.vx = -Math.abs(e.vx); }
        e.subT += dt;
        const ph = e.subT % 4.2;      // 0-2.2 su altı, 2.2-2.6 çıkış, 2.6-3.8 yüzeyde, 3.8-4.2 dalış
        e.sub = ph < 2.2 ? 1 : ph < 2.6 ? 1 - (ph - 2.2) / 0.4 : ph < 3.8 ? 0 : (ph - 3.8) / 0.4;
        e.charge = ph >= 2.6 && ph < 3.2 ? (ph - 2.6) / 0.6 : 0;
        if (ph < 3.2) e.fired = false;
        else if (playing && !e.fired && y > 8 && y < PSY - 100) {
          e.fired = true;
          const n = e.hard > 1.5 ? 10 : 8, v = 80 * e.hard;
          for (let q = 0; q < n; q++) { const a = q * 6.2832 / n + e.ph; orbs.push({ x: e.x, wy: e.wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v }); }
          A.play('orb');
        }
      } else if (e.type === 'crystal') {      // kristal çekirdek: dönen artı ateşi, vurulunca parçalanır
        e.x += Math.sin(G.t * 0.8 + e.ph) * 14 * dt;
        if (playing && y > 8 && y < PSY - 110) {
          e.cd -= dt;
          if (e.cd <= 0) {
            const a0 = G.t * 0.9 + e.ph, v = 85 * e.hard;
            for (let q = 0; q < 4; q++) { const a = a0 + q * Math.PI / 2; orbs.push({ x: e.x, wy: e.wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v }); }
            e.cd = 2.6 / e.hard; A.play('orb');
          }
        }
      } else if (e.type === 'shard') {      // kristal parçası: savrulur, sonra kızağa yönelir
        if (playing) {
          e.life = (e.life || 0) + dt;
          e.x += e.vx * dt; e.vx *= Math.pow(0.25, dt); e.wy -= 30 * dt;
          if (e.life > 0.45) e.x = approach(e.x, P.x, 75 * e.hard * dt);
        }
      } else if (e.type === 'mortar') {      // havan botu: kızağın gideceği yere mermi yağdırır
        e.x += e.vx * dt;
        if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); } else if (e.x > e.maxX) { e.x = e.maxX; e.vx = -Math.abs(e.vx); }
        e.charge = 0;
        if (playing && y > 30 && y < PSY - 140) {
          e.cd -= dt; e.charge = clamp(1 - e.cd / 0.8, 0, 1);
          if (e.cd <= 0) {
            const T = 1.4;
            shells.push({ sx: e.x, swy: e.wy, x: clamp(P.x, 20, W - 20), wy: P.wy + P.speed * T, t: T, T: T });
            e.cd = 3.2 / e.hard; A.play('orb');
          }
        }
      } else if (e.type === 'turret') {
        e.ang = Math.atan2(y - PSY, P.x - e.x);          // namlu oyuncuya döner (matematik açısı, y yukarı)
        if (playing && y > 8 && y < PSY - 90) {
          e.cd -= dt;
          if (e.cd <= 0) {
            const dx = P.x - e.x, dy = (P.wy + P.speed * 0.3) - e.wy, len = Math.hypot(dx, dy) || 1, v = 112 * e.hard * (0.85 + 0.15 * G.sm);
            const a0 = Math.atan2(dy, dx);
            for (let q = 0; q < e.vol; q++) {
              const a = a0 + (q - (e.vol - 1) / 2) * 0.2;
              orbs.push({ x: e.x, wy: e.wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
            }
            e.cd = e.rate;
            A.play('orb');
          }
        }
      }
      if (!playing) continue;

      for (let j = shots.length - 1; j >= 0; j--) {
        const s = shots[j];
        if (!(e.sub > 0.5) && s.last !== e && Math.abs(s.x - e.x) < e.hw + 2 && Math.abs(s.wy - e.wy) < e.hh + 6) {
          if (s.pierce > 0) { s.pierce--; s.last = e; } else shots.splice(j, 1);
          e.hp -= (s.dmg || 1) * (e.type === 'boss' && G.sled === 4 ? 1.25 : 1);      // Zümrüt Ejder: bekçiye +%25
          if (e.hp <= 0) kill(e, true);
          else { e.flash = 0.14; A.play('hit'); boom(s.x, s.wy, 5, ['#ffffff', '#ffd27a'], 60); }
          break;
        }
      }
      if (e.dead) continue;
      if (!(e.sub > 0.5) && P.inv <= 0 && !cfg.god && Math.abs(P.x - e.x) < e.hw + 5 && Math.abs(P.wy - e.wy) < e.hh + 8) {
        if (e.type === 'boss') { if (!e.flee) die('ulti:BEKÇİYE ÇARPTIN'); continue; }      // bekçi çarpışmadan ölmez
        kill(e, false);
        die('crash');
      }
    }
  }

  function updateShots(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) if ((bolts[i].life -= dt) <= 0) bolts.splice(i, 1);
    for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].life -= dt) <= 0) rings.splice(i, 1);
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s.homing && s.loiter > 0) {      // bekleyen misil: hedef yoksa gemi çevresinde tur atar
        s.loiter -= dt; s.orbA += 1.9 * dt;
        if (!s.tgt || s.tgt.dead) {
          s.tgt = null;
          const cand = [];
          for (let k = 0; k < ents.length; k++) { const e = ents[k], y = sy(e.wy); if (!e.dead && e.type !== 'beam' && e.type !== 'whirl' && !(e.sub > 0.5) && y > 0 && y < PSY - 10) cand.push(e); }
          if (cand.length) s.tgt = cand[Math.floor(Math.random() * cand.length)];
        }
        if (!s.tgt) {
          // bekleme deseni: geminin ilerisinde geniş bir daire (piste inemeyen uçaklar gibi)
          const cw = P.wy + 215, tt = terrain(cw, T2), cx = clamp(P.x, tt.L + 70, tt.R - 70), rx = Math.min(95, (tt.R - tt.L) / 2 - 16);
          const tx = cx + Math.cos(s.orbA) * rx, tw = cw + Math.sin(s.orbA) * 62;
          s.vx = approach(s.vx, (tx - s.x) * 4.5, 1300 * dt);
          s.v = approach(s.v, P.speed + (tw - s.wy) * 4.5, 1300 * dt);
          if (Math.random() < 0.5) part(s.x, s.wy - 4, rand(-8, 8), P.speed * 0.7, rand(0.2, 0.4), rand(1, 2), '#b8ffd8', true);
          s.wy += s.v * dt; s.x += s.vx * dt;
          continue;
        }
      }
      if (s.homing) {
        const tg = s.tgt;
        if (tg && !tg.dead) {
          const dx = tg.x - s.x, dy = tg.wy - s.wy, d = Math.hypot(dx, dy) || 1;
          s.vx = approach(s.vx, dx / d * 340, 1100 * dt);
          s.v = approach(s.v, dy / d * 340 + P.speed, 1100 * dt);
        } else s.v = approach(s.v, P.speed + 340, 900 * dt);
        if (Math.random() < 0.8) part(s.x + rand(-1, 1), s.wy - 4, rand(-10, 10), P.speed * 0.6 + rand(-20, 10), rand(0.25, 0.5), s.gold ? rand(1.8, 3.2) : rand(1.2, 2.4), s.gold ? (Math.random() < 0.5 ? '#ffd95a' : '#fff1b0') : Math.random() < 0.5 ? '#b8ffd8' : '#d9e6f2', true);      // duman izi
        if (sy(s.wy) > H + 20) { shots.splice(i, 1); continue; }
      }
      s.wy += s.v * dt;
      if (s.vx) s.x += s.vx * dt;
      if (s.life !== undefined && (s.life -= dt) <= 0) { shots.splice(i, 1); continue; }
      if (sy(s.wy) < -14 || sy(s.wy) > H + 20 || s.x < -12 || s.x > W + 12) { shots.splice(i, 1); continue; }
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
      if (o.split !== undefined && (o.split -= dt) <= 0) {      // kar devinin kayası: havada sekize bölünür
        for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4 + 0.2, v = 90; orbs.push({ x: o.x, wy: o.wy, vx: Math.cos(a) * v, vy: P.speed - Math.sin(a) * v }); }
        boom(o.x, o.wy, 14, ['#ffffff', '#cfeaff', '#9fd3e6'], 90); A.play('shatter');
        orbs.splice(i, 1); continue;
      }
      const y = sy(o.wy), orr = o.big ? 13 : 0;
      if (y > H + 20 || y < -60 || o.x < -20 || o.x > W + 20) { orbs.splice(i, 1); continue; }
      if (!playing) continue;
      let gone = false;
      for (let j = shots.length - 1; j >= 0; j--) {
        const s = shots[j];
        if (Math.abs(s.x - o.x) < 8 + orr && Math.abs(s.wy - o.wy) < 11 + orr) {
          shots.splice(j, 1);
          if (o.big && --o.hp > 0) { boom(s.x, s.wy, 5, ['#ffffff', '#cfeaff'], 60); A.play('hit'); break; }
          orbs.splice(i, 1); gone = true;
          boom(o.x, o.wy, 8, ['#ffffff', '#ff7ad1', '#d58bff'], 70);
          addScore(PTS.orb); pop(o.x, o.wy + 8, '+' + PTS.orb);
          A.play('hit');
          break;
        }
      }
      if (gone) continue;
      if (P.inv <= 0 && !cfg.god && Math.abs(P.x - o.x) < 8 + orr && Math.abs(P.wy - o.wy) < 11 + orr) {
        orbs.splice(i, 1);
        die('crash');
      }
    }
  }

  function updateShells(dt) {      // havan mermileri: hedefe düşünce patlar
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      if ((s.t -= dt) > 0) continue;
      boom(s.x, s.wy, 22, ['#ffffff', '#ffd27a', '#ff8a5a', '#9fd3e6'], 120);
      G.shake = Math.max(G.shake, 4); A.play('explode');
      if (G.mode === 'playing' && P.inv <= 0 && !cfg.god && Math.hypot(P.x - s.x, P.wy - s.wy) < 24) die('crash');
      shells.splice(i, 1);
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
  let sideHidden = false;
  function update(dt) {
    G.t += dt;
    pollPad();
    if ((digits[1] && digits[3] && digits[5]) || digits.b) { comboT += dt; if (comboT >= 3) { comboT = 0; digits[1] = digits[3] = digits[5] = digits.b = false; jumpToBoss(); } }
    else comboT = 0;
    const inPlay = G.mode === 'playing' || G.mode === 'dying';
    if (inPlay !== sideHidden) { sideHidden = inPlay; document.body.classList.toggle('playing', inPlay); }
    const hide = mouse.active && G.mode === 'playing';
    if (hide !== cursorHidden) { cursorHidden = hide; canvas.style.cursor = hide ? 'none' : ''; }
    G.shake = Math.max(0, G.shake - dt * 22);
    G.flash = Math.max(0, G.flash - dt);
    G.deny = Math.max(0, G.deny - dt);
    G.nukeT = Math.max(0, G.nukeT - dt);
    G.sensT = Math.max(0, G.sensT - dt);
    G.banner.t += dt; G.chapT += dt;
    let scroll = 0;

    G.stBuyT += dt; G.bossMagT = Math.max(0, (G.bossMagT || 0) - dt); G.fxFlash = Math.max(0, (G.fxFlash || 0) - dt);
    if (G.mode === 'playing') {      // toplam uçuş süresi → pilot seviyesi
      G.fly += dt;
      if ((G.flySave -= dt) <= 0) { G.flySave = 5; store('bg_fly', String(Math.floor(G.fly))); }
      const lv = pilotLevel();
      if (lv > G.lvSeen) { if (G.lvSeen) { pop(P.x, P.wy + 70, 'PİLOT SEVİYESİ ' + lv, '#ffd95a'); A.play('extraLife'); } G.lvSeen = lv; }
    }
    if (G.mode === 'title' || G.mode === 'store') {
      P.wy += 55 * dt; scroll = 55;
      setPal(dt, LV.info(LV.sectionAtRow(Math.floor(P.wy / ROW))).pal);
      G.fog *= 1 - Math.min(1, dt * 2); G.wind = 0;
      A.stopEngine(); A.setWind(0);
    } else if (G.mode === 'playing') {
      updatePlayer(dt);
      updateShots(dt); updateEnts(dt); updateOrbs(dt); updateShells(dt); updateUltis(dt);
      scroll = P.speed;
      setPal(dt, sec(G.sec).info.pal);
      G.fog += ((sec(G.sec).info.fog || 0) * (G.av === 3 ? 0.35 : 1) - G.fog) * Math.min(1, dt * 0.9);
    } else if (G.mode === 'dying') {
      updateEnts(dt); updateOrbs(dt); shells.length = 0;
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

  // Kıyı süsleri: yalnızca çamlar; soluk yeşil, bir kısmı tümüyle karlı, bir kısmı kesik (kütük). Göz yormasın diye silik.
  function pine(x, y, s, violet) {      // buz gezegeninin kristal kuleleri (eski çamların yerinde)
    ctx.fillStyle = 'rgba(20,40,60,0.14)';
    ctx.beginPath(); ctx.ellipse(x + 3 * s, y + 1, 5.5 * s, 2.2 * s, 0, 0, 6.3); ctx.fill();
    const d = violet ? '#7a6bd6' : '#3f9fc4', m = violet ? '#a99bff' : '#7fd6f0', l = violet ? '#e6e0ff' : '#e2f8ff';
    ctx.fillStyle = d; poly([x - 4.5 * s, y, x - 3.2 * s, y - 8 * s, x - 1.6 * s, y]);      // yan kristaller
    ctx.fillStyle = m; poly([x + 1.8 * s, y, x + 3.6 * s, y - 10 * s, x + 5 * s, y]);
    ctx.fillStyle = d; poly([x - 2.4 * s, y, x, y - 16 * s, x + 2.4 * s, y]);      // ana kule
    ctx.fillStyle = m; poly([x, y - 16 * s, x + 2.4 * s, y, x + 0.4 * s, y]);
    ctx.fillStyle = l; poly([x, y - 16 * s, x + 0.9 * s, y - 9 * s, x - 0.5 * s, y - 9 * s]);
    if (G.night > 0.3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y - 8 * s, 7 * s, violet ? '170,150,255' : '120,220,255', 0.25 * G.night); ctx.restore(); }
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
        const x = o.x, y = sy(o.y), s = o.s, h = hash(o.y * 0.37 + o.x * 1.3);
        if (o.k === 1 || h > 0.9) {
          // küçük krater
          ctx.fillStyle = 'rgba(40,70,100,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, 5 * s, 2.6 * s, 0, 0, 6.3); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, 5 * s, 2.6 * s, 0, 3.4, 6.1); ctx.stroke();
        } else pine(x, y, s, o.k === 2 || h < 0.3);
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
        // yakıt istasyonu: iniş pisti gibi koyu zemin, kenarlarda önden geriye sırayla yanan ledler
        const x = v.x, y = sy(v.y), hw = v.hw, hl = v.hl, pulse = 0.5 + 0.5 * Math.sin(G.t * 2.4 + v.y);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.translate(x, y); ctx.scale(1, 2.1); glow(0, 0, hw + 14, '255,180,90', 0.16 + 0.08 * pulse);
        ctx.restore();
        const pg = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
        pg.addColorStop(0, 'rgba(247,206,160,0.85)'); pg.addColorStop(0.5, 'rgba(255,228,196,0.88)'); pg.addColorStop(1, 'rgba(247,206,160,0.85)');      // pastel şeftali
        ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(x - hw, y - hl, hw * 2, hl * 2, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(196,130,70,0.75)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.roundRect(x - hw + 3, y - hl + 3, hw * 2 - 6, hl * 2 - 6, 4); ctx.stroke();
        ctx.strokeStyle = 'rgba(200,140,80,0.6)'; ctx.lineWidth = 1.4; ctx.setLineDash([6, 7]); ctx.lineDashOffset = 0;      // orta çizgi
        ctx.beginPath(); ctx.moveTo(x, y - hl + 12); ctx.lineTo(x, y - 11); ctx.moveTo(x, y + 9); ctx.lineTo(x, y + hl - 12); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';      // eşik çizgileri
        for (let q = -2; q <= 2; q++) if (q) { ctx.fillRect(x + q * (hw / 3.2) - 1, y - hl + 4, 2, 5); ctx.fillRect(x + q * (hw / 3.2) - 1, y + hl - 9, 2, 5); }
        const n = Math.max(5, Math.round(hl / 9)), step = (hl * 2 - 10) / (n - 1), head = (G.t * 9 + hash(v.y) * n) % (n + 3);
        for (let i = 0; i < n; i++) {
          const ly = y - hl + 5 + i * step, d = head - i, k = d >= 0 && d < 3 ? 1 - d / 3 : 0;      // önden geriye kayan ışık dalgası
          for (let sd = -1; sd <= 1; sd += 2) {
            const lx = x + sd * (hw - 2.5);
            ctx.fillStyle = k > 0 ? 'rgba(255,' + Math.round(200 + 40 * k) + ',' + Math.round(120 + 100 * k) + ',1)' : 'rgba(190,140,95,0.75)';
            ctx.beginPath(); ctx.arc(lx, ly, 1.3 + 0.5 * k, 0, 6.3); ctx.fill();
            if (k > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(lx, ly, 7, '255,200,120', 0.75 * k); ctx.restore(); }
          }
        }
        ctx.strokeStyle = 'rgba(214,120,50,' + (0.6 + 0.3 * pulse) + ')'; ctx.lineWidth = 1.3;      // ortada ince yakıt simgesi
        ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.bezierCurveTo(x + 5.5, y - 1, x + 5, y + 5, x, y + 5); ctx.bezierCurveTo(x - 5, y + 5, x - 5.5, y - 1, x, y - 7); ctx.stroke();
      }
    }
  }

  function drawGates() {
    const kA = LV.sectionAtRow(Math.max(0, vr.gA)), kB = LV.sectionAtRow(Math.max(0, vr.gB));
    for (let k = kA; k <= kB; k++) {
      const s = sec(k), y = sy(s.gateY);
      if (y < -30 || y > H + 30) continue;
      const passed = G.mode !== 'title' && G.mode !== 'store' && k < G.sec;
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
      text('ETAP ' + (k + 2), xr + 12, y + 3, 11, 'rgba(' + rgb + ',0.95)', 'left', 700);
    }
  }

  function drawEnts() {
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], y = sy(e.wy);
      if (y < -30 || y > H + 30 || e.dead) continue;
      const x = e.x, fl = e.flash > 0;
      const big = e.type === 'mine' || e.type === 'boat' || e.type === 'skim' || e.type === 'hunter' || e.type === 'turret' || !!NEWHP[e.type];
      if (big) { const sc = e.type === 'mine' ? ES * 1.15 : ES; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y); }      // mayınlar %15 büyük
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
        ctx.strokeStyle = '#2a1d47'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x - d * 6, y - 3); ctx.lineTo(x - d * 6, y - 15); ctx.stroke();      // direk
        const fw = Math.sin(G.t * 9 + e.ph) * 2;
        ctx.fillStyle = '#ff7ad1'; poly([x - d * 6, y - 15, x - d * 6 - d * 9, y - 13 + fw, x - d * 6, y - 10]);      // dalgalanan flama
        ctx.strokeStyle = 'rgba(40,20,70,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + d * 14, y); ctx.lineTo(x + d * 6, y - 6); ctx.lineTo(x - d * 11, y - 6); ctx.stroke();
        if (e.armed) {
          ctx.fillStyle = '#1b2431'; ctx.fillRect(x + d * 2 - 1.5, y, 3, 9);      // aşağı bakan namlu
          const on = e.cd < 0.5;
          ctx.fillStyle = on ? '#ff4d4d' : '#ffd27a'; ctx.beginPath(); ctx.arc(x + d * 2, y - 2, 1.8, 0, 6.3); ctx.fill();
          if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x + d * 2, y + 4, 10, '255,80,80', 0.55); ctx.restore(); }
        }
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
        ctx.fillStyle = fl ? '#ffffff' : '#c2338a';      // arka kanatçıklar
        poly([x - d * 8, y - 6 + hov, x - d * 13, y - 10 + hov, x - d * 11, y - 4 + hov]);
        poly([x - d * 8, y + 6 + hov, x - d * 13, y + 10 + hov, x - d * 11, y + 4 + hov]);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(x + d * 1, y + hov, 6, '150,240,255', 0.5 + 0.3 * Math.sin(G.t * 12 + e.ph));
        if (e.armed) glow(x + d * 6, y + hov, 7, '255,90,90', 0.4);
        ctx.restore();
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
        drawBossKind(e, x, y, fl);
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
        const flap = Math.sin(G.t * 14 + e.ph) * 3;
        ctx.fillStyle = fl ? '#ffffff' : '#a8182f';      // dikenli kanat uçları
        poly([x + 10, y - 8, x + 16, y - 13 - flap, x + 7, y - 4]);
        poly([x - 10, y - 8, x - 16, y - 13 - flap, x - 7, y - 4]);
        ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(x + wob * 0.6, y + 1, 2.2, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(x - 3.5, y - 4, 1.4, 0, 6.3); ctx.arc(x + 3.5, y - 4, 1.4, 0, 6.3); ctx.fill();      // gözler
        if (Math.random() < 0.35) part(x + rand(-3, 3), e.wy + 6, rand(-10, 10), rand(20, 50), rand(0.2, 0.4), rand(1, 2), '#ff8a7a', true);
        if (e.armed && e.cd < 0.5) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y - 4, 12, '255,230,80', 0.6); ctx.restore(); }
      } else if (NEWHP[e.type]) {
        if (window.FOES) FOES.drawEnemy(ctx, e, x, y, G.t);
        else { ctx.fillStyle = e.flash > 0 ? '#fff' : '#9a6bff'; ctx.beginPath(); ctx.arc(x, y, e.hw, 0, 6.3); ctx.fill(); }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 12, 9, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#39465a'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.3); ctx.fill();
        ctx.fillStyle = fl ? '#ffffff' : '#5c6d86'; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#2b3646';      // zırh plakaları
        for (let q = 0; q < 6; q++) { const a = q * 1.047 + 0.52; ctx.fillRect(x + Math.cos(a) * 11 - 2.5, y + Math.sin(a) * 11 - 2.5, 5, 5); }
        ctx.strokeStyle = 'rgba(255,159,224,0.55)'; ctx.lineWidth = 1.2;      // dönen nişan halkası
        ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(x, y, 14, G.t * 1.5, G.t * 1.5 + 6.3); ctx.stroke(); ctx.setLineDash([]);
        const ax = Math.cos(e.ang), ay = -Math.sin(e.ang), px = -ay, py = ax;
        ctx.strokeStyle = '#1b2431'; ctx.lineWidth = e.vol > 1 ? 3 : 4; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let q = 0; q < e.vol; q++) { const o = (q - (e.vol - 1) / 2) * 3.4; ctx.moveTo(x + px * o, y + py * o); ctx.lineTo(x + px * o + ax * 13, y + py * o + ay * 13); }
        ctx.stroke();
        ctx.lineCap = 'butt';
        const warn = e.cd < 0.5 && y > 8 && y < PSY - 90;
        ctx.fillStyle = warn ? '#ff5a5a' : (e.hp > 1 ? '#ff9fe0' : '#ffb347');
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.3); ctx.fill();
        if (warn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y, 14, '255,80,80', 0.6); ctx.restore(); }
      }
      if (big) ctx.restore();
    }
  }

  // bekçiler: degrade gövde, koyu kontur, parlayan çekirdek, hasar dumanı. 0 gözcü, 1 örümcek, 2 kartal, 3 kale, 4 kral
  function bpath(pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); }
  function bshape(pts, x0, y0, x1, y1, c0, c1, fl, line) {
    bpath(pts);
    if (fl) ctx.fillStyle = '#ffffff';
    else { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; }
    ctx.fill();
    ctx.strokeStyle = line || 'rgba(5,10,20,0.85)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function bcore(x, y, r, hpf, hue) {
    const col = hpf > 0.4 ? hue : '255,70,50', pul = 0.5 + 0.5 * Math.sin(G.t * (hpf > 0.4 ? 5 : 13));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y, r * 3.2, col, 0.45 + 0.3 * pul); ctx.restore();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, 'rgb(' + col + ')'); g.addColorStop(1, 'rgba(' + col + ',0.2)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(5,10,20,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function beye(x, y, r, col) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y, r * 3, col, 0.7); ctx.restore();
    ctx.fillStyle = 'rgb(' + col + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, 6.3); ctx.fill();
  }
  function drawBossKind(e, x, y, fl) {
    const hpf = clamp(e.hp / e.maxHp, 0, 1), k = e.kind || 0, t = G.t;
    if (window.FOES) { FOES.drawBoss(ctx, e, x, y, t); return; }      // tüm bekçiler foes.js'te çizilir; aşağısı yedek
    // gölge + su halkası
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(x + 6, y + 14, 48, 15, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(220,240,255,' + (0.18 + 0.1 * Math.sin(t * 3)) + ')'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, y + 10, 50 + Math.sin(t * 2) * 3, 14, 0, 0, 6.3); ctx.stroke();
    if (k === 0) {      // GÖZCÜ: zırhlı gözetleme gemisi, dönen radar
      bshape([x - 44, y, x - 30, y - 16, x + 30, y - 16, x + 44, y, x + 30, y + 15, x, y + 21, x - 30, y + 15], x, y - 16, x, y + 21, '#5d7190', '#1a2233', fl);
      bshape([x - 30, y - 16, x + 30, y - 16, x + 22, y - 3, x - 22, y - 3], x, y - 16, x, y - 3, '#a9bcd6', '#566a88', fl);
      for (let s = -1; s <= 1; s += 2) {      // yan motor kapsülleri
        bshape([x + s * 34, y - 6, x + s * 48, y - 2, x + s * 48, y + 8, x + s * 34, y + 10], x + s * 34, y, x + s * 48, y, '#4a5873', '#20293a', fl);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x + s * 41, y + 12, 9, '120,200,255', 0.6 + 0.3 * Math.sin(t * 20 + s)); ctx.restore();
      }
      ctx.save(); ctx.translate(x, y - 22); ctx.rotate(t * 2.2);      // radar çanağı
      ctx.fillStyle = fl ? '#fff' : '#c9d6e8'; ctx.fillRect(-11, -2, 22, 4); ctx.fillStyle = '#ff5fb8'; ctx.fillRect(9, -2, 3, 4);
      ctx.restore();
      ctx.fillStyle = '#1b2431'; ctx.fillRect(x - 1.5, y - 22, 3, 8);
      bcore(x, y + 5, 7, hpf, '255,90,170');
    } else if (k === 1) {      // BUZ ÖRÜMCEĞİ: eklemli bacaklar, kristal karın, sekiz göz
      ctx.lineCap = 'round';
      for (let q = 0; q < 4; q++) for (let s = -1; s <= 1; s += 2) {
        const ph = Math.sin(t * 7 + q * 1.3 + (s > 0 ? 1.5 : 0)), kx = x + s * (24 + q * 2), ky = y - 14 + q * 8 - 6 + ph * 2;
        const fx = x + s * (40 + q * 3), fy = y - 16 + q * 12 + ph * 4;
        ctx.strokeStyle = 'rgba(5,10,20,0.9)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x + s * 10, y - 6 + q * 5); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.strokeStyle = fl ? '#fff' : '#5fc9ea'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(x + s * 10, y - 6 + q * 5); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.arc(kx, ky, 1.6, 0, 6.3); ctx.fill();
      }
      ctx.lineCap = 'butt';
      bshape([x, y + 4, x + 15, y + 12, x + 11, y + 30, x, y + 36, x - 11, y + 30, x - 15, y + 12], x - 15, y, x + 15, y + 36, '#2a7fa3', '#0d2f42', fl);      // karın
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let q = 0; q < 3; q++) glow(x, y + 14 + q * 7, 6, '140,240,255', 0.35 + 0.25 * Math.sin(t * 4 + q));
      ctx.restore();
      bshape([x, y - 22, x + 17, y - 8, x + 13, y + 8, x - 13, y + 8, x - 17, y - 8], x - 17, y - 22, x + 17, y + 8, '#bff3ff', '#2d7fa6', fl);      // baş-gövde
      bshape([x, y - 22, x + 7, y - 8, x, y + 2, x - 7, y - 8], x, y - 22, x, y + 2, '#ffffff', '#7fd8f2', fl, 'rgba(20,60,90,0.6)');
      for (let q = 0; q < 4; q++) { beye(x - 9 + q * 6, y - 4 + Math.abs(q - 1.5) * 1.5, 1.6, '255,60,90'); }
      ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4, y + 7); ctx.lineTo(x - 6, y + 13); ctx.moveTo(x + 4, y + 7); ctx.lineTo(x + 6, y + 13); ctx.stroke();      // kıskaçlar
      bcore(x, y + 20, 5, hpf, '120,230,255');
    } else if (k === 2) {      // FIRTINA KARTALI: tüylü katmanlı kanatlar, şimşekli kuyruk
      const fp = Math.sin(t * 4) * 7;
      for (let s = -1; s <= 1; s += 2) {
        for (let f = 0; f < 4; f++) {      // tüy katmanları
          const tx = x + s * (52 - f * 6), ty = y - 20 - fp + f * 7;
          bshape([x + s * 8, y - 6 + f * 2, tx, ty, tx - s * 8, ty + 9, x + s * 10, y + 4 + f * 2], x, y, tx, ty, f % 2 ? '#e09a3a' : '#a85d1c', '#3a1d08', fl);
        }
      }
      bshape([x - 6, y + 14, x - 12, y + 30, x, y + 26, x + 12, y + 30, x + 6, y + 14], x, y + 14, x, y + 30, '#7a3f10', '#2a1404', fl);      // kuyruk
      bshape([x, y - 24, x + 12, y - 8, x + 9, y + 16, x - 9, y + 16, x - 12, y - 8], x - 12, y - 24, x + 12, y + 16, '#f2c27a', '#6a3810', fl);      // gövde
      bshape([x - 7, y - 20, x + 7, y - 20, x + 6, y - 10, x - 6, y - 10], x, y - 20, x, y - 10, '#ffffff', '#d8e2ee', fl, 'rgba(60,40,20,0.7)');      // beyaz baş
      bshape([x - 3, y - 10, x + 3, y - 10, x, y - 2], x, y - 10, x, y - 2, '#ffd24a', '#c97a10', fl);      // gaga (aşağı bakar)
      beye(x - 3.5, y - 15, 1.8, '255,220,60'); beye(x + 3.5, y - 15, 1.8, '255,220,60');
      if (Math.sin(t * 3) > 0.85) {      // kanat uçlarında şimşek
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(200,230,255,0.9)'; ctx.lineWidth = 1.5;
        for (let s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.moveTo(x + s * 50, y - 22 - fp); ctx.lineTo(x + s * 56, y - 10); ctx.lineTo(x + s * 50, y - 6); ctx.lineTo(x + s * 58, y + 6); ctx.stroke(); }
        ctx.restore();
      }
      bcore(x, y + 4, 5.5, hpf, '255,180,80');
    } else if (k === 3) {      // BUZ KALESİ: taş zırh, burçlar, buz kristalleri, dönen top bataryası
      bshape([x - 40, y - 14, x + 40, y - 14, x + 44, y + 16, x - 44, y + 16], x, y - 14, x, y + 16, '#8695ad', '#2a3242', fl);
      ctx.strokeStyle = 'rgba(10,15,25,0.5)'; ctx.lineWidth = 1;      // taş derzleri
      ctx.beginPath();
      for (let r = 0; r < 3; r++) { ctx.moveTo(x - 42, y - 4 + r * 9); ctx.lineTo(x + 42, y - 4 + r * 9); for (let c = 0; c < 6; c++) { const cx = x - 36 + c * 14 + (r % 2) * 7; ctx.moveTo(cx, y - 13 + r * 9); ctx.lineTo(cx, y - 5 + r * 9); } }
      ctx.stroke();
      for (let q = 0; q < 5; q++) {      // burçlar
        const bx = x - 38 + q * 17;
        bshape([bx, y - 14, bx + 10, y - 14, bx + 10, y - 24, bx, y - 24], bx, y - 24, bx, y - 14, '#b7c4d8', '#5d6a80', fl);
      }
      for (let s = -1; s <= 1; s += 2) {      // köşe kuleleri + buz sivrisi
        bshape([x + s * 44, y - 30, x + s * 52, y - 18, x + s * 52, y + 18, x + s * 36, y + 18, x + s * 36, y - 18], x + s * 36, y, x + s * 52, y, '#9aa9c0', '#333d50', fl);
        bshape([x + s * 44, y - 44, x + s * 48, y - 30, x + s * 40, y - 30], x + s * 44, y - 44, x + s * 44, y - 30, '#ffffff', '#8fd8ff', fl, 'rgba(30,70,110,0.7)');
        beye(x + s * 44, y - 8, 2.2, '255,120,60');
      }
      ctx.save(); ctx.translate(x, y + 2);      // dönen top halkası
      for (let q = 0; q < 8; q++) {
        const a = e.spin + q * 0.785, cx = Math.cos(a) * 24, cy = Math.sin(a) * 9;
        if (cy < 0) continue;
        ctx.fillStyle = '#141a24'; ctx.beginPath(); ctx.arc(cx, cy + 4, 3.6, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#ff9a4d'; ctx.beginPath(); ctx.arc(cx, cy + 4, 1.3, 0, 6.3); ctx.fill();
      }
      ctx.restore();
      bshape([x - 9, y - 8, x + 9, y - 8, x + 9, y + 12, x - 9, y + 12], x, y - 8, x, y + 12, '#1b2230', '#0a0e16', fl);      // kapı
      bcore(x, y + 2, 6, hpf, '255,150,70');
    } else {      // KUZEY KRALI: altın taç, dalgalanan pelerin, dönen rün halkası, aura
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y, 70, '160,90,255', 0.25 + 0.1 * Math.sin(t * 2)); ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.6);      // rün halkası
      ctx.strokeStyle = 'rgba(200,160,255,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      const w1 = Math.sin(t * 3) * 4, w2 = Math.sin(t * 3 + 1.5) * 4;
      bshape([x - 18, y - 12, x + 18, y - 12, x + 40, y + 26 + w1, x + 20, y + 22 + w2, x, y + 30 + w1, x - 20, y + 22 + w2, x - 40, y + 26 + w1], x, y - 12, x, y + 30, '#7a3fd0', '#1a0838', fl);      // pelerin
      bshape([x - 18, y - 14, x + 18, y - 14, x + 14, y + 12, x - 14, y + 12], x - 18, y, x + 18, y, '#4a3a6a', '#1e1530', fl);      // zırh
      for (let s = -1; s <= 1; s += 2) bshape([x + s * 16, y - 16, x + s * 30, y - 10, x + s * 26, y, x + s * 14, y - 4], x + s * 14, y - 16, x + s * 30, y, '#ffe9a8', '#b07a10', fl);      // apoletler
      bshape([x - 11, y - 30, x + 11, y - 30, x + 10, y - 14, x - 10, y - 14], x, y - 30, x, y - 14, '#e8f0ff', '#9fb2d0', fl);      // yüz maskesi
      beye(x - 4.5, y - 22, 2, '120,255,200'); beye(x + 4.5, y - 22, 2, '120,255,200');
      bshape([x - 13, y - 30, x - 15, y - 42, x - 8, y - 35, x - 4, y - 46, x, y - 36, x + 4, y - 46, x + 8, y - 35, x + 15, y - 42, x + 13, y - 30], x, y - 46, x, y - 30, '#fff3b0', '#c98a10', fl);      // taç
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(x, y - 40, 7, '255,90,200', 0.8); glow(x - 4, y - 44, 4, '120,255,200', 0.6); glow(x + 4, y - 44, 4, '120,200,255', 0.6);
      ctx.restore();
      for (let q = 0; q < 6; q++) {      // yörünge kristalleri
        const a = e.spin * 1.5 + q * 1.047, ox = x + Math.cos(a) * 38, oy = y + Math.sin(a) * 15;
        bshape([ox, oy - 5, ox + 3, oy, ox, oy + 5, ox - 3, oy], ox, oy - 5, ox, oy + 5, q % 2 ? '#ffd0f0' : '#c8fff0', q % 2 ? '#ff4fb0' : '#20c090', fl, 'rgba(10,10,30,0.6)');
      }
      bcore(x, y + 2, 6.5, hpf, '190,120,255');
    }
    // hasar: çatlak ve duman
    if (hpf < 0.5) {
      ctx.strokeStyle = 'rgba(255,120,60,' + (0.5 + 0.4 * Math.sin(t * 15)) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 14, y - 6); ctx.lineTo(x - 8, y); ctx.lineTo(x - 12, y + 6); ctx.moveTo(x + 10, y - 8); ctx.lineTo(x + 15, y - 1); ctx.stroke();
      if (Math.random() < 0.4) part(x + rand(-20, 20), e.wy + rand(-6, 10), rand(-15, 15), rand(30, 70), rand(0.5, 1), rand(2.5, 5), hpf < 0.25 ? '#ff7a3c' : '#5a6372', hpf < 0.25);
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
      if (c.pw) {                              // güçlendirme: dönen turuncu elmas
        const pu = 1 + 0.12 * Math.sin(G.t * 7);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const sh = c.k === 'sh', wg = c.k === 'wing', mg = c.k === 'mag', wd = c.k === 'wd', sk = c.k === 'sk';       // turuncu: silah · mavi: kalkan · yeşil: kanat yardımcıları
        glow(c.x, y, 22, sk ? '220,235,255' : wd ? '120,255,230' : mg ? '255,90,200' : sh ? '80,170,255' : wg ? '80,240,150' : '255,140,50', 0.6);
        ctx.restore();
        ctx.save(); ctx.translate(c.x, y); ctx.rotate(G.t * 1.6); ctx.scale(pu, pu);
        ctx.fillStyle = sk ? '#5a6f8c' : wd ? '#17a594' : mg ? '#d0369a' : sh ? '#2f8fe8' : wg ? '#1fae6a' : '#ff7a1f'; ctx.beginPath(); ctx.roundRect(-7, -7, 14, 14, 3); ctx.fill();
        ctx.strokeStyle = '#fff1dc'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        if (sk) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(c.x - 4.5, y + 3); ctx.lineTo(c.x + 4.5, y + 3); ctx.moveTo(c.x - 2.5, y + 3); ctx.lineTo(c.x - 2.5, y - 3.5); ctx.lineTo(c.x + 2, y - 3.5); ctx.stroke(); }
        else if (wd) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let q = -1; q <= 1; q++) { ctx.moveTo(c.x - 4, y + q * 2.6); ctx.quadraticCurveTo(c.x, y + q * 2.6 - 2, c.x + 4, y + q * 2.6); } ctx.stroke(); }
        else if (mg) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(c.x, y - 0.5, 3.4, Math.PI, 0); ctx.lineTo(c.x + 3.4, y + 3.5); ctx.moveTo(c.x - 3.4, y - 0.5); ctx.lineTo(c.x - 3.4, y + 3.5); ctx.stroke(); }
        else if (sh) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(c.x, y, 3.6, 0, 6.3); ctx.stroke(); }
        else if (wg) { poly([c.x - 5, y + 3, c.x - 2.5, y - 4, c.x, y + 3]); poly([c.x, y + 3, c.x + 2.5, y - 4, c.x + 5, y + 3]); }
        else { ctx.fillRect(c.x - 1.4, y - 4.5, 2.8, 9); ctx.fillRect(c.x - 4.5, y - 1.4, 9, 2.8); }
        continue;
      }
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
    const n = G.night * (G.av === 3 ? 0.45 : 1);      // Vega: gece görüşü
    if (n < 0.03) return;
    const playing = G.mode !== 'title' && G.mode !== 'store';
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
      if (s.flame) { const k = s.life / 0.42; glow(s.x, y, 8 + (1 - k) * 22, k > 0.6 ? '255,235,160' : k > 0.3 ? '255,140,40' : '230,70,30', 0.85 * k); continue; }
      const ux = s.vx || 0, uy = -(s.v - P.speed), ul = Math.hypot(ux, uy) || 1, tx = -ux / ul * 18, ty = -uy / ul * 18;
      glow(s.x, y, s.lance ? 16 : s.star ? 12 : s.gold ? 13 : s.pellet ? 8 : 9, s.lance ? '150,230,255' : s.star ? '255,160,240' : s.gold ? '255,210,90' : s.dmg > 1 ? '255,170,110' : '255,220,140', 0.7);
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
      if (s.flame) continue;
      if (s.lance) { ctx.fillStyle = '#7fe3ff'; ctx.fillRect(s.x - 2.6, sy(s.wy) - 14, 5.2, 26); ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 1.2, sy(s.wy) - 13, 2.4, 24); ctx.fillStyle = '#fffbe8'; continue; }
      if (s.star) { ctx.fillStyle = '#ffd6f6'; ctx.beginPath(); ctx.arc(s.x, sy(s.wy), 3.4, 0, 6.3); ctx.fill(); ctx.fillStyle = '#fffbe8'; continue; }
      if (s.homing) {      // güdümlü füze: gövde, burun, kanatçık, itici alevi
        const y = sy(s.wy), ux = s.vx || 0, uy = -(s.v - P.speed), a = Math.atan2(uy, ux) + Math.PI / 2;
        ctx.save(); ctx.translate(s.x, y); ctx.rotate(a); if (s.gold) ctx.scale(1.45, 1.45);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(0, 6, 8, '120,255,190', 0.7);
        ctx.fillStyle = '#fff6da'; poly([-1.6, 4, 1.6, 4, 0, 9 + Math.random() * 4]); ctx.restore();
        ctx.fillStyle = s.gold ? '#fff1b0' : '#e8f3ff'; ctx.fillRect(-1.6, -4, 3.2, 8);
        ctx.fillStyle = s.gold ? '#e0a21b' : '#3cc98d'; poly([-1.6, -4, 1.6, -4, 0, -7.5]);
        ctx.fillStyle = s.gold ? '#9a6a0c' : '#1f6b52'; poly([-1.6, 1.5, -4, 4.5, -1.6, 4]); poly([1.6, 1.5, 4, 4.5, 1.6, 4]);
        ctx.restore(); ctx.fillStyle = '#fffbe8';
      }
      else if (s.pellet) { ctx.beginPath(); ctx.arc(s.x, sy(s.wy), 2.2, 0, 6.3); ctx.fill(); }
      else ctx.fillRect(s.x - 1.5, sy(s.wy) - 5, 3, 9);
    }
  }

  function drawBlastFx() {      // zincir şimşek ve yıldız halkası
    if (!bolts.length && !rings.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i], a = Math.min(1, b.life / 0.3), y1 = sy(b.w1), y2 = sy(b.w2), pts = [b.x1, y1];
      for (let q = 1; q < 8; q++) { const f = q / 8; pts.push(b.x1 + (b.x2 - b.x1) * f + rand(-11, 11), y1 + (y2 - y1) * f + rand(-7, 7)); }
      pts.push(b.x2, y2);
      for (let w = 0; w < 3; w++) {      // dış hale, sarı gövde, beyaz çekirdek
        ctx.strokeStyle = w === 2 ? 'rgba(255,255,255,' + a + ')' : w ? 'rgba(255,230,90,' + (0.9 * a) + ')' : 'rgba(255,200,60,' + (0.3 * a) + ')';
        ctx.lineWidth = w === 2 ? 2 : w ? 5 : 12;
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let q = 2; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,245,170,' + (0.7 * a) + ')'; ctx.lineWidth = 1.5;      // yan dallar
      for (let q = 4; q < pts.length - 2; q += 4) { ctx.beginPath(); ctx.moveTo(pts[q], pts[q + 1]); ctx.lineTo(pts[q] + rand(-22, 22), pts[q + 1] + rand(-18, 18)); ctx.stroke(); }
      glow(b.x2, y2, 26, '255,240,150', 0.9 * a); glow(b.x1, y1, 16, '255,240,150', 0.6 * a);
    }
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i], k = 1 - Math.min(1, r.life / 0.6), rr = r.R * (0.2 + 0.8 * k), ry = sy(r.wy);
      ctx.strokeStyle = 'rgba(255,170,240,' + (0.95 * (1 - k)) + ')'; ctx.lineWidth = 14 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(r.x, ry, rr, 0, 6.3); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, ry, rr, 0, 6.3); ctx.stroke();
      for (let q = 0; q < 8; q++) { const an = q * 0.785 + G.t; ctx.fillStyle = 'rgba(255,230,250,' + (1 - k) + ')'; ctx.beginPath(); ctx.arc(r.x + Math.cos(an) * rr, ry + Math.sin(an) * rr, 3, 0, 6.3); ctx.fill(); }
    }
    ctx.restore();
  }
  function drawShells() {
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i], p = 1 - s.t / s.T, ty = sy(s.wy);
      const pulse = 0.5 + 0.5 * Math.sin(G.t * 16);
      ctx.strokeStyle = 'rgba(255,90,70,' + (0.35 + 0.4 * p) + ')'; ctx.lineWidth = 2;      // hedef işareti
      ctx.beginPath(); ctx.arc(s.x, ty, 24, 0, 6.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, ty, 24 * (1 - p) + 3, 0, 6.3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,90,70,' + (0.08 + 0.12 * p * pulse) + ')'; ctx.beginPath(); ctx.arc(s.x, ty, 24, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s.x - 8, ty); ctx.lineTo(s.x + 8, ty); ctx.moveTo(s.x, ty - 8); ctx.lineTo(s.x, ty + 8); ctx.stroke();
      const bx = s.sx + (s.x - s.sx) * p, by = sy(s.swy + (s.wy - s.swy) * p) - Math.sin(p * Math.PI) * 90, r = 4 + Math.sin(p * Math.PI) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(bx + 4, sy(s.swy + (s.wy - s.swy) * p), r * 0.8, 0, 6.3); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(bx, by, r * 3, '255,160,80', 0.6); ctx.restore();
      ctx.fillStyle = '#2a3340'; ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.4, 0, 6.3); ctx.fill();
    }
  }

  function drawOrbs() {
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i], y = sy(o.wy);
      if (o.big) {      // kar devinin kayası
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(o.x, y, 26, '170,220,255', 0.6); ctx.restore();
        ctx.fillStyle = '#cfe6f5'; ctx.beginPath(); ctx.arc(o.x, y, 11, 0, 6.3); ctx.fill();
        ctx.strokeStyle = '#3d5a73'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#8fb3cc'; ctx.beginPath(); ctx.arc(o.x + 3, y + 3, 4, 0, 6.3); ctx.arc(o.x - 4, y - 1, 2.5, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(o.x - 3, y - 4, 2.5, 0, 6.3); ctx.fill();
        continue;
      }
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
    if (G.wing) {      // yardımcı dronlar: dönen halka, çift itici, füze kapsülleri; kademe arttıkça zırh ve altın şerit
      for (let q = -1; q <= 1; q += 2) {
        const lv = G.wing, wx = x + q * (17 + 2 * lv), wy2 = y + 3 + Math.sin(G.t * 4 + q) * 1.8, rk = Math.sin(G.t * 2.2 + q) * 0.12;
        const fire = G.wingCd > (G.wing >= 2 ? 0.75 : 1.25);      // atıştan hemen sonra namlu parlar
        ctx.save(); ctx.translate(wx, wy2); ctx.rotate(rk + t * 0.15);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(5, 9, 6, 4, 0, 0, 6.3); ctx.fill();      // gölge
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(0, 0, 13, lv >= 3 ? '255,220,120' : '80,240,170', 0.35);
        for (let s2 = -1; s2 <= 1; s2 += 2) { const fl = 4 + Math.random() * 3; ctx.fillStyle = 'rgba(120,255,200,0.85)'; poly([s2 * 3 - 1.3, 5, s2 * 3 + 1.3, 5, s2 * 3, 5 + fl]); }
        if (fire) glow(0, -9, 9, '255,255,220', 0.9);
        ctx.restore();
        const g = ctx.createLinearGradient(-6, -6, 6, 6);
        g.addColorStop(0, lv >= 3 ? '#4fe0a0' : '#3cc98d'); g.addColorStop(1, lv >= 3 ? '#0d5a3c' : '#0f4a35');
        ctx.fillStyle = g; poly([0, -9, 5, -4, 6.5, 3, 3.5, 6, -3.5, 6, -6.5, 3, -5, -4]);      // gövde
        ctx.strokeStyle = '#06140f'; ctx.lineWidth = 1.2; ctx.stroke();
        for (let s2 = -1; s2 <= 1; s2 += 2) {      // yan füze kapsülleri
          ctx.fillStyle = '#1b2a33'; ctx.fillRect(s2 * 6.5 - 1.6, -4, 3.2, 8);
          ctx.fillStyle = lv >= 2 ? '#ff6a5a' : '#cfe9ff'; ctx.fillRect(s2 * 6.5 - 1.6, -5.5, 3.2, 2);
          if (lv >= 2) { ctx.fillStyle = '#2c6b52'; poly([s2 * 8, 0, s2 * 12, 5, s2 * 8, 5]); }      // kanatçık
        }
        ctx.fillStyle = '#dff7ff'; ctx.beginPath(); ctx.ellipse(0, -2, 2.2, 3, 0, 0, 6.3); ctx.fill();      // göz
        ctx.fillStyle = '#18b8ff'; ctx.beginPath(); ctx.arc(0, -2.4, 1.2, 0, 6.3); ctx.fill();
        if (lv >= 3) { ctx.strokeStyle = '#ffd95a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(0, -7); ctx.lineTo(4, 4); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(160,255,210,' + (0.5 + 0.3 * Math.sin(G.t * 6)) + ')'; ctx.lineWidth = 1;      // dönen tarama halkası
        ctx.beginPath(); ctx.arc(0, 0, 10, G.t * 3 * q, G.t * 3 * q + 1.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 10, G.t * 3 * q + 3.14, G.t * 3 * q + 4.7); ctx.stroke();
        ctx.restore();
      }
    }
    if (G.bossMagT > 0) {      // bekçi ödülü: büyük mıknatıs
      const a = Math.min(1, G.bossMagT / 0.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let q = 0; q < 3; q++) {
        const k = (G.t * 1.6 + q / 3) % 1;
        ctx.strokeStyle = 'rgba(255,122,209,' + (0.7 * (1 - k) * a) + ')'; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(x, y, 90 - 70 * k, 0, 6.3); ctx.stroke();
      }
      ctx.lineWidth = 1.2;
      for (let i = 0; i < coinsL.length; i++) {
        const c = coinsL[i]; if (!c.pull || c.pw) continue;
        const cy = sy(c.wy); ctx.strokeStyle = 'rgba(255,210,90,' + (0.45 * a) + ')';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(c.x, cy); ctx.stroke();
      }
      glow(x, y, 34, '255,122,209', 0.35 * a);
      ctx.restore();
      if (G.bossMagT > 2.2) text('MIKNATIS', x, y - 40, 13, '#ff9fe0', 'center', 700);
    }
    if (G.mag > 0 && G.magT <= 0) {
      ctx.strokeStyle = 'rgba(255,122,209,' + (0.18 + 0.1 * Math.sin(G.t * 6)) + ')'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(x, y, MAG_R[G.mag], G.t, G.t + 6.3); ctx.stroke(); ctx.setLineDash([]);
    }
    if (G.magT > 0) {
      G.magT -= 1 / 60;
      const R = MAG_R[G.mag] * (1 - G.magT / 0.6 * 0.3);
      ctx.strokeStyle = 'rgba(255,122,209,' + (G.magT / 0.6 * 0.7) + ')'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 6.3); ctx.stroke();
    }
    if (G.shield > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createRadialGradient(x, y, 6, x, y, 19);      // yumuşak, şeffaf kalkan balonu
      sg.addColorStop(0, 'rgba(120,200,255,0)'); sg.addColorStop(0.75, 'rgba(120,200,255,0.07)'); sg.addColorStop(1, 'rgba(150,215,255,' + (0.18 + 0.06 * Math.sin(G.t * 5)) + ')');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, y, 15, 19, 0, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(170,225,255,' + (0.16 + 0.06 * Math.sin(G.t * 5)) + ')'; ctx.lineWidth = 0.8; ctx.stroke();
      if (G.shield > 1) { ctx.strokeStyle = 'rgba(120,200,255,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, 19, 23, 0, 0, 6.3); ctx.stroke(); }
      ctx.restore();
    }
    // far ışığı
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, y - 10, 0, y - 140);
    g.addColorStop(0, 'rgba(255,232,180,' + (0.05 + 0.27 * G.night) + ')'); g.addColorStop(1, 'rgba(255,232,180,0)');
    ctx.fillStyle = g;
    poly([x - 3, y - 10, x - 36 + t * 26, y - 140, x + 36 + t * 26, y - 140, x + 3, y - 10]);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y); ctx.rotate(t * 0.2); ctx.scale(PS * (1 - Math.abs(t) * 0.16), PS);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';      // gemi havada: gölge yere düşer
    ctx.beginPath(); ctx.ellipse(9, 14, 8, 11, 0, 0, 6.3); ctx.fill();
    // itici alevi
    const fl = 6 + clamp((P.speed / G.sm - SPEED_MIN) / (SPEED_MAX - SPEED_MIN), 0, 1) * 13 + Math.random() * 3;
    ctx.fillStyle = '#ffb347'; poly([-3.2, 10, 3.2, 10, 0, 10 + fl]);
    ctx.fillStyle = '#fff6da'; poly([-1.6, 10, 1.6, 10, 0, 10 + fl * 0.55]);
    const tier = G.power >= 13 ? 3 : G.power >= 9 ? 2 : G.power >= 4 ? 1 : 0;
    if (window.COS) COS.drawSled(ctx, G.sled, tier, G.t);      // mağazadan seçilen kızak
    else {
    // kızak ayakları
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#141c28'; ctx.lineWidth = 4.2;       // koyu dış hat: gündüz açık suda seçilsin
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-9, 11); ctx.moveTo(9, -6); ctx.lineTo(9, 11); ctx.stroke();
    ctx.strokeStyle = '#dbe6f2'; ctx.lineWidth = 2.4;       // açık metal: gece de görünsün
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-9, 11); ctx.moveTo(9, -6); ctx.lineTo(9, 11); ctx.stroke();
    ctx.strokeStyle = '#8fa3ba'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-9, 3); ctx.lineTo(-4, 4); ctx.moveTo(9, 3); ctx.lineTo(4, 4); ctx.moveTo(-9, -2); ctx.lineTo(-4, -1); ctx.moveTo(9, -2); ctx.lineTo(4, -1); ctx.stroke();
    ctx.lineCap = 'butt';
    // gövde: güç arttıkça kızak tipi değişir (0-3 keşif, 4-7 avcı, 8-12 akıncı, 13+ buz kartalı)
    const HULL = [['#f26a1b', '#ff9a4d'], ['#d8323a', '#ff6a6a'], ['#6a3fd0', '#a27bff'], ['#d9a21b', '#ffe07a']][tier];
    if (tier >= 1) {      // yan kanatçıklar
      ctx.fillStyle = HULL[0]; poly([-6, 0, -13 - tier, 7, -12 - tier, 10, -6, 7]); poly([6, 0, 13 + tier, 7, 12 + tier, 10, 6, 7]);
    }
    if (tier >= 2) {      // namlu yuvaları
      ctx.fillStyle = '#16212f'; ctx.fillRect(-12.5, -6, 2.5, 9); ctx.fillRect(10, -6, 2.5, 9);
      ctx.fillStyle = HULL[1]; ctx.fillRect(-12.5, -7, 2.5, 2); ctx.fillRect(10, -7, 2.5, 2);
    }
    if (tier >= 3) {      // altın taç sivrisi + parıltı
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(0, -12, 9, '255,220,120', 0.35 + 0.15 * Math.sin(G.t * 6)); ctx.restore();
      ctx.fillStyle = '#fff1b0'; poly([0, -19, 2, -13, -2, -13]);
    }
    ctx.fillStyle = HULL[0]; poly([0, -14, 6, -2, 6.5, 8, 3, 11, -3, 11, -6.5, 8, -6, -2]);
    ctx.fillStyle = HULL[1]; poly([0, -14, -6, -2, -6.5, 8, -3, 11, 0, 11]);
    ctx.fillStyle = '#fff1dc'; ctx.fillRect(-4.5, 5, 9, 1.8);
    ctx.fillStyle = '#16212f'; ctx.beginPath(); ctx.ellipse(0, -2, 3.2, 5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#9fe6ff'; ctx.beginPath(); ctx.ellipse(-0.9, -3.4, 1.2, 2.2, 0, 0, 6.3); ctx.fill();
    }
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
      text(p.text, p.x, sy(p.wy) - (1.1 - p.life) * 26, p.text.charAt(0) === '+' ? 15 : 20, p.color, 'center', 700);
    }
    ctx.globalAlpha = 1;
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H * 0.6, H * 0.28, W / 2, H * 0.55, H * 0.78);
    g.addColorStop(0, 'rgba(2,6,12,0)'); g.addColorStop(1, 'rgba(2,6,12,' + (0.2 + 0.35 * G.night) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (G.flash > 0) { ctx.fillStyle = 'rgba(255,236,190,' + (G.flash * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
    if (G.fxFlash > 0) { ctx.fillStyle = 'rgba(' + (G.fxCol || '255,255,255') + ',' + (G.fxFlash * 1.4) + ')'; ctx.fillRect(0, 0, W, H); }      // özel yaylım parlaması
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
    if (window.COS) COS.drawAvatar(ctx, G.av, 24, 26, 14, G.t);      // pilot portresi
    const sx0 = window.COS ? 44 : 12;
    text('PUAN', sx0, 15, 10, 'rgba(190,215,240,0.8)', 'left', 500);
    text(String(G.score).padStart(6, '0'), sx0, 36, 24, '#ffffff', 'left', 700);
    coinIcon(18, 50, 5, 1);
    text(String(G.coins), 28, 55, 15, '#ffd95a', 'left', 700);
    // alınan güçlendirmeler: küçük rozetler (harf + kademe noktaları)
    let bdx = 12;
    const badge = (ch, col, lv, max) => {
      ctx.fillStyle = 'rgba(10,20,35,0.45)'; ctx.fillRect(bdx, 64, 18, 18);
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.strokeRect(bdx + 0.5, 64.5, 17, 17);
      text(ch, bdx + 9, 77, 11, col, 'center', 700);
      for (let i = 0; i < max; i++) { ctx.fillStyle = i < lv ? col : 'rgba(255,255,255,0.18)'; ctx.fillRect(bdx + i * (18 / max) + 1, 84, 18 / max - 2, 2); }
      bdx += 22;
    };
    if (G.power > 0) badge('S', '#ffb347', Math.ceil(G.power / 4), 4);
    if (G.shield > 0) badge('K', '#8fd0ff', G.shield, SHIELD_MAX);
    if (G.mag > 0) badge('M', '#ff9fe0', G.mag, MAG_MAX);
    if (G.wing > 0) badge('Y', '#7dffb0', G.wing, WING_MAX);
    if (G.windPf) badge('R', '#9ff5e8', 1, 1);
    if (G.skate) badge('P', '#e9f3ff', 1, 1);
    const loop = Math.floor(G.sec / NSEC);
    const stageLbl = 'ETAP ' + (G.sec + 1) + '/' + MAXLV;
    text(stageLbl, W / 2, 15, 10, 'rgba(190,215,240,0.8)', 'center', 500);
    todIcon(W / 2 - ctx.measureText(stageLbl).width / 2 - 11, 11.5);
    text(LV.info(G.sec).name.toLocaleUpperCase('tr'), W / 2, 33, 15, '#ffe9b8', 'center', 700);
    text('GEMİ', W - 12, 15, 10, 'rgba(190,215,240,0.8)', 'right', 500);
    const spare = Math.max(0, G.lives - (G.mode === 'dying' ? 1 : 0));
    for (let i = 0; i < spare; i++) miniShip(W - 17 - i * 13, 29);
    if (IS_TOUCH) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(W - 27, 46, 4, 13); ctx.fillRect(W - 19, 46, 4, 13);
    }

    // dokunmatik düğmeler: çevredeki halka bekleme süresini gösterir
    if (tb.seen && (G.mode === 'playing' || G.mode === 'dying')) {
      const drawTB = function (c, label, rgb, fr, held) {
        const ready = fr >= 1;
        ctx.fillStyle = 'rgba(8,18,30,' + (held ? 0.75 : 0.5) + ')';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 6.3); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(190,215,240,0.25)';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 1.5, 0, 6.3); ctx.stroke();
        ctx.strokeStyle = 'rgba(' + rgb + ',' + (ready ? 0.95 : 0.55) + ')';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 1.5, -Math.PI / 2, -Math.PI / 2 + 6.2832 * clamp(fr, 0, 1)); ctx.stroke();
        text(label, c.x, c.y + 3.5, 9, ready ? 'rgb(' + rgb + ')' : 'rgba(190,215,240,0.6)', 'center', 700);
      };
      drawTB(TBTN.blast, P.charge > 0 ? Math.round(P.charge * 100) + '%' : 'YAYLIM', P.charge > 0 ? '255,154,77' : '255,226,122', G.blastCd <= 0 ? 1 : 1 - G.blastCd / blastCdMax(), tb.blastId !== null);
      drawTB(TBTN.nuke, 'NÜKLEER', '125,255,176', G.nukeCd <= 0 ? 1 : 1 - G.nukeCd / nukeCdMax(), false);
    }

    // alt: ısı göstergesi
    const g2 = ctx.createLinearGradient(0, H - 58, 0, H);
    g2.addColorStop(0, 'rgba(3,9,16,0)'); g2.addColorStop(1, 'rgba(3,9,16,0.8)');
    ctx.fillStyle = g2; ctx.fillRect(0, H - 58, W, 58);
    const bx = 62, bw = 198, by = H - 27, bh = 11, f = clamp(G.heat / 100, 0, 1);
    const low = G.heat < 25, blink = low && Math.floor(G.t * 6) % 2 === 0;
    text('YAKIT', bx - 10, by + 10, 13, blink ? '#ff6a5a' : '#ffffff', 'right', 700);
    // yaylım atışı: bekleme süresi dolarken dolar, hazır olunca parlar, şarj edilirken turuncuya döner
    {
      const ready = G.blastCd <= 0, yb = by - 11, fr = ready ? 1 : 1 - G.blastCd / blastCdMax();
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
      const ready = G.nukeCd <= 0, yn = by - 20, fr = ready ? 1 : 1 - G.nukeCd / nukeCdMax();
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

    if (low && G.mode === 'playing') text('YAKIT İSTASYONU BUL!', W / 2, H - 60, 13, blink ? '#ff6a5a' : '#ffd0c8', 'center', 700);

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
        ctx.fillStyle = active ? 'rgba(200,60,40,0.55)' : 'rgba(8,18,30,0.6)'; ctx.fillRect(0, 104, W, 40);
        text(G.windWarn > 0 ? 'RÜZGÂR  › › ›' : '‹ ‹ ‹  RÜZGÂR', W / 2, 134, 28, active ? '#ffffff' : '#ffcf8a', 'center', 700);
      }
    }

    if (G.sensT > 0 && G.mode !== 'paused') {
      ctx.globalAlpha = Math.min(1, G.sensT * 2);
      text('HAREKET HASSASİYETİ  ' + mouse.level + ' / 9', W / 2, 170, 19, '#ffe9b8', 'center', 700);
      ctx.globalAlpha = 1;
    }

    // bölüm geçişi (bekçiden sonra)
    if (G.chapT < 4.5 && G.mode !== 'gameover') {
      const ct = G.chapT, a = clamp(ct * 2.5, 0, 1) * clamp((4.5 - ct) * 1.5, 0, 1);
      ctx.globalAlpha = a * 0.75; ctx.fillStyle = '#06101c'; ctx.fillRect(0, 250, W, 120);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#7dffb0'; ctx.fillRect(W / 2 - 90 * a, 252, 180 * a, 2); ctx.fillRect(W / 2 - 90 * a, 366, 180 * a, 2);
      text('BÖLÜM ' + (G.chapN - 1) + ' TAMAMLANDI', W / 2, 284, 14, '#7dffb0', 'center', 700);
      const fin = G.chapN > MAXLV / BOSS_EVERY;      // son bekçi: yeni bölüm yok, fenere ulaşınca zafer
      text(fin ? 'SON FENER' : 'BÖLÜM ' + G.chapN, W / 2, 330, 44, '#ffffff', 'center', 700);
      text(fin ? 'eve son birkaç kulaç kaldı' : 'artık buradan bedava başlayabilirsin', W / 2, 354, 12, 'rgba(190,215,240,0.85)', 'center', 500);
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
    return 'DEVAM · ETAP ' + (k + 1);
  }

  function toggleMute() { muted = !muted; A.setMuted(muted); store('bg_muted', muted ? '1' : '0'); }
  function drawMuteBtn() {      // menüde ses aç/kapa düğmesi (sağ üst)
    const b = BTN.mute, cx = b.x + 13, cy = b.y + b.h / 2;
    ctx.fillStyle = 'rgba(8,18,30,0.75)'; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(190,215,240,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = muted ? 'rgba(190,215,240,0.5)' : '#ffffff';
    poly([cx - 6, cy - 3, cx - 2, cy - 3, cx + 3, cy - 8, cx + 3, cy + 8, cx - 2, cy + 3, cx - 6, cy + 3]);
    ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    if (muted) { ctx.strokeStyle = '#ff8f80'; ctx.beginPath(); ctx.moveTo(cx + 7, cy - 5); ctx.lineTo(cx + 15, cy + 5); ctx.moveTo(cx + 15, cy - 5); ctx.lineTo(cx + 7, cy + 5); ctx.stroke(); }
    else { ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx + 4, cy, 5, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 4, cy, 9, -0.8, 0.8); ctx.stroke(); }
    ctx.lineCap = 'butt';
  }
  function drawTitle() {
    dim(0.68);
    const y0 = 132;
    text('KRİYO-7 BUZ GEZEGENİ · YAKIT KURYESİ', W / 2, y0 - 44, 13, '#ffcf8a', 'center', 500);
    for (let q = 0; q < 26; q++) {      // yıldızlar
      const sx2 = hash(q * 7.3) * W, sy2 = 50 + hash(q * 3.1 + 1) * 150, tw = 0.35 + 0.65 * Math.abs(Math.sin(G.t * (0.8 + hash(q) * 2) + q));
      ctx.fillStyle = 'rgba(230,240,255,' + tw * 0.8 + ')'; ctx.fillRect(sx2, sy2, 1.6, 1.6);
    }
    {      // Kriyo-7: halkalı buz gezegeni
      const gx = 296, gy = 96, gr = 19;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(gx, gy, 44, '120,200,255', 0.25); ctx.restore();
      ctx.strokeStyle = 'rgba(200,230,255,0.55)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(gx, gy, 34, 9, -0.35, Math.PI, 6.28); ctx.stroke();
      const pg = ctx.createRadialGradient(gx - 7, gy - 7, 2, gx, gy, gr);
      pg.addColorStop(0, '#f2fbff'); pg.addColorStop(0.5, '#8fd0ee'); pg.addColorStop(1, '#2b5f8c');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gx, gy, gr - 6, 3.6, 5.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,230,255,0.8)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(gx, gy, 34, 9, -0.35, 0, Math.PI); ctx.stroke();
    }
    text('BUZUL', W / 2, y0 + 10, 66, '#ffffff', 'center', 700);
    text('GEÇİDİ', W / 2, y0 + 66, 66, '#ff9a4d', 'center', 700);
    if (window.COS) { ctx.save(); ctx.translate(W / 2, y0 + 98); ctx.scale(0.95, 0.95); COS.drawSled(ctx, G.sled, 0, G.t); ctx.restore(); } else miniShip(W / 2, y0 + 96);

    const lines = [
      'Yakıtın bitmeden buz kanyonunu geç.',
      'Yakıt istasyonlarının üstünden yavaş',
      'geçersen daha çok yakıt alırsın. Altınla',
      'kaldığın etaptan devam edebilirsin.'
    ];
    for (let i = 0; i < lines.length; i++) text(lines[i], W / 2, y0 + 134 + i * 18, 14, 'rgba(225,238,250,0.92)', 'center', 500);

    const cy = y0 + 226;
    const rows = IS_TOUCH
      ? [['SÜRÜKLE', 'yön'], ['YUKARI / AŞAĞI', 'hızlan / yavaşla'], ['ATEŞ', 'otomatik'], ['DÜĞMELER', 'yaylım  ·  nükleer']]
      : [['←  →', 'yön'], ['↑  ↓', 'hızlan / yavaşla'], ['BOŞLUK / TIK', 'ateş'], ['BASILI TUT', 'şarj et, bırak: yaylım'], ['X / SAĞ TIK', 'nükleer patlama (60 sn)'], ['FARE', 'yön + hız'], ['1 – 9', 'hareket hassasiyeti: ' + mouse.level], ['P  ·  M', 'duraklat  ·  ses']];
    for (let i = 0; i < rows.length; i++) {
      text(rows[i][0], W / 2 - 10, cy + i * (rows.length > 7 ? 15.5 : 17.5), 14, '#ffe9b8', 'right', 700);
      text(rows[i][1], W / 2 + 10, cy + i * (rows.length > 7 ? 15.5 : 17.5), 14, 'rgba(225,238,250,0.92)', 'left', 500);
    }

    const blink = Math.floor(G.t * 1.6) % 2 === 0;
    button(BTN.titleNew, IS_TOUCH ? 'YENİ OYUN' : (blink ? 'YENİ OYUN  ·  ENTER' : 'YENİ OYUN'), null, true, true);
    if (G.last > 0) {
      const ck = contK(G.last), cost = contCost(ck), can = G.coins >= cost;
      const sh = G.deny > 0 ? Math.sin(G.deny * 60) * 4 : 0;
      button(BTN.titleCont, contLabel(ck), (IS_TOUCH ? '' : 'C  ·  ') + (cost ? cost + ' altın' : 'BEDAVA'), false, can, sh);
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
    text(G.won ? 'ZAFER!' : 'YOLCULUK BİTTİ', W / 2, 190, 40, G.won ? '#7dffb0' : '#ffffff', 'center', 700);
    text(G.won ? 'EVE ULAŞTIN · ' + MAXLV + ' ETAP TAMAM' : 'ETAP ' + (G.sec + 1) + ' · ' + LV.info(G.sec).name, W / 2, 218, 15, '#ffcf8a', 'center', 500);
    text('PUAN', W / 2, 262, 12, 'rgba(190,215,240,0.85)', 'center', 500);
    text(String(G.score).padStart(6, '0'), W / 2, 304, 46, '#ffffff', 'center', 700);
    text(G.newHi ? 'YENİ REKOR!' : 'EN İYİ  ' + String(G.hi).padStart(6, '0'), W / 2, 332, 15, G.newHi ? '#7dffb0' : '#ffcf8a', 'center', 700);
    coinIcon(W / 2 - 78, 361, 5.5, 1);
    text('bu yolculukta +' + G.runCoins + '  ·  toplam ' + G.coins, W / 2 - 68, 366, 14, '#ffd95a', 'left', 700);
    if (G.overT <= 0.8) return;
    if (G.sec > 0 && !G.won) {
      const ck = contK(G.sec), cost = contCost(ck), can = G.coins >= cost;
      const sh = G.deny > 0 ? Math.sin(G.deny * 60) * 4 : 0;
      button(BTN.overA, contLabel(ck), (IS_TOUCH ? '' : 'C  ·  ') + (cost ? cost + ' altın' : 'BEDAVA'), true, can, sh);
      button(BTN.overB, IS_TOUCH ? 'BAŞTAN BAŞLA' : 'BAŞTAN BAŞLA  ·  ENTER', null, false, true);
      text(can ? 'Devam edince puan sıfırlanır, 3 gemiyle etabın başından başlarsın.' : 'Devam için ' + (cost - G.coins) + ' altın daha gerekli.',
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
    if (G.mode !== 'title' && G.mode !== 'store') {
      drawCoins(); ROUND = 2.2; drawEnts(); ROUND = 0; drawShots(); drawBlastFx(); drawOrbs(); drawShells(); drawUltis();
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
    if (G.mode === 'shop') drawShop();
    else if (G.mode === 'store') drawStore();
    else if (G.mode === 'title') { drawTitle(); drawMuteBtn(); drawStoreBtn(); }
    else {
      drawHud();
      if (G.mode === 'gameover') { drawGameOver(); drawMuteBtn(); }
      else if (G.mode === 'paused') {
        dim(0.55); drawMuteBtn();
        text('DURAKLADI', W / 2, 300, 40, '#ffffff', 'center', 700);
        text(IS_TOUCH ? 'devam etmek için dokun' : mouse.active ? 'devam etmek için tıkla' : 'devam etmek için P ya da ENTER', W / 2, 330, 15, '#ffcf8a', 'center', 500);
        text(muted ? 'ses kapalı (M)' : 'ses açık (M)', W / 2, 354, 13, 'rgba(190,215,240,0.85)', 'center', 500);
        // fare hassasiyeti ayarı
        text('HAREKET HASSASİYETİ', W / 2, 406, 13, '#ffcf8a', 'center', 500);
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
    if (comboT > 0.3) text('BEKÇİYE ATLANIYOR  ' + Math.ceil(3 - comboT), W / 2, 140, 16, '#7dffb0', 'center', 700);
    // sürüm etiketi: karartmaların da üstünde, oyun sırasında dahil her zaman görünür
    ctx.globalAlpha = 1;
    text(VERSION, W - 6, H - 5, 12, '#ffffff', 'right', 700);
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
