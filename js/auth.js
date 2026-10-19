import { MODE_DEMO, supabase, ROLES_AUTORITE, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { obtenirProfil, profilDemo } from './donnees.js';
import { lireStockage, ecrireStockage } from './utils.js';
import { ID_DEMO } from './demo.js';

const CLE_DECONNEXION_DEMO = 'debrisat-demo-deconnecte';
const abonnes = new Set();
let utilisateur = null;
let profil = null;
let pret = null;

export function initAuth() {
    if (pret) return pret;
    pret = (async () => {
        if (MODE_DEMO) {
            if (!lireStockage(CLE_DECONNEXION_DEMO, false)) definirDemo();
            return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        await definirSession(session);
        supabase.auth.onAuthStateChange(async (_evenement, nouvelleSession) => {
            await definirSession(nouvelleSession);
            notifier();
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
    if (utilisateur) {
        try {
            profil = await obtenirProfil(utilisateur.id);
        } catch {
            profil = null;
        }
    }
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
export const estConnecte = () => !!utilisateur;
export const estAutorite = () => !!profil && ROLES_AUTORITE.includes(profil.role);

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
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    if (error) {
        if (/Invalid login credentials/i.test(error.message)) throw new Error('Adresse e-mail ou mot de passe incorrect.');
        if (/Email not confirmed/i.test(error.message)) throw new Error("Confirmez d'abord votre adresse e-mail grâce au lien reçu.");
        throw new Error('Connexion impossible pour le moment. Réessayez dans un instant.');
    }
}

export async function inscription({ email, motDePasse, nomComplet, commune, telephone }) {
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
            data: { nom_complet: nomComplet, commune, telephone: telephone || null },
            emailRedirectTo: new URL('app.html', location.href).href
        }
    });
    if (error) {
        if (/already registered/i.test(error.message)) throw new Error('Un compte existe déjà avec cette adresse e-mail.');
        if (error.code === 'email_address_invalid') throw new Error("Cette adresse e-mail n'est pas valide. Vérifiez-la et réessayez.");
        if (error.code === 'over_email_send_rate_limit') throw new Error("Trop d'inscriptions en peu de temps. Réessayez dans quelques minutes.");
        if (/Password/i.test(error.message)) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
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
        options: { redirectTo: new URL('app.html', location.href).href }
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

export async function deconnexion() {
    if (MODE_DEMO) {
        ecrireStockage(CLE_DECONNEXION_DEMO, true);
        utilisateur = null;
        profil = null;
        notifier();
        return;
    }
    await supabase.auth.signOut();
}

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
