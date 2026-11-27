/* Buzul Geçidi — bulut katmanı (window.CLOUD)
   Supabase Auth (Google) + REST ile kayıt senkronu, skor tablosu ve günlük görev tablosu.
   Kütüphane yok, build yok; supabase-js kullanılmaz, GoTrue ve PostgREST uçlarına doğrudan fetch atılır.
   CLOUD.configure() çağrılmadıysa (ya da url boşsa) modül tamamen pasiftir: her metot null/false döner, hiç istek atmaz.

   ============================================================================================
   KURULUM (proje sahibi için, sırayla)
   ============================================================================================
   1) Supabase projesi aç (https://supabase.com → New project). Project Settings → API'den şu ikisini not al:
        - Project URL   : https://<proj>.supabase.co
        - anon public key (JWT; "service_role" anahtarını ASLA tarayıcıya koyma)

   2) Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID
        - Application type: Web application
        - Authorized JavaScript origins:
              https://slmncmgl.github.io
              http://localhost:8790
        - Authorized redirect URIs:
              https://<proj>.supabase.co/auth/v1/callback
        (OAuth consent screen'de uygulama adını "Buzul Geçidi" yap, kapsamlar: email, profile, openid yeterli.)
        → Client ID ve Client Secret'ı kopyala.

   3) Supabase → Authentication → Providers → Google
        - "Enable Sign in with Google" aç
        - Client ID (for OAuth) alanına Google Client ID'yi, Client Secret alanına Secret'ı yapıştır → Save.

   4) Supabase → Authentication → URL Configuration
        - Site URL     : https://slmncmgl.github.io/buzul-gecidi/
        - Redirect URLs: https://slmncmgl.github.io/buzul-gecidi/
                         https://slmncmgl.github.io/buzul-gecidi/**
                         http://localhost:*
        (Giriş sonrası tarayıcı bu adreslere geri döner; listede olmayan adrese dönüş reddedilir.
         Yerel port joker: "http://localhost:*" tüm portları kapsar; alt yol gerekirse sonuna "/" + iki yıldız ekle.)

   5) Supabase → SQL Editor → bu repodaki supabase/schema.sql dosyasını yapıştır → Run.
        (Dosya idempotent; tekrar çalıştırmak zararsız.)

   6) index.html'de, src/cloud.js yüklendikten SONRA ve src/game.js'ten ÖNCE şu satırı ekle:
        <script src="src/cloud.js?v=73"></script>
        <script>CLOUD.configure({ url: 'https://<proj>.supabase.co', anonKey: '<anon public key>' }); CLOUD.init();</script>
      anon key tarayıcıda görünür olmak üzere tasarlanmıştır; veriyi RLS politikaları korur (schema.sql).
      Satırı eklemezsen oyun eskisi gibi tamamen çevrimdışı çalışır.

   7) Yerel test: python3 -m http.server 8790 → http://localhost:8790/ (Google origin listesindeki portla aynı olsun).
   ============================================================================================

   Dışa açılan API (hepsi hatasızdır: istisna fırlatmaz, çevrimdışıyken null/false döner):
     CLOUD.configure({url, anonKey})       CLOUD.enabled()            CLOUD.init()
     CLOUD.signIn()  CLOUD.signOut()        CLOUD.user()               CLOUD.onChange(fn)
     CLOUD.pullSave()  CLOUD.pushSave(obj)  CLOUD.merge(local, cloud)  CLOUD.setName(ad)
     CLOUD.submitScore({score, stage, ship, pilot, won})
     CLOUD.leaderboard('all'|'week', limit) CLOUD.myRank('all'|'week')
     CLOUD.submitDaily({day, score, stage}) CLOUD.dailyBoard(day, limit)
*/
(function () {
  'use strict';

  const W = typeof window !== 'undefined' ? window : globalThis;
  const SESSION_KEY = 'bg_cloud_session';
  const PUSH_DEBOUNCE_MS = 3000;
  const REFRESH_MARGIN_MS = 60 * 1000;          // süresi bitmeden bu kadar önce yenile
  const REQUEST_TIMEOUT_MS = 8000;
  const NAME_MAX = 20;

  const cfg = { url: '', anonKey: '' };
  let session = null;                           // { access_token, refresh_token, expires_at, user:{id,name,email,avatar} }
  let listeners = [];
  let refreshTimer = null;
  let initDone = false;
  let pushState = null;                         // { data, timer, waiters[] }

  // ------------------------------------------------------------ yardımcılar
  function dbg(msg) { try { if (W.console && W.console.debug) W.console.debug('[CLOUD] ' + msg); } catch (e) { /* yut */ } }
  function enabled() { return !!(cfg.url && cfg.anonKey); }
  function online() { try { return !(W.navigator && W.navigator.onLine === false); } catch (e) { return true; } }
  function lsGet(k) { try { return W.localStorage ? W.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (W.localStorage) { if (v === null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } } catch (e) { /* gizli sekme */ } }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function toInt(v, d) { const n = parseInt(v, 10); return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function clampInt(v, a, b) { const n = toInt(v, a); return n < a ? a : n > b ? b : n; }
  function copy(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }

  /* Dış kabuk: her public metot buradan geçer; hata → console.debug, dönüş fallback. */
  function safe(fn, fallback) {
    return function () {
      try {
        const r = fn.apply(null, arguments);
        if (r && typeof r.then === 'function') return r.catch(function (e) { dbg('hata: ' + (e && e.name || 'bilinmiyor')); return fallback; });
        return r;
      } catch (e) { dbg('hata: ' + (e && e.name || 'bilinmiyor')); return fallback; }
    };
  }

  function sanitizeName(s) {
    s = String(s === undefined || s === null ? '' : s);
    s = s.replace(/[\u0000-\u001F\u007F<>"'`\\]/g, '').replace(/\s+/g, ' ').trim();
    if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX).trim();
    return s;
  }

  function decodeJwt(tok) {
    try {
      const p = String(tok).split('.')[1];
      let b = p.replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      let bin;
      if (typeof W.atob === 'function') bin = W.atob(b);
      else if (typeof Buffer !== 'undefined') bin = Buffer.from(b, 'base64').toString('binary');
      else return null;
      let s = '';
      for (let i = 0; i < bin.length; i++) s += '%' + ('00' + bin.charCodeAt(i).toString(16)).slice(-2);
      return JSON.parse(decodeURIComponent(s));
    } catch (e) { return null; }
  }

  /* JWT ya da /auth/v1/user yanıtından kullanıcı özeti. İsim: Google ad (ilk kelime) ya da e-posta ön eki. */
  function userFrom(claims) {
    if (!claims) return null;
    const id = claims.sub || claims.id;
    if (!id) return null;
    const md = claims.user_metadata || {};
    const email = claims.email || md.email || '';
    let name = md.given_name || '';
    if (!name) { const full = md.full_name || md.name || ''; name = String(full).trim().split(/\s+/)[0] || ''; }
    if (!name && email) name = String(email).split('@')[0];
    name = sanitizeName(name) || 'Pilot';
    return { id: id, name: name, email: email, avatar: md.avatar_url || md.picture || '' };
  }

  // ------------------------------------------------------------ oturum
  function saveSession() { lsSet(SESSION_KEY, session ? JSON.stringify(session) : null); }
  function loadSession() {
    try {
      const raw = lsGet(SESSION_KEY); if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.access_token || !s.user || !s.user.id) return null;
      return s;
    } catch (e) { return null; }
  }
  function clearSession() {
    session = null; saveSession();
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  }
  function emit() {
    const u = user();
    for (let i = 0; i < listeners.length; i++) { try { listeners[i](u); } catch (e) { dbg('onChange dinleyici hatası'); } }
  }
  function user() {
    if (!enabled() || !session || !session.user) return null;
    return { id: session.user.id, name: session.user.name, email: session.user.email, avatar: session.user.avatar };
  }

  function setSessionFromTokens(t) {
    const claims = decodeJwt(t.access_token);
    const u = userFrom(claims);
    if (!u) return false;
    const expiresIn = toInt(t.expires_in, 3600);
    let expiresAt = Date.now() + expiresIn * 1000;
    if (claims && isNum(claims.exp)) expiresAt = Math.min(expiresAt, claims.exp * 1000);
    const prevName = session && session.user && session.user.id === u.id && session.user.custom ? session.user.name : null;
    if (prevName) { u.name = prevName; u.custom = true; }
    session = { access_token: t.access_token, refresh_token: t.refresh_token || (session && session.refresh_token) || '', expires_at: expiresAt, user: u };
    saveSession();
    scheduleRefresh();
    return true;
  }

  function scheduleRefresh() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (!session || !session.refresh_token) return;
    let wait = session.expires_at - Date.now() - REFRESH_MARGIN_MS;
    if (wait < 5000) wait = 5000;
    if (wait > 2147000000) wait = 2147000000;
    refreshTimer = setTimeout(function () { refreshTimer = null; refresh(); }, wait);
  }

  function refresh() {
    if (!enabled() || !session || !session.refresh_token) return Promise.resolve(false);
    if (!online()) { refreshTimer = setTimeout(function () { refreshTimer = null; refresh(); }, 30000); return Promise.resolve(false); }
    return authFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
      .then(function (r) {
        if (r.ok && r.json && r.json.access_token) { setSessionFromTokens(r.json); return true; }
        if (r.status === 400 || r.status === 401 || r.status === 403) { dbg('oturum yenilenemedi, çıkış'); clearSession(); emit(); return false; }
        refreshTimer = setTimeout(function () { refreshTimer = null; refresh(); }, 30000);   // ağ hatası: biraz sonra tekrar
        return false;
      });
  }

  /* URL hash'indeki OAuth dönüşünü (implicit flow) işler; işlediyse true. */
  function consumeHash() {
    const loc = W.location; if (!loc || !loc.hash || loc.hash.length < 2) return false;
    const h = loc.hash.charAt(0) === '#' ? loc.hash.slice(1) : loc.hash;
    if (h.indexOf('access_token=') < 0 && h.indexOf('error=') < 0) return false;
    const p = new URLSearchParams(h);
    let ok = false;
    if (p.get('access_token')) {
      ok = setSessionFromTokens({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') || '', expires_in: p.get('expires_in') || 3600 });
    } else dbg('giriş reddedildi: ' + (p.get('error') || '?'));
    try { if (W.history && W.history.replaceState) W.history.replaceState(null, '', loc.pathname + loc.search); } catch (e) { /* yut */ }
    return ok;
  }

  // ------------------------------------------------------------ HTTP
  function headers(extra, useAnonOnly) {
    const h = { 'apikey': cfg.anonKey, 'Authorization': 'Bearer ' + ((!useAnonOnly && session && session.access_token) || cfg.anonKey), 'Content-Type': 'application/json' };
    if (extra) for (const k in extra) h[k] = extra[k];
    return h;
  }
  /* fetch sarmalayıcı: { ok, status, json } döner; ağ hatasında ok:false status:0. */
  function authFetch(path, opt) {
    opt = opt || {};
    if (!enabled()) return Promise.resolve({ ok: false, status: 0, json: null });
    if (!online()) return Promise.resolve({ ok: false, status: 0, json: null, offline: true });
    let ctrl = null, tm = null;
    try { if (typeof AbortController === 'function') { ctrl = new AbortController(); tm = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS); } } catch (e) { ctrl = null; }
    const init = { method: opt.method || 'GET', headers: headers(opt.headers, opt.anon) };
    if (opt.body !== undefined) init.body = typeof opt.body === 'string' ? opt.body : JSON.stringify(opt.body);
    if (ctrl) init.signal = ctrl.signal;
    return Promise.resolve().then(function () { return W.fetch(cfg.url + path, init); })
      .then(function (res) {
        if (tm) clearTimeout(tm);
        return Promise.resolve().then(function () { return res.text(); }).catch(function () { return ''; })
          .then(function (txt) {
            let j = null; if (txt) { try { j = JSON.parse(txt); } catch (e) { j = null; } }
            return { ok: !!res.ok, status: res.status | 0, json: j };
          });
      }, function () { if (tm) clearTimeout(tm); return { ok: false, status: 0, json: null }; });
  }
  function requireUser() { return enabled() && session && session.user && session.user.id ? session.user.id : null; }

  /* /auth/v1/user ile isim/avatar'ı güncelle, profiles'tan kullanıcı adı geçersiz kılmasını oku. */
  function hydrateUser() {
    if (!requireUser()) return Promise.resolve();
    return authFetch('/auth/v1/user').then(function (r) {
      if (r.ok && r.json && r.json.id === session.user.id) {
        const u = userFrom(r.json);
        if (u) { if (session.user.custom) { u.name = session.user.name; u.custom = true; } session.user = u; }
      }
      return authFetch('/rest/v1/profiles?select=display_name&user_id=eq.' + encodeURIComponent(session.user.id));
    }).then(function (r) {
      if (!session) return;
      if (r.ok && Array.isArray(r.json) && r.json.length) {
        const n = sanitizeName(r.json[0].display_name);
        if (n) { session.user.name = n; session.user.custom = true; }
      } else if (r.ok && Array.isArray(r.json) && !r.json.length) {
        // tetikleyici çalışmadıysa profil satırını biz açalım
        return authFetch('/rest/v1/profiles', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: { user_id: session.user.id, display_name: session.user.name } });
      }
    }).then(function () { if (session) saveSession(); });
  }

  // ------------------------------------------------------------ public: yapılandırma ve oturum
  function configure(o) {
    o = o || {};
    cfg.url = String(o.url || '').replace(/\/+$/, '');
    cfg.anonKey = String(o.anonKey || '');
    if (cfg.url && !/^https?:\/\//.test(cfg.url)) { dbg('geçersiz url'); cfg.url = ''; }
  }

  function init() {
    if (!enabled()) { initDone = true; emit(); return Promise.resolve(null); }
    const fromHash = consumeHash();
    if (!fromHash) {
      session = loadSession();
      if (session) scheduleRefresh();
    }
    let p = Promise.resolve();
    if (session && session.expires_at - Date.now() < REFRESH_MARGIN_MS) p = refresh();
    else if (session) p = hydrateUser();
    return p.then(function () { initDone = true; emit(); return user(); });
  }

  function signIn() {
    if (!enabled() || !W.location) return false;
    const back = W.location.origin + W.location.pathname;
    W.location.assign(cfg.url + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(back));
    return true;
  }

  function signOut() {
    if (!enabled()) return Promise.resolve(false);
    const had = !!session;
    const p = had ? authFetch('/auth/v1/logout', { method: 'POST' }) : Promise.resolve({ ok: true });
    return p.then(function () { clearSession(); emit(); return had; });
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    if (initDone) { try { fn(user()); } catch (e) { dbg('onChange dinleyici hatası'); } }
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  function setName(name) {
    const uid = requireUser(); if (!uid) return Promise.resolve(false);
    const n = sanitizeName(name); if (!n) return Promise.resolve(false);
    return authFetch('/rest/v1/profiles', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: { user_id: uid, display_name: n } })
      .then(function (r) {
        if (!r.ok) return false;
        session.user.name = n; session.user.custom = true; saveSession(); emit();
        return true;
      });
  }

  // ------------------------------------------------------------ public: kayıt senkronu
  function pullSave() {
    const uid = requireUser(); if (!uid) return Promise.resolve(null);
    return authFetch('/rest/v1/saves?select=data,updated_at&user_id=eq.' + encodeURIComponent(uid)).then(function (r) {
      if (!r.ok || !Array.isArray(r.json) || !r.json.length) return null;
      const row = r.json[0]; const d = row.data;
      if (!isObj(d)) return null;
      if (!isNum(d.updatedAt) && row.updated_at) { const t = Date.parse(row.updated_at); if (isFinite(t)) d.updatedAt = t; }
      return d;
    });
  }

  function doPush(data) {
    const uid = requireUser(); if (!uid) return Promise.resolve(false);
    const body = { user_id: uid, data: data, updated_at: new Date().toISOString() };
    const send = function () { return authFetch('/rest/v1/saves', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: body }); };
    return send().then(function (r) {
      if (r.ok) return true;
      if (r.offline) return false;
      return send().then(function (r2) { return !!r2.ok; });     // bir kez daha dene
    });
  }

  /* 3 sn içindeki çağrılar tek yazıma indirgenir; her çağrının sözü aynı sonuçla çözülür. */
  function pushSave(saveObject) {
    if (!requireUser() || !isObj(saveObject)) return Promise.resolve(false);
    if (!online()) return Promise.resolve(false);
    const data = copy(saveObject);
    if (!isNum(data.updatedAt)) data.updatedAt = Date.now();
    return new Promise(function (resolve) {
      if (!pushState) pushState = { data: null, timer: null, waiters: [] };
      pushState.data = data; pushState.waiters.push(resolve);
      if (pushState.timer) clearTimeout(pushState.timer);
      pushState.timer = setTimeout(function () {
        const st = pushState; pushState = null;
        doPush(st.data).then(function (ok) { for (let i = 0; i < st.waiters.length; i++) st.waiters[i](ok); },
          function () { for (let i = 0; i < st.waiters.length; i++) st.waiters[i](false); });
      }, PUSH_DEBOUNCE_MS);
    });
  }

  /* Birleştirme politikası (saf fonksiyon):
       sayılar → büyük olan (altın, rekor, en iyi etap, uçuş sn, bossCp, meta sayaçları)
       sahip olunan id dizileri → birleşim
       etap anahtarlı nesneler (stg, ach, killT...) → anahtar başına aynı kurallar (yıldız = max)
       seçimler (sled/av/ship/pilot/set/q/tut/muted/last) → updatedAt'i daha yeni olan taraf; eşitlikte yerel
       updatedAt → Date.now()                                                                    */
  const RECENT_KEYS = { sled: 1, av: 1, ship: 1, pilot: 1, set: 1, q: 1, tut: 1, muted: 1, last: 1, sens: 1, name: 1 };
  function unionArr(a, b) {
    const out = [], seen = {};
    const add = function (v) { const k = (typeof v === 'object' && v !== null) ? 'o:' + JSON.stringify(v) : typeof v + ':' + String(v); if (!seen[k]) { seen[k] = 1; out.push(copy(v)); } };
    for (let i = 0; i < a.length; i++) add(a[i]);
    for (let j = 0; j < b.length; j++) add(b[j]);
    return out;
  }
  function mergeVal(l, c, key, localNewer) {
    if (l === undefined || l === null) return copy(c);
    if (c === undefined || c === null) return copy(l);
    if (RECENT_KEYS[key]) return copy(localNewer ? l : c);
    if (isNum(l) && isNum(c)) return Math.max(l, c);
    if (Array.isArray(l) && Array.isArray(c)) return unionArr(l, c);
    if (isObj(l) && isObj(c)) return mergeObj(l, c, localNewer);
    if (typeof l === 'boolean' && typeof c === 'boolean') return l || c;
    return copy(localNewer ? l : c);
  }
  function mergeObj(l, c, localNewer) {
    const out = {};
    for (const k in l) if (Object.prototype.hasOwnProperty.call(l, k)) out[k] = mergeVal(l[k], c[k], k, localNewer);
    for (const k in c) if (Object.prototype.hasOwnProperty.call(c, k) && !(k in out)) out[k] = copy(c[k]);
    return out;
  }
  function merge(localSave, cloudSave) {
    const l = isObj(localSave) ? localSave : null, c = isObj(cloudSave) ? cloudSave : null;
    let out;
    if (!l && !c) out = {};
    else if (!c) out = copy(l);
    else if (!l) out = copy(c);
    else out = mergeObj(l, c, (toInt(l.updatedAt, 0) >= toInt(c.updatedAt, 0)));
    out.updatedAt = Date.now();
    return out;
  }

  // ------------------------------------------------------------ public: skorlar
  function submitScore(o) {
    const uid = requireUser(); if (!uid || !o) return Promise.resolve(false);
    const score = clampInt(o.score, 0, 2000000000); if (!(score > 0)) return Promise.resolve(false);
    const body = { user_id: uid, score: score, stage: clampInt(o.stage, 0, 9999), ship: clampInt(o.ship, 0, 999), pilot: clampInt(o.pilot, 0, 999), won: !!o.won };
    return authFetch('/rest/v1/scores', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: body }).then(function (r) { return !!r.ok; });
  }

  function rowsToBoard(rows, limit) {
    const me = session && session.user ? session.user.id : null;
    const out = [];
    if (!Array.isArray(rows)) return out;
    for (let i = 0; i < rows.length && out.length < limit; i++) {
      const r = rows[i]; if (!r) continue;
      out.push({ rank: isNum(r.rank) ? r.rank : out.length + 1, name: sanitizeName(r.name || r.display_name) || 'Pilot', score: toInt(r.score, 0), stage: toInt(r.stage, 0), me: !!me && r.user_id === me });
    }
    return out;
  }

  function leaderboard(kind, limit) {
    if (!enabled()) return Promise.resolve([]);
    const view = kind === 'week' ? 'lb_week' : 'lb_all';
    limit = clampInt(limit === undefined ? 50 : limit, 1, 100);
    return authFetch('/rest/v1/' + view + '?select=*&order=score.desc,created_at.asc&limit=' + limit, { anon: !session })
      .then(function (r) { return r.ok ? rowsToBoard(r.json, limit) : []; });
  }

  function myRank(kind) {
    const uid = requireUser(); if (!uid) return Promise.resolve(null);
    kind = kind === 'week' ? 'week' : 'all';
    return leaderboard(kind, 100).then(function (rows) {
      for (let i = 0; i < rows.length; i++) if (rows[i].me) return { rank: rows[i].rank, score: rows[i].score };
      return authFetch('/rest/v1/rpc/my_rank', { method: 'POST', body: { p_kind: kind } }).then(function (r) {
        const j = Array.isArray(r.json) ? r.json[0] : r.json;
        if (!r.ok || !j || !isNum(j.rank) || j.rank < 1) return null;
        return { rank: j.rank, score: toInt(j.score, 0) };
      });
    });
  }

  // ------------------------------------------------------------ public: günlük görev
  function validDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d) : null; }
  function submitDaily(o) {
    const uid = requireUser(); if (!uid || !o) return Promise.resolve(false);
    const day = validDay(o.day); const score = clampInt(o.score, 0, 2000000000);
    if (!day || !(score > 0)) return Promise.resolve(false);
    // tablo tarafındaki tetikleyici küçük skoru ezmez (keep max); upsert güvenli
    return authFetch('/rest/v1/daily_scores', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: { user_id: uid, day: day, score: score, stage: clampInt(o.stage, 0, 9999) } })
      .then(function (r) { return !!r.ok; });
  }
  function dailyBoard(day, limit) {
    if (!enabled()) return Promise.resolve([]);
    day = validDay(day); if (!day) return Promise.resolve([]);
    limit = clampInt(limit === undefined ? 50 : limit, 1, 100);
    return authFetch('/rest/v1/rpc/lb_daily', { method: 'POST', body: { p_day: day, p_limit: limit }, anon: !session })
      .then(function (r) { return r.ok ? rowsToBoard(r.json, limit) : []; });
  }

  // ------------------------------------------------------------ dışa aç
  const CLOUD = {
    configure: safe(configure, undefined),
    enabled: safe(enabled, false),
    init: safe(init, null),
    signIn: safe(signIn, false),
    signOut: safe(signOut, false),
    user: safe(user, null),
    onChange: safe(onChange, function () {}),
    setName: safe(setName, false),
    pullSave: safe(pullSave, null),
    pushSave: safe(pushSave, false),
    merge: safe(merge, {}),
    submitScore: safe(submitScore, false),
    leaderboard: safe(leaderboard, []),
    myRank: safe(myRank, null),
    submitDaily: safe(submitDaily, false),
    dailyBoard: safe(dailyBoard, []),
    _sanitizeName: sanitizeName                 // test için
  };
  W.CLOUD = CLOUD;
})();
