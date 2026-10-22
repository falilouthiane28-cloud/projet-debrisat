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
const CLE_INSCRIPTION_AGENT = 'debrisat-inscription-agent';
// Generic entry pages: landing there after login would hide the agent/admin space, so the role home wins
const ENTREES_GENERIQUES = ['', 'index.html', 'app.html', 'auth.html'];

// Each role lands on its own interface; a deep link (#signaler, a report, the profile...) is kept
function destinationRetour() {
    try {
        if (sessionStorage.getItem(CLE_INSCRIPTION_AGENT)) {
            sessionStorage.removeItem(CLE_INSCRIPTION_AGENT);
            if (accueilRole() === 'app.html') return 'profil.html?code=agent';
        }
    } catch { /* stockage indisponible */ }
    const brut = new URLSearchParams(location.search).get('retour');
    if (!brut || /^[a-z]+:|^\/\//i.test(brut)) return accueilRole();
    const [page] = brut.split(/[?#]/);
    if (!PAGES_RETOUR.includes(page)) return accueilRole();
    const lienProfond = brut !== page;
    if (ENTREES_GENERIQUES.includes(page) && !lienProfond) return accueilRole();
    return brut;
}

const roleChoisi = () => $('input[name="typeCompte"]:checked')?.value || 'citoyen';

// Errors Supabase puts in the URL after an OAuth return (query or fragment); without this the failure is silent
function erreurRetourOAuth() {
    const p = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const code = p.get('error') || h.get('error');
    if (!code) return null;
    const detail = `${p.get('error_description') || h.get('error_description') || ''} ${p.get('error_code') || h.get('error_code') || ''}`;
    history.replaceState(null, '', location.pathname + (p.get('retour') ? `?retour=${encodeURIComponent(p.get('retour'))}` : ''));
    if (code === 'access_denied') return 'Connexion Google annulée. Vous pouvez réessayer ou utiliser votre e-mail.';
    if (/exchange external code|server_error/i.test(`${code} ${detail}`)) {
        return "La connexion avec Google n'a pas abouti à cause d'un réglage du service. Connectez-vous avec votre e-mail en attendant, ou réessayez plus tard.";
    }
    if (/Database error|signup/i.test(detail)) return "Votre compte n'a pas pu être créé. Les inscriptions sont peut-être fermées : contactez un administrateur.";
    return "La connexion avec Google a échoué. Réessayez, ou connectez-vous avec votre e-mail.";
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
    majTypeCompte();
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
    champCode: v => (mode === 'inscription' && roleChoisi() === 'agent_municipal' && !/^AGT-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(v) ? "Saisissez le code d'accès remis par votre administrateur (format AGT-XXXX-XXXX)." : ''),
    champConditions: () => (mode === 'inscription' && !$('#champConditions').checked ? "Acceptez les conditions d'utilisation pour continuer." : '')
};

// Le choix « Agent municipal » demande un code ; le role reel est decide cote serveur a partir de ce code
function majTypeCompte() {
    const inscrire = mode === 'inscription';
    const agent = inscrire && roleChoisi() === 'agent_municipal';
    $('#groupeCode').hidden = !agent;
    $('#aideGoogleAgent').hidden = !agent;
    $('#libelleGoogle').textContent = inscrire ? "S'inscrire avec Google" : 'Continuer avec Google';
    if (!agent) erreurChamp('champCode', '');
}
$$('input[name="typeCompte"]').forEach(r => r.addEventListener('change', majTypeCompte));

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
                codeAcces: roleChoisi() === 'agent_municipal' ? $('#champCode').value.trim().toUpperCase() : null
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
    bouton.classList.add('btn-chargement');
    $('#erreurGenerale').innerHTML = '';
    try {
        if (mode === 'inscription' && roleChoisi() === 'agent_municipal') sessionStorage.setItem(CLE_INSCRIPTION_AGENT, '1');
        else sessionStorage.removeItem(CLE_INSCRIPTION_AGENT);
    } catch { /* stockage indisponible */ }
    try {
        await connexionGoogle();
        if (MODE_DEMO) location.replace(destinationRetour());
    } catch (err) {
        $('#erreurGenerale').innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${echapper(err.message)}`;
        bouton.disabled = false;
        bouton.classList.remove('btn-chargement');
    }
});

const erreurOAuth = erreurRetourOAuth();
if (erreurOAuth) {
    $('#erreurGenerale').innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${echapper(erreurOAuth)}`;
    $('#champEmail').focus();
}
