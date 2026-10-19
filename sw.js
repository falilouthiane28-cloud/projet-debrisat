// Service Worker Debrisat — Cache et offline
const CACHE_NAME = 'debrisat-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/dashboard.html',
  '/css/variables.css',
  '/css/base.css',
  '/css/components.css',
  '/css/landing.css',
  '/css/app.css',
  '/css/dashboard.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/auth.js',
  '/js/map.js',
  '/js/signalement.js',
  '/js/gamification.js',
  '/js/realtime.js',
  '/js/notifications.js',
  '/js/ia-analysis.js',
  '/js/satellite.js',
  '/js/heatmap.js',
  '/js/dashboard.js',
  '/manifest.json'
];

// Installation : mise en cache des fichiers
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activation : nettoyage ancien cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategie : Network first, fallback cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache les tuiles de carte
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open('debrisat-tiles').then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetched = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetched;
        })
      )
    );
    return;
  }

  // Pour les API Supabase, toujours reseau
  if (url.hostname.includes('supabase')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell : network first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// File d'attente offline pour signalements
const QUEUE_NAME = 'debrisat-offline-queue';

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-signalements') {
    event.waitUntil(envoyerFileAttente());
  }
});

async function envoyerFileAttente() {
  try {
    const db = await ouvrirDB();
    const tx = db.transaction(QUEUE_NAME, 'readonly');
    const store = tx.objectStore(QUEUE_NAME);
    const items = await new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
    });

    for (const item of items) {
      try {
        await fetch(item.url, { method: item.method, headers: item.headers, body: item.body });
        const delTx = db.transaction(QUEUE_NAME, 'readwrite');
        delTx.objectStore(QUEUE_NAME).delete(item.id);
      } catch (e) {
        break;
      }
    }
  } catch (e) {}
}

function ouvrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('debrisat-sw', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(QUEUE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
