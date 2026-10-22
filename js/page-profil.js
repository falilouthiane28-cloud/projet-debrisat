import { MODE_DEMO, COMMUNES, ROLES, TYPES_OBSTRUCTION } from './config.js';
import { $, $$, echapper, formatNombre, formatRelatif, formatDate, initiales, htmlVignette, htmlStatut, htmlSeverite, lieuSignalement } from './utils.js';
import { initTheme, preferenceTheme, definirTheme } from './theme.js';
import { LANGUES, langueCourante, definirLangue, initI18n } from './i18n.js';
import { initPwa, surInstallationPossible, installer } from './pwa.js';
import { initRetourTactile, compterJusqua } from './animations.js';
import { estConnecte, estAutorite, profilCourant, utilisateurCourant, rafraichirProfil, accueilRole, activerCodeAcces } from './auth.js';
import { garderPage } from './guard.js';
import { listerBadges, signalementsDe, historiquePoints, rangUtilisateur, mettreAJourProfil, reinitialiserDemo } from './donnees.js';
import { htmlBadges, prochainBadge, RAISONS_POINTS } from './gamification.js';
import { succes, erreur, info, permissionNotifications, demanderPermissionNotifications } from './notifications.js';

initTheme();
initI18n();
initPwa();
initRetourTactile();

// ============ Parametres (disponibles meme sans compte) ============
function majChoixTheme() {
    const p = preferenceTheme();
    $$('[data-theme-choix]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoix === p)));
}
$('#choixTheme').addEventListener('click', e => {
    const b = e.target.closest('[data-theme-choix]');
    if (!b) return;
    definirTheme(b.dataset.themeChoix);
    majChoixTheme();
});
document.addEventListener('theme-change', majChoixTheme);
majChoixTheme();

$('#choixLangue').innerHTML = Object.entries(LANGUES).map(([cle, nom]) => `<option value="${cle}"${cle === langueCourante() ? ' selected' : ''}>${echapper(nom)}</option>`).join('');
$('#choixLangue').addEventListener('change', async e => {
    await definirLangue(e.target.value);
    info('Langue modifiée', e.target.value === 'wo' ? 'Seuls les menus principaux sont traduits pour le moment.' : 'Interface en français.', { duree: 3500 });
});

function majNotifications() {
    const etat = permissionNotifications();
    const bouton = $('#btnNotifications');
    const textes = {
        granted: ['Activées', true, 'Vous serez prévenu des signalements à moins de 1 km.'],
        denied: ['Bloquées', true, 'Autorisez les notifications dans les réglages du navigateur.'],
        unsupported: ['Indisponible', true, "Ce navigateur ne gère pas les notifications."],
        default: ['Activer', false, 'Notification quand un signalement apparaît à moins de 1 km']
    };
    const [libelle, desactive, description] = textes[etat] || textes.default;
    bouton.innerHTML = `<i class="bi ${etat === 'granted' ? 'bi-bell-fill' : 'bi-bell'}" aria-hidden="true"></i>${libelle}`;
    bouton.disabled = desactive;
    $('#descNotifications').textContent = description;
}
$('#btnNotifications').addEventListener('click', async () => {
    await demanderPermissionNotifications();
    majNotifications();
});
majNotifications();

function majGroupeApplication() {
    $('#groupeApplication').hidden = $('#ligneInstallation').hidden && $('#blocDemo').hidden;
}
surInstallationPossible(possible => {
    $('#ligneInstallation').hidden = !possible;
    majGroupeApplication();
});
$('#btnInstaller').addEventListener('click', installer);

// ============ Panneaux depliables (edition du profil, code agent) ============
function basculerPanneau(bouton, ouvrir = bouton.getAttribute('aria-expanded') !== 'true') {
    const panneau = $(`#${bouton.getAttribute('aria-controls')}`);
    bouton.setAttribute('aria-expanded', String(ouvrir));
    panneau.hidden = !ouvrir;
    if (ouvrir) panneau.querySelector('input, select')?.focus();
}
$('#btnOuvrirEdition').addEventListener('click', e => basculerPanneau(e.currentTarget));
$('#btnOuvrirCode').addEventListener('click', e => basculerPanneau(e.currentTarget));
$('#btnAnnulerEdition').addEventListener('click', () => {
    remplirFormulaire(profilCourant());
    basculerPanneau($('#btnOuvrirEdition'), false);
    $('#btnOuvrirEdition').focus();
});
for (const [panneau, bouton] of [['#panneauEdition', '#btnOuvrirEdition'], ['#panneauCode', '#btnOuvrirCode']]) {
    $(panneau).addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        basculerPanneau($(bouton), false);
        $(bouton).focus();
    });
}

// ============ Validation en ligne ============
function erreurChamp(champ, zone, message) {
    $(champ).setAttribute('aria-invalid', message ? 'true' : 'false');
    $(zone).innerHTML = message ? `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${echapper(message)}` : '';
    return !message;
}
const REGLES_PROFIL = {
    '#champNomProfil': ['#erreurNomProfil', v => (v.trim().length < 2 ? 'Indiquez votre nom complet (au moins 2 caractères).' : '')],
    '#champTelProfil': ['#erreurTelProfil', v => {
        const tel = v.replace(/[\s.-]/g, '');
        return tel && !/^\+?\d{9,15}$/.test(tel) ? 'Numéro invalide. Exemple : +221 77 123 45 67' : '';
    }]
};
const validerChamp = id => erreurChamp(id, REGLES_PROFIL[id][0], REGLES_PROFIL[id][1]($(id).value));
for (const id of Object.keys(REGLES_PROFIL)) {
    $(id).addEventListener('blur', () => { if ($(id).value) validerChamp(id); });
    $(id).addEventListener('input', () => { if ($(id).getAttribute('aria-invalid') === 'true') validerChamp(id); });
}
const FORMAT_CODE = /^AGT-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
$('#champCodeAgent').addEventListener('input', () => {
    if ($('#champCodeAgent').getAttribute('aria-invalid') === 'true' && FORMAT_CODE.test($('#champCodeAgent').value.trim())) {
        erreurChamp('#champCodeAgent', '#erreurCodeAgent', '');
    }
});

// ============ Onglets d'activite ============
const onglets = [$('#ongletSignalements'), $('#ongletPoints')];
function choisirOnglet(onglet) {
    for (const o of onglets) {
        const actif = o === onglet;
        o.setAttribute('aria-selected', String(actif));
        o.tabIndex = actif ? 0 : -1;
        $(`#${o.getAttribute('aria-controls')}`).hidden = !actif;
    }
}
onglets.forEach(o => o.addEventListener('click', () => choisirOnglet(o)));
$('.onglets[role="tablist"]').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = onglets.indexOf(document.activeElement);
    if (i < 0) return;
    const suivant = onglets[(i + 1) % onglets.length];
    choisirOnglet(suivant);
    suivant.focus();
});

// ============ Profil ============
const ICONES_POINTS = { signalement: 'bi-exclamation-triangle', verification: 'bi-check-circle', signalement_verifie: 'bi-patch-check', signalement_resolu: 'bi-check-lg', badge: 'bi-award' };

function etatErreur(message) {
    return `<div class="etat-erreur" role="alert">
        <i class="bi bi-cloud-slash" aria-hidden="true"></i>
        <p>${echapper(message)}</p>
        <button type="button" class="btn btn-sm btn-secondary" data-action="recharger-profil"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i>Réessayer</button>
    </div>`;
}
document.addEventListener('click', e => {
    if (e.target.closest('[data-action="recharger-profil"]')) rendre();
});

function remplirFormulaire(profil) {
    if (!profil) return;
    $('#champNomProfil').value = profil.nom_complet || '';
    $('#champCommuneProfil').innerHTML = COMMUNES.map(c => `<option value="${echapper(c)}"${c === profil.commune ? ' selected' : ''}>${echapper(c)}</option>`).join('');
    $('#champTelProfil').value = profil.telephone || '';
    for (const id of Object.keys(REGLES_PROFIL)) erreurChamp(id, REGLES_PROFIL[id][0], '');
}

function rendreBadges(badges, profil) {
    const grille = $('#grilleBadges');
    grille.innerHTML = htmlBadges(badges, profil);
    // Etat lisible sans la couleur : une icone et un libelle pour chaque badge
    for (const carte of $$('.card-badge', grille)) {
        const condition = carte.querySelector('.condition');
        const obtenu = carte.classList.contains('obtenu');
        condition.insertAdjacentHTML('afterbegin', `<i class="bi ${obtenu ? 'bi-check-circle-fill' : 'bi-lock'}" aria-hidden="true"></i>`);
    }
    const nombre = $$('.card-badge.obtenu', grille).length;
    $('#compteBadges').textContent = badges.length ? `${nombre} sur ${badges.length} obtenu${nombre > 1 ? 's' : ''}` : '';
    grille.setAttribute('aria-busy', 'false');
}

function rendreSignalements(liste) {
    const conteneur = $('#mesSignalements');
    conteneur.innerHTML = liste.length
        ? liste.map(s => {
            const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
            return `<a class="card-signalement" href="app.html#carte?signalement=${encodeURIComponent(s.id)}">
                ${htmlVignette(s)}
                <span class="corps">
                    <span class="rangee-entre"><span class="titre tronque">${echapper(type.libelle)}</span>${htmlSeverite(s.severite)}</span>
                    <span class="meta tronque"><i class="bi bi-geo-alt" aria-hidden="true"></i> ${echapper(lieuSignalement(s))}</span>
                    <span class="ligne-meta">${htmlStatut(s.statut)}<span class="texte-xs texte-muet">${echapper(formatRelatif(s.created_at))} · ${s.nombre_confirmations} confirmation${s.nombre_confirmations > 1 ? 's' : ''}</span></span>
                </span>
            </a>`;
        }).join('')
        : `<div class="etat-vide card"><i class="bi bi-camera" aria-hidden="true"></i><p>Vous n'avez encore rien signalé. Votre premier signalement débloque le badge « Premier pas ».</p>
            <a class="btn btn-plein btn-sm" href="app.html#signaler"><i class="bi bi-plus-lg" aria-hidden="true"></i>Signaler une obstruction</a></div>`;
    conteneur.setAttribute('aria-busy', 'false');
}

function rendreHistorique(historique) {
    const liste = $('#historiquePoints');
    liste.innerHTML = historique.length
        ? historique.map(h => `
            <li>
                <span class="icone-ronde"><i class="bi ${ICONES_POINTS[h.raison] || 'bi-star'}" aria-hidden="true"></i></span>
                <span class="flex-1"><span style="display:block;color:var(--color-heading)">${echapper(RAISONS_POINTS[h.raison] || h.raison)}</span><span class="texte-xs texte-secondaire">${echapper(formatRelatif(h.created_at))}</span></span>
                <span class="points">+${formatNombre(h.points)}</span>
            </li>`).join('')
        : '<li class="etat-vide" style="border:none"><i class="bi bi-star" aria-hidden="true"></i><p>Vos points apparaîtront ici après votre premier signalement ou votre première vérification.</p></li>';
    liste.setAttribute('aria-busy', 'false');
}

async function rendre() {
    const contenu = $('#contenu');
    if (!estConnecte()) {
        $$('#contenu > section').forEach(s => { s.hidden = !s.hasAttribute('data-public'); });
        $('#blocDeconnecte').hidden = false;
        majGroupeApplication();
        contenu.setAttribute('aria-busy', 'false');
        return;
    }
    const profil = profilCourant();
    const moi = utilisateurCourant();
    if (!profil) {
        $('#blocIdentite').innerHTML = etatErreur("Votre compte existe mais son profil n'a pas pu être chargé. Réessayez, ou contactez un administrateur si le problème continue.");
        contenu.setAttribute('aria-busy', 'false');
        return;
    }
    $('#lienTableau').hidden = !estAutorite();
    $('#lienTableau').href = accueilRole();
    $('#blocCompte').hidden = false;
    $('#groupeSession').hidden = false;
    $('#blocCodeAgent').hidden = profil.role !== 'citoyen' || MODE_DEMO;
    $('#blocDemo').hidden = !MODE_DEMO;
    majGroupeApplication();

    $('#avatarProfil').textContent = initiales(profil.nom_complet);
    $('#nomProfil').textContent = profil.nom_complet;
    $('#metaProfil').innerHTML = `
        ${profil.commune ? `<span class="lieu"><i class="bi bi-geo-alt" aria-hidden="true"></i>${echapper(profil.commune)}</span>` : ''}
        <span class="badge badge-neutral">${echapper(ROLES[profil.role] || profil.role)}</span>
        ${MODE_DEMO ? '<span class="badge badge-demo">Mode démo</span>' : ''}
        <span>Membre depuis ${echapper(formatDate(profil.created_at))}</span>`;
    if ($('#panneauEdition').hidden) remplirFormulaire(profil);

    let donnees;
    try {
        donnees = await Promise.all([listerBadges(), signalementsDe(moi.id), historiquePoints(moi.id), rangUtilisateur(profil.points_total)]);
    } catch {
        const message = "Vos données n'ont pas pu être chargées. Vérifiez votre connexion puis réessayez.";
        $('#grilleBadges').innerHTML = etatErreur(message);
        $('#mesSignalements').innerHTML = etatErreur(message);
        $('#historiquePoints').innerHTML = `<li style="list-style:none">${etatErreur(message)}</li>`;
        for (const id of ['#grilleBadges', '#mesSignalements', '#historiquePoints']) $(id).setAttribute('aria-busy', 'false');
        $('#statPoints').textContent = formatNombre(profil.points_total);
        contenu.setAttribute('aria-busy', 'false');
        return;
    }
    const [badges, mesSignalements, historique, rang] = donnees;

    compterJusqua($('#statPoints'), profil.points_total, { duree: 1200 });
    compterJusqua($('#statSignalements'), profil.nombre_signalements || mesSignalements.length, { duree: 1000 });
    compterJusqua($('#statVerifications'), profil.nombre_verifications ?? historique.filter(h => h.raison === 'verification').length, { duree: 1000 });
    $('#statRang').textContent = `#${rang}`;

    const prochain = prochainBadge(profil, badges);
    $('#blocProchainBadge').hidden = !prochain;
    if (prochain) {
        const ratio = Math.min(1, prochain.actuel / prochain.objectif);
        const reste = Math.max(0, prochain.objectif - prochain.actuel);
        $('#titreProchain').textContent = prochain.badge.nom;
        $('#iconeProchain').innerHTML = `<i class="bi ${echapper(prochain.badge.icone)}" aria-hidden="true"></i>`;
        $('#ratioProchain').textContent = `${prochain.actuel} / ${prochain.objectif}`;
        const jauge = $('#jaugeProchain');
        jauge.setAttribute('aria-valuemax', prochain.objectif);
        jauge.setAttribute('aria-valuenow', prochain.actuel);
        requestAnimationFrame(() => jauge.style.setProperty('--ratio', ratio));
        $('#resteProchain').textContent = `Encore ${reste} ${prochain.unite} pour débloquer « ${prochain.badge.nom} ».`;
    }

    rendreBadges(badges, profil);
    rendreSignalements(mesSignalements);
    rendreHistorique(historique);
    contenu.setAttribute('aria-busy', 'false');
}

$('#formProfil').addEventListener('submit', async e => {
    e.preventDefault();
    const valides = Object.keys(REGLES_PROFIL).map(validerChamp);
    if (valides.includes(false)) {
        $(Object.keys(REGLES_PROFIL)[valides.indexOf(false)]).focus();
        return;
    }
    const bouton = $('#btnEnregistrerProfil');
    if (bouton.disabled) return;
    bouton.disabled = true;
    bouton.classList.add('btn-chargement');
    const tel = $('#champTelProfil').value.replace(/[\s.-]/g, '');
    try {
        await mettreAJourProfil(utilisateurCourant().id, { nom_complet: $('#champNomProfil').value.trim(), commune: $('#champCommuneProfil').value, telephone: tel || null });
        await rafraichirProfil();
        basculerPanneau($('#btnOuvrirEdition'), false);
        await rendre();
        succes('Profil enregistré', 'Vos informations sont à jour.');
        $('#btnOuvrirEdition').focus();
    } catch {
        erreur("Le profil n'a pas été enregistré", 'Vérifiez votre connexion puis réessayez dans un instant.');
    } finally {
        bouton.disabled = false;
        bouton.classList.remove('btn-chargement');
    }
});

$('#btnReinitDemo').addEventListener('click', () => {
    reinitialiserDemo();
    succes('Données de démo réinitialisées');
    setTimeout(() => location.reload(), 600);
});

garderPage().then(ok => { if (ok) return rendre(); }).catch(() => erreur('Chargement impossible', 'La page de profil n\'a pas pu se charger. Rechargez la page.'));

$('#formCodeAgent').addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('#champCodeAgent').value.trim().toUpperCase();
    if (!erreurChamp('#champCodeAgent', '#erreurCodeAgent', FORMAT_CODE.test(code) ? '' : "Le code d'accès a la forme AGT-XXXX-XXXX.")) {
        $('#champCodeAgent').focus();
        return;
    }
    const bouton = $('#btnCodeAgent');
    if (bouton.disabled) return;
    bouton.disabled = true;
    bouton.classList.add('btn-chargement');
    try {
        const commune = await activerCodeAcces(code);
        succes('Compte agent activé', `Vous êtes rattaché à ${commune}.`);
        setTimeout(() => location.assign('dashboard.html'), 1200);
    } catch (err) {
        erreurChamp('#champCodeAgent', '#erreurCodeAgent', err.message || "Ce code n'a pas pu être activé.");
        bouton.disabled = false;
        bouton.classList.remove('btn-chargement');
    }
});
