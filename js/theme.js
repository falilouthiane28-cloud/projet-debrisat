// Theme sombre/clair — charge dans <head> pour eviter le flash de theme
window.debrisat = window.debrisat || {};

window.debrisat.theme = {
    CLE: 'debrisat-theme',

    lire() {
        try {
            return localStorage.getItem(this.CLE);
        } catch (e) {
            return null;
        }
    },

    actuel() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    },

    appliquer(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'light' ? '#FFFFFF' : '#0A0A0A');
        this.synchroniserBoutons();
        window.dispatchEvent(new CustomEvent('debrisat:theme', { detail: { theme } }));
    },

    definir(theme) {
        try {
            localStorage.setItem(this.CLE, theme);
        } catch (e) { /* stockage indisponible : le theme reste valable pour la session */ }
        this.appliquer(theme);
    },

    basculer() {
        this.definir(this.actuel() === 'dark' ? 'light' : 'dark');
    },

    synchroniserBoutons() {
        const sombre = this.actuel() === 'dark';
        document.querySelectorAll('[data-action="basculer-theme"]').forEach(btn => {
            btn.setAttribute('aria-label', sombre ? 'Passer en mode clair' : 'Passer en mode sombre');
            btn.setAttribute('title', sombre ? 'Mode clair' : 'Mode sombre');
            const icone = btn.querySelector('.bi');
            if (icone) icone.className = `bi ${sombre ? 'bi-sun' : 'bi-moon'}`;
        });
        document.querySelectorAll('[data-reglage="theme"]').forEach(input => {
            input.checked = !sombre;
        });
    }
};

document.documentElement.setAttribute('data-theme', window.debrisat.theme.lire() === 'light' ? 'light' : 'dark');

document.addEventListener('DOMContentLoaded', () => {
    window.debrisat.theme.appliquer(window.debrisat.theme.actuel());
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="basculer-theme"]')) window.debrisat.theme.basculer();
    });
    document.addEventListener('change', (e) => {
        if (e.target.matches('[data-reglage="theme"]')) {
            window.debrisat.theme.definir(e.target.checked ? 'light' : 'dark');
        }
    });
});
