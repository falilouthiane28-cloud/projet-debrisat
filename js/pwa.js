// PWA : Service Worker, installation, file d'attente hors-ligne
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', async () => {
        try {
            await navigator.serviceWorker.register('sw.js');
        } catch (e) {
            console.warn('Service Worker non enregistré :', e);
        }
    });
}

window.debrisat.pwa = {
    invitation: null,

    afficherBoutonInstallation() {
        if (document.getElementById('btnInstaller')) return;
        const bouton = document.createElement('button');
        bouton.id = 'btnInstaller';
        bouton.type = 'button';
        bouton.className = 'btn btn-primary btn-sm btn-installer no-print';
        bouton.innerHTML = '<i class="bi bi-download" aria-hidden="true"></i>Installer l\'application';
        bouton.addEventListener('click', async () => {
            if (!this.invitation) return;
            this.invitation.prompt();
            const { outcome } = await this.invitation.userChoice;
            if (outcome === 'accepted') bouton.remove();
            this.invitation = null;
        });
        document.body.appendChild(bouton);
    }
};

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.debrisat.pwa.invitation = e;
    window.debrisat.pwa.afficherBoutonInstallation();
});

window.addEventListener('appinstalled', () => document.getElementById('btnInstaller')?.remove());

// File d'attente des signalements crees hors-ligne (IndexedDB)
window.debrisat.fileHorsLigne = {
    BASE: 'debrisat-hors-ligne',
    MAGASIN: 'signalements',

    ouvrir() {
        return new Promise((resolve, reject) => {
            const requete = indexedDB.open(this.BASE, 1);
            requete.onupgradeneeded = () => {
                requete.result.createObjectStore(this.MAGASIN, { keyPath: 'idLocal', autoIncrement: true });
            };
            requete.onsuccess = () => resolve(requete.result);
            requete.onerror = () => reject(requete.error);
        });
    },

    async ajouter(signalement) {
        const base = await this.ouvrir();
        await new Promise((resolve, reject) => {
            const tx = base.transaction(this.MAGASIN, 'readwrite');
            tx.objectStore(this.MAGASIN).add({ ...signalement, horodatage: Date.now() });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        window.debrisat.utils.toast('Vous êtes hors-ligne. Le signalement sera envoyé dès le retour du réseau.', 'warning', 6000);
    },

    async lister() {
        const base = await this.ouvrir();
        return new Promise((resolve) => {
            const requete = base.transaction(this.MAGASIN, 'readonly').objectStore(this.MAGASIN).getAll();
            requete.onsuccess = () => resolve(requete.result || []);
            requete.onerror = () => resolve([]);
        });
    },

    async supprimer(idLocal) {
        const base = await this.ouvrir();
        base.transaction(this.MAGASIN, 'readwrite').objectStore(this.MAGASIN).delete(idLocal);
    },

    async synchroniser() {
        try {
            const elements = await this.lister();
            let envoyes = 0;
            for (const element of elements) {
                try {
                    const { idLocal, horodatage, ...donnees } = element;
                    await window.debrisat.donnees.creerSignalement(donnees);
                    await this.supprimer(idLocal);
                    envoyes++;
                } catch (e) {
                    break;
                }
            }
            if (envoyes) window.debrisat.utils.toast(`${envoyes} signalement(s) hors-ligne envoyé(s).`, 'success');
        } catch (e) {
            console.warn('Synchronisation hors-ligne impossible :', e);
        }
    }
};

window.addEventListener('online', () => {
    window.debrisat.utils.toast('Connexion rétablie.', 'success', 3000);
    window.debrisat.fileHorsLigne.synchroniser();
});

window.addEventListener('offline', () => {
    window.debrisat.utils.toast('Vous êtes hors-ligne. La carte affiche les données en cache.', 'warning', 5000);
});
