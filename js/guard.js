// Protection des pages par role, et mode maintenance.
// La securite reelle est dans la RLS : ce garde evite seulement d'afficher une interface inutile.
import { MODE_DEMO } from './config.js';
import { initAuth, estConnecte, profilCourant, accueilRole } from './auth.js';
import { lireConfig } from './donnees.js';

const PAGE = location.pathname.split('/').pop() || 'index.html';

function versConnexion() {
    location.replace(`auth.html?retour=${encodeURIComponent(PAGE + location.hash)}`);
}

// Ecran plein « site en maintenance », sans dependance a la page
function afficherMaintenance() {
    const ecran = document.createElement('div');
    ecran.className = 'ecran-maintenance';
    ecran.setAttribute('role', 'alert');
    ecran.innerHTML = `
        <div class="glass-card pile" style="max-width:420px;text-align:center;align-items:center">
            <i class="bi bi-tools" aria-hidden="true" style="font-size:2rem"></i>
            <h1 class="h3">Site en maintenance</h1>
            <p class="texte-secondaire">Debrisat est en cours de mise à jour. Revenez dans quelques minutes.</p>
        </div>`;
    document.body.append(ecran);
    document.body.classList.add('en-maintenance');
}

/**
 * roles : liste des roles autorises, ou null pour une page ouverte a tous (connecte ou non).
 * Retourne true si la page peut s'afficher.
 */
export async function garderPage({ roles = null } = {}) {
    await initAuth();
    const profil = profilCourant();

    if (!MODE_DEMO && profil?.role !== 'admin') {
        try {
            if ((await lireConfig()).maintenance === true) {
                afficherMaintenance();
                return false;
            }
        } catch { /* configuration illisible : on n'empeche pas l'acces */ }
    }

    if (!roles) return true;
    if (!estConnecte()) {
        versConnexion();
        return false;
    }
    if (!profil || !roles.includes(profil.role)) {
        location.replace(accueilRole());
        return false;
    }
    return true;
}
