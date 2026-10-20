// Sections propres a l'administration : utilisateurs, codes d'acces, configuration, journal.
// Charge uniquement par admin.html (via dashboard.js) ; chaque action est aussi verifiee et journalisee en SQL.
import { SUPABASE_URL, SUPABASE_ANON_KEY, COMMUNES, ROLES, MODE_DEMO, TYPES_OBSTRUCTION, STATUTS, supabase } from './config.js';
import { chargerAnalyse, boundsAnalyse, ComparateurAvantApres, ATTRIBUTION_SCENES } from './satellite.js';
import { $, $$, echapper, formatDate, formatRelatif, formatNombre, initiales, debounce, telechargerFichier } from './utils.js';
import { Feuille } from './animations.js';
import { profilCourant } from './auth.js';
import { succes, erreur } from './notifications.js';
import {
    adminListerUtilisateurs, adminModifierUtilisateur, adminSupprimerUtilisateur,
    adminListerCodes, adminGenererCode, adminRevoquerCode, adminReinitialiserPoints, adminPurgerSignalements,
    adminListerJournal, ecouterJournal, lireConfig, ecrireConfig, adminSupprimerSignalement
} from './donnees.js';

export const TITRES = {
    utilisateurs: 'Utilisateurs', codes: "Codes d'accès", configuration: 'Configuration', journal: "Journal d'activité",
    satellite: 'Satellite', whatsapp: 'WhatsApp'
};

const CLASSES_ROLE = { citoyen: 'badge-neutral', agent_municipal: 'badge-info', admin: 'badge-warning' };
const ICONES_ROLE = { citoyen: 'bi-person', agent_municipal: 'bi-person-badge', admin: 'bi-shield-lock' };
const LIBELLES_ACTION = {
    changement_role: 'Changement de rôle', reactivation_compte: 'Compte réactivé', desactivation_compte: 'Compte désactivé',
    changement_commune: 'Commune assignée', modification_points: 'Points modifiés', suppression_compte: 'Compte supprimé',
    changement_statut: 'Statut modifié', assignation: 'Signalement assigné', changement_priorite: 'Priorité modifiée',
    suppression_signalement: 'Signalement supprimé', purge_signalements: 'Purge des signalements',
    envoi_alerte: 'Alerte envoyée', modification_config: 'Configuration modifiée',
    creation_code: 'Code créé', revocation_code: 'Code révoqué', reinitialisation_points: 'Points remis à zéro',
    creation_zone: 'Zone créée', modification_zone: 'Zone modifiée', suppression_zone: 'Zone supprimée'
};

const etat = {
    utilisateurs: null,
    codes: null,
    journal: null,
    config: null,
    selection: new Set(),
    filtres: { recherche: '', role: '', statut: '' },
    filtreJournal: ''
};

let feuilleUtilisateur = null;
let feuilleConfirmation = null;
let initialise = false;

function squelette(colonnes, lignes = 4) {
    return Array.from({ length: lignes }, () =>
        `<tr class="squelette-ligne">${'<td><span></span></td>'.repeat(colonnes)}</tr>`).join('');
}

function ligneVide(colonnes, icone, texte) {
    return `<tr><td colspan="${colonnes}"><div class="etat-vide" style="padding:var(--space-8) var(--space-4);text-align:center">
        <i class="bi ${icone}" aria-hidden="true" style="font-size:1.5rem;color:var(--color-muted)"></i>
        <p class="texte-secondaire" style="margin-top:var(--space-2)">${texte}</p></div></td></tr>`;
}

// Confirmation explicite pour les actions irreversibles
function confirmer(titre, texte, libelle = 'Confirmer') {
    return new Promise(resolve => {
        $('#titreConfirmation').textContent = titre;
        $('#texteConfirmation').textContent = texte;
        const bouton = $('#btnConfirmer');
        bouton.textContent = libelle;
        let reponse = false;
        const valider = () => { reponse = true; feuilleConfirmation.fermer(); };
        bouton.addEventListener('click', valider, { once: true });
        feuilleConfirmation.surFermeture = () => {
            bouton.removeEventListener('click', valider);
            resolve(reponse);
        };
        feuilleConfirmation.ouvrir();
    });
}

function initialiser() {
    if (initialise) return;
    initialise = true;
    feuilleUtilisateur = new Feuille($('#feuilleUtilisateur'));
    feuilleConfirmation = new Feuille($('#feuilleConfirmation'));

    const options = COMMUNES.map(c => `<option value="${echapper(c)}">${echapper(c)}</option>`).join('');
    $('#champCommuneCode').insertAdjacentHTML('beforeend', options);

    // Utilisateurs
    $('#rechercheUtilisateurs').addEventListener('input', debounce(e => { etat.filtres.recherche = e.target.value.trim().toLowerCase(); rendreUtilisateurs(); }, 200));
    $('#filtreRoleUtilisateurs').addEventListener('change', e => { etat.filtres.role = e.target.value; rendreUtilisateurs(); });
    $('#filtreStatutUtilisateurs').addEventListener('change', e => { etat.filtres.statut = e.target.value; rendreUtilisateurs(); });
    $('#toutSelectionnerUtilisateurs').addEventListener('change', e => {
        for (const u of utilisateursFiltres()) {
            if (u.id === profilCourant()?.id) continue;
            if (e.target.checked) etat.selection.add(u.id); else etat.selection.delete(u.id);
        }
        rendreUtilisateurs();
    });
    $('#corpsUtilisateurs').addEventListener('change', e => {
        const caseSel = e.target.closest('[data-selection]');
        if (!caseSel) return;
        if (caseSel.checked) etat.selection.add(caseSel.dataset.selection); else etat.selection.delete(caseSel.dataset.selection);
        majSelection();
    });
    $('#corpsUtilisateurs').addEventListener('click', e => {
        const bouton = e.target.closest('[data-detail]');
        if (bouton) ouvrirUtilisateur(bouton.dataset.detail);
    });
    $$('[data-groupe]').forEach(b => b.addEventListener('click', () => actionGroupee(b.dataset.groupe)));

    // Codes
    $('#formCode').addEventListener('submit', genererCode);
    $('#btnCopierCode').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText($('#valeurCodeGenere').textContent);
            succes('Code copié', 'Vous pouvez le transmettre à l\'agent.');
        } catch {
            erreur('Copie impossible', 'Sélectionnez le code et copiez-le à la main.');
        }
    });
    $('#corpsCodes').addEventListener('click', async e => {
        const bouton = e.target.closest('[data-revoquer]');
        if (!bouton) return;
        if (!await confirmer('Révoquer ce code ?', "Il ne pourra plus être utilisé pour créer un compte agent.", 'Révoquer')) return;
        try {
            await adminRevoquerCode(bouton.dataset.revoquer);
            succes('Code révoqué');
            await chargerCodes(true);
        } catch (err) {
            erreur('Révocation impossible', err.message);
        }
    });

    // Configuration
    $$('[data-config]').forEach(champ => {
        const evenement = champ.classList.contains('interrupteur') ? 'click' : 'change';
        champ.addEventListener(evenement, () => enregistrerReglage(champ));
    });
    $('#btnVoirCle').addEventListener('click', e => {
        const visible = e.currentTarget.getAttribute('aria-pressed') !== 'true';
        e.currentTarget.setAttribute('aria-pressed', String(visible));
        e.currentTarget.innerHTML = `<i class="bi ${visible ? 'bi-eye-slash' : 'bi-eye'}" aria-hidden="true"></i>${visible ? 'Masquer' : 'Afficher'}`;
        $('#infoClePublique').textContent = visible ? (MODE_DEMO ? 'Mode démo' : SUPABASE_ANON_KEY) : '••••••••';
    });
    $('#btnRazPoints').addEventListener('click', async () => {
        if (!await confirmer('Remettre tous les points à zéro ?', "L'historique des points et les badges de tous les comptes seront effacés. Cette action est définitive.", 'Tout remettre à zéro')) return;
        try {
            const n = await adminReinitialiserPoints(null);
            succes('Points remis à zéro', `${formatNombre(n)} compte(s) concerné(s).`);
            etat.utilisateurs = null;
        } catch (err) {
            erreur('Opération impossible', err.message);
        }
    });
    $('#btnPurger').addEventListener('click', async () => {
        const jours = Number($('#champJoursPurge').value);
        if (!(jours >= 30)) {
            erreur('Durée trop courte', 'La purge ne concerne que les signalements clos depuis 30 jours au moins.');
            return;
        }
        if (!await confirmer('Purger les signalements clos ?', `Les signalements résolus ou rejetés depuis plus de ${jours} jours seront supprimés définitivement, photos comprises dans les statistiques.`, 'Purger')) return;
        try {
            const n = await adminPurgerSignalements(jours);
            succes('Purge terminée', `${formatNombre(n)} signalement(s) supprimé(s).`);
        } catch (err) {
            erreur('Purge impossible', err.message);
        }
    });

    // Journal
    $('#filtreTypeJournal').addEventListener('change', e => { etat.filtreJournal = e.target.value; rendreJournal(); });
    $('#btnExportJournal').addEventListener('click', exporterJournal);
    ecouterJournal(ligne => {
        if (!etat.journal) return;
        etat.journal.unshift(ligne);
        if (!$('#section-journal').hidden) rendreJournal();
    });
}

// ============ Utilisateurs ============

async function chargerUtilisateurs(forcer = false) {
    if (etat.utilisateurs && !forcer) return rendreUtilisateurs();
    $('#corpsUtilisateurs').innerHTML = squelette(8);
    try {
        etat.utilisateurs = await adminListerUtilisateurs();
    } catch (err) {
        etat.utilisateurs = [];
        erreur('Chargement impossible', err.message);
    }
    rendreUtilisateurs();
}

function utilisateursFiltres() {
    const { recherche, role, statut } = etat.filtres;
    return (etat.utilisateurs || []).filter(u =>
        (!role || u.role === role)
        && (!statut || (statut === 'actif') === u.compte_actif)
        && (!recherche || `${u.nom_complet} ${u.email}`.toLowerCase().includes(recherche)));
}

function rendreStatsUtilisateurs() {
    const liste = etat.utilisateurs || [];
    const ilYa30j = Date.now() - 30 * 86400000;
    const cartes = [
        ['bi-people', '', 'Comptes', liste.length],
        ['bi-person-check', 'succes', 'Citoyens actifs (30 j)', liste.filter(u => u.role === 'citoyen' && u.derniere_connexion && new Date(u.derniere_connexion) > ilYa30j).length],
        ['bi-person-badge', 'info', 'Agents municipaux', liste.filter(u => u.role === 'agent_municipal').length],
        ['bi-slash-circle', 'alerte', 'Comptes désactivés', liste.filter(u => !u.compte_actif).length]
    ];
    $('#statsUtilisateurs').innerHTML = cartes.map(([icone, ton, libelle, valeur]) => `
        <article class="card-stat glass-card">
            <span class="icone-ronde ${ton}"><i class="bi ${icone}" aria-hidden="true"></i></span>
            <p class="valeur chiffre">${formatNombre(valeur)}</p><p class="libelle">${libelle}</p>
        </article>`).join('');
}

function rendreUtilisateurs() {
    rendreStatsUtilisateurs();
    const liste = utilisateursFiltres();
    const moi = profilCourant()?.id;
    $('#sousTitreUtilisateurs').textContent = `${formatNombre(liste.length)} compte${liste.length > 1 ? 's' : ''} affiché${liste.length > 1 ? 's' : ''}`;
    if (!liste.length) {
        $('#corpsUtilisateurs').innerHTML = ligneVide(8, 'bi-people', 'Aucun compte ne correspond à ces filtres.');
        majSelection();
        return;
    }
    $('#corpsUtilisateurs').innerHTML = liste.map(u => `
        <tr class="${u.compte_actif ? '' : 'ligne-desactivee'} ${etat.selection.has(u.id) ? 'selectionnee' : ''}">
            <td class="col-collante"><label class="checkbox"><input type="checkbox" data-selection="${u.id}" ${etat.selection.has(u.id) ? 'checked' : ''} ${u.id === moi ? 'disabled' : ''}><span class="sr-only">Sélectionner ${echapper(u.nom_complet)}</span></label></td>
            <td><div class="cellule-utilisateur"><span class="avatar">${echapper(initiales(u.nom_complet || ''))}</span>
                <span><strong>${echapper(u.nom_complet)}</strong>${u.id === moi ? ' <span class="texte-xs texte-muet">(vous)</span>' : ''}<span class="sous">${echapper(u.email || '')}${u.fournisseur === 'google' ? ' · Google' : ''}</span></span></div></td>
            <td><span class="badge ${CLASSES_ROLE[u.role] || 'badge-neutral'}"><i class="bi ${ICONES_ROLE[u.role] || 'bi-person'}" aria-hidden="true"></i>${echapper(ROLES[u.role] || u.role)}</span></td>
            <td>${echapper(u.role === 'agent_municipal' ? (u.commune_assignee || 'Non assignée') : (u.commune || '—'))}</td>
            <td class="chiffre">${formatNombre(u.points_total || 0)}</td>
            <td>${formatDate(u.created_at)}</td>
            <td>${u.compte_actif ? '<span class="badge badge-success">Actif</span>' : '<span class="badge badge-danger">Désactivé</span>'}</td>
            <td><button type="button" class="btn btn-sm btn-ghost" data-detail="${u.id}" aria-label="Gérer ${echapper(u.nom_complet)}"><i class="bi bi-three-dots" aria-hidden="true"></i>Gérer</button></td>
        </tr>`).join('');
    majSelection();
}

function majSelection() {
    $('#actionsUtilisateurs').hidden = etat.selection.size === 0;
    $('#nbSelectionUtilisateurs').textContent = etat.selection.size;
}

async function actionGroupee(type) {
    const ids = [...etat.selection];
    const champs = type === 'citoyen' ? { role: 'citoyen', commune_assignee: null } : { compte_actif: type === 'activer' };
    const libelle = { citoyen: 'repasser en citoyen', desactiver: 'désactiver', activer: 'réactiver' }[type];
    if (!await confirmer('Action groupée', `Voulez-vous ${libelle} ${ids.length} compte(s) ?`, 'Appliquer')) return;
    let echecs = 0;
    for (const id of ids) {
        try { await adminModifierUtilisateur(id, champs); } catch { echecs++; }
    }
    etat.selection.clear();
    if (echecs) erreur('Action partielle', `${echecs} compte(s) n'ont pas pu être modifiés.`);
    else succes('Comptes mis à jour', `${ids.length} compte(s) modifié(s).`);
    await chargerUtilisateurs(true);
}

function ouvrirUtilisateur(id) {
    const u = etat.utilisateurs.find(x => x.id === id);
    if (!u) return;
    const moi = u.id === profilCourant()?.id;
    const optionsCommunes = COMMUNES.map(c => `<option value="${echapper(c)}" ${c === u.commune_assignee ? 'selected' : ''}>${echapper(c)}</option>`).join('');
    $('#titreFeuilleUtilisateur').textContent = u.nom_complet;
    $('#corpsFeuilleUtilisateur').innerHTML = `
        <div class="rangee"><span class="avatar" style="width:48px;height:48px">${echapper(initiales(u.nom_complet || ''))}</span>
            <div><p><strong>${echapper(u.nom_complet)}</strong></p><p class="texte-sm texte-secondaire">${echapper(u.email || '')}</p></div></div>
        <div class="grille-stats" style="grid-template-columns:repeat(3,1fr)">
            <div class="card-stat glass-card"><p class="valeur chiffre">${formatNombre(u.points_total || 0)}</p><p class="libelle">Points</p></div>
            <div class="card-stat glass-card"><p class="valeur chiffre">${formatNombre(u.nombre_signalements || 0)}</p><p class="libelle">Signalements</p></div>
            <div class="card-stat glass-card"><p class="valeur chiffre">${formatNombre(u.nombre_verifications || 0)}</p><p class="libelle">Vérifications</p></div>
        </div>
        <p class="texte-sm texte-secondaire">Inscrit le ${formatDate(u.created_at)} · dernière connexion ${u.derniere_connexion ? formatRelatif(u.derniere_connexion) : 'inconnue'}</p>
        ${moi ? '<p class="texte-sm texte-muet"><i class="bi bi-info-circle" aria-hidden="true"></i> Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte.</p>' : `
        <div class="form-group">
            <label class="form-label" for="champRoleUtilisateur">Rôle</label>
            <select class="select" id="champRoleUtilisateur">
                ${Object.entries(ROLES).map(([cle, nom]) => `<option value="${cle}" ${cle === u.role ? 'selected' : ''}>${nom}</option>`).join('')}
            </select>
        </div>
        <div class="form-group" id="groupeCommuneUtilisateur" ${u.role === 'agent_municipal' ? '' : 'hidden'}>
            <label class="form-label" for="champCommuneUtilisateur">Commune assignée</label>
            <select class="select" id="champCommuneUtilisateur"><option value="">Choisissez une commune</option>${optionsCommunes}</select>
        </div>
        <div class="rangee-wrap">
            <button type="button" class="btn btn-plein" id="btnEnregistrerUtilisateur"><i class="bi bi-check-lg" aria-hidden="true"></i>Enregistrer</button>
            <button type="button" class="btn btn-secondary" id="btnBasculerCompte"><i class="bi ${u.compte_actif ? 'bi-slash-circle' : 'bi-check-circle'}" aria-hidden="true"></i>${u.compte_actif ? 'Désactiver le compte' : 'Réactiver le compte'}</button>
            <button type="button" class="btn btn-secondary" id="btnRazUtilisateur"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Remettre les points à zéro</button>
            <button type="button" class="btn btn-danger" id="btnSupprimerUtilisateur"><i class="bi bi-trash3" aria-hidden="true"></i>Supprimer</button>
        </div>`}`;
    feuilleUtilisateur.ouvrir();
    if (moi) return;

    $('#champRoleUtilisateur').addEventListener('change', e => { $('#groupeCommuneUtilisateur').hidden = e.target.value !== 'agent_municipal'; });
    $('#btnEnregistrerUtilisateur').addEventListener('click', async () => {
        const role = $('#champRoleUtilisateur').value;
        const commune = $('#champCommuneUtilisateur').value || null;
        if (role === 'agent_municipal' && !commune) {
            erreur('Commune manquante', 'Un agent municipal doit être rattaché à une commune.');
            return;
        }
        await agir(() => adminModifierUtilisateur(u.id, { role, commune_assignee: role === 'agent_municipal' ? commune : null }), 'Compte mis à jour');
    });
    $('#btnBasculerCompte').addEventListener('click', () =>
        agir(() => adminModifierUtilisateur(u.id, { compte_actif: !u.compte_actif }), u.compte_actif ? 'Compte désactivé' : 'Compte réactivé'));
    $('#btnRazUtilisateur').addEventListener('click', async () => {
        if (!await confirmer('Remettre les points à zéro ?', `Les points et badges de ${u.nom_complet} seront effacés.`, 'Remettre à zéro')) return;
        await agir(() => adminReinitialiserPoints(u.id), 'Points remis à zéro');
    });
    $('#btnSupprimerUtilisateur').addEventListener('click', async () => {
        if (!await confirmer('Supprimer ce compte ?', `Le compte de ${u.nom_complet} sera supprimé définitivement. Ses signalements restent visibles, sans auteur.`, 'Supprimer définitivement')) return;
        await agir(() => adminSupprimerUtilisateur(u.id), 'Compte supprimé');
    });
}

async function agir(action, message) {
    try {
        await action();
        succes(message);
        feuilleUtilisateur.fermer();
        await chargerUtilisateurs(true);
    } catch (err) {
        erreur('Action impossible', err.message);
    }
}

// ============ Codes d'acces ============

function statutCode(c) {
    if (c.utilise) return '<span class="badge badge-success">Utilisé</span>';
    if (c.revoque) return '<span class="badge badge-neutral">Révoqué</span>';
    if (c.expire_le && new Date(c.expire_le) < new Date()) return '<span class="badge badge-danger">Expiré</span>';
    return '<span class="badge badge-info">Disponible</span>';
}

async function chargerCodes(forcer = false) {
    if (!etat.codes || forcer) {
        $('#corpsCodes').innerHTML = squelette(6, 3);
        try {
            etat.codes = await adminListerCodes();
        } catch (err) {
            etat.codes = [];
            erreur('Chargement impossible', err.message);
        }
    }
    $('#corpsCodes').innerHTML = etat.codes.length ? etat.codes.map(c => `
        <tr>
            <td><code class="chiffre">${echapper(c.code)}</code></td>
            <td>${echapper(c.commune)}</td>
            <td>${statutCode(c)}</td>
            <td>${formatDate(c.cree_le)}${c.expire_le ? `<span class="sous texte-xs texte-muet" style="display:block">expire le ${formatDate(c.expire_le)}</span>` : ''}</td>
            <td>${echapper(c.utilisateur?.nom_complet || (c.utilise ? 'Compte supprimé' : '—'))}</td>
            <td>${!c.utilise && !c.revoque ? `<button type="button" class="btn btn-sm btn-ghost" data-revoquer="${c.id}"><i class="bi bi-x-circle" aria-hidden="true"></i>Révoquer</button>` : ''}</td>
        </tr>`).join('') : ligneVide(6, 'bi-key', "Aucun code pour l'instant. Générez-en un pour inviter un agent.");
}

async function genererCode(e) {
    e.preventDefault();
    const commune = $('#champCommuneCode').value;
    const date = $('#champExpirationCode').value;
    $('#erreurFormCode').textContent = '';
    if (!commune) {
        $('#erreurFormCode').innerHTML = '<i class="bi bi-exclamation-circle" aria-hidden="true"></i>Choisissez la commune de l\'agent.';
        $('#champCommuneCode').focus();
        return;
    }
    const bouton = $('#btnGenererCode');
    bouton.disabled = true;
    try {
        const code = await adminGenererCode(commune, date ? new Date(`${date}T23:59:59`).toISOString() : null);
        $('#valeurCodeGenere').textContent = code;
        $('#codeGenere').hidden = false;
        succes('Code généré', `Valable pour ${commune}.`);
        await chargerCodes(true);
    } catch (err) {
        erreur('Génération impossible', err.message);
    } finally {
        bouton.disabled = false;
    }
}

// ============ Configuration ============

async function chargerConfiguration() {
    try {
        etat.config = await lireConfig();
    } catch (err) {
        erreur('Chargement impossible', err.message);
        return;
    }
    for (const champ of $$('[data-config]')) {
        const valeur = etat.config[champ.dataset.config];
        if (champ.dataset.type === 'booleen') champ.setAttribute('aria-checked', String(valeur === true));
        else champ.value = valeur ?? '';
    }
    $('#infoUrlSupabase').textContent = MODE_DEMO ? 'Mode démo : Supabase non configuré' : SUPABASE_URL;
    try {
        const reponse = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
        const actif = (await reponse.json())?.external?.google === true;
        $('#infoGoogle').innerHTML = actif
            ? '<span class="badge badge-success"><i class="bi bi-check-circle" aria-hidden="true"></i>Activée</span>'
            : '<span class="badge badge-warning"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>Désactivée</span> À activer dans Supabase, Authentication, Providers.';
    } catch {
        $('#infoGoogle').textContent = 'État inconnu (Supabase injoignable).';
    }
}

async function enregistrerReglage(champ) {
    const cle = champ.dataset.config;
    let valeur;
    if (champ.dataset.type === 'booleen') {
        valeur = champ.getAttribute('aria-checked') !== 'true';
        if (cle === 'maintenance' && valeur && !await confirmer('Activer la maintenance ?', 'Le site ne sera plus accessible aux citoyens ni aux agents tant que vous ne la désactivez pas.', 'Activer')) return;
        champ.setAttribute('aria-checked', String(valeur));
    } else if (champ.dataset.type === 'nombre') {
        valeur = Math.max(0, Math.min(100, Math.round(Number(champ.value) || 0)));
        champ.value = valeur;
    } else {
        valeur = champ.value.trim();
        if (!valeur) return;
    }
    try {
        await ecrireConfig(cle, valeur);
        etat.config[cle] = valeur;
        succes('Réglage enregistré');
    } catch (err) {
        if (champ.dataset.type === 'booleen') champ.setAttribute('aria-checked', String(!valeur));
        erreur('Enregistrement impossible', err.message);
    }
}

// ============ Journal ============

async function chargerJournal(forcer = false) {
    if (!etat.journal || forcer) {
        $('#corpsJournal').innerHTML = squelette(5);
        try {
            etat.journal = await adminListerJournal(300);
        } catch (err) {
            etat.journal = [];
            erreur('Chargement impossible', err.message);
        }
    }
    rendreJournal();
}

function resumeDetails(d) {
    if (!d) return '';
    const morceaux = [];
    if (d.nom) morceaux.push(d.nom);
    if (d.commune) morceaux.push(d.commune);
    if (d.avant !== undefined || d.apres !== undefined) morceaux.push(`${d.avant ?? '—'} → ${d.apres ?? '—'}`);
    if (d.titre) morceaux.push(d.titre);
    if (d.valeur !== undefined) morceaux.push(`valeur : ${JSON.stringify(d.valeur)}`);
    if (d.supprimes !== undefined) morceaux.push(`${d.supprimes} supprimé(s)`);
    if (d.comptes !== undefined) morceaux.push(`${d.comptes} compte(s)`);
    return morceaux.join(' · ');
}

function rendreJournal() {
    const liste = (etat.journal || []).filter(l => !etat.filtreJournal || l.cible_type === etat.filtreJournal);
    $('#corpsJournal').innerHTML = liste.length ? liste.map(l => `
        <tr>
            <td>${formatDate(l.cree_le, true)}</td>
            <td>${echapper(l.auteur?.nom_complet || (l.admin_id ? 'Compte supprimé' : 'Système'))}</td>
            <td>${echapper(LIBELLES_ACTION[l.action] || l.action)}</td>
            <td><span class="badge badge-neutral">${echapper(l.cible_type || '—')}</span></td>
            <td class="details-journal">${echapper(resumeDetails(l.details))}</td>
        </tr>`).join('') : ligneVide(5, 'bi-journal-text', 'Aucune action enregistrée pour ce filtre.');
}

function exporterJournal() {
    const cellule = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lignes = [['Date', 'Auteur', 'Action', 'Type de cible', 'Cible', 'Détails']]
        .concat((etat.journal || []).map(l => [l.cree_le, l.auteur?.nom_complet || '', LIBELLES_ACTION[l.action] || l.action, l.cible_type || '', l.cible_id || '', resumeDetails(l.details)]));
    // Point-virgule et BOM : ouverture directe dans Excel en francais
    const csv = '﻿' + lignes.map(l => l.map(cellule).join(';')).join('\r\n');
    telechargerFichier(`debrisat-journal-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
}

// ============ Signalements ============

// Appele depuis le tableau des signalements de dashboard.js
export async function supprimerSignalement(id) {
    initialiser();
    if (!await confirmer('Supprimer ce signalement ?', 'Il disparaîtra de la carte, des statistiques et du classement. Cette action est définitive.', 'Supprimer')) return false;
    try {
        await adminSupprimerSignalement(id);
        succes('Signalement supprimé');
        return true;
    } catch (err) {
        erreur('Suppression impossible', err.message);
        return false;
    }
}

// ============ Satellite ============

let carteSatellite = null;
async function chargerSatellite() {
    if (carteSatellite) {
        setTimeout(() => carteSatellite.invalidateSize(), 50);
        return;
    }
    carteSatellite = L.map('carteSatelliteAdmin', { zoomSnap: 0.25 });
    initCopernicus();
    carteSatellite.createPane('analyse').style.zIndex = 420;
    carteSatellite.attributionControl.setPrefix(false);
    const fondSat = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 19, maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(carteSatellite);
    carteSatellite.getContainer().querySelector('.leaflet-tile-pane').style.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1) saturate(0.3)';
    try {
        const { metadata, exposition } = await chargerAnalyse();
        const bounds = boundsAnalyse(metadata);
        carteSatellite.fitBounds(bounds);
        const [seche, pluies] = metadata.scenes;
        new ComparateurAvantApres(carteSatellite, {
            avant: 'assets/satellite/seche-rgb.png', apres: 'assets/satellite/pluies-rgb.png', bounds,
            libelleAvant: `Saison sèche · ${formatDate(seche.date)}`, libelleApres: `Saison des pluies · ${formatDate(pluies.date)}`
        });
        L.imageOverlay('assets/satellite/changement.png', bounds, { pane: 'analyse', alt: 'Eau nouvelle' }).addTo(carteSatellite);
        carteSatellite.attributionControl.addAttribution(ATTRIBUTION_SCENES);
        const plage = Object.values(metadata.eau_nouvelle_ha_par_seuil);
        const nb = v => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v);
        const carte = (icone, valeur, libelle) => `<article class="card-stat glass-card"><span class="icone-ronde"><i class="bi ${icone}" aria-hidden="true"></i></span><p class="valeur chiffre">${valeur}</p><p class="libelle">${libelle}</p></article>`;
        $('#statsSatellite').innerHTML = [
            carte('bi-droplet-half', `${nb(metadata.eau_nouvelle_ha)} ha`, `Eau nouvelle (plage ${nb(Math.min(...plage))} à ${nb(Math.max(...plage))} ha)`),
            carte('bi-sign-turn-right', exposition ? `${nb(exposition.longueur_routes_exposees_km)} km` : '—', 'Routes exposées'),
            carte('bi-house', exposition?.batiments_exposes ?? '—', 'Bâtiments exposés'),
            carte('bi-cloud', `${nb(seche.nuages_zone_pct)} % / ${nb(pluies.nuages_zone_pct)} %`, 'Nuages sur la zone')
        ].join('');
    } catch (err) {
        erreur('Analyse satellite indisponible', err.message);
    }
}

// ============ Image a la demande (Copernicus Data Space, via la fonction Edge) ============

let calqueCdse = null;
let urlCdse = null;
const dateIso = d => d.toISOString().slice(0, 10);

function initCopernicus() {
    const aujourdhui = new Date();
    $('#champFinCdse').value = dateIso(aujourdhui);
    $('#champDebutCdse').value = dateIso(new Date(aujourdhui - 12 * 86400000));
    $('#btnRetirerCdse').addEventListener('click', retirerCdse);
    $('#formCopernicus').addEventListener('submit', async e => {
        e.preventDefault();
        $('#erreurCdse').textContent = '';
        if (MODE_DEMO) {
            $('#erreurCdse').textContent = 'Indisponible en mode démo : Supabase doit être configuré.';
            return;
        }
        const debut = $('#champDebutCdse').value;
        const fin = $('#champFinCdse').value;
        if (!debut || !fin || debut > fin) {
            $('#erreurCdse').textContent = 'Choisissez une période valide.';
            return;
        }
        const b = carteSatellite.getBounds();
        const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(v => Math.round(v * 1e5) / 1e5);
        if (bbox[2] - bbox[0] > 0.25 || bbox[3] - bbox[1] > 0.25) {
            $('#erreurCdse').textContent = 'Zone trop grande : rapprochez la carte (0,25° au plus).';
            return;
        }
        const bouton = $('#btnCdse');
        bouton.disabled = true;
        bouton.classList.add('btn-chargement');
        $('#infoCdse').textContent = 'Calcul en cours chez Copernicus…';
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const produit = $('#champProduitCdse').value;
            const reponse = await fetch(`${SUPABASE_URL}/functions/v1/imagerie-copernicus`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${session?.access_token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ produit, debut, fin, bbox })
            });
            if (!reponse.ok) {
                const corps = await reponse.json().catch(() => ({}));
                throw new Error(corps.erreur || `Erreur ${reponse.status}`);
            }
            retirerCdse();
            urlCdse = URL.createObjectURL(await reponse.blob());
            calqueCdse = L.imageOverlay(urlCdse, [[bbox[1], bbox[0]], [bbox[3], bbox[2]]], {
                pane: 'analyse', opacity: produit === 'couleurs' ? 1 : 0.85, alt: 'Image Copernicus'
            }).addTo(carteSatellite);
            carteSatellite.attributionControl.addAttribution('Copernicus Sentinel (ESA) via Copernicus Data Space Ecosystem');
            $('#btnRetirerCdse').hidden = false;
            $('#infoCdse').textContent = `Mosaïque ${produit === 'radar' ? 'Sentinel-1 la plus récente' : 'Sentinel-2 la moins nuageuse'} entre le ${formatDate(debut)} et le ${formatDate(fin)}.`;
        } catch (err) {
            $('#infoCdse').textContent = '';
            $('#erreurCdse').textContent = err.message;
        } finally {
            bouton.disabled = false;
            bouton.classList.remove('btn-chargement');
        }
    });
}

function retirerCdse() {
    calqueCdse?.remove();
    calqueCdse = null;
    if (urlCdse) URL.revokeObjectURL(urlCdse);
    urlCdse = null;
    $('#btnRetirerCdse').hidden = true;
}

// ============ WhatsApp ============

let etatTableau = null;
async function chargerWhatsapp() {
    const url = `${SUPABASE_URL}/functions/v1/webhook-whatsapp`;
    $('#urlWebhook').textContent = MODE_DEMO ? 'Mode démo : Supabase non configuré' : url;
    const recus = (etatTableau?.signalements || []).filter(s => s.source === 'whatsapp')
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const semaine = recus.filter(s => Date.now() - new Date(s.created_at) < 7 * 86400000).length;
    const carte = (icone, valeur, libelle) => `<article class="card-stat glass-card"><span class="icone-ronde"><i class="bi ${icone}" aria-hidden="true"></i></span><p class="valeur chiffre">${valeur}</p><p class="libelle">${libelle}</p></article>`;
    $('#statsWhatsapp').innerHTML = [
        carte('bi-whatsapp', formatNombre(recus.length), 'Signalements reçus'),
        carte('bi-calendar-week', formatNombre(semaine), 'Ces 7 derniers jours'),
        carte('bi-check2-circle', formatNombre(recus.filter(s => s.statut === 'resolu').length), 'Résolus')
    ].join('');
    $('#corpsWhatsapp').innerHTML = recus.length ? recus.slice(0, 20).map(s => {
        const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
        const statut = STATUTS[s.statut] || STATUTS.en_attente;
        return `<tr><td><i class="bi ${type.icone}" aria-hidden="true"></i> ${echapper(type.libelle)}</td><td>${echapper(s.commune || '—')}</td>
            <td>${formatRelatif(s.created_at)}</td><td><span class="badge ${statut.classe}">${statut.libelle}</span></td></tr>`;
    }).join('') : ligneVide(4, 'bi-whatsapp', 'Aucun signalement reçu par WhatsApp pour le moment.');

    if (MODE_DEMO) {
        $('#etatWebhook').textContent = 'Non disponible en mode démo.';
        return;
    }
    // Une requete sans signature doit etre refusee (403) : cela prouve que la fonction repond et se protege
    try {
        const reponse = await fetch(url, { method: 'POST', body: '' });
        $('#etatWebhook').innerHTML = reponse.status === 403
            ? '<span class="badge badge-success"><i class="bi bi-check-circle" aria-hidden="true"></i>En ligne</span> La fonction répond et refuse les requêtes non signées par Twilio.'
            : `<span class="badge badge-warning">Réponse inattendue (${reponse.status})</span>`;
    } catch {
        $('#etatWebhook').innerHTML = '<span class="badge badge-danger">Injoignable</span>';
    }
}

// ============ Routes ============

export function routes({ afficherSection, etat: etatDashboard }) {
    etatTableau = etatDashboard;
    const route = (section, charger) => ({
        entrer() {
            initialiser();
            afficherSection(section);
            charger();
        }
    });
    return {
        utilisateurs: route('section-utilisateurs', () => chargerUtilisateurs()),
        codes: route('section-codes', () => chargerCodes()),
        configuration: route('section-configuration', chargerConfiguration),
        journal: route('section-journal', () => chargerJournal(true)),
        satellite: route('section-satellite', chargerSatellite),
        whatsapp: route('section-whatsapp', chargerWhatsapp)
    };
}
