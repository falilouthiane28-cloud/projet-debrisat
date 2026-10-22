// Service worker Debrisat : coquille de l'application hors ligne, tuiles de carte mises en cache au fil de la navigation.
const VERSION = 'debrisat-v7';
const CACHE_COQUILLE = `${VERSION}-coquille`;
const CACHE_CDN = `${VERSION}-cdn`;
const CACHE_TUILES = `${VERSION}-tuiles`;
const MAX_TUILES = 600;

const COQUILLE = [
    './', 'index.html', 'app.html', 'dashboard.html', 'admin.html', 'hackathon.html', 'auth.html', 'profil.html', '404.html', 'manifest.json',
    'css/tokens.css', 'css/reset.css', 'css/base.css', 'css/components.css',
    'css/landing.css', 'css/hackathon.css', 'css/app.css', 'css/dashboard.css', 'css/profil.css', 'css/responsive.css',
    'js/config.js', 'js/utils.js', 'js/demo.js', 'js/donnees.js', 'js/auth.js', 'js/router.js',
    'js/map.js', 'js/signalement.js', 'js/heatmap.js', 'js/gamification.js', 'js/realtime.js',
    'js/dashboard.js', 'js/notifications.js', 'js/theme.js', 'js/animations.js', 'js/ia-analysis.js',
    'js/satellite.js', 'js/i18n.js', 'js/pwa.js',
    'js/page-accueil.js', 'js/page-app.js', 'js/page-auth.js', 'js/page-profil.js', 'js/guard.js', 'js/admin.js', 'js/page-hackathon.js',
    'i18n/wo.json',
    'img/logo.png', 'img/symbole.png', 'img/terre-afrique.jpg', 'img/satellite-faisceau.jpg', 'img/satellite-orbite.jpg',
    'img/icons/icon-192.png', 'img/icons/icon-512.png', 'img/icons/favicon-32.png'
];

const HOTES_CDN = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const HOTES_TUILES = ['server.arcgisonline.com', 'tiles.maps.eox.at'];

self.addEventListener('install', evenement => {
    evenement.waitUntil(caches.open(CACHE_COQUILLE).then(cache => cache.addAll(COQUILLE)));
    self.skipWaiting();
});

self.addEventListener('activate', evenement => {
    evenement.waitUntil((async () => {
        const cles = await caches.keys();
        await Promise.all(cles.filter(c => !c.startsWith(VERSION)).map(c => caches.delete(c)));
        await self.clients.claim();
    })());
});

async function limiterCache(nom, maximum) {
    const cache = await caches.open(nom);
    const cles = await cache.keys();
    for (let i = 0; i < cles.length - maximum; i++) await cache.delete(cles[i]);
}

// Reseau d'abord, cache en secours : les pages restent a jour quand la connexion le permet
async function reseauDabord(requete) {
    const cache = await caches.open(CACHE_COQUILLE);
    try {
        const reponse = await fetch(requete);
        if (reponse.ok) cache.put(requete, reponse.clone());
        return reponse;
    } catch {
        const enCache = await cache.match(requete, { ignoreSearch: true });
        if (enCache) return enCache;
        if (requete.mode === 'navigate') return cache.match('app.html');
        throw new Error('Hors ligne');
    }
}

// Cache d'abord : les bibliotheques versionnees et les tuiles ne changent pas
async function cacheDabord(requete, nomCache, maximum) {
    const cache = await caches.open(nomCache);
    const enCache = await cache.match(requete);
    if (enCache) return enCache;
    const reponse = await fetch(requete);
    if (reponse.ok || reponse.type === 'opaque') {
        cache.put(requete, reponse.clone());
        if (maximum) limiterCache(nomCache, maximum);
    }
    return reponse;
}

self.addEventListener('fetch', evenement => {
    const { request } = evenement;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Donnees, authentification et geocodage : toujours le reseau, jamais de cache
    if (url.hostname.endsWith('supabase.co') || url.hostname.includes('nominatim')) return;

    if (HOTES_TUILES.includes(url.hostname)) {
        evenement.respondWith(cacheDabord(request, CACHE_TUILES, MAX_TUILES));
        return;
    }
    if (HOTES_CDN.includes(url.hostname)) {
        evenement.respondWith(cacheDabord(request, CACHE_CDN));
        return;
    }
    if (url.origin === self.location.origin) {
        evenement.respondWith(reseauDabord(request));
    }
});
