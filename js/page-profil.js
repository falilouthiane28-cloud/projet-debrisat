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

surInstallationPossible(possible => { $('#ligneInstallation').hidden = !possible; });
$('#btnInstaller').addEventListener('click', installer);

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
async function rendre() {
    const contenu = $('#contenu');
    if (!estConnecte()) {
        $$('#contenu > section').forEach(s => { if (!['blocDeconnecte'].includes(s.id) && !s.querySelector('#choixTheme')) s.hidden = true; });
        $('#blocDeconnecte').hidden = false;
        contenu.setAttribute('aria-busy', 'false');
        return;
    }
    const profil = profilCourant();
    const moi = utilisateurCourant();
    if (!profil) {
        erreur('Profil introuvable', 'Votre compte existe mais son profil n\'a pas été créé. Contactez un administrateur.');
        return;
    }
    $('#lienTableau').hidden = !estAutorite();
    $('#lienTableau').href = accueilRole();
    $('#blocCodeAgent').hidden = profil.role !== 'citoyen' || MODE_DEMO;
    $('#blocCompte').hidden = false;
    $('#blocDemo').hidden = !MODE_DEMO;

    $('#avatarProfil').textContent = initiales(profil.nom_complet);
    $('#nomProfil').textContent = profil.nom_complet;
    $('#metaProfil').innerHTML = `
        ${profil.commune ? `<span class="rangee" style="gap:4px"><i class="bi bi-building" aria-hidden="true"></i>${echapper(profil.commune)}</span>` : ''}
        <span class="badge badge-neutral">${echapper(ROLES[profil.role] || profil.role)}</span>
        ${MODE_DEMO ? '<span class="badge badge-demo">Mode démo</span>' : ''}
        <span class="texte-muet">Membre depuis ${echapper(formatDate(profil.created_at))}</span>`;

    const [badges, mesSignalements, historique, rang] = await Promise.all([
        listerBadges(), signalementsDe(moi.id), historiquePoints(moi.id), rangUtilisateur(profil.points_total)
    ]);

    compterJusqua($('#statPoints'), profil.points_total, { duree: 1200 });
    compterJusqua($('#statSignalements'), profil.nombre_signalements || mesSignalements.length, { duree: 1000 });
    compterJusqua($('#statVerifications'), profil.nombre_verifications ?? historique.filter(h => h.raison === 'verification').length, { duree: 1000 });
    $('#statRang').textContent = `#${rang}`;

    const prochain = prochainBadge(profil, badges);
    const bloc = $('#blocProchainBadge');
    bloc.hidden = !prochain;
    if (prochain) {
        const ratio = Math.min(1, prochain.actuel / prochain.objectif);
        $('#titreProchain').textContent = prochain.badge.nom;
        $('#iconeProchain').innerHTML = `<i class="bi ${echapper(prochain.badge.icone)}" aria-hidden="true"></i>`;
        $('#ratioProchain').textContent = `${prochain.actuel} / ${prochain.objectif}`;
        const jauge = $('#jaugeProchain');
        jauge.setAttribute('aria-valuemax', prochain.objectif);
        jauge.setAttribute('aria-valuenow', prochain.actuel);
        requestAnimationFrame(() => jauge.style.setProperty('--ratio', ratio));
        const reste = prochain.objectif - prochain.actuel;
        $('#resteProchain').textContent = `Encore ${reste} ${prochain.unite} pour débloquer « ${prochain.badge.nom} ».`;
    }

    $('#grilleBadges').innerHTML = htmlBadges(badges, profil);

    $('#mesSignalements').innerHTML = mesSignalements.length
        ? mesSignalements.map(s => {
            const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
            return `<a class="card-signalement" href="app.html#carte?signalement=${s.id}">
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

    $('#historiquePoints').innerHTML = historique.length
        ? historique.map(h => `
            <li>
                <span class="icone-ronde"><i class="bi ${{ signalement: 'bi-exclamation-triangle', verification: 'bi-check-circle', signalement_verifie: 'bi-patch-check', signalement_resolu: 'bi-check-lg', badge: 'bi-award' }[h.raison] || 'bi-star'}" aria-hidden="true"></i></span>
                <span class="flex-1"><span style="display:block;color:var(--color-heading)">${echapper(RAISONS_POINTS[h.raison] || h.raison)}</span><span class="texte-xs texte-muet">${echapper(formatRelatif(h.created_at))}</span></span>
                <span class="points">+${formatNombre(h.points)}</span>
            </li>`).join('')
        : '<li class="etat-vide" style="border:none"><i class="bi bi-star" aria-hidden="true"></i><p>Vos points apparaîtront ici.</p></li>';

    $('#champNomProfil').value = profil.nom_complet || '';
    $('#champCommuneProfil').innerHTML = COMMUNES.map(c => `<option value="${echapper(c)}"${c === profil.commune ? ' selected' : ''}>${echapper(c)}</option>`).join('');
    $('#champTelProfil').value = profil.telephone || '';
    contenu.setAttribute('aria-busy', 'false');
}

$('#formProfil').addEventListener('submit', async e => {
    e.preventDefault();
    const nom = $('#champNomProfil').value.trim();
    const tel = $('#champTelProfil').value.replace(/[\s.-]/g, '');
    if (nom.length < 2) { erreur('Nom trop court', 'Indiquez votre nom complet.'); $('#champNomProfil').focus(); return; }
    if (tel && !/^\+?\d{9,15}$/.test(tel)) { erreur('Téléphone invalide', 'Exemple : +221 77 123 45 67'); $('#champTelProfil').focus(); return; }
    const bouton = $('#btnEnregistrerProfil');
    bouton.classList.add('btn-chargement');
    try {
        await mettreAJourProfil(utilisateurCourant().id, { nom_complet: nom, commune: $('#champCommuneProfil').value, telephone: tel || null });
        await rafraichirProfil();
        await rendre();
        succes('Profil enregistré');
    } catch (err) {
        erreur("Le profil n'a pas été enregistré", err.message);
    } finally {
        bouton.classList.remove('btn-chargement');
    }
});

$('#btnReinitDemo').addEventListener('click', () => {
    reinitialiserDemo();
    succes('Données de démo réinitialisées');
    setTimeout(() => location.reload(), 600);
});

garderPage().then(ok => { if (ok) return rendre(); }).catch(err => erreur('Chargement impossible', err.message));

$('#formCodeAgent').addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('#champCodeAgent').value.trim();
    if (!/^AGT-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) {
        erreur('Code invalide', 'Le code a la forme AGT-XXXX-XXXX.');
        return;
    }
    const bouton = $('#btnCodeAgent');
    bouton.disabled = true;
    try {
        const commune = await activerCodeAcces(code);
        succes('Compte agent activé', `Vous êtes rattaché à ${commune}.`);
        setTimeout(() => location.assign('dashboard.html'), 1200);
    } catch (err) {
        erreur('Activation impossible', err.message);
        bouton.disabled = false;
    }
});
