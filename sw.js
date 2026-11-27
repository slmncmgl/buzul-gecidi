/* Buzul Geçidi service worker.
   Yeni sürüm çıkarken sadece SURUM sayısını artır: eski önbellek activate'te silinir. */
const SURUM = 'bg-v2';
const ONBELLEK = SURUM;

// Kurulumda indirilecek dosyalar (hepsi göreli: GitHub Pages alt yolunda da çalışır)
const ON_YUKLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/level.js',
  './src/audio.js',
  './src/cosmetics.js',
  './src/foes.js',
  './src/meta.js',
  './src/map.js',
  './src/cloud.js',
  './src/game.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(ONBELLEK)
      // Tek bir dosya hata verse kurulum düşmesin: her birini ayrı ekle
      .then((c) => Promise.allSettled(ON_YUKLE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== ONBELLEK).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

// Önce ağ, olmazsa önbellek: index.html ve src/*.js böylece hiçbir zaman eski sürümde takılmaz.
// ?v= sorgusu değişse de önbellekteki kopya bulunabilsin diye ignoreSearch kullanılır.
async function agOncelikli(req, yedek) {
  const c = await caches.open(ONBELLEK);
  try {
    const yanit = await fetch(req);
    if (yanit && yanit.ok) c.put(req, yanit.clone());
    return yanit;
  } catch (err) {
    const eski = await c.match(req, { ignoreSearch: true });
    if (eski) return eski;
    if (yedek) { const y = await c.match(yedek); if (y) return y; }
    throw err;
  }
}

// Önce önbellek, yoksa ağdan al ve sakla: ikonlar, manifest, fontlar (opak yanıtlar da saklanır).
async function onbellekOncelikli(req) {
  const c = await caches.open(ONBELLEK);
  const eski = await c.match(req);
  if (eski) return eski;
  const yanit = await fetch(req);
  if (yanit && (yanit.ok || yanit.type === 'opaque')) c.put(req, yanit.clone());
  return yanit;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const kendiSite = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (req.mode === 'navigate' || (kendiSite && (url.pathname.endsWith('/index.html') || url.pathname.includes('/src/')))) {
    e.respondWith(agOncelikli(req, req.mode === 'navigate' ? './index.html' : null));
    return;
  }
  if (font || (kendiSite && (url.pathname.includes('/icons/') || url.pathname.endsWith('/manifest.webmanifest')))) {
    e.respondWith(onbellekOncelikli(req));
  }
  // Diğer istekler (ör. tools/) tarayıcıya bırakılır.
});
