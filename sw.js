// Service worker: tiene in memoria l'interfaccia, così l'app si apre anche con rete debole.
// Mappa e campi richiedono comunque la connessione.
const CACHE = 'campetti-v1';
const SHELL = [
  './', 'index.html', 'css/style.css', 'js/config.js', 'js/app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Dati dei campi e riquadri della mappa: sempre dalla rete
  if (e.request.method !== 'GET' || url.hostname.includes('overpass') || url.hostname.includes('tile.openstreetmap.org')) return;
  // Interfaccia: prima la rete (per vedere subito le modifiche), poi la copia salvata
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
