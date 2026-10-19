import { lireStockage, ecrireStockage } from './utils.js';

const CLE = 'debrisat-theme';
const requeteClair = matchMedia('(prefers-color-scheme: light)');

// Preference : 'sombre' (par defaut), 'clair' ou 'systeme'
export function preferenceTheme() {
    const p = lireStockage(CLE, 'sombre');
    return ['sombre', 'clair', 'systeme'].includes(p) ? p : 'sombre';
}

export function themeEffectif(preference = preferenceTheme()) {
    if (preference === 'systeme') return requeteClair.matches ? 'clair' : 'sombre';
    return preference;
}

function appliquer(theme) {
    const racine = document.documentElement;
    if (theme === 'clair') racine.setAttribute('data-theme', 'light');
    else racine.removeAttribute('data-theme');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'clair' ? '#FFFFFF' : '#0A0A0A');
    document.dispatchEvent(new CustomEvent('theme-change', { detail: { theme } }));
    for (const bouton of document.querySelectorAll('[data-action="basculer-theme"]')) {
        const clair = theme === 'clair';
        // Le libelle change avec l'etat : pas d'aria-pressed, qui doublerait l'information
        bouton.setAttribute('aria-label', clair ? 'Passer en mode sombre' : 'Passer en mode clair');
        const icone = bouton.querySelector('.bi');
        if (icone) icone.className = `bi ${clair ? 'bi-moon' : 'bi-sun'}`;
    }
}

// Fondu enchaine de toute la page : evite un saut de luminosite brutal
function avecTransition(action) {
    const racine = document.documentElement;
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    racine.classList.add('theme-en-cours');
    const fin = () => requestAnimationFrame(() => racine.classList.remove('theme-en-cours'));
    if (document.startViewTransition && !reduit && document.visibilityState === 'visible') {
        document.startViewTransition(action).finished.finally(fin);
    } else {
        action();
        fin();
    }
}

export function definirTheme(preference) {
    ecrireStockage(CLE, preference);
    avecTransition(() => appliquer(themeEffectif(preference)));
}

export function basculerTheme() {
    definirTheme(themeEffectif() === 'clair' ? 'sombre' : 'clair');
}

export function initTheme() {
    appliquer(themeEffectif());
    requeteClair.addEventListener('change', () => {
        if (preferenceTheme() === 'systeme') avecTransition(() => appliquer(themeEffectif()));
    });
    document.addEventListener('click', e => {
        if (e.target.closest('[data-action="basculer-theme"]')) basculerTheme();
    });
}
