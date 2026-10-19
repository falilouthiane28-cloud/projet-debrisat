import { echapper } from './utils.js';

const ICONES = {
    success: 'bi-check-circle',
    error: 'bi-exclamation-octagon',
    warning: 'bi-exclamation-triangle',
    info: 'bi-info-circle'
};

function conteneur() {
    let c = document.getElementById('toasts');
    if (!c) {
        c = document.createElement('div');
        c.id = 'toasts';
        c.className = 'toast-container';
        c.setAttribute('aria-live', 'polite');
        c.setAttribute('aria-relevant', 'additions');
        document.body.appendChild(c);
    }
    return c;
}

export function toast({ type = 'info', titre, message = '', duree = 5000, icone } = {}) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
        <i class="bi ${icone || ICONES[type]} toast-icon" aria-hidden="true"></i>
        <div class="toast-corps">
            ${titre ? `<p class="toast-titre">${echapper(titre)}</p>` : ''}
            ${message ? `<p class="toast-message">${echapper(message)}</p>` : ''}
        </div>
        <button type="button" class="btn-icon nu toast-close" aria-label="Fermer la notification"><i class="bi bi-x-lg" aria-hidden="true"></i></button>`;
    const c = conteneur();
    c.appendChild(el);
    while (c.children.length > 4) c.firstElementChild.remove();

    let minuteur;
    const fermer = () => {
        clearTimeout(minuteur);
        if (el.classList.contains('sortie')) return;
        el.classList.add('sortie');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 400);
    };
    const programmer = () => { if (duree) minuteur = setTimeout(fermer, duree); };
    el.querySelector('.toast-close').addEventListener('click', fermer);
    // Laisser le temps de lire : la minuterie se suspend au survol ou au focus
    el.addEventListener('pointerenter', () => clearTimeout(minuteur));
    el.addEventListener('pointerleave', programmer);
    el.addEventListener('focusin', () => clearTimeout(minuteur));
    programmer();
    return fermer;
}

export const succes = (titre, message, options) => toast({ type: 'success', titre, message, ...options });
export const erreur = (titre, message, options) => toast({ type: 'error', titre, message, duree: 7000, ...options });
export const info = (titre, message, options) => toast({ type: 'info', titre, message, ...options });
export const avertissement = (titre, message, options) => toast({ type: 'warning', titre, message, ...options });

// Message lu par les lecteurs d'ecran sans affichage
export function annoncer(message) {
    let zone = document.getElementById('annonces');
    if (!zone) {
        zone = document.createElement('div');
        zone.id = 'annonces';
        zone.className = 'sr-only';
        zone.setAttribute('aria-live', 'polite');
        document.body.appendChild(zone);
    }
    zone.textContent = '';
    requestAnimationFrame(() => { zone.textContent = message; });
}

export function permissionNotifications() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function demanderPermissionNotifications() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    return Notification.requestPermission();
}

export function notificationSysteme(titre, corps) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    try {
        new Notification(titre, { body: corps, icon: 'img/icons/icon-192.png', lang: 'fr' });
    } catch { /* certains navigateurs mobiles exigent le service worker */ }
}
