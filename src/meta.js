/* Buzul Geçidi — görevler, madalyalar, etap yıldızları (window.META)
   Oyun olayları META.on(evt, data) ile gelir; tamamlanan görev/madalya listesi döner (oyun altını kendi ekler).
   Tek bir JSON kayıt: localStorage "bg_meta" (ui.store üzerinden), saniyede en fazla bir yazım; tamamlanmada hemen. */
(function () {
  'use strict';

  const KEY = 'bg_meta';
  const META = {};
  let ui = null;                               // META.init ile gelen çizim/saklama yardımcıları
  let S = null;                                // kalıcı durum
  let dirty = false, lastSave = 0, saveTimer = null;
  META._now = function () { return new Date(); };      // testte tarih enjekte edilebilir

  // ------------------------------------------------------------ yardımcılar
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  function dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {                         // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const SHIP_NAMES = ['KEŞİF', 'KUTUP TİLKİSİ', 'KIZIL ŞİMŞEK', 'MOR KUYRUKLU YILDIZ', 'ZÜMRÜT EJDER', 'ALTIN İMPARATOR'];
  function shipName(id) {
    try { const C = window.COS; if (C && C.SLEDS && C.SLEDS[id]) return C.SLEDS[id].name; } catch (e) { /* yut */ }
    return SHIP_NAMES[id] || ('GEMİ ' + id);
  }
  const ENEMY_TYPES = ['mine', 'boat', 'skim', 'hunter', 'turret', 'ice', 'wasp', 'sub', 'crystal', 'shard', 'mortar'];
  const BOSS_KINDS = 10, SHIPS = 6, PILOTS = 6;

  // ------------------------------------------------------------ durum
  function freshStats() {
    return {
      kills: 0, killT: {}, bosses: 0, bossK: {}, bossFast: 0, flee: 0,
      coins: 0, bestRunCoins: 0, powers: 0, fuel: 0, nukes: 0, blasts: 0, orbs: 0,
      stages: 0, perfect: 0, deaths: 0, deathS1: 0, runs: 0, bestStage: 0, bestScore: 0, playTime: 0, wins: 0,
      ships: [], pilots: [], level: 1, maxCombo: 0, night: 0, frugal: 0,
      run: { coins: 0, stages: 0, blasts: 0, nukes: 0 }
    };
  }
  function fresh() { return { v: 1, st: freshStats(), ach: {}, q: null, stg: {} }; }
  function load() {
    let d = null;
    try { const raw = ui && ui.store ? ui.store(KEY) : null; if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = fresh();
    const f = fresh();
    if (!d.st || typeof d.st !== 'object') d.st = f.st;
    for (const k in f.st) if (d.st[k] === undefined || d.st[k] === null) d.st[k] = f.st[k];
    if (!Array.isArray(d.st.ships)) d.st.ships = [];
    if (!Array.isArray(d.st.pilots)) d.st.pilots = [];
    if (!d.st.run || typeof d.st.run !== 'object') d.st.run = f.st.run;
    if (!d.ach || typeof d.ach !== 'object') d.ach = {};
    if (!d.stg || typeof d.stg !== 'object') d.stg = {};
    if (d.q && (typeof d.q !== 'object' || !Array.isArray(d.q.list))) d.q = null;
    S = d;
  }
  function save(force) {
    dirty = true;
    const now = Date.now();
    if (!force && now - lastSave < 1000) {
      if (!saveTimer && typeof setTimeout === 'function') saveTimer = setTimeout(function () { saveTimer = null; flush(); }, 1000 - (now - lastSave) + 5);
      return;
    }
    flush();
  }
  function flush() {
    if (!dirty || !S) return;
    try { if (ui && ui.store) ui.store(KEY, JSON.stringify(S)); } catch (e) { /* gizli sekme vb. */ }
    dirty = false; lastSave = Date.now();
  }
  try { if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', flush); } catch (e) { /* yut */ }

  // ------------------------------------------------------------ günlük görev şablonları
  // tiers: [hedef, ödül]; ev: olay adı; f: olay filtresi; inc: artış miktarı
  const QT = [
    { id: 'kill', cat: 'fight', title: 'DÜŞMAN AVI', desc: (g) => g + ' düşman vur', tiers: [[40, 40], [80, 70], [150, 110]], ev: 'kill' },
    { id: 'coin', cat: 'coin', title: 'ALTIN AVCISI', desc: (g) => g + ' altın topla', tiers: [[150, 40], [400, 75], [800, 120]], ev: 'coin', inc: (d) => Math.max(1, d.v | 0) },
    { id: 'boss', cat: 'boss', title: 'BEKÇİ AVI', desc: () => 'Bir bekçi yen', tiers: [[1, 80]], ev: 'boss' },
    { id: 'stage', cat: 'stage', title: 'YOL AL', desc: (g) => g + ' etap geç', tiers: [[5, 40], [10, 70], [20, 110]], ev: 'stage' },
    { id: 'perfect', cat: 'perfect', title: 'HASARSIZ', desc: () => 'Hasar almadan bir etap bitir', tiers: [[1, 70]], ev: 'perfectStage' },
    { id: 'blast', cat: 'blast', title: 'YAYLIM ATEŞİ', desc: (g) => g + ' yaylım kullan', tiers: [[8, 40], [20, 75]], ev: 'blast' },
    { id: 'orb', cat: 'orb', title: 'MERMİ KALKANI', desc: (g) => g + ' düşman mermisi vur', tiers: [[20, 45], [60, 90]], ev: 'orbShot' },
    { id: 'ship', cat: 'ship', title: null, desc: (g, p) => shipName(p) + ' gemisiyle ' + g + ' etap geç', tiers: [[3, 80]], ev: 'stage', param: 'ship' },
    { id: 'nuke', cat: 'nuke', title: 'NÜKLEER KIŞ', desc: (g) => g + ' nükleer kullan', tiers: [[2, 60]], ev: 'nuke' },
    { id: 'crystal', cat: 'crystal', title: 'KRİSTAL KIRICI', desc: (g) => g + ' kristal parçala', tiers: [[5, 60], [12, 100]], ev: 'kill', f: (d) => d.type === 'crystal' },
    { id: 'long', cat: 'time', title: 'UZUN UÇUŞ', desc: () => '5 dakikadan uzun bir oyun oyna', tiers: [[1, 70]], ev: 'run', f: (d) => (d.time || 0) >= 300 },
    { id: 'combo', cat: 'combo', title: 'ZİNCİR', desc: () => '10 kombo yap', tiers: [[1, 60]], ev: 'combo', f: (d) => (d.n || 0) >= 10 },
    { id: 'fuel', cat: 'fuel', title: 'YAKIT İSTASYONU', desc: (g) => g + ' yakıt istasyonu kullan', tiers: [[3, 50]], ev: 'power', f: (d) => d.k === 'fu' },
    { id: 'mine', cat: 'fight', title: 'MAYIN TARLASI', desc: (g) => g + ' mayın patlat', tiers: [[15, 40], [40, 80]], ev: 'kill', f: (d) => d.type === 'mine' },
    { id: 'pw', cat: 'collect', title: 'GÜÇ TOPLAYICI', desc: (g) => g + ' güçlendirme topla', tiers: [[10, 45], [25, 90]], ev: 'power' },
    { id: 'hunter', cat: 'fight', title: 'AVCI AVI', desc: (g) => g + ' avcı düşür', tiers: [[8, 50], [20, 95]], ev: 'kill', f: (d) => d.type === 'hunter' }
  ];
  const QT_BY = {}; for (let i = 0; i < QT.length; i++) QT_BY[QT[i].id] = QT[i];

  function rollDay(day) {
    const r = rng(strHash('bg:' + day));
    const pool = QT.slice(), list = [];
    while (list.length < 3 && pool.length) {
      const t = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const tier = Math.floor(r() * t.tiers.length);
      const q = { t: t.id, tier: tier, p: null };
      if (t.param === 'ship') q.p = Math.floor(r() * SHIPS);
      list.push(q);
    }
    return { day: day, list: list, prog: {}, done: {}, ship: -1, shipRun: 0 };
  }
  function ensureDay() {
    const day = dayKey(META._now());
    if (!S.q || S.q.day !== day) { S.q = rollDay(day); save(true); }
  }
  const qKey = (q) => q.t + ':' + q.tier + (q.p === null ? '' : ':' + q.p);
  function questView(q) {
    const t = QT_BY[q.t]; if (!t) return null;
    const tier = t.tiers[clamp(q.tier, 0, t.tiers.length - 1)], k = qKey(q), goal = tier[0];
    return { id: k, cat: t.cat, title: t.title || (shipName(q.p) + ' GEMİSİ'), desc: t.desc(goal, q.p), prog: Math.min(goal, S.q.prog[k] | 0), goal: goal, done: !!S.q.done[k], reward: tier[1] };
  }
  function questEvent(evt, d, out) {
    for (let i = 0; i < S.q.list.length; i++) {
      const q = S.q.list[i], t = QT_BY[q.t]; if (!t) continue;
      const k = qKey(q); if (S.q.done[k]) continue;
      if (t.ev !== evt) continue;
      if (t.f && !t.f(d)) continue;
      if (t.param === 'ship') {              // gemi bilgisi 'stage' olayında gelmezse oyun sonunda ('run') telafi edilir
        if (d.ship === undefined) continue;
        if ((d.ship | 0) !== q.p) continue;
      }
      const inc = t.inc ? t.inc(d) : 1, goal = t.tiers[clamp(q.tier, 0, t.tiers.length - 1)][0];
      S.q.prog[k] = Math.min(goal, (S.q.prog[k] | 0) + inc);
      if (S.q.prog[k] >= goal) { S.q.done[k] = true; const v = questView(q); out.push({ kind: 'quest', title: v.title, sub: 'Görev tamamlandı · ' + v.desc, reward: v.reward }); }
    }
  }
  function questShipCredit(ship, n, out) {       // oyun sonu: bu turda geçilen etapları gemi görevine yaz
    for (let i = 0; i < S.q.list.length; i++) {
      const q = S.q.list[i]; if (q.t !== 'ship' || q.p !== (ship | 0)) continue;
      const k = qKey(q); if (S.q.done[k]) continue;
      const goal = QT_BY.ship.tiers[0][0];
      S.q.prog[k] = Math.min(goal, (S.q.prog[k] | 0) + n);
      if (S.q.prog[k] >= goal) { S.q.done[k] = true; const v = questView(q); out.push({ kind: 'quest', title: v.title, sub: 'Görev tamamlandı · ' + v.desc, reward: v.reward }); }
    }
  }

  // ------------------------------------------------------------ madalyalar
  const CATS = [['first', 'İLK ADIMLAR'], ['fight', 'SAVAŞ'], ['boss', 'BEKÇİLER'], ['coin', 'ZENGİNLİK'], ['collect', 'KOLEKSİYON'], ['master', 'USTALIK'], ['secret', 'GİZLİ']];
  const nKeys = (o) => { let n = 0; for (const k in o) if (o[k]) n++; return n; };
  const ACH = [
    // ilk adımlar
    { id: 'a_kill1', cat: 'first', icon: 'fight', title: 'İLK KIVILCIM', desc: 'İlk düşmanı vur', goal: 1, reward: 25, p: (s) => s.kills },
    { id: 'a_stage1', cat: 'first', icon: 'stage', title: 'İLK ETAP', desc: 'Bir etap geç', goal: 1, reward: 25, p: (s) => s.stages },
    { id: 'a_boss1', cat: 'first', icon: 'boss', title: 'İLK BEKÇİ', desc: 'Bir bekçi yen', goal: 1, reward: 50, p: (s) => s.bosses },
    // savaş
    { id: 'a_kill100', cat: 'fight', icon: 'fight', title: 'AVCI I', desc: '100 düşman vur', goal: 100, reward: 50, p: (s) => s.kills },
    { id: 'a_kill1k', cat: 'fight', icon: 'fight', title: 'AVCI II', desc: '1.000 düşman vur', goal: 1000, reward: 150, p: (s) => s.kills },
    { id: 'a_kill10k', cat: 'fight', icon: 'fight', title: 'AVCI III', desc: '10.000 düşman vur', goal: 10000, reward: 400, p: (s) => s.kills },
    { id: 'a_orb50', cat: 'fight', icon: 'orb', title: 'MERMİ AVCISI', desc: '50 düşman mermisi vur', goal: 50, reward: 50, p: (s) => s.orbs },
    { id: 'a_blast25', cat: 'fight', icon: 'blast', title: 'YAYLIMCI', desc: '25 yaylım kullan', goal: 25, reward: 50, p: (s) => s.blasts },
    { id: 'a_blast250', cat: 'fight', icon: 'blast', title: 'YAYLIM USTASI', desc: '250 yaylım kullan', goal: 250, reward: 150, p: (s) => s.blasts },
    { id: 'a_nuke10', cat: 'fight', icon: 'nuke', title: 'NÜKLEER ÇAĞ', desc: '10 nükleer kullan', goal: 10, reward: 50, p: (s) => s.nukes },
    { id: 'a_combo20', cat: 'fight', icon: 'combo', title: 'ZİNCİR USTASI', desc: '20 kombo yap', goal: 20, reward: 75, p: (s) => s.maxCombo },
    { id: 'a_types', cat: 'fight', icon: 'crystal', title: 'TÜR BİLİMCİ', desc: 'Her düşman türünden en az birini vur', goal: ENEMY_TYPES.length, reward: 100, p: (s) => { let n = 0; for (let i = 0; i < ENEMY_TYPES.length; i++) if (s.killT[ENEMY_TYPES[i]]) n++; return n; } },
    // bekçiler
    { id: 'a_boss10', cat: 'boss', icon: 'boss', title: 'BEKÇİ KATİLİ', desc: '10 bekçi yen', goal: 10, reward: 100, p: (s) => s.bosses },
    { id: 'a_boss50', cat: 'boss', icon: 'boss', title: 'BEKÇİLERİN KÂBUSU', desc: '50 bekçi yen', goal: 50, reward: 300, p: (s) => s.bosses },
    { id: 'a_bossAll', cat: 'boss', icon: 'boss', title: 'BEKÇİ ALBÜMÜ', desc: '10 farklı bekçiyi yen', goal: BOSS_KINDS, reward: 300, p: (s) => nKeys(s.bossK) },
    { id: 'a_bossFast', cat: 'boss', icon: 'combo', title: 'ŞİMŞEK ÇAKTI', desc: 'Bir bekçiyi 20 saniyede yen', goal: 1, reward: 150, p: (s) => s.bossFast },
    // zenginlik
    { id: 'a_coin1k', cat: 'coin', icon: 'coin', title: 'HAZİNE I', desc: 'Toplam 1.000 altın topla', goal: 1000, reward: 50, p: (s) => s.coins },
    { id: 'a_coin10k', cat: 'coin', icon: 'coin', title: 'HAZİNE II', desc: 'Toplam 10.000 altın topla', goal: 10000, reward: 150, p: (s) => s.coins },
    { id: 'a_coin50k', cat: 'coin', icon: 'coin', title: 'HAZİNE III', desc: 'Toplam 50.000 altın topla', goal: 50000, reward: 400, p: (s) => s.coins },
    { id: 'a_run500', cat: 'coin', icon: 'coin', title: 'TEK SEFERDE', desc: 'Bir oyunda 500 altın topla', goal: 500, reward: 100, p: (s) => s.bestRunCoins },
    // koleksiyon
    { id: 'a_ship1', cat: 'collect', icon: 'ship', title: 'YENİ GEMİ', desc: 'Bir gemi satın al', goal: 1, reward: 50, p: (s) => s.ships.length },
    { id: 'a_shipAll', cat: 'collect', icon: 'ship', title: 'FİLO', desc: 'Tüm gemileri satın al', goal: SHIPS - 1, reward: 300, p: (s) => s.ships.length },
    { id: 'a_pilot1', cat: 'collect', icon: 'pilot', title: 'YENİ PİLOT', desc: 'Bir pilot satın al', goal: 1, reward: 50, p: (s) => s.pilots.length },
    { id: 'a_pilotAll', cat: 'collect', icon: 'pilot', title: 'MÜRETTEBAT', desc: 'Tüm pilotları satın al', goal: PILOTS - 1, reward: 300, p: (s) => s.pilots.length },
    { id: 'a_lv10', cat: 'collect', icon: 'pilot', title: 'EFSANE PİLOT', desc: 'Pilot seviyesi 10', goal: 10, reward: 400, p: (s) => s.level },
    // ustalık
    { id: 'a_st10', cat: 'master', icon: 'stage', title: 'KÂŞİF', desc: '10. etaba ulaş', goal: 10, reward: 50, p: (s) => s.bestStage },
    { id: 'a_st25', cat: 'master', icon: 'stage', title: 'YOLCU', desc: '25. etaba ulaş', goal: 25, reward: 100, p: (s) => s.bestStage },
    { id: 'a_st50', cat: 'master', icon: 'stage', title: 'DERİN BUZ', desc: '50. etaba ulaş', goal: 50, reward: 200, p: (s) => s.bestStage },
    { id: 'a_win', cat: 'master', icon: 'star', title: 'GEÇİT AÇILDI', desc: '100. etabı geç, oyunu bitir', goal: 1, reward: 500, p: (s) => s.wins },
    { id: 'a_perf10', cat: 'master', icon: 'perfect', title: 'KUSURSUZ', desc: '10 etabı hasarsız bitir', goal: 10, reward: 100, p: (s) => s.perfect },
    { id: 'a_perf50', cat: 'master', icon: 'perfect', title: 'DOKUNULMAZ', desc: '50 etabı hasarsız bitir', goal: 50, reward: 300, p: (s) => s.perfect },
    { id: 'a_star30', cat: 'master', icon: 'star', title: 'YILDIZ TOPLAYICISI', desc: '30 yıldız kazan', goal: 30, reward: 100, p: () => totalStars() },
    { id: 'a_star300', cat: 'master', icon: 'star', title: 'TÜM GÖKYÜZÜ', desc: '300 yıldız kazan', goal: 300, reward: 500, p: () => totalStars() },
    { id: 'a_time1h', cat: 'master', icon: 'time', title: 'KUTUP SAATİ', desc: 'Toplam 1 saat uç', goal: 3600, reward: 100, p: (s) => Math.floor(s.playTime), fmt: (v) => Math.floor(v / 60) + 'd' },
    // gizli
    { id: 'a_early', cat: 'secret', icon: 'secret', secret: true, title: 'ERKEN VEDA', desc: '1. etapta düş', goal: 1, reward: 25, p: (s) => s.deathS1 },
    { id: 'a_flee', cat: 'secret', icon: 'secret', secret: true, title: 'KAÇIRDIN', desc: '3 bekçinin kaçmasına izin ver', goal: 3, reward: 50, p: (s) => s.flee },
    { id: 'a_night', cat: 'secret', icon: 'secret', secret: true, title: 'GECE KUŞU', desc: 'Gece 00:00–05:00 arasında bir oyun bitir', goal: 1, reward: 75, p: (s) => s.night },
    { id: 'a_frugal', cat: 'secret', icon: 'secret', secret: true, title: 'TUTUMLU', desc: 'Yaylım ve nükleer kullanmadan 5. etaba ulaş', goal: 1, reward: 100, p: (s) => s.frugal },
    { id: 'a_die100', cat: 'secret', icon: 'secret', secret: true, title: 'YILMAYAN', desc: '100 kez düş ve yine de uç', goal: 100, reward: 100, p: (s) => s.deaths }
  ];
  function achView(a) {
    const done = !!S.ach[a.id];
    let p = 0; try { p = a.p(S.st) | 0; } catch (e) { p = 0; }
    const v = { id: a.id, cat: a.cat, icon: a.icon, title: a.title, desc: a.desc, prog: done ? a.goal : Math.min(a.goal, p), goal: a.goal, done: done, reward: a.reward };
    if (a.fmt) v.fmt = a.fmt;
    if (a.secret) v.secret = true;
    return v;
  }
  function checkAch(out) {
    for (let i = 0; i < ACH.length; i++) {
      const a = ACH[i]; if (S.ach[a.id]) continue;
      let p = 0; try { p = a.p(S.st); } catch (e) { p = 0; }
      if (p >= a.goal) { S.ach[a.id] = true; out.push({ kind: 'ach', title: a.title, sub: 'Madalya · ' + a.desc, reward: a.reward }); }
    }
  }
  function totalStars() { let n = 0; for (const k in S.stg) n += S.stg[k].stars | 0; return n; }

  // ------------------------------------------------------------ olaylar
  function handle(evt, d) {
    const st = S.st, out = [];
    d = d || {};
    switch (evt) {
      case 'kill':
        st.kills++; st.killT[d.type || '?'] = (st.killT[d.type || '?'] | 0) + 1; break;
      case 'boss':
        st.bosses++; st.bossK[d.kind | 0] = true; if ((d.time || 1e9) <= 20) st.bossFast++; break;
      case 'bossFlee': st.flee++; break;
      case 'coin': { const v = Math.max(0, d.v | 0) || 1; st.coins += v; st.run.coins += v; if (st.run.coins > st.bestRunCoins) st.bestRunCoins = st.run.coins; break; }
      case 'power': st.powers++; if (d.k === 'fu') st.fuel++; break;
      case 'nuke': st.nukes++; st.run.nukes++; break;
      case 'blast': st.blasts++; st.run.blasts++; break;
      case 'orbShot': st.orbs++; break;
      case 'stage': {
        st.stages++; st.run.stages++;
        const k = d.k | 0; if (k > st.bestStage) st.bestStage = k;
        if (k >= 5 && st.run.blasts === 0 && st.run.nukes === 0 && !st.run.frugalDone) { st.frugal++; st.run.frugalDone = true; }
        if (d.stars) setStage(k, { stars: d.stars, time: d.time, score: d.score });
        if (d.ship !== undefined) { S.q.ship = d.ship | 0; S.q.shipRun = 0; } else S.q.shipRun++;
        break;
      }
      case 'perfectStage': st.perfect++; break;
      case 'death': st.deaths++; if ((d.stage | 0) <= 1) st.deathS1++; break;
      case 'run': {
        st.runs++; if ((d.score | 0) > st.bestScore) st.bestScore = d.score | 0;
        st.playTime += Math.max(0, +d.time || 0);
        const h = META._now().getHours(); if (h >= 0 && h < 5) st.night++;
        if (d.ship !== undefined && S.q.shipRun > 0) questShipCredit(d.ship, S.q.shipRun, out);
        if ((d.stage | 0) > st.bestStage) st.bestStage = d.stage | 0;
        break;
      }
      case 'win': st.wins++; if ((d.score | 0) > st.bestScore) st.bestScore = d.score | 0; break;
      case 'buy': {
        const arr = d.kind === 'pilot' ? st.pilots : st.ships, id = d.id | 0;
        if (arr.indexOf(id) < 0) arr.push(id); break;
      }
      case 'level': if ((d.lv | 0) > st.level) st.level = d.lv | 0; break;
      case 'combo': if ((d.n | 0) > st.maxCombo) st.maxCombo = d.n | 0; break;
      default: break;
    }
    questEvent(evt, d, out);
    checkAch(out);
    if (evt === 'run' || evt === 'win') { st.run = { coins: 0, stages: 0, blasts: 0, nukes: 0 }; S.q.shipRun = 0; }
    save(out.length > 0);
    return out;
  }
  function setStage(k, r) {
    k = k | 0; r = r || {};
    const cur = S.stg[k] || { stars: 0, time: 0, score: 0 };
    const stars = clamp(r.stars | 0, 0, 3);
    S.stg[k] = {
      stars: Math.max(cur.stars | 0, stars),
      time: cur.time > 0 && r.time > 0 ? Math.min(cur.time, +r.time) : (+r.time || cur.time || 0),
      score: Math.max(cur.score | 0, r.score | 0)
    };
  }

  // ------------------------------------------------------------ çizim
  const TAB = [{ x: 40, y: 70, w: 132, h: 34 }, { x: 188, y: 70, w: 132, h: 34 }];
  const CLOSE = { x: 110, y: 596, w: 140, h: 36 };
  const LIST_Y = 120, LIST_H = 460, ROW_H = 56, ROW_GAP = 6, HEAD_H = 26, RX = 16, RW = 328;
  function countdown() {
    const now = META._now(), next = new Date(now.getTime());
    next.setHours(24, 0, 0, 0);
    let s = Math.max(0, Math.floor((next - now) / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60);
    return h + 's ' + m + 'd';
  }
  function layout(tab) {           // [{type:'head'|'row'|'note', h, item}]
    const L = [];
    if (tab === 0) {
      L.push({ type: 'note', h: 24 });
      for (let i = 0; i < S.q.list.length; i++) { const v = questView(S.q.list[i]); if (v) L.push({ type: 'row', h: ROW_H + ROW_GAP, item: v }); }
    } else {
      for (let c = 0; c < CATS.length; c++) {
        let first = true;
        for (let i = 0; i < ACH.length; i++) {
          if (ACH[i].cat !== CATS[c][0]) continue;
          if (first) { L.push({ type: 'head', h: HEAD_H, title: CATS[c][1] }); first = false; }
          L.push({ type: 'row', h: ROW_H + ROW_GAP, item: achView(ACH[i]) });
        }
      }
    }
    return L;
  }
  function icon(ctx, kind, cx, cy, done) {
    const c = done ? '#7dffb0' : '#ffe9b8';
    ctx.save(); ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (kind) {
      case 'fight':          // nişangâh
        ctx.arc(cx, cy, 6, 0, 6.3); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 9, cy);
        ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 9); ctx.stroke(); break;
      case 'coin':           // altın
        ctx.arc(cx, cy, 7, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 6.3); ctx.stroke(); break;
      case 'boss':           // taç
        ctx.moveTo(cx - 8, cy + 6); ctx.lineTo(cx - 8, cy - 4); ctx.lineTo(cx - 4, cy); ctx.lineTo(cx, cy - 7); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx + 8, cy - 4); ctx.lineTo(cx + 8, cy + 6); ctx.closePath(); ctx.stroke(); break;
      case 'stage':          // bayrak
        ctx.moveTo(cx - 6, cy + 9); ctx.lineTo(cx - 6, cy - 9); ctx.lineTo(cx + 8, cy - 5); ctx.lineTo(cx - 6, cy - 1); ctx.stroke(); break;
      case 'perfect':        // kalkan
        ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 8, cy - 5); ctx.lineTo(cx + 6, cy + 4); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 6, cy + 4); ctx.lineTo(cx - 8, cy - 5); ctx.closePath(); ctx.stroke(); break;
      case 'blast':          // yelpaze
        for (let i = -2; i <= 2; i++) { const a = -Math.PI / 2 + i * 0.42; ctx.moveTo(cx, cy + 6); ctx.lineTo(cx + Math.cos(a) * 12, cy + 6 + Math.sin(a) * 12); }
        ctx.stroke(); break;
      case 'orb':            // mermi + çarpı
        ctx.arc(cx, cy, 5, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 9, cy - 9); ctx.lineTo(cx + 9, cy + 9); ctx.moveTo(cx + 9, cy - 9); ctx.lineTo(cx - 9, cy + 9); ctx.stroke(); break;
      case 'ship':           // gemi
        ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 7, cy + 7); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 7, cy + 7); ctx.closePath(); ctx.fill(); break;
      case 'nuke':           // radyasyon
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.094; ctx.moveTo(cx, cy); ctx.arc(cx, cy, 9, a - 0.5, a + 0.5); ctx.closePath(); }
        ctx.fill(); break;
      case 'crystal':        // elmas
        ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 7, cy - 2); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 7, cy - 2); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 7, cy - 2); ctx.lineTo(cx + 7, cy - 2); ctx.stroke(); break;
      case 'time':           // saat
        ctx.arc(cx, cy, 8, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy); ctx.lineTo(cx + 4, cy + 2); ctx.stroke(); break;
      case 'combo':          // şimşek
        ctx.moveTo(cx + 2, cy - 10); ctx.lineTo(cx - 5, cy + 1); ctx.lineTo(cx, cy + 1); ctx.lineTo(cx - 2, cy + 10); ctx.lineTo(cx + 5, cy - 1); ctx.lineTo(cx, cy - 1); ctx.closePath(); ctx.fill(); break;
      case 'fuel':           // damla
        ctx.moveTo(cx, cy - 9); ctx.bezierCurveTo(cx + 9, cy + 1, cx + 6, cy + 9, cx, cy + 9); ctx.bezierCurveTo(cx - 6, cy + 9, cx - 9, cy + 1, cx, cy - 9); ctx.fill(); break;
      case 'collect':        // kutu
        ctx.rect(cx - 7, cy - 5, 14, 12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 7, cy - 1); ctx.lineTo(cx + 7, cy - 1); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 7); ctx.stroke(); break;
      case 'pilot':          // kask
        ctx.arc(cx, cy - 1, 8, Math.PI, 0); ctx.lineTo(cx + 8, cy + 5); ctx.lineTo(cx - 8, cy + 5); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 5, cy + 1); ctx.lineTo(cx + 5, cy + 1); ctx.stroke(); break;
      case 'star':           // yıldız
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 9, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); break;
      case 'secret':         // soru işareti
      default:
        ctx.arc(cx, cy - 3, 5, Math.PI * 1.1, Math.PI * 2.3); ctx.lineTo(cx, cy + 3); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy + 8, 1.4, 0, 6.3); ctx.fill(); break;
    }
    ctx.restore();
  }
  function row(ctx, u, v, x, y, t) {
    const done = v.done, hidden = v.secret && !done, cy = y + ROW_H / 2;
    ctx.fillStyle = done ? 'rgba(14,44,36,0.78)' : 'rgba(18,36,56,0.92)';
    ctx.beginPath(); ctx.roundRect(x, y, RW, ROW_H, 10); ctx.fill();
    ctx.strokeStyle = done ? 'rgba(125,255,176,0.45)' : 'rgba(190,215,240,0.22)'; ctx.lineWidth = 1.2; ctx.stroke();
    // simge dairesi
    ctx.fillStyle = done ? 'rgba(125,255,176,0.14)' : 'rgba(255,217,90,0.1)';
    ctx.beginPath(); ctx.arc(x + 28, cy, 18, 0, 6.3); ctx.fill();
    ctx.strokeStyle = done ? 'rgba(125,255,176,0.6)' : 'rgba(255,233,184,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    if (done) {           // yeşil onay
      ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x + 20, cy); ctx.lineTo(x + 26, cy + 6); ctx.lineTo(x + 37, cy - 7); ctx.stroke(); ctx.lineCap = 'butt';
    } else icon(ctx, hidden ? 'secret' : (v.icon || v.cat), x + 28, cy, false);
    const tc = done ? 'rgba(225,238,250,0.6)' : '#ffffff', dc = done ? 'rgba(225,238,250,0.4)' : 'rgba(225,238,250,0.72)';
    u.text(hidden ? '???' : v.title, x + 56, y + 20, 14.5, tc, 'left', 700);
    u.text(hidden ? 'Gizli madalya' : v.desc, x + 56, y + 34, 11, dc, 'left', 500);
    // ilerleme çubuğu
    if (!hidden) {
      const bw = 120, bx = x + 56, by = y + 42, f = v.goal > 0 ? clamp(v.prog / v.goal, 0, 1) : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = done ? '#7dffb0' : '#ffd95a'; ctx.fillRect(bx, by, bw * f, 4);
      const pl = v.fmt ? v.fmt(v.prog) + '/' + v.fmt(v.goal) : v.prog + '/' + v.goal;
      u.text(pl, bx + bw + 8, by + 5, 10.5, done ? 'rgba(125,255,176,0.8)' : 'rgba(225,238,250,0.7)', 'left', 700);
    }
    // ödül
    const rx = x + RW - 14;
    ctx.save(); if (done) ctx.globalAlpha = 0.55;
    u.coinIcon(rx - 34, y + 27, 5, 1);
    u.text(String(v.reward), rx - 26, y + 32, 14, done ? '#7dffb0' : '#ffd95a', 'left', 700);
    ctx.restore();
    if (done) u.text('ALINDI', rx, y + 47, 9.5, 'rgba(125,255,176,0.75)', 'right', 700);
  }
  function drawPanel(ctx, u, t, tab, scroll) {
    tab = tab ? 1 : 0; scroll = +scroll || 0; t = +t || 0;
    const W = u.W || 360;
    u.dim(0.86);
    u.text(tab ? 'MADALYALAR' : 'GÖREVLER', W / 2, 36, 26, '#ffffff', 'center', 700);
    let sub;
    if (tab) { let n = 0; for (let i = 0; i < ACH.length; i++) if (S.ach[ACH[i].id]) n++; sub = n + '/' + ACH.length + ' madalya · ' + totalStars() + ' yıldız'; }
    else { let n = 0; for (let i = 0; i < S.q.list.length; i++) if (S.q.done[qKey(S.q.list[i])]) n++; sub = 'Günlük görevler · ' + n + '/' + S.q.list.length + ' tamamlandı'; }
    u.text(sub, W / 2, 56, 12.5, 'rgba(225,238,250,0.72)', 'center', 500);
    for (let q = 0; q < 2; q++) {
      const b = TAB[q], on = tab === q;
      ctx.fillStyle = on ? '#f26a1b' : 'rgba(8,18,30,0.8)'; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 17); ctx.fill();
      ctx.strokeStyle = on ? 'rgba(255,220,180,0.8)' : 'rgba(190,215,240,0.35)'; ctx.lineWidth = 1.4; ctx.stroke();
      u.text((q ? 'MADALYALAR' : 'GÖREVLER') + (u.IS_TOUCH ? '' : q ? '  ·  E' : '  ·  Q'), b.x + b.w / 2, b.y + 22, 15, on ? '#ffffff' : 'rgba(225,238,250,0.75)', 'center', 700);
    }
    // liste (kaydırılır, kırpılır)
    const L = layout(tab);
    ctx.save(); ctx.beginPath(); ctx.rect(0, LIST_Y, W, LIST_H); ctx.clip();
    let y = LIST_Y + 8 - scroll;
    for (let i = 0; i < L.length; i++) {
      const it = L[i];
      if (y + it.h >= LIST_Y && y <= LIST_Y + LIST_H) {
        if (it.type === 'note') {
          const blink = 0.72 + 0.1 * Math.sin(t * 2);
          u.text('Yenilenmeye kalan: ' + countdown(), W / 2, y + 15, 12.5, 'rgba(255,233,184,' + blink + ')', 'center', 700);
        } else if (it.type === 'head') {
          u.text(it.title, RX, y + 17, 12, 'rgba(255,217,90,0.85)', 'left', 700);
          ctx.fillStyle = 'rgba(255,217,90,0.25)'; ctx.fillRect(RX + 6 + measure(ctx, u, it.title, 12), y + 13, RW - 6 - measure(ctx, u, it.title, 12), 1);
        } else row(ctx, u, it.item, RX, y, t);
      }
      y += it.h;
    }
    ctx.restore();
    // kenar solgunlukları: içerik devam ediyor
    const total = panelHeight(tab);
    if (scroll > 2) fade(ctx, W, LIST_Y, 1);
    if (total - scroll > LIST_H + 2) fade(ctx, W, LIST_Y + LIST_H, -1);
    u.button(CLOSE, 'GERİ' + (u.IS_TOUCH ? '' : ' · ESC'), null, false, true, 0);
  }
  function measure(ctx, u, s, size) { try { ctx.font = '700 ' + size + 'px ' + (u.FONT || 'sans-serif'); return ctx.measureText(s).width; } catch (e) { return s.length * size * 0.5; } }
  function fade(ctx, W, y, dir) {
    const g = ctx.createLinearGradient(0, y, 0, y + dir * 22);
    g.addColorStop(0, 'rgba(4,10,18,0.9)'); g.addColorStop(1, 'rgba(4,10,18,0)');
    ctx.fillStyle = g; ctx.fillRect(0, dir > 0 ? y : y - 22, W, 22);
  }
  function panelHeight(tab) {
    const L = layout(tab ? 1 : 0); let h = 16;
    for (let i = 0; i < L.length; i++) h += L[i].h;
    return h;
  }

  // ------------------------------------------------------------ dışa açık API (hiç fırlatmaz)
  function safe(fn, fallback) {
    return function () {
      try { if (!S) load(); if (!S.q) ensureDay(); return fn.apply(null, arguments); }
      catch (e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('META', e); } catch (_) { /* yut */ } return typeof fallback === 'function' ? fallback() : fallback; }
    };
  }
  META.init = function (u) {
    try { ui = u || {}; load(); ensureDay(); } catch (e) { S = fresh(); try { ensureDay(); } catch (_) { /* yut */ } }
  };
  META.on = safe(function (evt, data) { ensureDay(); return handle(String(evt || ''), data); }, () => []);
  META.quests = safe(function () { ensureDay(); const out = []; for (let i = 0; i < S.q.list.length; i++) { const v = questView(S.q.list[i]); if (v) out.push(v); } return out; }, () => []);
  META.achievements = safe(function () { const out = []; for (let i = 0; i < ACH.length; i++) out.push(achView(ACH[i])); return out; }, () => []);
  META.rateStage = safe(function (st) {
    st = st || {}; let s = 3;
    if ((st.deaths | 0) > 0) s--;
    const slow = st.par > 0 && st.time > st.par * 1.25, miss = (st.shots | 0) > 30 && (st.hits | 0) / st.shots < 0.3;
    if (slow || miss) s--;
    return Math.max(1, s);
  }, 1);
  META.setStageResult = safe(function (k, r) { setStage(k, r); save(false); }, undefined);
  META.stars = safe(function (k) { const r = S.stg[k | 0]; return r ? clamp(r.stars | 0, 0, 3) : 0; }, 0);
  META.totalStars = safe(function () { return totalStars(); }, 0);
  META.stats = safe(function () {
    const s = S.st, o = {};
    for (const k in s) if (k !== 'run') o[k] = Array.isArray(s[k]) ? s[k].slice() : (s[k] && typeof s[k] === 'object') ? Object.assign({}, s[k]) : s[k];
    o.bossKinds = nKeys(s.bossK); o.totalStars = totalStars();
    let n = 0; for (let i = 0; i < ACH.length; i++) if (S.ach[ACH[i].id]) n++;
    o.achievements = n; o.achievementsTotal = ACH.length;
    return o;
  }, () => ({}));
  META.drawPanel = safe(function (ctx, u, t, tab, scroll) { ensureDay(); drawPanel(ctx, u || ui, t, tab, scroll); }, undefined);
  META.hitTest = safe(function (p, tab) {
    if (!p || !ui || !ui.inBtn) return null;
    if (ui.inBtn(p, CLOSE)) return 'close';
    if (ui.inBtn(p, TAB[0])) return 'tab0';
    if (ui.inBtn(p, TAB[1])) return 'tab1';
    return null;
  }, null);
  META.panelHeight = safe(function (tab) { ensureDay(); return panelHeight(tab); }, 0);
  META.flush = safe(function () { flush(); }, undefined);
  META._reset = safe(function () { S = fresh(); ensureDay(); save(true); }, undefined);      // test/geliştirme

  window.META = META;
})();
