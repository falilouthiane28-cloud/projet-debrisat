// Gestion des vues par ancre (#carte, #liste, ...) pour l'app et le dashboard
window.debrisat.router = {
    vues: [],
    actuelle: null,
    actions: {},
    surChangement: null,

    init({ vues, defaut, actions = {}, surChangement }) {
        this.vues = vues;
        this.defaut = defaut;
        this.actions = actions;
        this.surChangement = surChangement;
        window.addEventListener('hashchange', () => this.lire());
        this.lire();
    },

    lire() {
        const cible = decodeURIComponent(location.hash.slice(1));
        if (this.actions[cible]) {
            history.replaceState(null, '', `#${this.actuelle || this.defaut}`);
            this.activer(this.actuelle || this.defaut);
            this.actions[cible]();
            return;
        }
        this.activer(this.vues.includes(cible) ? cible : this.defaut);
    },

    activer(vue) {
        const precedente = this.actuelle;
        this.actuelle = vue;
        document.querySelectorAll('[data-vue]').forEach(el => {
            el.hidden = !el.dataset.vue.split(' ').includes(vue);
        });
        document.querySelectorAll('[data-route]').forEach(lien => {
            const actif = lien.dataset.route === vue;
            lien.classList.toggle('active', actif);
            if (actif) lien.setAttribute('aria-current', 'page');
            else lien.removeAttribute('aria-current');
        });
        if (precedente !== vue) this.surChangement?.(vue, precedente);
    },

    aller(vue) {
        if (location.hash === `#${vue}`) this.lire();
        else location.hash = vue;
    }
};
