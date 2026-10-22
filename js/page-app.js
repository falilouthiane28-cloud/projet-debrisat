import { MODE_DEMO, TYPES_OBSTRUCTION, STATUTS, SEVERITES, COMMUNES, SEUIL_VERIFICATION, POINTS } from './config.js';
import {
    $, $$, echapper, formatRelatif, formatDate, debounce, distanceKm, obtenirPosition, rechercherLieu,
    htmlSeverite, htmlStatut, htmlVignette, lieuSignalement, initiales, idCourt, lireStockage, ecrireStockage
} from './utils.js';
import { initTheme } from './theme.js';
import { initI18n } from './i18n.js';
import { initPwa, synchroniserAuRetour } from './pwa.js';
import { estConnecte, utilisateurCourant, profilCourant, surChangementAuth, rafraichirProfil } from './auth.js';
import { listerSignalements, listerZones, listerAlertes, classement, verifierSignalement, aDejaVerifie, obtenirSignalement } from './donnees.js';
import { creerCarte, CoucheSignalements, creerCoucheZones, marqueurPosition } from './map.js';
import { creerCoucheChaleur, mettreAJourChaleur } from './heatmap.js';
import { BasculeSatellite } from './satellite.js';
import { Feuille, initRetourTactile, celebrer } from './animations.js';
import { Routeur } from './router.js';
import { AssistantSignalement, envoyerDepuisFile } from './signalement.js';
import { suivreSignalements, signalerSiProche } from './realtime.js';
import { htmlClassement, celebrerPoints } from './gamification.js';
import { htmlAnalyse } from './ia-analysis.js';
import { toast, erreur, succes, info, annoncer } from './notifications.js';
import { garderPage } from './guard.js';

initTheme();
initI18n();
initPwa();
initRetourTactile();

const etat = {
    signalements: [],
    position: null,
    marqueurPos: null,
    tri: 'recent',
    filtres: { types: new Set(), severiteMin: 1, statuts: new Set(), commune: '', du: '', au: '' }
};

// ============ Carte ============
const carte = creerCarte($('#carte'));
const couche = new CoucheSignalements(carte, {
    optionsPopup: { peutVerifier: true }
});
let coucheZones = null;
let coucheChaleur = null;
const satellite = new BasculeSatellite(carte);

$('#btnZoomPlus').addEventListener('click', () => carte.zoomIn());
$('#btnZoomMoins').addEventListener('click', () => carte.zoomOut());

$('#btnZones').addEventListener('click', e => {
    const bouton = e.currentTarget;
    const active = bouton.getAttribute('aria-pressed') !== 'true';
    bouton.setAttribute('aria-pressed', String(active));
    if (coucheZones) active ? coucheZones.addTo(carte) : coucheZones.remove();
});

$('#btnChaleur').addEventListener('click', e => {
    const bouton = e.currentTarget;
    const active = bouton.getAttribute('aria-pressed') !== 'true';
    bouton.setAttribute('aria-pressed', String(active));
    if (!coucheChaleur) coucheChaleur = creerCoucheChaleur(couche.visibles());
    if (!coucheChaleur) {
        erreur('Carte de chaleur indisponible', "L'extension de carte n'a pas pu être chargée.");
        return;
    }
    active ? coucheChaleur.addTo(carte) : coucheChaleur.remove();
    annoncer(active ? 'Carte de chaleur affichée' : 'Carte de chaleur masquée');
});

$('#btnSatellite').addEventListener('click', e => {
    const active = satellite.basculer();
    e.currentTarget.setAttribute('aria-pressed', String(active));
    if (active) info('Imagerie Sentinel-2', 'Mosaïque satellite sans nuages, résolution 10 m.', { duree: 3500 });
});

$('#btnLocaliser').addEventListener('click', async e => {
    const bouton = e.currentTarget;
    bouton.classList.add('btn-chargement');
    try {
        const pos = await obtenirPosition();
        definirPosition(pos);
        carte.flyTo([pos.lat, pos.lng], 16, { duration: 0.8 });
    } catch (err) {
        erreur('Position indisponible', err.message);
    } finally {
        bouton.classList.remove('btn-chargement');
    }
});

function definirPosition(pos) {
    etat.position = pos;
    etat.marqueurPos = marqueurPosition(carte, etat.marqueurPos, pos);
}

// Actions dans les infobulles de la carte (delegation)
carte.getContainer().addEventListener('click', e => {
    const cible = e.target.closest('[data-action]');
    if (!cible) return;
    if (cible.dataset.action === 'confirmer') donnerAvis(cible.dataset.id, true, cible);
    if (cible.dataset.action === 'detail') ouvrirDetail(cible.dataset.id);
});

// ============ Feuilles ============
const routeVersCarte = () => routeur.aller('carte', { remplacer: true });
const feuilles = {
    filtres: new Feuille($('#feuilleFiltres'), { surFermeture: () => $('#btnFiltres').setAttribute('aria-expanded', 'false') }),
    liste: new Feuille($('#feuilleListe'), { surFermeture: routeVersCarte }),
    classement: new Feuille($('#feuilleClassement'), { surFermeture: routeVersCarte }),
    detail: new Feuille($('#feuilleDetail')),
    alertes: new Feuille($('#feuilleAlertes')),
    signalement: new Feuille($('#feuilleSignalement'))
};

const assistant = new AssistantSignalement(feuilles.signalement, {
    surCree: (s, { miseAJour } = {}) => {
        integrer(s);
        if (miseAJour && s.photo_analyse) info('Analyse automatique terminée', `Sévérité estimée : ${s.photo_analyse.severite_suggeree}/5`, { icone: 'bi-cpu', duree: 4000 });
    }
});
document.addEventListener('voir-signalement', e => {
    routeVersCarte();
    setTimeout(() => couche.ouvrir(e.detail.id), 350);
});

function ouvrirAssistant() {
    if (!estConnecte()) {
        info('Connexion nécessaire', 'Connectez-vous pour signaler une obstruction et gagner des points.');
        location.href = 'auth.html?retour=' + encodeURIComponent('app.html#signaler');
        return;
    }
    assistant.ouvrir();
}
$('#btnSignaler').addEventListener('click', ouvrirAssistant);
$('[data-action="signaler"]').addEventListener('click', ouvrirAssistant);

$('#btnFiltres').addEventListener('click', e => {
    feuilles.filtres.basculer();
    e.currentTarget.setAttribute('aria-expanded', String(feuilles.filtres.ouverte));
});

// ============ Routeur ============
const routeur = new Routeur({
    carte: {
        entrer(parametres) {
            feuilles.liste.fermer({ silencieux: true });
            feuilles.classement.fermer({ silencieux: true });
            if (parametres.get('signalement')) ouvrirDetail(parametres.get('signalement'));
        },
        actualiser(parametres) {
            if (parametres.get('signalement')) ouvrirDetail(parametres.get('signalement'));
        }
    },
    liste: {
        entrer() {
            feuilles.classement.fermer({ silencieux: true });
            rendreListe();
            feuilles.liste.ouvrir();
        },
        sortir() { feuilles.liste.fermer({ silencieux: true }); }
    },
    classement: {
        entrer() {
            feuilles.liste.fermer({ silencieux: true });
            feuilles.classement.ouvrir();
            rendreClassement();
        },
        sortir() { feuilles.classement.fermer({ silencieux: true }); }
    },
    signaler: {
        entrer() {
            routeur.aller('carte', { remplacer: true });
            // Laisse l'authentification se resoudre avant d'ouvrir l'assistant
            pretAuth.then(ouvrirAssistant);
        }
    }
}, { defaut: 'carte' });

// ============ Filtres ============
function initFiltres() {
    $('#filtreTypes').innerHTML = Object.entries(TYPES_OBSTRUCTION).map(([cle, t]) => `
        <label class="checkbox"><input type="checkbox" value="${cle}" name="type">
            <i class="bi ${t.icone}" aria-hidden="true"></i>${echapper(t.libelle)}</label>`).join('');
    $('#filtreStatuts').innerHTML = Object.entries(STATUTS).map(([cle, s]) => `
        <button type="button" class="chip" data-statut="${cle}" aria-pressed="false">
            <i class="bi ${s.icone}" aria-hidden="true"></i>${echapper(s.libelle)}</button>`).join('');
    $('#filtreCommune').insertAdjacentHTML('beforeend', COMMUNES.map(c => `<option value="${echapper(c)}">${echapper(c)}</option>`).join(''));

    const f = etat.filtres;
    $('#filtreTypes').addEventListener('change', e => {
        e.target.checked ? f.types.add(e.target.value) : f.types.delete(e.target.value);
        appliquerFiltres();
    });
    $('#filtreStatuts').addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const actif = chip.getAttribute('aria-pressed') !== 'true';
        chip.setAttribute('aria-pressed', String(actif));
        actif ? f.statuts.add(chip.dataset.statut) : f.statuts.delete(chip.dataset.statut);
        appliquerFiltres();
    });
    const curseur = $('#filtreSeverite');
    const majCurseur = () => {
        const n = Number(curseur.value);
        f.severiteMin = n;
        curseur.style.setProperty('--valeur', n);
        curseur.style.setProperty('--couleur', SEVERITES[n].couleur);
        curseur.setAttribute('aria-valuetext', `${n} sur 5, ${SEVERITES[n].libelle}`);
        const badge = $('#valeurFiltreSeverite');
        badge.className = `badge badge-severity-${n}`;
        badge.textContent = `${n} · ${SEVERITES[n].libelle}`;
    };
    curseur.addEventListener('input', () => { majCurseur(); appliquerFiltres(); });
    majCurseur();
    $('#filtreCommune').addEventListener('change', e => { f.commune = e.target.value; appliquerFiltres(); });
    $('#filtreDu').addEventListener('change', e => { f.du = e.target.value; appliquerFiltres(); });
    $('#filtreAu').addEventListener('change', e => { f.au = e.target.value; appliquerFiltres(); });
    $('#btnReinitialiserFiltres').addEventListener('click', () => {
        f.types.clear(); f.statuts.clear();
        f.severiteMin = 1; f.commune = ''; f.du = ''; f.au = '';
        $('#formFiltres').reset();
        $$('#filtreStatuts .chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
        majCurseur();
        appliquerFiltres();
        annoncer('Filtres réinitialisés');
    });
}

function correspond(s) {
    const f = etat.filtres;
    if (f.types.size && !f.types.has(s.type_obstruction)) return false;
    if (s.severite < f.severiteMin) return false;
    // Sans filtre de statut, les signalements rejetes restent masques
    if (f.statuts.size ? !f.statuts.has(s.statut) : s.statut === 'rejete') return false;
    if (f.commune && s.commune !== f.commune) return false;
    const jour = s.created_at.slice(0, 10);
    if (f.du && jour < f.du) return false;
    if (f.au && jour > f.au) return false;
    return true;
}

function nombreFiltresActifs() {
    const f = etat.filtres;
    return f.types.size + f.statuts.size + (f.severiteMin > 1) + !!f.commune + !!(f.du || f.au);
}

function appliquerFiltres() {
    const n = couche.filtrer(correspond);
    $('#nbVisibles').textContent = n;
    $('#libelleVisibles').textContent = n > 1 ? 'signalements affichés' : 'signalement affiché';
    $('#btnAppliquerFiltres').textContent = n ? `Afficher ${n} résultat${n > 1 ? 's' : ''}` : 'Aucun résultat';
    const actifs = nombreFiltresActifs();
    const compteur = $('#compteurFiltres');
    compteur.hidden = !actifs;
    compteur.textContent = actifs;
    $('#resumeFiltres').textContent = actifs ? `${actifs} filtre${actifs > 1 ? 's' : ''} actif${actifs > 1 ? 's' : ''}` : 'Tous les signalements actifs';
    if (coucheChaleur) mettreAJourChaleur(coucheChaleur, couche.visibles());
    if (feuilles.liste.ouverte) rendreListe();
}

// ============ Liste ============
$('#feuilleListe').addEventListener('click', async e => {
    const tri = e.target.closest('[data-tri]');
    if (tri) {
        if (tri.dataset.tri === 'proche' && !etat.position) {
            try { definirPosition(await obtenirPosition()); }
            catch (err) { erreur('Position indisponible', err.message); return; }
        }
        etat.tri = tri.dataset.tri;
        $$('#feuilleListe [data-tri]').forEach(b => b.setAttribute('aria-pressed', String(b === tri)));
        rendreListe();
        return;
    }
    const carteSig = e.target.closest('.card-signalement');
    if (carteSig) ouvrirDetail(carteSig.dataset.id);
});

function rendreListe() {
    const conteneur = $('#listeSignalements');
    const liste = couche.visibles();
    const pos = etat.position;
    const tris = {
        recent: (a, b) => b.created_at.localeCompare(a.created_at),
        severite: (a, b) => b.severite - a.severite || b.created_at.localeCompare(a.created_at),
        proche: (a, b) => distanceKm(pos.lat, pos.lng, a.lat, a.lng) - distanceKm(pos.lat, pos.lng, b.lat, b.lng)
    };
    liste.sort(tris[etat.tri] || tris.recent);
    $('#sousTitreListe').textContent = `${liste.length} signalement${liste.length > 1 ? 's' : ''} · ${{ recent: 'les plus récents d\'abord', severite: 'les plus graves d\'abord', proche: 'les plus proches d\'abord' }[etat.tri]}`;
    conteneur.setAttribute('aria-busy', 'false');
    if (!liste.length) {
        conteneur.innerHTML = `<div class="etat-vide"><i class="bi bi-funnel" aria-hidden="true"></i><p>Aucun signalement ne correspond à vos filtres.</p></div>`;
        return;
    }
    conteneur.innerHTML = liste.map(s => {
        const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
        const distance = pos && etat.tri === 'proche' ? ` · ${distanceKm(pos.lat, pos.lng, s.lat, s.lng).toFixed(1).replace('.', ',')} km` : '';
        return `
            <button type="button" class="card-signalement" data-id="${s.id}">
                ${htmlVignette(s)}
                <span class="corps">
                    <span class="rangee-entre"><span class="titre tronque">${echapper(type.libelle)}</span>${htmlSeverite(s.severite)}</span>
                    <span class="meta tronque"><i class="bi bi-geo-alt" aria-hidden="true"></i> ${echapper(lieuSignalement(s))}</span>
                    <span class="ligne-meta">${htmlStatut(s.statut)}<span class="texte-xs texte-muet">${echapper(formatRelatif(s.created_at))}${distance}</span></span>
                </span>
            </button>`;
    }).join('');
}

function squelettesListe() {
    $('#listeSignalements').innerHTML = Array.from({ length: 5 }, () => `
        <div class="card-signalement" aria-hidden="true">
            <div class="skeleton" style="aspect-ratio:1"></div>
            <div><div class="skeleton skeleton-text" style="--l:60%"></div><div class="skeleton skeleton-text" style="--l:85%"></div><div class="skeleton skeleton-text" style="--l:40%"></div></div>
        </div>`).join('');
}

// ============ Classement ============
async function rendreClassement() {
    const corps = $('#corpsClassement');
    corps.innerHTML = Array.from({ length: 6 }, () => '<div class="rangee" style="padding:12px"><div class="skeleton skeleton-circle" style="width:36px;height:36px"></div><div class="flex-1"><div class="skeleton skeleton-text" style="--l:55%"></div><div class="skeleton skeleton-text" style="--l:30%"></div></div></div>').join('');
    try {
        const liste = await classement(20);
        corps.innerHTML = htmlClassement(liste, utilisateurCourant()?.id);
        corps.insertAdjacentHTML('beforeend', `<p class="form-helper texte-centre" style="margin-top:var(--space-4)">
            <i class="bi bi-star" aria-hidden="true"></i> ${POINTS.signalement} pts par signalement · ${POINTS.verification} pts par vérification · ${POINTS.signalement_verifie} pts si confirmé · ${POINTS.signalement_resolu} pts si résolu</p>`);
    } catch (err) {
        corps.innerHTML = `<div class="etat-vide"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><p>${echapper(err.message)}</p></div>`;
    } finally {
        corps.setAttribute('aria-busy', 'false');
    }
}

// ============ Detail ============
async function ouvrirDetail(id) {
    let s = couche.donnees.get(id);
    if (!s) {
        try { s = await obtenirSignalement(id); } catch { s = null; }
        if (!s) { erreur('Signalement introuvable', 'Il a peut-être été supprimé.'); return; }
        couche.ajouter(s, { animer: false });
    }
    carte.closePopup();
    rendreDetail(s);
    feuilles.detail.ouvrir();
}

// Built only from what the record holds: no date is shown for a step the data does not timestamp
function htmlChronologie(s) {
    const confirmations = s.nombre_confirmations || 0;
    const infirmations = s.nombre_infirmations || 0;
    const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    const rang = { en_attente: 1, verifie: 2, en_cours: 3, resolu: 4 }[s.statut] || 1;
    const etapes = [{ titre: 'Signalé', detail: formatDate(s.created_at, true), etat: 'fait', icone: 'bi-flag' }];
    if (s.statut === 'rejete') {
        etapes.push({ titre: 'Rejeté par la communauté', detail: pluriel(infirmations, 'avis contraire'), etat: 'rejete', icone: 'bi-x-lg' });
    } else {
        etapes.push({
            titre: 'Vérifié par la communauté',
            detail: rang >= 2 ? pluriel(confirmations, 'confirmation') : `${confirmations} sur ${SEUIL_VERIFICATION} confirmations nécessaires`,
            etat: rang >= 2 ? 'fait' : 'courant', icone: 'bi-people'
        });
        etapes.push({
            titre: 'Intervention',
            detail: rang >= 4 ? 'Terminée' : rang === 3 ? (s.assigne_a ? 'En cours, une équipe est assignée' : 'En cours') : 'À venir',
            etat: rang >= 4 ? 'fait' : rang === 3 ? 'courant' : 'a-venir', icone: 'bi-tools'
        });
        etapes.push({
            titre: 'Résolu',
            detail: s.resolu_at ? formatDate(s.resolu_at, true) : rang === 4 ? 'Canal dégagé' : 'À venir',
            etat: rang === 4 ? 'fait' : 'a-venir', icone: 'bi-check-lg'
        });
    }
    const etats = { fait: 'terminé', courant: 'étape actuelle', 'a-venir': 'à venir', rejete: 'étape finale' };
    return `
        <section class="bloc-chronologie" aria-labelledby="titreChronologie">
            <h3 class="titre-section" id="titreChronologie">Suivi</h3>
            <ol class="chronologie">
                ${etapes.map(e => `
                    <li class="etape-chrono" data-etat="${e.etat}"${e.etat === 'courant' ? ' aria-current="step"' : ''}>
                        <span class="repere-chrono"><i class="bi ${e.etat === 'fait' ? 'bi-check-lg' : e.icone}" aria-hidden="true"></i></span>
                        <span class="texte-chrono">
                            <span class="titre-chrono">${e.titre}<span class="sr-only"> : ${etats[e.etat]}</span></span>
                            <span class="detail-chrono">${echapper(e.detail)}</span>
                        </span>
                    </li>`).join('')}
            </ol>
        </section>`;
}

async function rendreDetail(s) {
    const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
    const moi = utilisateurCourant()?.id;
    const estAuteur = s.user_id && s.user_id === moi;
    const actif = ['en_attente', 'verifie'].includes(s.statut);
    $('#idDetail').textContent = `${idCourt(s.id)} · ${formatRelatif(s.created_at)}`;
    $('#titreDetail').textContent = type.libelle;
    const sources = { webapp: 'Application', whatsapp: 'WhatsApp', satellite: 'Détection satellite' };
    const iconesSources = { webapp: 'bi-phone', whatsapp: 'bi-whatsapp', satellite: 'bi-broadcast' };
    const confirmations = s.nombre_confirmations || 0;
    const infirmations = s.nombre_infirmations || 0;
    $('#corpsDetail').innerHTML = `
        <div class="detail-photo">${s.photo_url
            ? `<img src="${echapper(s.photo_url)}" alt="Photo de l'obstruction : ${echapper(type.libelle.toLowerCase())}">`
            : htmlVignette(s, 'large')}</div>
        <div class="pile">
            <div class="rangee-entre">${htmlStatut(s.statut)}<span class="badge badge-severity-${s.severite}">${s.severite}/5 · ${echapper(SEVERITES[s.severite]?.libelle || '')}</span></div>
            ${s.description ? `<p class="description-detail">${echapper(s.description)}</p>` : ''}
            <div id="zoneAvis">${actif && !estAuteur ? '<div class="skeleton" style="height:96px;border-radius:12px"></div>' : ''}</div>
            ${htmlChronologie(s)}
            <dl class="liste-def">
                <dt><i class="bi bi-geo-alt" aria-hidden="true"></i>Lieu</dt><dd>${echapper(s.adresse || lieuSignalement(s))}</dd>
                <dt><i class="bi ${iconesSources[s.source] || 'bi-phone'}" aria-hidden="true"></i>Source</dt><dd>${echapper(sources[s.source] || s.source)}</dd>
                <dt><i class="bi bi-people" aria-hidden="true"></i>Avis</dt><dd class="mono">${confirmations} pour · ${infirmations} contre</dd>
            </dl>
            ${htmlAnalyse(s.photo_analyse, { avecPhoto: !!s.photo_url })}
            ${estAuteur ? '<p class="form-helper"><i class="bi bi-info-circle" aria-hidden="true"></i> Vous êtes l\'auteur de ce signalement : d\'autres citoyens doivent le vérifier.</p>' : ''}
            <div class="detail-actions">
                <button type="button" class="btn btn-secondary" data-detail="carte"><i class="bi bi-map" aria-hidden="true"></i>Sur la carte</button>
                <button type="button" class="btn btn-secondary" data-detail="partager"><i class="bi bi-share" aria-hidden="true"></i>Partager</button>
            </div>
        </div>`;
    const corps = $('#corpsDetail');
    corps.querySelector('[data-detail="carte"]').onclick = () => {
        feuilles.detail.fermer();
        routeVersCarte();
        setTimeout(() => couche.ouvrir(s.id), 300);
    };
    corps.querySelector('[data-detail="partager"]').onclick = () => partager(s);

    if (actif && !estAuteur) {
        const zone = $('#zoneAvis');
        const dejaVote = moi ? await aDejaVerifie(s.id, moi) : false;
        if (!zone.isConnected) return;
        zone.innerHTML = dejaVote
            ? '<p class="avis-merci"><i class="bi bi-check-circle-fill" aria-hidden="true"></i>Merci, votre avis a été pris en compte.</p>'
            : `<div class="bloc-avis">
                   <p class="question-avis">Avez-vous vu cette obstruction sur place ?</p>
                   <p class="aide-avis">Votre avis aide les équipes à intervenir au bon endroit. Vous gagnez ${POINTS.verification} points.</p>
                   <div class="detail-actions">
                       <button type="button" class="btn btn-succes" data-avis="1"><i class="bi bi-hand-thumbs-up" aria-hidden="true"></i>Je confirme</button>
                       <button type="button" class="btn btn-secondary" data-avis="0"><i class="bi bi-hand-thumbs-down" aria-hidden="true"></i>Je conteste</button>
                   </div>
               </div>`;
        const boutons = [...zone.querySelectorAll('[data-avis]')];
        boutons.forEach(b => b.addEventListener('click', async () => {
            // Both choices lock while the vote is in flight: one tap, one request
            boutons.forEach(x => { x.disabled = true; });
            const ok = await donnerAvis(s.id, b.dataset.avis === '1', b);
            if (!ok && b.isConnected) boutons.forEach(x => { x.disabled = false; });
        }));
    }
}

async function partager(s) {
    const lien = new URL(`app.html#carte?signalement=${s.id}`, location.href).href;
    const type = TYPES_OBSTRUCTION[s.type_obstruction]?.libelle || 'Obstruction';
    const texte = `${type} signalé à ${lieuSignalement(s)} sur Debrisat`;
    try {
        if (navigator.share) await navigator.share({ title: 'Debrisat', text: texte, url: lien });
        else {
            await navigator.clipboard.writeText(lien);
            succes('Lien copié', 'Collez-le dans un message pour le partager.');
        }
    } catch (err) {
        if (err.name !== 'AbortError') erreur('Partage impossible', 'Copiez le lien depuis la barre d\'adresse.');
    }
}

async function donnerAvis(id, confirme, bouton) {
    if (!estConnecte()) {
        info('Connexion nécessaire', 'Connectez-vous pour vérifier les signalements.');
        location.href = 'auth.html?retour=' + encodeURIComponent(`app.html#carte?signalement=${id}`);
        return;
    }
    bouton?.classList.add('btn-chargement');
    const statutAvant = couche.donnees.get(id)?.statut;
    try {
        const maj = await verifierSignalement(id, confirme, utilisateurCourant().id);
        integrer(maj);
        celebrerPoints(POINTS.verification);
        const change = maj.statut !== statutAvant;
        succes(confirme ? 'Confirmation enregistrée' : 'Contestation enregistrée',
            change && maj.statut === 'verifie' ? `Le signalement est désormais vérifié par la communauté. Vous gagnez ${POINTS.verification} points.`
                : change && maj.statut === 'rejete' ? `Le signalement a été rejeté par la communauté. Vous gagnez ${POINTS.verification} points.`
                    : `Vous gagnez ${POINTS.verification} points.`);
        if (feuilles.detail.ouverte) rendreDetail(couche.donnees.get(id));
        rafraichirProfil();
        return true;
    } catch (err) {
        erreur("Votre avis n'a pas été enregistré", err.message);
        return false;
    } finally {
        bouton?.classList.remove('btn-chargement');
    }
}

// ============ Alertes ============
const CLE_ALERTES_VUES = 'debrisat-alertes-vues';
let alertes = [];

async function chargerAlertes() {
    try {
        alertes = await listerAlertes(20);
        const derniereVue = lireStockage(CLE_ALERTES_VUES, '');
        $('#pastilleAlertes').hidden = !alertes.some(a => a.created_at > derniereVue);
        if (alertes[0] && alertes[0].type_alerte === 'critique' && alertes[0].created_at > derniereVue) {
            toast({ type: 'error', icone: 'bi-exclamation-octagon', titre: alertes[0].titre, message: alertes[0].message, duree: 9000 });
        }
    } catch { /* la pastille reste masquee */ }
}

$('#btnAlertes').addEventListener('click', () => {
    const icones = { critique: 'bi-exclamation-octagon', danger: 'bi-exclamation-triangle', attention: 'bi-exclamation-triangle', info: 'bi-info-circle' };
    $('#listeAlertes').innerHTML = alertes.length
        ? alertes.map(a => `
            <article class="alerte-item alerte-${a.type_alerte}">
                <i class="bi ${icones[a.type_alerte] || 'bi-bell'}" aria-hidden="true" style="color:var(--couleur);font-size:1.25rem"></i>
                <div class="flex-1">
                    <h3>${echapper(a.titre)}</h3>
                    <p>${echapper(a.message)}</p>
                    <p class="quand"><i class="bi bi-clock" aria-hidden="true"></i>${echapper(formatRelatif(a.created_at))}</p>
                </div>
            </article>`).join('')
        : '<div class="etat-vide"><i class="bi bi-bell" aria-hidden="true"></i><p>Aucune alerte pour le moment.</p></div>';
    feuilles.alertes.ouvrir();
    if (alertes[0]) ecrireStockage(CLE_ALERTES_VUES, alertes[0].created_at);
    $('#pastilleAlertes').hidden = true;
});

// ============ Recherche ============
const champ = $('#champRecherche');
const panneauResultats = $('#resultatsRecherche');
let resultats = [];
let indexActif = -1;

function afficherResultats(locaux, distants = [], chargement = false) {
    resultats = [...locaux, ...distants];
    indexActif = -1;
    const vide = !resultats.length && !chargement;
    panneauResultats.hidden = !champ.value.trim();
    champ.setAttribute('aria-expanded', String(!panneauResultats.hidden));
    const ligne = (r, i) => `
        <button type="button" class="resultat" role="option" id="resultat-${i}" data-index="${i}" aria-selected="false">
            <i class="bi ${r.icone}" aria-hidden="true"></i>
            <span class="flex-1"><span class="principal tronque" style="display:block">${echapper(r.nom)}</span><span class="secondaire">${echapper(r.detail)}</span></span>
        </button>`;
    panneauResultats.innerHTML = `
        ${locaux.length ? `<p class="eyebrow resultats-titre">Dans Debrisat</p>${locaux.map(ligne).join('')}` : ''}
        ${distants.length ? `<p class="eyebrow resultats-titre">Lieux</p>${distants.map((r, i) => ligne(r, i + locaux.length)).join('')}` : ''}
        ${chargement ? '<div class="rangee" style="padding:12px"><span class="spinner spinner-sm"></span><span class="texte-sm texte-secondaire">Recherche des lieux…</span></div>' : ''}
        ${vide ? '<p class="texte-sm texte-secondaire" style="padding:12px">Aucun résultat dans la région de Dakar.</p>' : ''}`;
}

function rechercheLocale(q) {
    const n = q.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const norm = t => (t || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const lieux = new Map();
    for (const s of etat.signalements) {
        for (const [nom, niveau] of [[s.quartier, 'quartier'], [s.commune, 'commune']]) {
            if (!nom || !norm(nom).includes(n)) continue;
            const cle = `${niveau}:${nom}`;
            const l = lieux.get(cle) || { nom, niveau, commune: s.commune, n: 0, lat: 0, lng: 0 };
            l.n++; l.lat += s.lat; l.lng += s.lng;
            lieux.set(cle, l);
        }
    }
    return [...lieux.values()].sort((a, b) => b.n - a.n).slice(0, 5).map(l => ({
        nom: l.nom,
        detail: `${l.niveau === 'quartier' ? l.commune + ' · ' : ''}${l.n} signalement${l.n > 1 ? 's' : ''}`,
        icone: l.niveau === 'commune' ? 'bi-building' : 'bi-geo-alt',
        lat: l.lat / l.n, lng: l.lng / l.n, zoom: l.niveau === 'commune' ? 14 : 15
    }));
}

const rechercheDistante = debounce(async q => {
    try {
        const lieux = await rechercherLieu(q);
        if (champ.value.trim() !== q) return;
        afficherResultats(rechercheLocale(q), lieux.map(l => ({ ...l, icone: 'bi-pin-map', zoom: 16 })));
    } catch {
        if (champ.value.trim() === q) afficherResultats(rechercheLocale(q));
    }
}, 700);

champ.addEventListener('input', () => {
    const q = champ.value.trim();
    if (!q) { afficherResultats([]); return; }
    const locaux = rechercheLocale(q);
    afficherResultats(locaux, [], q.length >= 3);
    if (q.length >= 3) rechercheDistante(q);
});

function choisirResultat(i) {
    const r = resultats[i];
    if (!r) return;
    carte.flyTo([r.lat, r.lng], r.zoom || 15, { duration: 0.9 });
    champ.value = r.nom;
    panneauResultats.hidden = true;
    champ.setAttribute('aria-expanded', 'false');
    champ.blur();
}

panneauResultats.addEventListener('click', e => {
    const b = e.target.closest('.resultat');
    if (b) choisirResultat(Number(b.dataset.index));
});
champ.addEventListener('keydown', e => {
    const boutons = $$('.resultat', panneauResultats);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!boutons.length) return;
        indexActif = (indexActif + (e.key === 'ArrowDown' ? 1 : -1) + boutons.length) % boutons.length;
        boutons.forEach((b, i) => b.setAttribute('aria-selected', String(i === indexActif)));
        champ.setAttribute('aria-activedescendant', boutons[indexActif].id);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        choisirResultat(indexActif >= 0 ? indexActif : 0);
    } else if (e.key === 'Escape') {
        panneauResultats.hidden = true;
        champ.setAttribute('aria-expanded', 'false');
    }
});
document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.recherche, .resultats-recherche')) {
        panneauResultats.hidden = true;
        champ.setAttribute('aria-expanded', 'false');
    }
});

// ============ Donnees et temps reel ============
function integrer(s) {
    const i = etat.signalements.findIndex(x => x.id === s.id);
    if (i >= 0) etat.signalements[i] = { ...etat.signalements[i], ...s };
    else etat.signalements.unshift(s);
    couche.mettreAJour(s);
    appliquerFiltres();
}

function majAvatar() {
    const profil = profilCourant();
    const avatar = $('#avatarUtilisateur');
    const btnMenu = $('#btnMenuUtilisateur');
    if (estConnecte() && profil) {
        avatar.textContent = initiales(profil.nom_complet);
        btnMenu.setAttribute('aria-label', `Mon profil, ${profil.nom_complet}, ${profil.points_total} points`);
        $('#menuNomUtilisateur').textContent = profil.nom_complet;
        $('#menuMetaUtilisateur').textContent = `${profil.points_total} pts · ${profil.commune || ''}`;
        const autorite = ['agent_municipal', 'admin'].includes(profil.role);
        $('#menuTableau').hidden = !autorite;
    } else {
        avatar.innerHTML = '<i class="bi bi-person-circle" aria-hidden="true"></i>';
        btnMenu.setAttribute('aria-label', 'Se connecter');
        $('#menuNomUtilisateur').textContent = '';
        $('#menuMetaUtilisateur').textContent = '';
    }
}

function basculerMenuUtilisateur() {
    const dropdown = $('#dropdownUtilisateur');
    const btn = $('#btnMenuUtilisateur');
    if (!estConnecte()) {
        location.href = 'auth.html?retour=app.html';
        return;
    }
    const ouvert = !dropdown.hidden;
    dropdown.hidden = ouvert;
    btn.setAttribute('aria-expanded', String(!ouvert));
}

$('#btnMenuUtilisateur').addEventListener('click', basculerMenuUtilisateur);
$('#menuUtilisateur').addEventListener('keydown', e => {
    if (e.key !== 'Escape' || $('#dropdownUtilisateur').hidden) return;
    $('#dropdownUtilisateur').hidden = true;
    $('#btnMenuUtilisateur').setAttribute('aria-expanded', 'false');
    $('#btnMenuUtilisateur').focus();
});
document.addEventListener('click', e => {
    const menu = $('#menuUtilisateur');
    if (!menu.contains(e.target)) {
        $('#dropdownUtilisateur').hidden = true;
        $('#btnMenuUtilisateur').setAttribute('aria-expanded', 'false');
    }
});

const pretAuth = garderPage().then(() => {
    majAvatar();
    surChangementAuth(majAvatar);
    // Message de bienvenue apres connexion (une seule fois par session)
    try {
        if (estConnecte() && profilCourant() && !sessionStorage.getItem('debrisat-bienvenue')) {
            sessionStorage.setItem('debrisat-bienvenue', '1');
            const prenom = (profilCourant().nom_complet || '').split(' ')[0];
            if (prenom) succes(`Bienvenue, ${prenom}`, 'Bonne contribution sur Debrisat.', { duree: 3000 });
        }
    } catch { /* stockage indisponible */ }
});

async function demarrer() {
    $('#chipDemo').hidden = !MODE_DEMO;
    initFiltres();
    squelettesListe();
    routeur.demarrer();

    try {
        const [signalements, zones] = await Promise.all([listerSignalements(), listerZones()]);
        etat.signalements = signalements;
        couche.definir(signalements);
        const actifs = signalements.filter(s => s.statut !== 'rejete' && s.lat != null);
        if (actifs.length && !routeur.parametres.get('signalement')) {
            carte.fitBounds(L.latLngBounds(actifs.map(s => [s.lat, s.lng])), {
                paddingTopLeft: [24, 110], paddingBottomRight: [24, 120], maxZoom: 14, animate: false
            });
        }
        coucheZones = creerCoucheZones(zones, {
            surClic: z => info(z.nom, `Score de risque ${Math.round(z.score_risque)}/100 · ${z.nombre_signalements_actifs} signalement${z.nombre_signalements_actifs > 1 ? 's' : ''} actif${z.nombre_signalements_actifs > 1 ? 's' : ''}`, { icone: 'bi-shield-exclamation', duree: 4000 })
        });
        if ($('#btnZones').getAttribute('aria-pressed') === 'true') coucheZones.addTo(carte);
        coucheZones.bringToBack?.();
        appliquerFiltres();
        const id = routeur.parametres.get('signalement');
        if (id) ouvrirDetail(id);
    } catch (err) {
        erreur('Chargement impossible', err.message);
        $('#nbVisibles').textContent = '0';
    }

    chargerAlertes();
    await pretAuth;

    // Position silencieuse seulement si l'autorisation est deja accordee : pas de demande au chargement
    try {
        const permission = await navigator.permissions?.query({ name: 'geolocation' });
        if (permission?.state === 'granted') definirPosition(await obtenirPosition({ precision: false }));
    } catch { /* API Permissions absente */ }

    suivreSignalements({
        surNouveau: s => {
            const nouveau = !couche.donnees.has(s.id);
            integrer(s);
            if (!nouveau || s.user_id === utilisateurCourant()?.id) return;
            if (!signalerSiProche(s, etat.position, utilisateurCourant()?.id)) {
                const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
                toast({ type: 'info', icone: type.icone, titre: 'Nouveau signalement', message: `${type.libelle} · ${lieuSignalement(s)}`, duree: 4500 });
            }
            celebrer($('.resume-carte'));
        },
        surMiseAJour: integrer
    });

    if (estConnecte()) synchroniserAuRetour(envoyerDepuisFile);
}

demarrer();
