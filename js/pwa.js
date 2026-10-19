// Application installable et file d'attente hors ligne des signalements (IndexedDB)
import { toast, succes } from './notifications.js';

let invitationInstallation = null;
const abonnesInstallation = new Set();

export function initPwa() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker non enregistré', err));
        });
    }
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        invitationInstallation = e;
        abonnesInstallation.forEach(r => r(true));
    });
    window.addEventListener('appinstalled', () => {
        invitationInstallation = null;
        abonnesInstallation.forEach(r => r(false));
        succes('Debrisat est installée', "Retrouvez-la sur votre écran d'accueil.");
    });
    surveillerConnexion();
}

export function surInstallationPossible(rappel) {
    abonnesInstallation.add(rappel);
    rappel(!!invitationInstallation);
}

export async function installer() {
    if (!invitationInstallation) return false;
    invitationInstallation.prompt();
    const { outcome } = await invitationInstallation.userChoice;
    invitationInstallation = null;
    abonnesInstallation.forEach(r => r(false));
    return outcome === 'accepted';
}

function surveillerConnexion() {
    let bandeau = null;
    const maj = () => {
        if (navigator.onLine) {
            if (bandeau) {
                bandeau.remove();
                bandeau = null;
                toast({ type: 'success', icone: 'bi-wifi', titre: 'Connexion rétablie', duree: 3000 });
            }
            return;
        }
        if (bandeau) return;
        bandeau = document.createElement('div');
        bandeau.className = 'bandeau-hors-ligne';
        bandeau.setAttribute('role', 'status');
        bandeau.innerHTML = '<i class="bi bi-wifi-off" aria-hidden="true"></i>Hors ligne · vos signalements seront envoyés plus tard';
        document.body.appendChild(bandeau);
    };
    window.addEventListener('online', maj);
    window.addEventListener('offline', maj);
    if (!navigator.onLine) maj();
}

// ============ File d'attente ============
const NOM_BASE = 'debrisat-hors-ligne';
const MAGASIN = 'signalements';

function ouvrirBase() {
    return new Promise((resolve, reject) => {
        const requete = indexedDB.open(NOM_BASE, 1);
        requete.onupgradeneeded = () => requete.result.createObjectStore(MAGASIN, { keyPath: 'cle', autoIncrement: true });
        requete.onsuccess = () => resolve(requete.result);
        requete.onerror = () => reject(requete.error);
    });
}

function transaction(mode, action) {
    return ouvrirBase().then(base => new Promise((resolve, reject) => {
        const tx = base.transaction(MAGASIN, mode);
        const resultat = action(tx.objectStore(MAGASIN));
        tx.oncomplete = () => resolve(resultat?.result ?? resultat);
        tx.onerror = () => reject(tx.error);
    }));
}

// La photo (Blob) est stockee telle quelle : IndexedDB accepte les donnees binaires
export function mettreEnAttente(donnees, userId) {
    return transaction('readwrite', magasin => magasin.add({ donnees, userId, cree_le: Date.now() }));
}

export function elementsEnAttente() {
    return transaction('readonly', magasin => magasin.getAll());
}

function retirer(cle) {
    return transaction('readwrite', magasin => magasin.delete(cle));
}

let synchronisationEnCours = false;

export async function synchroniser(envoyer) {
    if (synchronisationEnCours || !navigator.onLine) return 0;
    synchronisationEnCours = true;
    let envoyes = 0;
    try {
        const elements = await elementsEnAttente();
        for (const element of elements) {
            try {
                await envoyer(element.donnees, element.userId);
                await retirer(element.cle);
                envoyes++;
            } catch (err) {
                console.warn('Envoi différé échoué, nouvel essai plus tard', err);
                break;
            }
        }
    } catch {
        // IndexedDB indisponible (navigation privee) : rien a synchroniser
    } finally {
        synchronisationEnCours = false;
    }
    if (envoyes) succes(`${envoyes} signalement${envoyes > 1 ? 's' : ''} envoyé${envoyes > 1 ? 's' : ''}`, 'Vos signalements enregistrés hors ligne ont été transmis.');
    return envoyes;
}

export function synchroniserAuRetour(envoyer) {
    window.addEventListener('online', () => synchroniser(envoyer));
    synchroniser(envoyer);
}
