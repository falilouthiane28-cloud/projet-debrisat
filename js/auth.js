import { MODE_DEMO, supabase, ROLES_AUTORITE, ACCUEIL_ROLE, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { obtenirProfil, profilDemo } from './donnees.js';
import { lireStockage, ecrireStockage } from './utils.js';
import { ID_DEMO } from './demo.js';

const CLE_DECONNEXION_DEMO = 'debrisat-demo-deconnecte';
export const CLE_MESSAGE_DECONNEXION = 'debrisat-deconnecte';
const abonnes = new Set();
let utilisateur = null;
let profil = null;
let erreurProfil = false;
let pret = null;
let deconnexionEnCours = false;

export function initAuth() {
    if (pret) return pret;
    pret = (async () => {
        if (MODE_DEMO) {
            if (!lireStockage(CLE_DECONNEXION_DEMO, false)) definirDemo();
            return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        await definirSession(session);
        // auth-js runs this callback while holding its lock: awaiting any Supabase call here deadlocks the client
        supabase.auth.onAuthStateChange((evenement, nouvelleSession) => {
            if (evenement === 'INITIAL_SESSION') return;
            if (evenement === 'SIGNED_OUT' || !nouvelleSession) {
                utilisateur = null;
                profil = null;
                if (!deconnexionEnCours) notifier();
                return;
            }
            if (evenement === 'TOKEN_REFRESHED' && nouvelleSession.user?.id === utilisateur?.id) return;
            setTimeout(async () => {
                await definirSession(nouvelleSession);
                notifier();
            }, 0);
        });
    })();
    return pret;
}

function definirDemo() {
    utilisateur = { id: ID_DEMO, email: 'demo@debrisat.local' };
    profil = profilDemo();
}

async function definirSession(session) {
    utilisateur = session?.user || null;
    profil = null;
    erreurProfil = false;
    if (!utilisateur) return;
    try {
        profil = await obtenirProfil(utilisateur.id);
    } catch {
        profil = null;
        erreurProfil = true;
    }
    // Un compte desactive par un administrateur est deconnecte des son arrivee
    if (profil && profil.compte_actif === false) {
        try { sessionStorage.setItem('debrisat-compte-desactive', '1'); } catch { /* stockage indisponible */ }
        utilisateur = null;
        profil = null;
        await supabase.auth.signOut();
        return;
    }
    marquerConnexion(session);
}

// Date de derniere connexion, une fois par session (la date est posee cote serveur)
function marquerConnexion(session) {
    const cle = 'debrisat-connexion-' + (session.access_token || '').slice(-12);
    try {
        if (sessionStorage.getItem(cle)) return;
        sessionStorage.setItem(cle, '1');
    } catch { /* stockage indisponible */ }
    supabase.rpc('marquer_connexion').then(() => {}, () => {});
}

function notifier() {
    for (const rappel of abonnes) rappel({ utilisateur, profil });
}

export function surChangementAuth(rappel) {
    abonnes.add(rappel);
    return () => abonnes.delete(rappel);
}

export const utilisateurCourant = () => utilisateur;
export const profilCourant = () => profil;
export const profilIndisponible = () => !!utilisateur && erreurProfil;
export const estConnecte = () => !!utilisateur;
export const estAutorite = () => !!profil && ROLES_AUTORITE.includes(profil.role);
export const estAdmin = () => profil?.role === 'admin';
export const estAgent = () => profil?.role === 'agent_municipal';
// Page d'arrivee selon le role : application citoyenne, espace agent ou administration
export const accueilRole = () => ACCUEIL_ROLE[profil?.role] || 'app.html';

export async function rafraichirProfil() {
    if (!utilisateur) return null;
    profil = MODE_DEMO ? profilDemo() : await obtenirProfil(utilisateur.id);
    notifier();
    return profil;
}

export async function connexion(email, motDePasse) {
    if (MODE_DEMO) {
        entrerEnDemo();
        return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    if (!error) {
        await definirSession(data.session);
        notifier();
        if (!utilisateur) throw new Error('Ce compte a été désactivé. Contactez un administrateur.');
        return;
    }
    if (/Invalid login credentials/i.test(error.message)) throw new Error('Adresse e-mail ou mot de passe incorrect.');
    if (/Email not confirmed/i.test(error.message)) throw new Error("Confirmez d'abord votre adresse e-mail grâce au lien reçu.");
    throw new Error('Connexion impossible pour le moment. Réessayez dans un instant.');
}

export async function inscription({ email, motDePasse, nomComplet, commune, telephone, codeAcces }) {
    if (MODE_DEMO) {
        entrerEnDemo();
        return { confirmationRequise: false };
    }
    // Le profil est cree par un declencheur SQL a partir de ces metadonnees,
    // ce qui fonctionne meme quand la confirmation par e-mail retarde la session.
    const { data, error } = await supabase.auth.signUp({
        email,
        password: motDePasse,
        options: {
            // Le role n'est jamais envoye : seul un code d'acces valide, verifie en SQL, fait d'un compte un agent
            data: { nom_complet: nomComplet, commune, telephone: telephone || null, code_acces: codeAcces || null },
            emailRedirectTo: new URL('auth.html', location.href).href
        }
    });
    if (error) {
        if (/already registered/i.test(error.message)) throw new Error('Un compte existe déjà avec cette adresse e-mail.');
        if (error.code === 'email_address_invalid') throw new Error("Cette adresse e-mail n'est pas valide. Vérifiez-la et réessayez.");
        if (error.code === 'over_email_send_rate_limit') throw new Error("Trop d'inscriptions en peu de temps. Réessayez dans quelques minutes.");
        if (/Password/i.test(error.message)) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
        // Le declencheur SQL refuse l'inscription quand elles sont fermees (sauf code d'acces)
        if (/Database error/i.test(error.message)) throw new Error("Les inscriptions sont fermées pour le moment. Avec un code d'accès agent, vérifiez sa saisie.");
        throw new Error("L'inscription a échoué. Réessayez dans un instant.");
    }
    return { confirmationRequise: !data.session };
}

// Google renvoie vers l'application ; le profil est cree par le meme declencheur SQL qu'une inscription par e-mail
export async function connexionGoogle() {
    if (MODE_DEMO) {
        entrerEnDemo();
        return;
    }
    // Sans ce controle, un fournisseur desactive mene a une page d'erreur brute de Supabase
    let active = true;
    try {
        const reponse = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
        active = (await reponse.json())?.external?.google === true;
    } catch { /* en cas de doute, on tente la redirection */ }
    if (!active) throw new Error("La connexion Google n'est pas encore activée. Utilisez votre e-mail pour le moment.");
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        // Retour sur la page de connexion, qui redirige selon le role
        options: { redirectTo: new URL('auth.html', location.href).href }
    });
    if (error) {
        if (/provider is not enabled|Unsupported provider/i.test(error.message)) throw new Error("La connexion Google n'est pas encore activée. Utilisez votre e-mail pour le moment.");
        throw new Error('Connexion Google impossible pour le moment. Réessayez dans un instant.');
    }
}

export async function reinitialiserMotDePasse(email) {
    if (MODE_DEMO) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: new URL('auth.html#nouveau-mot-de-passe', location.href).href
    });
    if (error) throw new Error("L'envoi du lien a échoué. Vérifiez l'adresse saisie.");
}

// Le lien de reinitialisation ouvre une session de recuperation : on propose alors un nouveau mot de passe
export function surRecuperationMotDePasse(rappel) {
    if (MODE_DEMO) return;
    supabase.auth.onAuthStateChange(evenement => {
        if (evenement === 'PASSWORD_RECOVERY') rappel();
    });
}

export async function changerMotDePasse(motDePasse) {
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    if (error) throw new Error("Le nouveau mot de passe n'a pas pu être enregistré. Le lien a peut-être expiré.");
}

function effacerDonneesUtilisateur() {
    try {
        for (const cle of Object.keys(localStorage)) {
            if (cle.startsWith('sb-')) localStorage.removeItem(cle);
        }
        for (const cle of Object.keys(sessionStorage)) {
            if (cle.startsWith('debrisat-')) sessionStorage.removeItem(cle);
        }
    } catch { /* stockage indisponible */ }
}

// Single logout path for every page. The offline queue is kept: each item carries its author's id.
export async function deconnexion() {
    if (deconnexionEnCours) return;
    deconnexionEnCours = true;
    if (MODE_DEMO) {
        ecrireStockage(CLE_DECONNEXION_DEMO, true);
    } else {
        // A network failure must not keep the user signed in on this device
        await Promise.race([
            supabase.auth.signOut({ scope: 'local' }).catch(() => {}),
            new Promise(resoudre => setTimeout(resoudre, 3000))
        ]);
    }
    utilisateur = null;
    profil = null;
    effacerDonneesUtilisateur();
    try { sessionStorage.setItem(CLE_MESSAGE_DECONNEXION, '1'); } catch { /* stockage indisponible */ }
    location.replace('auth.html');
}

document.addEventListener('click', e => {
    const bouton = e.target.closest('[data-action="deconnexion"]');
    if (!bouton) return;
    e.preventDefault();
    bouton.disabled = true;
    bouton.classList.add('btn-chargement');
    deconnexion();
});

export function entrerEnDemo() {
    ecrireStockage(CLE_DECONNEXION_DEMO, false);
    definirDemo();
    notifier();
}

// Redirige vers la page de connexion en memorisant la page de retour
export function exigerConnexion(retour = location.pathname.split('/').pop() + location.hash) {
    if (estConnecte()) return true;
    location.href = `auth.html?retour=${encodeURIComponent(retour)}`;
    return false;
}

// Un citoyen deja inscrit (par exemple via Google) devient agent avec un code remis par un administrateur
export async function activerCodeAcces(code) {
    if (MODE_DEMO) throw new Error("Les codes d'accès ne fonctionnent pas en mode démo.");
    const { data, error } = await supabase.rpc('utiliser_code_acces', { p_code: code });
    if (error) throw new Error(error.message || "Ce code n'a pas pu être activé.");
    await rafraichirProfil();
    return data;
}
