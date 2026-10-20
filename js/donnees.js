// Couche d'acces aux donnees : meme interface en mode Supabase et en mode demo.
import { MODE_DEMO, supabase, BUCKET_PHOTOS, SEUIL_VERIFICATION, POINTS } from './config.js';
import { genererDonnees, badgesMerites, analyseFictive, signalementSimule, ID_DEMO } from './demo.js';
import { lireStockage, ecrireStockage } from './utils.js';

const CLE_DEMO = 'debrisat-demo-v3';
const COLONNES_SIGNALEMENT = 'id,user_id,type_obstruction,description,severite,photo_url,photo_analyse,lat,lng,adresse,commune,quartier,statut,source,nombre_confirmations,nombre_infirmations,priorite,assigne_a,resolu_at,created_at,updated_at';

export { MODE_DEMO };

// ============ Etat demo ============
let etat = null;
const bus = new EventTarget();

function etatDemo() {
    if (etat) return etat;
    etat = genererDonnees();
    // Seules les actions de l'utilisateur sont persistees ; le jeu de base est regenere a l'identique.
    const ajouts = lireStockage(CLE_DEMO, null);
    if (ajouts) appliquerAjoutsDemo(ajouts);
    return etat;
}

function appliquerAjoutsDemo(ajouts) {
    for (const s of ajouts.signalements || []) {
        if (!etat.signalements.some(x => x.id === s.id)) etat.signalements.push(s);
    }
    for (const m of ajouts.modifications || []) {
        const s = etat.signalements.find(x => x.id === m.id);
        if (s) Object.assign(s, m.champs);
    }
    for (const v of ajouts.verifications || []) etat.verifications.push(v);
    for (const h of ajouts.historique || []) etat.historique.push(h);
    for (const a of ajouts.alertes || []) etat.alertes.unshift(a);
    recalculerProfils();
}

function sauverAjout(categorie, element) {
    const ajouts = lireStockage(CLE_DEMO, { signalements: [], modifications: [], verifications: [], historique: [], alertes: [] });
    ajouts[categorie] = ajouts[categorie] || [];
    ajouts[categorie].push(element);
    if (!ecrireStockage(CLE_DEMO, ajouts) && categorie === 'signalements') {
        // Stockage plein (photo trop lourde) : on garde le signalement sans la photo
        ajouts[categorie][ajouts[categorie].length - 1] = { ...element, photo_url: null };
        ecrireStockage(CLE_DEMO, ajouts);
    }
}

export function reinitialiserDemo() {
    try { localStorage.removeItem(CLE_DEMO); } catch { /* stockage indisponible */ }
    etat = null;
}

function recalculerProfils() {
    for (const p of etat.profils) {
        p.nombre_signalements = etat.signalements.filter(s => s.user_id === p.id).length;
        p.nombre_verifications = etat.verifications.filter(v => v.user_id === p.id).length;
        p.points_total = etat.historique.filter(h => h.user_id === p.id).reduce((t, h) => t + h.points, 0);
        p.badges = badgesMerites(p, etat.badges);
    }
}

function ajouterPointsDemo(userId, points, raison, signalementId) {
    if (!userId) return;
    const h = { user_id: userId, points, raison, signalement_id: signalementId, created_at: new Date().toISOString() };
    etat.historique.push(h);
    sauverAjout('historique', h);
}

function modifierDemo(id, champs) {
    const s = etat.signalements.find(x => x.id === id);
    if (!s) return null;
    Object.assign(s, champs, { updated_at: new Date().toISOString() });
    sauverAjout('modifications', { id, champs: { ...champs, updated_at: s.updated_at } });
    return s;
}

const attendre = ms => new Promise(r => setTimeout(r, ms));

function verifierErreur(error, message) {
    if (error) {
        console.error(message, error);
        throw new Error(traduireErreur(error) || message);
    }
}

function traduireErreur(error) {
    const msg = error?.message || '';
    if (error?.code === '23505') return 'Vous avez déjà donné votre avis sur ce signalement.';
    if (error?.code === '42501' || /row-level security/i.test(msg)) return "Vous n'avez pas les droits nécessaires pour cette action.";
    if (/JWT|token/i.test(msg)) return 'Votre session a expiré. Reconnectez-vous.';
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Connexion impossible. Vérifiez votre accès à Internet.';
    return '';
}

// ============ Signalements ============

export async function listerSignalements({ limite = 1000 } = {}) {
    if (MODE_DEMO) {
        await attendre(250);
        return etatDemo().signalements.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map(s => ({ ...s }));
    }
    const { data, error } = await supabase
        .from('signalements')
        .select(COLONNES_SIGNALEMENT)
        .order('created_at', { ascending: false })
        .limit(limite);
    verifierErreur(error, 'Impossible de charger les signalements.');
    return data;
}

export async function obtenirSignalement(id) {
    if (MODE_DEMO) {
        const s = etatDemo().signalements.find(x => x.id === id);
        return s ? { ...s } : null;
    }
    const { data, error } = await supabase.from('signalements').select(COLONNES_SIGNALEMENT).eq('id', id).maybeSingle();
    verifierErreur(error, 'Impossible de charger ce signalement.');
    return data;
}

export async function compterSignalements() {
    if (MODE_DEMO) return etatDemo().signalements.length;
    const { count, error } = await supabase.from('signalements').select('id', { count: 'exact', head: true });
    verifierErreur(error, 'Impossible de compter les signalements.');
    return count || 0;
}

export async function creerSignalement({ photo, type_obstruction, severite, lat, lng, adresse, commune, quartier, description }, userId) {
    if (MODE_DEMO) {
        etatDemo();
        await attendre(700);
        const photoUrl = photo ? await lireCommeDataUrl(photo) : null;
        const maintenant = new Date().toISOString();
        const s = {
            id: crypto.randomUUID(),
            user_id: userId,
            type_obstruction, severite, lat, lng,
            adresse, commune, quartier,
            description: description || '',
            photo_url: photoUrl,
            photo_analyse: null,
            statut: 'en_attente',
            source: 'webapp',
            nombre_confirmations: 0,
            nombre_infirmations: 0,
            priorite: severite >= 5 ? 'critique' : severite >= 4 ? 'haute' : 'normale',
            assigne_a: null,
            resolu_at: null,
            created_at: maintenant,
            updated_at: maintenant
        };
        etat.signalements.push(s);
        sauverAjout('signalements', s);
        ajouterPointsDemo(userId, POINTS.signalement, 'signalement', s.id);
        recalculerProfils();
        emettre('INSERT', s);
        return { ...s };
    }

    let photoUrl = null;
    if (photo) {
        const extension = (photo.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const chemin = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
        const { error: errUpload } = await supabase.storage.from(BUCKET_PHOTOS).upload(chemin, photo, {
            contentType: photo.type, cacheControl: '31536000', upsert: false
        });
        verifierErreur(errUpload, "L'envoi de la photo a échoué.");
        photoUrl = supabase.storage.from(BUCKET_PHOTOS).getPublicUrl(chemin).data.publicUrl;
    }

    const { data, error } = await supabase
        .from('signalements')
        .insert({
            user_id: userId,
            type_obstruction, severite,
            description: description || null,
            photo_url: photoUrl,
            localisation: `SRID=4326;POINT(${lng} ${lat})`,
            adresse, commune, quartier,
            source: 'webapp'
        })
        .select(COLONNES_SIGNALEMENT)
        .single();
    verifierErreur(error, "L'enregistrement du signalement a échoué.");
    return data;
}

function lireCommeDataUrl(fichier) {
    return new Promise((resolve, reject) => {
        const lecteur = new FileReader();
        lecteur.onload = () => resolve(lecteur.result);
        lecteur.onerror = () => reject(new Error('Lecture de la photo impossible.'));
        lecteur.readAsDataURL(fichier);
    });
}

export async function verifierSignalement(signalementId, confirme, userId) {
    if (MODE_DEMO) {
        etatDemo();
        await attendre(300);
        const s = etat.signalements.find(x => x.id === signalementId);
        if (!s) throw new Error('Signalement introuvable.');
        if (s.user_id === userId) throw new Error('Vous ne pouvez pas vérifier votre propre signalement.');
        if (etat.verifications.some(v => v.signalement_id === signalementId && v.user_id === userId)) {
            throw new Error('Vous avez déjà donné votre avis sur ce signalement.');
        }
        const v = { signalement_id: signalementId, user_id: userId, confirme, created_at: new Date().toISOString() };
        etat.verifications.push(v);
        sauverAjout('verifications', v);
        ajouterPointsDemo(userId, POINTS.verification, 'verification', signalementId);

        const champs = confirme
            ? { nombre_confirmations: s.nombre_confirmations + 1 }
            : { nombre_infirmations: s.nombre_infirmations + 1 };
        if (confirme && champs.nombre_confirmations >= SEUIL_VERIFICATION && s.statut === 'en_attente') {
            champs.statut = 'verifie';
            champs.priorite = s.priorite === 'critique' ? 'critique' : 'haute';
            ajouterPointsDemo(s.user_id, POINTS.signalement_verifie, 'signalement_verifie', s.id);
        }
        if (!confirme && champs.nombre_infirmations >= SEUIL_VERIFICATION && ['en_attente', 'verifie'].includes(s.statut)) {
            champs.statut = 'rejete';
        }
        const maj = modifierDemo(signalementId, champs);
        recalculerProfils();
        emettre('UPDATE', maj);
        return { ...maj };
    }

    const { error } = await supabase.from('verifications').insert({ signalement_id: signalementId, user_id: userId, confirme });
    verifierErreur(error, "Votre avis n'a pas pu être enregistré.");
    return obtenirSignalement(signalementId);
}

export async function aDejaVerifie(signalementId, userId) {
    if (!userId) return false;
    if (MODE_DEMO) return etatDemo().verifications.some(v => v.signalement_id === signalementId && v.user_id === userId);
    const { count } = await supabase.from('verifications').select('id', { count: 'exact', head: true })
        .eq('signalement_id', signalementId).eq('user_id', userId);
    return (count || 0) > 0;
}

export async function changerStatut(ids, statut, { assigneA } = {}) {
    const liste = Array.isArray(ids) ? ids : [ids];
    if (MODE_DEMO) {
        etatDemo();
        await attendre(250);
        const resultats = [];
        for (const id of liste) {
            const avant = etat.signalements.find(x => x.id === id);
            if (!avant) continue;
            const champs = { statut };
            if (statut === 'resolu' && avant.statut !== 'resolu') {
                champs.resolu_at = new Date().toISOString();
                ajouterPointsDemo(avant.user_id, POINTS.signalement_resolu, 'signalement_resolu', id);
            }
            if (statut !== 'resolu') champs.resolu_at = null;
            if (assigneA !== undefined) champs.assigne_a = assigneA;
            const maj = modifierDemo(id, champs);
            emettre('UPDATE', maj);
            resultats.push({ ...maj });
        }
        recalculerProfils();
        return resultats;
    }
    const champs = { statut };
    if (assigneA !== undefined) champs.assigne_a = assigneA;
    const { data, error } = await supabase.from('signalements').update(champs).in('id', liste).select(COLONNES_SIGNALEMENT);
    verifierErreur(error, 'La mise à jour du statut a échoué.');
    return data;
}

export async function enregistrerAnalyse(signalementId, analyse) {
    if (MODE_DEMO) {
        etatDemo();
        const s = etat.signalements.find(x => x.id === signalementId);
        if (!s) return null;
        const champs = { photo_analyse: analyse };
        // L'IA ne fait que relever la severite : une sous-estimation citoyenne est plus risquee qu'une surestimation
        if (analyse.severite_suggeree > s.severite) champs.severite = analyse.severite_suggeree;
        const maj = modifierDemo(signalementId, champs);
        emettre('UPDATE', maj);
        return { ...maj };
    }
    return obtenirSignalement(signalementId);
}

export function analyseDemo(s) {
    return analyseFictive(s.type_obstruction, s.severite);
}

// ============ Zones, alertes, badges ============

export async function listerZones() {
    if (MODE_DEMO) return etatDemo().zones.map(z => ({ ...z }));
    const { data, error } = await supabase.from('vue_zones_risque').select('*').order('score_risque', { ascending: false });
    verifierErreur(error, 'Impossible de charger les zones à risque.');
    return data.map(z => ({
        ...z,
        coordonnees: (z.geojson?.coordinates?.[0] || []).slice(0, -1).map(([lng, lat]) => [lat, lng])
    }));
}

export async function listerAlertes(limite = 20) {
    if (MODE_DEMO) return etatDemo().alertes.slice(0, limite).map(a => ({ ...a }));
    const { data, error } = await supabase.from('alertes').select('*').order('created_at', { ascending: false }).limit(limite);
    verifierErreur(error, 'Impossible de charger les alertes.');
    return data;
}

export async function creerAlerte({ titre, message, type_alerte, canal, zone_id }) {
    if (MODE_DEMO) {
        etatDemo();
        await attendre(500);
        const a = { id: crypto.randomUUID(), titre, message, type_alerte, canal, zone_id: zone_id || null, envoyee: true, created_at: new Date().toISOString() };
        etat.alertes.unshift(a);
        sauverAjout('alertes', a);
        return { alerte: a, destinataires: canal === 'webapp' ? null : 0 };
    }
    const { data, error } = await supabase.from('alertes')
        .insert({ titre, message, type_alerte, canal, zone_id: zone_id || null })
        .select().single();
    verifierErreur(error, "La création de l'alerte a échoué.");
    let destinataires = null;
    if (canal !== 'webapp') {
        const { data: envoi, error: errEnvoi } = await supabase.functions.invoke('envoyer-alerte', { body: { alerte_id: data.id } });
        if (errEnvoi) throw new Error("L'alerte est enregistrée mais l'envoi SMS / WhatsApp a échoué.");
        destinataires = envoi?.envoyes ?? 0;
    }
    return { alerte: data, destinataires };
}

export async function listerBadges() {
    if (MODE_DEMO) return etatDemo().badges.map(b => ({ ...b }));
    const { data, error } = await supabase.from('badges').select('*');
    verifierErreur(error, 'Impossible de charger les badges.');
    return data;
}

// ============ Profils et gamification ============

export async function obtenirProfil(id) {
    if (MODE_DEMO) {
        const p = etatDemo().profils.find(x => x.id === id);
        return p ? { ...p } : null;
    }
    const { data, error } = await supabase.from('profils').select('*').eq('id', id).maybeSingle();
    verifierErreur(error, 'Impossible de charger le profil.');
    return data;
}

export async function mettreAJourProfil(id, champs) {
    const autorises = {};
    for (const cle of ['nom_complet', 'commune', 'telephone']) if (cle in champs) autorises[cle] = champs[cle];
    if (MODE_DEMO) {
        const p = etatDemo().profils.find(x => x.id === id);
        Object.assign(p, autorises);
        return { ...p };
    }
    const { data, error } = await supabase.from('profils').update(autorises).eq('id', id).select().single();
    verifierErreur(error, 'La mise à jour du profil a échoué.');
    return data;
}

export async function classement(limite = 20) {
    if (MODE_DEMO) {
        await attendre(200);
        return etatDemo().profils.slice().sort((a, b) => b.points_total - a.points_total).slice(0, limite).map(p => ({ ...p }));
    }
    const { data, error } = await supabase.from('classement_public')
        .select('id,nom_complet,commune,points_total,nombre_signalements,badges')
        .order('points_total', { ascending: false }).limit(limite);
    verifierErreur(error, 'Impossible de charger le classement.');
    return data;
}

export async function rangUtilisateur(points) {
    if (MODE_DEMO) return etatDemo().profils.filter(p => p.points_total > points).length + 1;
    const { count } = await supabase.from('classement_public').select('id', { count: 'exact', head: true }).gt('points_total', points);
    return (count || 0) + 1;
}

export async function historiquePoints(userId, limite = 30) {
    if (MODE_DEMO) {
        return etatDemo().historique.filter(h => h.user_id === userId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limite);
    }
    const { data, error } = await supabase.from('points_historique').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(limite);
    verifierErreur(error, "Impossible de charger l'historique des points.");
    return data;
}

export async function signalementsDe(userId) {
    if (MODE_DEMO) {
        return etatDemo().signalements.filter(s => s.user_id === userId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)).map(s => ({ ...s }));
    }
    const { data, error } = await supabase.from('signalements').select(COLONNES_SIGNALEMENT)
        .eq('user_id', userId).order('created_at', { ascending: false });
    verifierErreur(error, 'Impossible de charger vos signalements.');
    return data;
}

export async function compterCitoyensActifs() {
    if (MODE_DEMO) return etatDemo().profils.filter(p => p.nombre_signalements + p.nombre_verifications > 0).length;
    const { count } = await supabase.from('classement_public').select('id', { count: 'exact', head: true }).gt('points_total', 0);
    return count || 0;
}

export async function listerAgents() {
    if (MODE_DEMO) return etatDemo().profils.filter(p => ['agent_municipal', 'admin'].includes(p.role)).map(p => ({ id: p.id, nom_complet: p.nom_complet }));
    const { data } = await supabase.from('classement_public').select('id,nom_complet').in('role', ['agent_municipal', 'admin']);
    return data || [];
}

export function profilDemo() {
    return { ...etatDemo().profils.find(p => p.id === ID_DEMO) };
}

// ============ Temps reel ============

function emettre(type, enregistrement) {
    bus.dispatchEvent(new CustomEvent('changement', { detail: { type, nouveau: { ...enregistrement } } }));
}

let simulation = null;
let indexSimulation = 0;

export function ecouterSignalements(rappel) {
    if (MODE_DEMO) {
        const gestionnaire = e => rappel(e.detail);
        bus.addEventListener('changement', gestionnaire);
        return () => bus.removeEventListener('changement', gestionnaire);
    }
    const canal = supabase
        .channel('signalements-' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'signalements' }, async payload => {
            let nouveau = payload.new;
            // Les colonnes calculees lat/lng peuvent manquer dans le flux de replication : on relit la ligne
            if (nouveau?.id && nouveau.lat == null) {
                try { nouveau = (await obtenirSignalement(nouveau.id)) || nouveau; } catch { /* on garde la charge utile brute */ }
            }
            rappel({ type: payload.eventType, nouveau, ancien: payload.old });
        })
        .subscribe();
    return () => supabase.removeChannel(canal);
}

// En mode demo, un signalement fictif arrive regulierement pour montrer le temps reel
export function demarrerSimulation({ premierDelai = 25000, intervalle = 90000 } = {}) {
    if (!MODE_DEMO || simulation) return;
    const lancer = () => {
        etatDemo();
        const s = signalementSimule(indexSimulation++, etat.profils);
        etat.signalements.push(s);
        emettre('INSERT', s);
    };
    simulation = setTimeout(function boucle() {
        lancer();
        simulation = setTimeout(boucle, intervalle);
    }, premierDelai);
}

export function arreterSimulation() {
    clearTimeout(simulation);
    simulation = null;
}

// ============ Configuration du site ============

const CONFIG_DEMO = { nom_site: 'Debrisat', maintenance: false, inscriptions_ouvertes: true, points_signalement: 10, points_verification: 3 };

export async function lireConfig() {
    if (MODE_DEMO) return { ...CONFIG_DEMO };
    const { data, error } = await supabase.from('config_site').select('cle,valeur');
    verifierErreur(error, 'Impossible de lire la configuration.');
    return Object.fromEntries(data.map(l => [l.cle, l.valeur]));
}

export async function ecrireConfig(cle, valeur) {
    if (MODE_DEMO) {
        CONFIG_DEMO[cle] = valeur;
        return;
    }
    const { error } = await supabase.from('config_site').upsert({ cle, valeur });
    verifierErreur(error, "Le réglage n'a pas pu être enregistré.");
}

// ============ Administration ============
// Toutes ces fonctions sont refusees cote serveur a qui n'est pas administrateur (RLS et fonctions SQL).

const demoAdmin = { codes: [], journal: [] };

function journalDemo(action, cible_type, cible_id, details) {
    demoAdmin.journal.unshift({ id: crypto.randomUUID(), admin_id: ID_DEMO, action, cible_type, cible_id, details, cree_le: new Date().toISOString() });
}

export async function adminListerUtilisateurs() {
    if (MODE_DEMO) {
        return etatDemo().profils.map(p => ({
            ...p, email: `${(p.nom_complet || 'compte').toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '.')}@exemple.sn`,
            compte_actif: p.compte_actif !== false, commune_assignee: p.commune_assignee || null, fournisseur: 'email',
            derniere_connexion: p.created_at
        }));
    }
    const { data, error } = await supabase.rpc('admin_lister_utilisateurs');
    verifierErreur(error, 'Impossible de charger les utilisateurs.');
    return data;
}

export async function adminModifierUtilisateur(id, champs) {
    const autorises = {};
    for (const cle of ['role', 'commune_assignee', 'compte_actif', 'points_total']) if (cle in champs) autorises[cle] = champs[cle];
    if (MODE_DEMO) {
        const p = etatDemo().profils.find(x => x.id === id);
        Object.assign(p, autorises);
        journalDemo('modification_utilisateur', 'utilisateur', id, { nom: p.nom_complet, ...autorises });
        return { ...p };
    }
    const { data, error } = await supabase.from('profils').update(autorises).eq('id', id).select().single();
    verifierErreur(error, "La modification n'a pas pu être enregistrée.");
    return data;
}

export async function adminSupprimerUtilisateur(id) {
    if (MODE_DEMO) {
        etatDemo().profils = etat.profils.filter(p => p.id !== id);
        journalDemo('suppression_compte', 'utilisateur', id, null);
        return;
    }
    const { error } = await supabase.rpc('admin_supprimer_utilisateur', { p_id: id });
    verifierErreur(error, 'La suppression a échoué.');
}

export async function adminListerCodes() {
    if (MODE_DEMO) return demoAdmin.codes.map(c => ({ ...c }));
    const { data, error } = await supabase.from('codes_acces').select('*, utilisateur:utilise_par(nom_complet)').order('cree_le', { ascending: false });
    verifierErreur(error, "Impossible de charger les codes d'accès.");
    return data;
}

export async function adminGenererCode(commune, expireLe) {
    if (MODE_DEMO) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const tirage = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
        const code = `AGT-${tirage()}-${tirage()}`;
        demoAdmin.codes.unshift({ id: crypto.randomUUID(), code, commune, utilise: false, revoque: false, cree_le: new Date().toISOString(), expire_le: expireLe });
        journalDemo('creation_code', 'code', code, { commune });
        return code;
    }
    const { data, error } = await supabase.rpc('admin_generer_code', { p_commune: commune, p_expire_le: expireLe || null });
    verifierErreur(error, "Le code n'a pas pu être généré.");
    return data;
}

export async function adminRevoquerCode(id) {
    if (MODE_DEMO) {
        const c = demoAdmin.codes.find(x => x.id === id);
        if (c) c.revoque = true;
        return;
    }
    const { error } = await supabase.rpc('admin_revoquer_code', { p_id: id });
    verifierErreur(error, "Le code n'a pas pu être révoqué.");
}

export async function adminReinitialiserPoints(id = null) {
    if (MODE_DEMO) {
        journalDemo('reinitialisation_points', 'utilisateur', id || 'tous', null);
        return 0;
    }
    const { data, error } = await supabase.rpc('admin_reinitialiser_points', { p_id: id });
    verifierErreur(error, 'La remise à zéro a échoué.');
    return data;
}

export async function adminPurgerSignalements(jours) {
    if (MODE_DEMO) return 0;
    const { data, error } = await supabase.rpc('admin_purger_signalements', { p_jours: jours });
    if (error) throw new Error(error.message || 'La purge a échoué.');
    return data;
}

export async function adminSupprimerSignalement(id) {
    if (MODE_DEMO) {
        etatDemo().signalements = etat.signalements.filter(s => s.id !== id);
        return;
    }
    const { error } = await supabase.from('signalements').delete().eq('id', id);
    verifierErreur(error, 'La suppression du signalement a échoué.');
}

export async function adminListerJournal(limite = 200) {
    if (MODE_DEMO) return demoAdmin.journal.slice(0, limite);
    const { data, error } = await supabase.from('logs_admin').select('*, auteur:admin_id(nom_complet)').order('cree_le', { ascending: false }).limit(limite);
    verifierErreur(error, 'Impossible de charger le journal.');
    return data;
}

export function ecouterJournal(rappel) {
    if (MODE_DEMO) return () => {};
    const canal = supabase.channel('journal-' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs_admin' }, p => rappel(p.new))
        .subscribe();
    return () => supabase.removeChannel(canal);
}
