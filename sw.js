// Service Worker Debrisat : coquille applicative hors-ligne + cache des tuiles
const VERSION = 'debrisat-v2';
const CACHE_COQUILLE = `${VERSION}-coquille`;
const CACHE_CDN = `${VERSION}-cdn`;
const CACHE_TUILES = 'debrisat-tuiles';
const MAX_TUILES = 600;

const COQUILLE = [
    './',
    'index.html',
    'app.html',
    'dashboard.html',
    'auth.html',
    'profil.html',
    'manifest.json',
    'css/tokens.css',
    'css/reset.css',
    'css/base.css',
    'css/components.css',
    'css/landing.css',
    'css/app.css',
    'css/dashboard.css',
    'css/responsive.css',
    'js/theme.js',
    'js/config.js',
    'js/utils.js',
    'js/donnees.js',
    'js/notifications.js',
    'js/i18n.js',
    'js/animations.js',
    'js/auth.js',
    'js/router.js',
    'js/map.js',
    'js/heatmap.js',
    'js/satellite.js',
    'js/gamification.js',
    'js/ia-analysis.js',
    'js/signalement.js',
    'js/realtime.js',
    'js/pwa.js',
    'js/landing.js',
    'js/app.js',
    'js/dashboard.js',
    'js/profil.js',
    'img/logo.png',
    'img/logo-mark.png',
    'img/icon-192.png',
    'img/icon-512.png'
];

const HOTES_CDN = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const HOTES_TUILES = ['basemaps.cartocdn.com', 'tiles.maps.eox.at'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_COQUILLE).then((cache) => cache.addAll(COQUILLE)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cles) => Promise.all(
            cles.filter((c) => c !== CACHE_TUILES && !c.startsWith(VERSION)).map((c) => caches.delete(c))
        ))
    );
    self.clients.claim();
});

async function limiterCache(nom, max) {
    const cache = await caches.open(nom);
    const cles = await cache.keys();
    if (cles.length > max) await Promise.all(cles.slice(0, cles.length - max).map((c) => cache.delete(c)));
}

// Les fichiers CDN ont une version figee dans l'URL : le cache suffit
async function cacheDabord(requete, nomCache) {
    const enCache = await caches.match(requete);
    if (enCache) return enCache;
    const reponse = await fetch(requete);
    if (reponse.ok || reponse.type === 'opaque') {
        const cache = await caches.open(nomCache);
        cache.put(requete, reponse.clone());
    }
    return reponse;
}

async function reseauDabord(requete) {
    try {
        const reponse = await fetch(requete);
        if (reponse.ok) {
            const cache = await caches.open(CACHE_COQUILLE);
            cache.put(requete, reponse.clone());
        }
        return reponse;
    } catch (e) {
        const enCache = await caches.match(requete, { ignoreSearch: true });
        if (enCache) return enCache;
        if (requete.mode === 'navigate') return caches.match('app.html');
        throw e;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.hostname.includes('supabase') || url.hostname.includes('nominatim')) return;

    if (HOTES_TUILES.some((h) => url.hostname.endsWith(h))) {
        event.respondWith(
            cacheDabord(request, CACHE_TUILES).then((r) => {
                limiterCache(CACHE_TUILES, MAX_TUILES);
                return r;
            }).catch(() => new Response('', { status: 504 }))
        );
        return;
    }

    if (HOTES_CDN.includes(url.hostname)) {
        event.respondWith(cacheDabord(request, CACHE_CDN));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(reseauDabord(request));
    }
});
