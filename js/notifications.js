// Toasts et notifications Debrisat
window.debrisat.notifications = {
    ICONES: {
        success: 'bi-check-circle',
        error: 'bi-exclamation-octagon',
        warning: 'bi-exclamation-triangle',
        info: 'bi-info-circle'
    },
    TITRES: {
        success: 'Succès',
        error: 'Erreur',
        warning: 'Attention',
        info: 'Information'
    },

    conteneur() {
        let c = document.getElementById('toastContainer');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toastContainer';
            c.className = 'toast-container';
            c.setAttribute('aria-live', 'polite');
            document.body.appendChild(c);
        }
        return c;
    },

    toast(message, type = 'info', duree = 5000, titre) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.innerHTML = `
            <i class="bi ${this.ICONES[type] || this.ICONES.info} toast-icon" aria-hidden="true"></i>
            <div>
                <span class="toast-titre">${window.debrisat.utils.echapper(titre || this.TITRES[type] || '')}</span>
                <span>${window.debrisat.utils.echapper(message)}</span>
            </div>
            <button type="button" class="toast-close" aria-label="Fermer la notification">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>`;
        const fermer = () => {
            if (toast.classList.contains('sortie')) return;
            toast.classList.add('sortie');
            setTimeout(() => toast.remove(), 200);
        };
        toast.querySelector('.toast-close').addEventListener('click', fermer);
        let minuteur = setTimeout(fermer, duree);
        toast.addEventListener('mouseenter', () => clearTimeout(minuteur));
        toast.addEventListener('mouseleave', () => { minuteur = setTimeout(fermer, 2000); });
        this.conteneur().appendChild(toast);
        return toast;
    },

    erreur(e, contexte) {
        console.error(contexte || 'Erreur Debrisat', e);
        this.toast(e?.message || 'Une erreur inattendue est survenue. Réessayez.', 'error');
    },

    async demanderPermission() {
        if (!('Notification' in window) || Notification.permission !== 'default') return Notification?.permission;
        try {
            return await Notification.requestPermission();
        } catch (e) {
            return 'denied';
        }
    },

    envoyer(titre, message, type = 'info') {
        this.toast(message, type, 6000, titre);
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(titre, { body: message, icon: 'img/icon-192.png' });
        }
    }
};
