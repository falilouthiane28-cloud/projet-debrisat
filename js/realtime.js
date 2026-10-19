import { ecouterSignalements, demarrerSimulation, MODE_DEMO } from './donnees.js';
import { TYPES_OBSTRUCTION, RAYON_PROXIMITE_KM } from './config.js';
import { distanceKm, lieuSignalement } from './utils.js';
import { toast, notificationSysteme } from './notifications.js';

// Abonnement aux changements de la table signalements (Supabase Realtime, ou flux simule en demo)
export function suivreSignalements({ surNouveau, surMiseAJour, simulation = true }) {
    const arreter = ecouterSignalements(({ type, nouveau }) => {
        if (!nouveau) return;
        if (type === 'INSERT') surNouveau?.(nouveau);
        if (type === 'UPDATE') surMiseAJour?.(nouveau);
    });
    if (MODE_DEMO && simulation) demarrerSimulation();
    return arreter;
}

export function signalerSiProche(s, position, auteurCourantId) {
    if (!position || s.lat == null || s.user_id === auteurCourantId) return false;
    const km = distanceKm(position.lat, position.lng, s.lat, s.lng);
    if (km > RAYON_PROXIMITE_KM) return false;
    const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
    const distance = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
    toast({ type: 'warning', icone: 'bi-geo-alt', titre: `Nouveau signalement à ${distance}`, message: `${type.libelle} · ${lieuSignalement(s)}`, duree: 7000 });
    notificationSysteme('Debrisat — signalement proche', `${type.libelle} à ${distance} de vous`);
    return true;
}
