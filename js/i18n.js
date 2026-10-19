// Traductions : le francais est ecrit directement dans le HTML ; les autres langues
// remplacent les textes marques data-i18n. Une cle absente garde le texte francais.
import { lireStockage, ecrireStockage } from './utils.js';

const CLE = 'debrisat-langue';
export const LANGUES = { fr: 'Français', wo: 'Wolof (bêta)' };
const originaux = new WeakMap();
const attributsOriginaux = new WeakMap();

export const langueCourante = () => {
    const l = lireStockage(CLE, 'fr');
    return LANGUES[l] ? l : 'fr';
};

async function chargerDictionnaire(langue) {
    if (langue === 'fr') return {};
    try {
        const reponse = await fetch(`i18n/${langue}.json`, { cache: 'force-cache' });
        if (!reponse.ok) throw new Error();
        return await reponse.json();
    } catch {
        return {};
    }
}

export async function appliquerLangue(langue = langueCourante(), racine = document) {
    const dico = await chargerDictionnaire(langue);
    document.documentElement.lang = langue;
    for (const el of racine.querySelectorAll('[data-i18n]')) {
        if (!originaux.has(el)) originaux.set(el, el.textContent);
        const valeur = dico[el.dataset.i18n];
        el.textContent = valeur || originaux.get(el);
    }
    for (const el of racine.querySelectorAll('[data-i18n-attr]')) {
        if (!attributsOriginaux.has(el)) attributsOriginaux.set(el, {});
        const memoire = attributsOriginaux.get(el);
        for (const paire of el.dataset.i18nAttr.split(';')) {
            const [attribut, cle] = paire.split(':').map(s => s.trim());
            if (!(attribut in memoire)) memoire[attribut] = el.getAttribute(attribut) || '';
            el.setAttribute(attribut, dico[cle] || memoire[attribut]);
        }
    }
}

export async function definirLangue(langue) {
    ecrireStockage(CLE, langue);
    await appliquerLangue(langue);
}

export function initI18n() {
    if (langueCourante() !== 'fr') appliquerLangue();
}
