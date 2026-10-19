import { LIMITES_DAKAR, SEVERITES, TYPES_OBSTRUCTION, STATUTS, COMMUNES } from './config.js';

export const $ = (selecteur, racine = document) => racine.querySelector(selecteur);
export const $$ = (selecteur, racine = document) => [...racine.querySelectorAll(selecteur)];

const ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Tout contenu saisi par un utilisateur passe par ici avant d'entrer dans du HTML
export function echapper(valeur) {
    return String(valeur ?? '').replace(/[&<>"']/g, c => ENTITES[c]);
}

const formatRelatifFr = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const formatNombreFr = new Intl.NumberFormat('fr-FR');

export function formatRelatif(date) {
    const ecart = (new Date(date).getTime() - Date.now()) / 1000;
    const abs = Math.abs(ecart);
    if (abs < 45) return "à l'instant";
    if (abs < 3600) return formatRelatifFr.format(Math.round(ecart / 60), 'minute');
    if (abs < 86400) return formatRelatifFr.format(Math.round(ecart / 3600), 'hour');
    if (abs < 86400 * 7) return formatRelatifFr.format(Math.round(ecart / 86400), 'day');
    return formatDate(date);
}

export function formatDate(date, avecHeure = false) {
    return new Date(date).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'short', year: 'numeric',
        ...(avecHeure ? { hour: '2-digit', minute: '2-digit' } : {})
    });
}

export function formatNombre(n) {
    return formatNombreFr.format(n);
}

export function formatDuree(heures) {
    if (heures == null || Number.isNaN(heures)) return '—';
    if (heures < 24) return `${Math.round(heures)} h`;
    const jours = heures / 24;
    return `${jours.toFixed(jours < 10 ? 1 : 0).replace('.', ',')} j`;
}

export function initiales(nom = '') {
    return nom.trim().split(/\s+/).slice(0, 2).map(m => m[0] || '').join('').toUpperCase() || '?';
}

export function idCourt(id = '') {
    return '#' + String(id).replace(/-/g, '').slice(0, 6).toUpperCase();
}

export function debounce(fn, delai = 250) {
    let minuteur;
    return (...args) => {
        clearTimeout(minuteur);
        minuteur = setTimeout(() => fn(...args), delai);
    };
}

export function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const rad = d => d * Math.PI / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function obtenirPosition({ precision = true, delai = 10000 } = {}) {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }),
            err => {
                const messages = {
                    1: "Accès à la position refusé. Autorisez-le dans les réglages du navigateur.",
                    2: 'Position introuvable. Vérifiez que le GPS est activé.',
                    3: 'La recherche de position a pris trop de temps.'
                };
                reject(new Error(messages[err.code] || 'Impossible de déterminer votre position.'));
            },
            { enableHighAccuracy: precision, timeout: delai, maximumAge: 30000 }
        );
    });
}

// Nominatim impose au plus une requete par seconde : les appelants doivent temporiser.
export async function geocodageInverse(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=fr&zoom=17`;
        const reponse = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!reponse.ok) throw new Error();
        const d = await reponse.json();
        const a = d.address || {};
        const rue = [a.house_number, a.road].filter(Boolean).join(' ');
        const quartier = a.neighbourhood || a.suburb || a.quarter || a.village || '';
        const commune = normaliserCommune(a.city_district || a.town || a.city || a.municipality || '');
        return {
            adresse: [rue, quartier, commune].filter(Boolean).join(', ') || d.display_name || '',
            quartier,
            commune
        };
    } catch {
        return { adresse: '', quartier: '', commune: '' };
    }
}

const sansAccents = t => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// « Commune de Pikine Est » devient « Pikine », pour correspondre aux filtres de l'application
export function normaliserCommune(brut) {
    const nettoye = brut.replace(/^(Commune|Arrondissement|Département) (de |d'|du |des )?/i, '').trim();
    const cle = sansAccents(nettoye);
    return COMMUNES.find(c => cle.includes(sansAccents(c))) || nettoye;
}

export async function rechercherLieu(requete) {
    const { ouest, sud, est, nord } = LIMITES_DAKAR;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(requete)}&format=jsonv2&accept-language=fr&limit=5&countrycodes=sn&viewbox=${ouest},${nord},${est},${sud}&bounded=1`;
    const reponse = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!reponse.ok) throw new Error('Recherche indisponible pour le moment.');
    const resultats = await reponse.json();
    return resultats.map(r => ({
        nom: r.name || r.display_name.split(',')[0],
        detail: r.display_name.split(',').slice(1, 3).join(',').trim(),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon)
    }));
}

// Reduit la photo avant envoi : les forfaits mobiles sont chers, 1600 px suffisent a l'analyse.
export async function compresserImage(fichier, dimensionMax = 1600, qualite = 0.82) {
    if (!fichier.type.startsWith('image/') || fichier.type === 'image/gif') return fichier;
    try {
        const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
        const echelle = Math.min(1, dimensionMax / Math.max(bitmap.width, bitmap.height));
        const largeur = Math.round(bitmap.width * echelle);
        const hauteur = Math.round(bitmap.height * echelle);
        const canvas = document.createElement('canvas');
        canvas.width = largeur;
        canvas.height = hauteur;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, largeur, hauteur);
        bitmap.close?.();
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', qualite));
        return blob && blob.size < fichier.size ? new File([blob], fichier.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : fichier;
    } catch {
        return fichier;
    }
}

export function lireStockage(cle, defaut = null) {
    try {
        const v = localStorage.getItem(cle);
        return v === null ? defaut : JSON.parse(v);
    } catch {
        return defaut;
    }
}

export function ecrireStockage(cle, valeur) {
    try {
        localStorage.setItem(cle, JSON.stringify(valeur));
        return true;
    } catch {
        return false;
    }
}

export function telechargerFichier(nom, contenu, type = 'text/plain') {
    const blob = new Blob([contenu], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// === Fragments HTML partages ===

export function htmlSeverite(niveau) {
    const n = Number(niveau) || 1;
    const points = [1, 2, 3, 4, 5].map(i => `<span class="severity-dot${i <= n ? ' filled' : ''}"></span>`).join('');
    return `<span class="severity-dots" data-niveau="${n}" role="img" aria-label="Sévérité ${n} sur 5, ${echapper(SEVERITES[n]?.libelle || '')}">${points}</span>`;
}

export function htmlStatut(statut) {
    const s = STATUTS[statut] || { libelle: statut, icone: 'bi-question-circle', classe: 'badge-neutral' };
    return `<span class="badge ${s.classe}"><i class="bi ${s.icone}" aria-hidden="true"></i>${echapper(s.libelle)}</span>`;
}

export function htmlType(type, { avecLibelle = true } = {}) {
    const t = TYPES_OBSTRUCTION[type] || TYPES_OBSTRUCTION.autre;
    return `<i class="bi ${t.icone}" aria-hidden="true"></i>${avecLibelle ? `<span>${echapper(t.libelle)}</span>` : ''}`;
}

export function htmlVignette(s, classe = '') {
    const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
    const teinte = SEVERITES[s.severite]?.couleur || SEVERITES[3].couleur;
    if (s.photo_url) {
        return `<div class="vignette ${classe}"><img src="${echapper(s.photo_url)}" alt="Photo du signalement : ${echapper(type.libelle.toLowerCase())}" loading="lazy" decoding="async"></div>`;
    }
    return `<div class="vignette vignette-vide ${classe}" style="--teinte:${teinte}" role="img" aria-label="Aucune photo disponible"><i class="bi ${type.icone}" aria-hidden="true"></i></div>`;
}

export function lieuSignalement(s) {
    return [s.quartier, s.commune].filter(Boolean).join(', ') || s.adresse || 'Localisation inconnue';
}
