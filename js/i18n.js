// Chargeur de traductions francais / wolof
window.debrisat.i18n = {
    CLE: 'debrisat-langue',
    langue: 'fr',

    // Traductions wolof partielles, a faire relire par un locuteur natif avant mise en production.
    // Toute cle absente retombe sur le texte francais present dans le HTML.
    DICTIONNAIRES: {
        wo: {
            'nav.fonctionnement': 'Naka lay doxe',
            'nav.direct': 'Fi mu nekk',
            'nav.chiffres': 'Limu yi',
            'nav.technologies': 'Xarala yi',
            'nav.carte': 'Kart',
            'nav.liste': 'Lim',
            'nav.signaler': 'Yëgle',
            'nav.classement': 'Rang',
            'nav.profil': 'Sama xët',
            'cta.signaler': 'Yëgle léegi',
            'cta.autorites': 'Bérab kilifa yi',
            'cta.ouvrirApp': 'Ubbi aplikasioŋ bi',
            'action.confirmer': 'Dëggal',
            'action.suivant': 'Ci kanam',
            'action.precedent': 'Ginnaaw'
        }
    },

    init() {
        this.langue = window.debrisat.utils.lireLocal(this.CLE, 'fr');
        document.querySelectorAll('[data-i18n]').forEach(el => {
            if (!el.dataset.i18nFr) el.dataset.i18nFr = el.textContent.trim();
        });
        this.appliquer();
        document.addEventListener('change', (e) => {
            if (e.target.matches('[data-action="changer-langue"]')) this.definir(e.target.value);
        });
    },

    t(cle, defaut) {
        return this.DICTIONNAIRES[this.langue]?.[cle] || defaut;
    },

    appliquer() {
        document.documentElement.lang = this.langue === 'wo' ? 'wo' : 'fr';
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = this.t(el.dataset.i18n, el.dataset.i18nFr);
        });
        document.querySelectorAll('[data-action="changer-langue"]').forEach(select => {
            select.value = this.langue;
        });
    },

    definir(langue) {
        this.langue = langue === 'wo' ? 'wo' : 'fr';
        window.debrisat.utils.ecrireLocal(this.CLE, this.langue);
        this.appliquer();
        window.debrisat.utils.toast(
            this.langue === 'wo' ? 'Wolof activé (traduction partielle).' : 'Langue : français.',
            'info', 3000
        );
    }
};

document.addEventListener('DOMContentLoaded', () => window.debrisat.i18n.init());
