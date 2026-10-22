import { MODE_DEMO, COMMUNES } from './config.js';
import { $, $$, echapper } from './utils.js';
import { initTheme } from './theme.js';
import { initPwa } from './pwa.js';
import { initRetourTactile } from './animations.js';
import { initAuth, estConnecte, surChangementAuth, CLE_MESSAGE_DECONNEXION, accueilRole, connexion, connexionGoogle, inscription, reinitialiserMotDePasse, entrerEnDemo, surRecuperationMotDePasse, changerMotDePasse } from './auth.js';
import { succes, info } from './notifications.js';

initTheme();
initPwa();
initRetourTactile();

// Seules les pages de l'application sont acceptees comme destination de retour (pas de redirection ouverte)
const PAGES_RETOUR = ['app.html', 'profil.html', 'dashboard.html', 'admin.html', 'index.html'];
// Sans page de retour, chaque role arrive sur son interface (la page cible verifie de toute facon le role)
function destinationRetour() {
    const brut = new URLSearchParams(location.search).get('retour');
    if (!brut) return accueilRole();
    const page = brut.split(/[?#]/)[0];
    return PAGES_RETOUR.includes(page) && !/^[a-z]+:|^\/\//i.test(brut) ? brut : accueilRole();
}

let mode = 'connexion';
const form = $('#formulaire');
const btnValider = $('#btnValider');

$('#champCommune').insertAdjacentHTML('beforeend', COMMUNES.map(c => `<option value="${echapper(c)}">${echapper(c)}</option>`).join(''));

function definirMode(nouveau) {
    mode = nouveau;
    const inscrire = mode === 'inscription';
    for (const onglet of $$('[role="tab"]')) {
        const actif = onglet.dataset.mode === mode;
        onglet.setAttribute('aria-selected', String(actif));
        onglet.tabIndex = actif ? 0 : -1;
    }
    form.setAttribute('aria-labelledby', inscrire ? 'ongletInscription' : 'ongletConnexion');
    $$('[data-champ="inscription"]').forEach(el => { el.hidden = !inscrire; });
    $$('[data-champ="connexion"]').forEach(el => { el.hidden = inscrire; });
    $('#groupeCode').hidden = !inscrire || $('#champRole').value !== 'agent_municipal';
    $('#champMotDePasse').autocomplete = inscrire ? 'new-password' : 'current-password';
    $('#titreAuth').textContent = inscrire ? 'Rejoindre Debrisat' : 'Bon retour parmi nous';
    $('#sousTitreAuth').textContent = inscrire
        ? 'Créez votre compte en une minute et gagnez des points pour chaque signalement utile.'
        : 'Connectez-vous pour signaler et vérifier les obstructions de votre quartier.';
    btnValider.textContent = inscrire ? 'Créer mon compte' : 'Se connecter';
    document.title = `${inscrire ? 'Inscription' : 'Connexion'} · Debrisat`;
    effacerErreurs();
}

$$('[role="tab"]').forEach(onglet => onglet.addEventListener('click', () => definirMode(onglet.dataset.mode)));
$('.onglets').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const suivant = mode === 'connexion' ? 'inscription' : 'connexion';
    definirMode(suivant);
    $(`[data-mode="${suivant}"]`).focus();
});

$('#btnVoirMotDePasse').addEventListener('click', e => {
    const champ = $('#champMotDePasse');
    const visible = champ.type === 'password';
    champ.type = visible ? 'text' : 'password';
    e.currentTarget.setAttribute('aria-pressed', String(visible));
    e.currentTarget.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    e.currentTarget.innerHTML = `<i class="bi ${visible ? 'bi-eye-slash' : 'bi-eye'}" aria-hidden="true"></i>`;
});

// ============ Validation en ligne ============
function erreurChamp(id, message) {
    const champ = $(`#${id}`);
    const zone = $(`#erreur${id.replace('champ', '')}`);
    champ.setAttribute('aria-invalid', message ? 'true' : 'false');
    zone.innerHTML = message ? `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${echapper(message)}` : '';
    return !message;
}

function effacerErreurs() {
    $$('.form-error', form).forEach(z => { z.innerHTML = ''; });
    $$('[aria-invalid]', form).forEach(c => c.removeAttribute('aria-invalid'));
}

const REGLES = {
    champEmail: v => (!v ? 'Indiquez votre adresse e-mail.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Cette adresse e-mail n'est pas valide." : ''),
    champMotDePasse: v => (!v ? 'Indiquez votre mot de passe.' : mode !== 'connexion' && v.length < 8 ? 'Le mot de passe doit contenir au moins 8 caractères.' : ''),
    champNom: v => (mode === 'inscription' && v.trim().length < 2 ? 'Indiquez votre nom complet.' : ''),
    champCommune: v => (mode === 'inscription' && !v ? 'Choisissez votre commune.' : ''),
    champTelephone: v => (v && !/^\+?[\d\s.-]{9,16}$/.test(v) ? 'Numéro invalide. Exemple : +221 77 123 45 67' : ''),
    champCode: v => (mode === 'inscription' && $('#champRole').value === 'agent_municipal' && !/^AGT-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(v) ? "Saisissez le code d'accès remis par votre administrateur (format AGT-XXXX-XXXX)." : ''),
    champConditions: () => (mode === 'inscription' && !$('#champConditions').checked ? "Acceptez les conditions d'utilisation pour continuer." : '')
};

// Le choix « Agent municipal » demande un code ; le role reel est decide cote serveur a partir de ce code
$('#champRole').addEventListener('change', () => {
    const agent = $('#champRole').value === 'agent_municipal';
    $('#groupeCode').hidden = !agent;
    if (!agent) erreurChamp('champCode', '');
});

// Force du mot de passe sur quatre segments, a l'inscription seulement
function forceMotDePasse(v) {
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
    return v ? Math.max(1, score) : 0;
}
const LIBELLES_FORCE = ['', 'Faible', 'Moyen', 'Bon', 'Excellent'];
$('#champMotDePasse').addEventListener('input', () => {
    const score = forceMotDePasse($('#champMotDePasse').value);
    $('#jaugeForce').dataset.score = score;
    $('#libelleForce').textContent = score ? `Robustesse : ${LIBELLES_FORCE[score]}` : '';
});

function valider(id) {
    const champ = $(`#${id}`);
    return erreurChamp(id, REGLES[id](champ.value.trim()));
}

for (const id of Object.keys(REGLES)) {
    const champ = $(`#${id}`);
    champ.addEventListener('blur', () => { if (champ.value) valider(id); });
    champ.addEventListener('input', () => { if (champ.getAttribute('aria-invalid') === 'true') valider(id); });
}

form.addEventListener('submit', async e => {
    e.preventDefault();
    $('#erreurGenerale').innerHTML = '';
    // Ordre visuel du formulaire, pour placer le focus sur la premiere erreur rencontree
    const champs = $$('input, select', form).map(c => c.id).filter(id => REGLES[id] && !$(`#${id}`).closest('[hidden]'));
    if (mode === 'inscription' && !champs.includes('champConditions')) champs.push('champConditions');
    const resultats = champs.map(valider);
    if (resultats.includes(false)) {
        $(`#${champs[resultats.indexOf(false)]}`).focus();
        return;
    }
    btnValider.classList.add('btn-chargement');
    btnValider.disabled = true;
    try {
        const email = $('#champEmail').value.trim();
        const motDePasse = $('#champMotDePasse').value;
        if (mode === 'nouveau') {
            await changerMotDePasse(motDePasse);
            succes('Mot de passe modifié', 'Vous êtes connecté avec votre nouveau mot de passe.');
            location.replace('app.html');
        } else if (mode === 'connexion') {
            await connexion(email, motDePasse);
            location.replace(destinationRetour());
        } else {
            const { confirmationRequise } = await inscription({
                email, motDePasse,
                nomComplet: $('#champNom').value.trim(),
                commune: $('#champCommune').value,
                telephone: $('#champTelephone').value.replace(/[\s.-]/g, ''),
                codeAcces: $('#champRole').value === 'agent_municipal' ? $('#champCode').value.trim().toUpperCase() : null
            });
            if (confirmationRequise) {
                succes('Compte créé', `Un lien de confirmation a été envoyé à ${email}. Ouvrez-le pour activer votre compte.`, { duree: 10000 });
                definirMode('connexion');
            } else {
                location.replace(destinationRetour());
            }
        }
    } catch (err) {
        $('#erreurGenerale').innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${echapper(err.message)}`;
    } finally {
        btnValider.classList.remove('btn-chargement');
        btnValider.disabled = false;
    }
});

$('#btnOubli').addEventListener('click', async () => {
    if (!valider('champEmail')) {
        $('#champEmail').focus();
        return;
    }
    try {
        await reinitialiserMotDePasse($('#champEmail').value.trim());
        info('Lien envoyé', MODE_DEMO ? 'En mode démo, aucun e-mail n\'est envoyé.' : 'Consultez votre boîte de réception pour choisir un nouveau mot de passe.');
    } catch (err) {
        $('#erreurGenerale').innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${echapper(err.message)}`;
    }
});

if (MODE_DEMO) {
    $('#bandeauDemo').hidden = false;
    $('#btnDemo').addEventListener('click', () => {
        entrerEnDemo();
        location.replace(destinationRetour());
    });
}

if (new URLSearchParams(location.search).get('mode') === 'inscription') definirMode('inscription');

try {
    if (sessionStorage.getItem(CLE_MESSAGE_DECONNEXION)) {
        sessionStorage.removeItem(CLE_MESSAGE_DECONNEXION);
        info('Vous êtes déconnecté', 'À bientôt sur Debrisat.', { duree: 4000 });
    }
    if (sessionStorage.getItem('debrisat-compte-desactive')) {
        sessionStorage.removeItem('debrisat-compte-desactive');
        $('#erreurGenerale').innerHTML = '<i class="bi bi-slash-circle" aria-hidden="true"></i>Ce compte a été désactivé. Contactez un administrateur.';
    }
} catch { /* stockage indisponible */ }

// Le fragment est lu avant que Supabase ne le consomme, pour ne pas rediriger un utilisateur en recuperation
let recuperation = false;
function modeRecuperation() {
    if (recuperation) return;
    recuperation = true;
    mode = 'nouveau';
    $('.onglets').hidden = true;
    $$('[data-champ]').forEach(el => { el.hidden = true; });
    $('#champEmail').closest('.form-group').hidden = true;
    $('#aideMotDePasse').hidden = false;
    $('#champMotDePasse').autocomplete = 'new-password';
    $('label[for="champMotDePasse"]').textContent = 'Nouveau mot de passe';
    $('#titreAuth').textContent = 'Choisir un nouveau mot de passe';
    $('#sousTitreAuth').textContent = 'Saisissez-le une fois : vous serez ensuite connecté automatiquement.';
    btnValider.textContent = 'Enregistrer le mot de passe';
    $('#champMotDePasse').focus();
}
if (/type=recovery/.test(location.hash)) modeRecuperation();
surRecuperationMotDePasse(modeRecuperation);

initAuth().then(() => {
    if (recuperation) return;
    // Deja connecte (hors mode demo, ou on laisse le choix de se reconnecter) : retour direct
    if (estConnecte() && !MODE_DEMO) {
        location.replace(destinationRetour());
        return;
    }
    // A sign-in finished elsewhere (other tab, OAuth return processed late) must also leave this page
    surChangementAuth(({ utilisateur }) => {
        if (utilisateur && !recuperation && !MODE_DEMO) location.replace(destinationRetour());
    });
});

$('#btnGoogle').addEventListener('click', async () => {
    const bouton = $('#btnGoogle');
    bouton.disabled = true;
    try {
        await connexionGoogle();
        if (MODE_DEMO) location.replace(destinationRetour());
    } catch (err) {
        $('#erreurGenerale').innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${echapper(err.message)}`;
        bouton.disabled = false;
    }
});
