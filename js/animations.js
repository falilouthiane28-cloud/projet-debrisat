// Revelations au defilement et micro-interactions
window.debrisat.animations = {
    mouvementReduit: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

    initRevelations(racine = document) {
        const elements = racine.querySelectorAll('[data-reveal]:not(.revealed)');
        elements.forEach(el => {
            if (el.dataset.delay) el.style.setProperty('--reveal-delai', `${el.dataset.delay}ms`);
            if (el.dataset.duration) el.style.setProperty('--reveal-duree', `${el.dataset.duration}ms`);
        });

        if (this.mouvementReduit || !('IntersectionObserver' in window)) {
            elements.forEach(el => el.classList.add('revealed'));
            return;
        }

        const observateur = new IntersectionObserver((entrees) => {
            entrees.forEach(entree => {
                if (!entree.isIntersecting) return;
                entree.target.classList.add('revealed');
                observateur.unobserve(entree.target);
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        elements.forEach(el => observateur.observe(el));
    },

    compter(el, cible, duree = 2000) {
        const format = n => window.debrisat.utils.formatNombre(n);
        if (this.mouvementReduit) {
            el.textContent = format(cible);
            return;
        }
        const debut = performance.now();
        const etape = (maintenant) => {
            const t = Math.min(1, (maintenant - debut) / duree);
            const adouci = 1 - Math.pow(1 - t, 3);
            el.textContent = format(Math.round(cible * adouci));
            if (t < 1) requestAnimationFrame(etape);
        };
        requestAnimationFrame(etape);
    },

    compterQuandVisible(el, cible) {
        if (!('IntersectionObserver' in window)) {
            this.compter(el, cible);
            return;
        }
        const obs = new IntersectionObserver((entrees) => {
            if (entrees.some(e => e.isIntersecting)) {
                this.compter(el, cible);
                obs.disconnect();
            }
        }, { threshold: 0.4 });
        obs.observe(el);
    },

    // Grille animee tres discrete derriere le hero
    grilleHero(canvas) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const pas = 56;
        let largeur, hauteur, decalage = 0, idAnimation;

        const redimensionner = () => {
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            largeur = canvas.clientWidth;
            hauteur = canvas.clientHeight;
            canvas.width = largeur * ratio;
            canvas.height = hauteur * ratio;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        };

        const dessiner = () => {
            const clair = document.documentElement.getAttribute('data-theme') === 'light';
            ctx.clearRect(0, 0, largeur, hauteur);
            ctx.lineWidth = 1;
            const cx = largeur / 2;
            const cy = hauteur * 0.4;
            const rayon = Math.max(largeur, hauteur) * 0.6;
            for (let x = -pas + (decalage % pas); x < largeur + pas; x += pas) {
                for (let y = -pas + (decalage % pas); y < hauteur + pas; y += pas) {
                    const d = Math.hypot(x - cx, y - cy) / rayon;
                    const alpha = Math.max(0, 0.14 * (1 - d));
                    if (alpha <= 0) continue;
                    ctx.strokeStyle = clair ? `rgba(0,0,0,${alpha * 0.6})` : `rgba(255,255,255,${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + pas, y);
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + pas);
                    ctx.stroke();
                }
            }
        };

        const boucle = () => {
            decalage += 0.12;
            dessiner();
            idAnimation = requestAnimationFrame(boucle);
        };

        redimensionner();
        dessiner();
        window.addEventListener('resize', window.debrisat.utils.debounce(() => { redimensionner(); dessiner(); }, 150));
        window.addEventListener('debrisat:theme', dessiner);

        if (this.mouvementReduit) return;
        const obs = new IntersectionObserver(([entree]) => {
            if (entree.isIntersecting) idAnimation = requestAnimationFrame(boucle);
            else cancelAnimationFrame(idAnimation);
        });
        obs.observe(canvas);
    }
};

document.addEventListener('DOMContentLoaded', () => window.debrisat.animations.initRevelations());
