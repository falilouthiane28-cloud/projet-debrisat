// Page d'accueil : en-tete, carte apercu, compteurs
document.addEventListener('DOMContentLoaded', async () => {
    const D = window.debrisat;
    const u = D.utils;

    document.getElementById('anneeCourante').textContent = new Date().getFullYear();
    D.animations.grilleHero(document.getElementById('heroGrille'));

    const entete = document.getElementById('enteteAccueil');
    const majEntete = () => entete.classList.toggle('defile', window.scrollY > 24);
    window.addEventListener('scroll', majEntete, { passive: true });
    majEntete();

    const btnMenu = document.getElementById('btnMenuAccueil');
    const menu = document.getElementById('menuAccueil');
    const basculerMenu = (ouvrir) => {
        menu.classList.toggle('ouvert', ouvrir);
        btnMenu.setAttribute('aria-expanded', String(ouvrir));
        btnMenu.setAttribute('aria-label', ouvrir ? 'Fermer le menu' : 'Ouvrir le menu');
        btnMenu.querySelector('.bi').className = `bi ${ouvrir ? 'bi-x-lg' : 'bi-list'}`;
    };
    btnMenu.addEventListener('click', () => basculerMenu(!menu.classList.contains('ouvert')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) basculerMenu(false); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('ouvert')) {
            basculerMenu(false);
            btnMenu.focus();
        }
    });

    let carte = null;
    try {
        carte = D.carte.creer('carteApercu', { interactive: false, zoom: 11 });
    } catch (e) {
        document.getElementById('carteApercu').innerHTML = '<div class="etat-vide"><i class="bi bi-map" aria-hidden="true"></i><p>La carte n\'a pas pu être chargée.</p></div>';
    }

    try {
        const signalements = await D.donnees.listerSignalements();
        const actifs = signalements.filter(s => !['resolu', 'rejete'].includes(s.statut));
        if (carte) {
            actifs.filter(s => s.lat != null).forEach(s => {
                L.marker([s.lat, s.lng], { icon: D.carte.icone(s), interactive: false, keyboard: false }).addTo(carte);
            });
        }
        D.animations.compterQuandVisible(document.getElementById('compteActifs'), actifs.length);

        const stats = await D.donnees.statistiques();
        document.querySelectorAll('[data-compteur]').forEach(el => {
            D.animations.compterQuandVisible(el, stats[el.dataset.compteur] || 0);
        });
    } catch (e) {
        D.notifications.erreur(e, 'Chargement page d\'accueil');
        document.getElementById('compteActifs').textContent = '—';
    }

    if (D.supabase) {
        D.supabase.channel('accueil-signalements')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signalements' }, (payload) => {
                const s = D.donnees.normaliser(payload.new);
                const el = document.getElementById('compteActifs');
                const actuel = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
                el.textContent = u.formatNombre(actuel + 1);
                if (carte && s.lat != null) L.marker([s.lat, s.lng], { icon: D.carte.icone(s), interactive: false }).addTo(carte);
            })
            .subscribe();
    }
});
