// Gestionnaire d'etat de page base sur le fragment d'URL (#vue).
// Chaque vue declare entrer() / sortir() ; le bouton retour du navigateur fonctionne naturellement.
export class Routeur {
    constructor(vues, { defaut, surChangement } = {}) {
        this.vues = vues;
        this.defaut = defaut || Object.keys(vues)[0];
        this.surChangement = surChangement;
        this.courante = null;
        this.parametres = new URLSearchParams();
        this.gerer = this.gerer.bind(this);
    }

    demarrer() {
        window.addEventListener('hashchange', this.gerer);
        document.addEventListener('click', e => {
            const lien = e.target.closest('[data-route]');
            if (!lien || lien.tagName === 'A') return;
            e.preventDefault();
            this.aller(lien.dataset.route);
        });
        this.gerer();
    }

    lire() {
        const brut = location.hash.slice(1);
        const [nom, requete = ''] = brut.split('?');
        return { nom: this.vues[nom] ? nom : this.defaut, parametres: new URLSearchParams(requete), connu: !!this.vues[nom] };
    }

    gerer() {
        const { nom, parametres } = this.lire();
        const precedente = this.courante;
        this.parametres = parametres;
        if (precedente === nom) {
            this.vues[nom].actualiser?.(parametres);
            return;
        }
        if (precedente) this.vues[precedente].sortir?.(nom);
        this.courante = nom;
        this.marquerNavigation(nom);
        this.vues[nom].entrer?.(parametres, precedente);
        this.surChangement?.(nom, precedente);
    }

    // remplacer : true pour ne pas empiler d'entree d'historique (fermeture d'un panneau par exemple)
    aller(nom, { parametres, remplacer = false } = {}) {
        const requete = parametres ? '?' + new URLSearchParams(parametres).toString() : '';
        const hash = `#${nom}${requete}`;
        if (location.hash === hash) return this.gerer();
        if (remplacer) {
            history.replaceState(history.state, '', hash);
            this.gerer();
        } else {
            location.hash = hash;
        }
    }

    marquerNavigation(nom) {
        for (const el of document.querySelectorAll('[data-route]')) {
            const actif = el.dataset.route === nom;
            el.classList.toggle('active', actif);
            if (actif) el.setAttribute('aria-current', 'page');
            else el.removeAttribute('aria-current');
        }
    }
}
