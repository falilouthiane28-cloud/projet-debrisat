// Mouvement : apparitions au defilement, compteurs, ressorts interruptibles et feuilles glissantes.

export const mouvementReduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============ Apparitions au defilement ============
export function initApparitions(racine = document) {
    const elements = [...racine.querySelectorAll('[data-reveal]:not(.revealed)')];
    for (const groupe of racine.querySelectorAll('[data-stagger]')) {
        [...groupe.querySelectorAll(':scope > [data-reveal]')].forEach((el, i) => {
            if (!el.dataset.delay) el.style.setProperty('--delai', `${i * 100}ms`);
        });
    }
    for (const el of elements) {
        if (el.dataset.delay) el.style.setProperty('--delai', `${el.dataset.delay}ms`);
        if (el.dataset.duration) el.style.transitionDuration = `${el.dataset.duration}ms`;
    }
    if (mouvementReduit() || !('IntersectionObserver' in window)) {
        elements.forEach(el => el.classList.add('revealed'));
        return;
    }
    const observateur = new IntersectionObserver(entrees => {
        for (const entree of entrees) {
            if (!entree.isIntersecting) continue;
            entree.target.classList.add('revealed');
            observateur.unobserve(entree.target);
        }
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    elements.forEach(el => observateur.observe(el));
}

// ============ Compteurs ============
const sortieExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function compterJusqua(el, cible, { duree = 2000, format = n => new Intl.NumberFormat('fr-FR').format(n), decimales = 0 } = {}) {
    const depart = Number(el.dataset.valeur || 0);
    el.dataset.valeur = cible;
    if (mouvementReduit() || depart === cible) {
        el.textContent = format(cible);
        return;
    }
    const debut = performance.now();
    const facteur = 10 ** decimales;
    const etape = maintenant => {
        const t = Math.min(1, (maintenant - debut) / duree);
        const valeur = Math.round((depart + (cible - depart) * sortieExpo(t)) * facteur) / facteur;
        el.textContent = format(valeur);
        if (t < 1) requestAnimationFrame(etape);
    };
    requestAnimationFrame(etape);
}

export function compterQuandVisible(el, cible, options) {
    if (!('IntersectionObserver' in window)) return compterJusqua(el, cible, options);
    const obs = new IntersectionObserver(([entree]) => {
        if (!entree.isIntersecting) return;
        obs.disconnect();
        compterJusqua(el, cible, options);
    }, { threshold: 0.4 });
    obs.observe(el);
}

// ============ Ressort ============
// Parametres a la maniere d'Apple : amortissement (1 = sans rebond) et reponse (s).
// Le ressort repart toujours de sa valeur et de sa vitesse courantes : il est interruptible.
export class Ressort {
    constructor({ valeur = 0, amortissement = 1, reponse = 0.35, surMiseAJour, surFin } = {}) {
        this.valeur = valeur;
        this.vitesse = 0;
        this.cible = valeur;
        this.amortissement = amortissement;
        this.reponse = reponse;
        this.surMiseAJour = surMiseAJour;
        this.surFin = surFin;
        this.image = null;
    }

    vers(cible, { vitesse, amortissement, reponse } = {}) {
        this.cible = cible;
        if (vitesse !== undefined) this.vitesse = vitesse;
        if (amortissement !== undefined) this.amortissement = amortissement;
        if (reponse !== undefined) this.reponse = reponse;
        if (mouvementReduit()) {
            this.fixer(cible);
            this.surFin?.(cible);
            return;
        }
        if (!this.image) {
            this.dernier = performance.now();
            this.image = requestAnimationFrame(t => this.pas(t));
        }
    }

    fixer(valeur) {
        this.arreter();
        this.valeur = valeur;
        this.cible = valeur;
        this.vitesse = 0;
        this.surMiseAJour?.(valeur);
    }

    arreter() {
        if (this.image) cancelAnimationFrame(this.image);
        this.image = null;
    }

    pas(maintenant) {
        const dt = Math.min(0.064, (maintenant - this.dernier) / 1000);
        this.dernier = maintenant;
        const raideur = (2 * Math.PI / this.reponse) ** 2;
        const frottement = (4 * Math.PI * this.amortissement) / this.reponse;
        // Sous-pas fixes : integration stable meme si une image prend du retard
        const sousPas = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / sousPas;
        for (let i = 0; i < sousPas; i++) {
            const acceleration = -raideur * (this.valeur - this.cible) - frottement * this.vitesse;
            this.vitesse += acceleration * h;
            this.valeur += this.vitesse * h;
        }
        this.surMiseAJour?.(this.valeur);
        if (Math.abs(this.vitesse) < 2 && Math.abs(this.valeur - this.cible) < 0.5) {
            this.valeur = this.cible;
            this.vitesse = 0;
            this.image = null;
            this.surMiseAJour?.(this.valeur);
            this.surFin?.(this.valeur);
            return;
        }
        this.image = requestAnimationFrame(t => this.pas(t));
    }
}

// Projection de l'elan (fonction utilisee par UIKit pour la deceleration du defilement)
export function projeter(vitesse, deceleration = 0.99) {
    return (vitesse / 1000) * deceleration / (1 - deceleration);
}

// Resistance progressive au-dela d'une limite
export function elastique(depassement, dimension, constante = 0.55) {
    return (depassement * dimension * constante) / (dimension + constante * Math.abs(depassement));
}

// ============ Feuille (bottom sheet sur mobile, modale ou panneau sur ordinateur) ============
const requeteBureau = matchMedia('(min-width: 768px)');
const SELECTEUR_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const pileFeuilles = [];

export class Feuille {
    constructor(element, { surFermeture, modaleSurBureau } = {}) {
        this.el = element;
        this.surFermeture = surFermeture;
        this.ouverte = false;
        this.modeBureau = element.dataset.desktop || 'modale';
        // Un panneau lateral sur ordinateur ne bloque pas le reste de l'interface
        this.bloquante = () => !requeteBureau.matches || this.modeBureau === 'modale' || modaleSurBureau;
        this.voile = document.createElement('div');
        this.voile.className = 'modal-overlay';
        this.voile.hidden = true;
        this.voile.addEventListener('click', () => this.fermer());
        element.before(this.voile);

        this.ressort = new Ressort({
            valeur: 0,
            surMiseAJour: y => this.appliquerPosition(y)
        });
        this.hauteur = 0;
        this.el.setAttribute('role', element.getAttribute('role') || 'dialog');
        this.el.setAttribute('tabindex', '-1');
        this.el.hidden = true;

        this.el.addEventListener('keydown', e => this.clavier(e));
        this.el.addEventListener('click', e => {
            if (e.target.closest('[data-fermer]')) this.fermer();
        });
        for (const poignee of this.el.querySelectorAll('.bottom-sheet-handle, .modal-header')) {
            poignee.addEventListener('pointerdown', e => this.debutGlisser(e));
        }
        requeteBureau.addEventListener('change', () => { if (this.ouverte) this.reinitialiserMode(); });
    }

    estMobile() { return !requeteBureau.matches; }

    appliquerPosition(y) {
        this.el.style.transform = `translate3d(0, ${y}px, 0)`;
        if (this.hauteur) {
            const ratio = Math.max(0, Math.min(1, 1 - y / this.hauteur));
            this.voile.style.opacity = String(ratio);
        }
    }

    reinitialiserMode() {
        this.ressort.arreter();
        if (this.estMobile()) {
            this.el.classList.remove('ouverte');
            this.hauteur = this.el.getBoundingClientRect().height;
            this.ressort.fixer(0);
        } else {
            this.el.style.transform = '';
            this.voile.style.opacity = '';
            this.el.classList.add('ouverte');
        }
        this.voile.hidden = !this.bloquante();
        this.voile.classList.toggle('ouvert', this.bloquante());
    }

    ouvrir() {
        clearTimeout(this.minuteurFermeture);
        const dejaOuverte = this.ouverte;
        this.ouverte = true;
        if (!dejaOuverte) {
            this.focusPrecedent = document.activeElement;
            if (!pileFeuilles.includes(this)) pileFeuilles.push(this);
        }
        this.el.hidden = false;
        this.voile.hidden = !this.bloquante();
        this.el.setAttribute('aria-modal', String(this.bloquante()));

        if (this.estMobile()) {
            this.el.style.transition = 'none';
            this.hauteur = this.el.getBoundingClientRect().height;
            // Reprend depuis la position affichee si la feuille etait en train de se fermer
            if (!this.ressort.image && !dejaOuverte) this.ressort.fixer(this.hauteur + 24);
            this.voile.classList.remove('ouvert');
            this.voile.style.transition = 'none';
            this.ressort.surFin = null;
            this.ressort.vers(0, { amortissement: 1, reponse: 0.38 });
            if (mouvementReduit()) {
                this.el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
                this.voile.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
            }
        } else {
            this.el.style.transform = '';
            this.voile.style.opacity = '';
            this.voile.style.transition = '';
            requestAnimationFrame(() => {
                this.el.classList.add('ouverte');
                this.voile.classList.add('ouvert');
            });
        }
        requestAnimationFrame(() => {
            const cible = this.el.querySelector('[autofocus]') || this.el.querySelector(SELECTEUR_FOCUSABLE) || this.el;
            cible.focus({ preventScroll: true });
        });
        document.documentElement.style.overflow = this.bloquante() ? 'hidden' : '';
    }

    fermer({ vitesse = 0, silencieux = false } = {}) {
        if (!this.ouverte) return;
        this.ouverte = false;
        const index = pileFeuilles.indexOf(this);
        if (index >= 0) pileFeuilles.splice(index, 1);
        if (!pileFeuilles.some(f => f.bloquante())) document.documentElement.style.overflow = '';

        const terminer = () => {
            if (this.ouverte) return;
            this.el.hidden = true;
            this.voile.hidden = true;
            this.el.classList.remove('ouverte');
        };
        if (this.estMobile()) {
            this.hauteur = this.el.getBoundingClientRect().height;
            this.ressort.surFin = terminer;
            this.ressort.vers(this.hauteur + 24, { vitesse, amortissement: 1, reponse: 0.32 });
        } else {
            this.el.classList.remove('ouverte');
            this.voile.classList.remove('ouvert');
            this.minuteurFermeture = setTimeout(terminer, 320);
        }
        if (this.focusPrecedent && document.contains(this.focusPrecedent)) {
            this.focusPrecedent.focus({ preventScroll: true });
        }
        if (!silencieux) this.surFermeture?.();
    }

    basculer() { this.ouverte ? this.fermer() : this.ouvrir(); }

    clavier(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.fermer();
            return;
        }
        if (e.key !== 'Tab' || !this.bloquante()) return;
        const focusables = [...this.el.querySelectorAll(SELECTEUR_FOCUSABLE)].filter(el => el.offsetParent !== null);
        if (!focusables.length) return;
        const premier = focusables[0];
        const dernier = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
        else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }

    // Glisser pour fermer : suivi 1:1, elastique vers le haut, projection de l'elan au relachement
    debutGlisser(e) {
        if (!this.estMobile() || e.button > 0) return;
        if (e.target.closest('button, a, input, select, textarea')) return;
        e.preventDefault();
        const zone = e.currentTarget;
        try { zone.setPointerCapture(e.pointerId); } catch { /* pointeur deja relache */ }
        this.ressort.arreter();
        this.hauteur = this.el.getBoundingClientRect().height;
        const departY = e.clientY;
        const departValeur = this.ressort.valeur;
        const historique = [{ y: e.clientY, t: e.timeStamp }];
        let engage = false;

        const deplacer = ev => {
            const delta = ev.clientY - departY;
            if (!engage && Math.abs(delta) < 6) return;
            engage = true;
            let y = departValeur + delta;
            if (y < 0) y = elastique(y, this.hauteur);
            this.ressort.fixer(y);
            historique.push({ y: ev.clientY, t: ev.timeStamp });
            if (historique.length > 6) historique.shift();
        };
        const relacher = () => {
            zone.removeEventListener('pointermove', deplacer);
            zone.removeEventListener('pointerup', relacher);
            zone.removeEventListener('pointercancel', relacher);
            if (!engage) return;
            const a = historique[0];
            const b = historique[historique.length - 1];
            const vitesse = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
            const projection = this.ressort.valeur + projeter(vitesse);
            if (projection > this.hauteur * 0.45 || vitesse > 900) {
                this.fermer({ vitesse });
            } else {
                // Leger rebond uniquement parce que le geste portait de l'elan
                this.ressort.vers(0, { vitesse, amortissement: 0.82, reponse: 0.3 });
            }
        };
        zone.addEventListener('pointermove', deplacer);
        zone.addEventListener('pointerup', relacher);
        zone.addEventListener('pointercancel', relacher);
    }
}

export function feuilleOuverte() {
    return pileFeuilles[pileFeuilles.length - 1] || null;
}

// Retour au toucher sur iOS : sans ecouteur, Safari n'applique pas :active
export function initRetourTactile() {
    document.addEventListener('touchstart', () => {}, { passive: true });
}

export function celebrer(element) {
    if (mouvementReduit() || !element?.animate) return;
    element.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
        { duration: 450, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
    );
}
