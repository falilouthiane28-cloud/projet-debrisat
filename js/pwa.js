// PWA Registration Debrisat
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((reg) => console.log('Service Worker enregistre:', reg.scope))
            .catch((err) => console.log('Erreur SW:', err));
    });
}

// Prompt d'installation
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const installBtn = document.createElement('button');
    installBtn.className = 'btn btn-primary btn-sm';
    installBtn.textContent = 'Installer l\'app';
    installBtn.style.cssText = 'position:fixed;bottom:90px;right:24px;z-index:500';
    installBtn.onclick = async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBtn.remove();
        deferredPrompt = null;
    };
    document.body.appendChild(installBtn);
});

// File d'attente offline pour signalements
window.debrisat.offlineQueue = {
    DB_NAME: 'debrisat-offline',
    STORE_NAME: 'signalements-queue',

    async ouvrirDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async ajouter(signalement) {
        try {
            const db = await this.ouvrirDB();
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).add({
                ...signalement,
                timestamp: Date.now()
            });
            window.debrisat.utils.toast('Signalement sauvegarde hors-ligne. Il sera envoye automatiquement.', 'warning');
        } catch(e) {}
    },

    async synchroniser() {
        try {
            const db = await this.ouvrirDB();
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const items = await new Promise(resolve => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve([]);
            });

            for (const item of items) {
                try {
                    const { error } = await window.debrisat.supabase
                        .from('signalements')
                        .insert(item);
                    if (!error) {
                        const delTx = db.transaction(this.STORE_NAME, 'readwrite');
                        delTx.objectStore(this.STORE_NAME).delete(item.id);
                    }
                } catch(e) {}
            }

            if (items.length > 0) {
                window.debrisat.utils.toast(`${items.length} signalement(s) synchronise(s)`, 'success');
            }
        } catch(e) {}
    }
};

window.addEventListener('online', () => {
    window.debrisat.offlineQueue.synchroniser();
});
