import { echapper, initiales, formatNombre } from './utils.js';
import { toast } from './notifications.js';
import { mouvementReduit } from './animations.js';

export const RAISONS_POINTS = {
    signalement: 'Nouveau signalement',
    verification: 'Vérification d\'un signalement',
    signalement_verifie: 'Signalement confirmé par la communauté',
    signalement_resolu: 'Signalement résolu par les autorités',
    badge: 'Badge obtenu'
};

export function badgesObtenus(profil) {
    return new Set((profil?.badges || []).map(b => (typeof b === 'string' ? b : b.id)));
}

export function nouveauxBadges(avant, apres, badges) {
    const deja = badgesObtenus(avant);
    return badges.filter(b => badgesObtenus(apres).has(b.id) && !deja.has(b.id));
}

export function celebrerPoints(points) {
    if (!points) return;
    if (mouvementReduit()) return;
    const el = document.createElement('div');
    el.className = 'points-flottants';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<i class="bi bi-star-fill"></i>+${points} points`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
}

export function annoncerBadges(liste) {
    liste.forEach((b, i) => setTimeout(() => toast({
        type: 'success',
        icone: 'bi-award',
        titre: `Badge débloqué : ${b.nom}`,
        message: b.description,
        duree: 6000
    }), 600 + i * 900));
}

// Prochain badge a viser, avec la progression vers celui-ci
export function prochainBadge(profil, badges) {
    const obtenus = badgesObtenus(profil);
    const candidats = badges
        .filter(b => !obtenus.has(b.id))
        .map(b => {
            const parSignalements = b.condition_signalements != null;
            const actuel = parSignalements ? profil.nombre_signalements || 0 : profil.nombre_verifications || 0;
            const objectif = parSignalements ? b.condition_signalements : b.condition_verifications || 10;
            return { badge: b, actuel, objectif, unite: parSignalements ? 'signalements' : 'vérifications', reste: objectif - actuel };
        })
        .sort((a, b) => a.reste - b.reste);
    return candidats[0] || null;
}

export function htmlBadges(badges, profil) {
    const obtenus = badgesObtenus(profil);
    return badges.map(b => {
        const ok = obtenus.has(b.id);
        const condition = b.condition_signalements != null
            ? `${b.condition_signalements} signalement${b.condition_signalements > 1 ? 's' : ''}`
            : `${b.condition_verifications || 10} vérifications`;
        return `
            <div class="card-badge ${ok ? 'obtenu' : 'verrouille'}" role="listitem">
                <span class="icone-ronde"><i class="bi ${echapper(b.icone)}" aria-hidden="true"></i></span>
                <span class="nom">${echapper(b.nom)}</span>
                <span class="condition">${ok ? 'Obtenu' : condition}</span>
                <span class="sr-only">${ok ? 'Badge obtenu' : 'Badge verrouillé'}</span>
            </div>`;
    }).join('');
}

const ICONES_PODIUM = ['or', 'argent', 'bronze'];

export function htmlClassement(liste, moiId) {
    if (!liste.length) {
        return `<div class="etat-vide"><i class="bi bi-trophy" aria-hidden="true"></i><p>Le classement apparaîtra dès les premiers signalements.</p></div>`;
    }
    const podium = liste.slice(0, 3);
    const ordrePodium = [podium[1], podium[0], podium[2]].filter(Boolean);
    const htmlPodium = `
        <div class="podium" aria-hidden="true">
            ${ordrePodium.map(p => {
                const rang = liste.indexOf(p);
                return `<div class="podium-place glass p${rang + 1}">
                    <span class="rang ${ICONES_PODIUM[rang]}"><i class="bi bi-trophy-fill" style="color:inherit"></i></span>
                    <span class="avatar${rang === 0 ? ' lg' : ''}">${echapper(initiales(p.nom_complet))}</span>
                    <span class="nom tronque">${echapper(p.nom_complet.split(' ')[0])}</span>
                    <span class="chiffre">${formatNombre(p.points_total)}</span>
                </div>`;
            }).join('')}
        </div>`;
    const lignes = liste.map((p, i) => `
        <li class="ligne-classement${p.id === moiId ? ' moi' : ''}">
            <span class="rang ${ICONES_PODIUM[i] || ''}">${i < 3 ? `<i class="bi bi-trophy-fill" aria-hidden="true"></i><span class="sr-only">${i + 1}</span>` : i + 1}</span>
            <span class="avatar">${echapper(initiales(p.nom_complet))}</span>
            <span class="flex-1">
                <span class="nom tronque" style="display:block">${echapper(p.nom_complet)}${p.id === moiId ? ' <span class="badge badge-neutral">Vous</span>' : ''}</span>
                <span class="sous">${echapper(p.commune || '')} · ${p.nombre_signalements || 0} signalement${(p.nombre_signalements || 0) > 1 ? 's' : ''}</span>
            </span>
            <span class="points">${formatNombre(p.points_total)} pts</span>
        </li>`).join('');
    return `${htmlPodium}<ol class="classement" role="list" aria-label="Classement des contributeurs">${lignes}</ol>`;
}
