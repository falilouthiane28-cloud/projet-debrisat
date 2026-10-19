import { STATUTS_ACTIFS } from './config.js';

// Seuls les signalements encore actifs contribuent a la densite de risque
function points(signalements) {
    return signalements
        .filter(s => STATUTS_ACTIFS.includes(s.statut) && s.lat != null)
        .map(s => [s.lat, s.lng, Math.max(0.2, (s.severite || 1) / 5)]);
}

export function creerCoucheChaleur(signalements) {
    if (typeof L.heatLayer !== 'function') return null;
    return L.heatLayer(points(signalements), {
        radius: 28,
        blur: 22,
        maxZoom: 15,
        minOpacity: 0.25,
        gradient: { 0.2: '#4ADE80', 0.4: '#A3E635', 0.6: '#FACC15', 0.8: '#FB923C', 1: '#EF4444' }
    });
}

export function mettreAJourChaleur(couche, signalements) {
    couche?.setLatLngs(points(signalements));
}
