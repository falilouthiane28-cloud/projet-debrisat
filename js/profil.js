// Page profil : niveau, badges, signalements et historique des points
window.debrisat.profil = {
    ICONES_RAISON: {
        signalement: 'bi-exclamation-triangle',
        verification: 'bi-check-circle',
        signalement_verifie: 'bi-patch-check',
        signalement_resolu: 'bi-check-lg'
    },
    LIBELLES_RAISON: {
        signalement: 'Signalement envoyé',
        verification: 'Confirmation d\'un signalement',
        signalement_verifie: 'Signalement vérifié',
        signalement_resolu: 'Signalement résolu'
    },

    async init() {
        const D = window.debrisat;
        const u = D.utils;
        await D.auth.init();
        if (!D.auth.estConnecte()) return;

        const p = D.auth.profil;
        if (!p) {
            D.notifications.toast('Profil introuvable. Complétez votre inscription.', 'warning');
            return;
        }
        const niveau = D.gamification.niveau(p.points_total || 0);
        u.$('#nomNiveau').innerHTML = `<i class="bi bi-award" aria-hidden="true"></i>${u.echapper(niveau.nom)}`;
        u.$('#numeroNiveau').textContent = niveau.numero;
        u.$('#restantNiveau').textContent = niveau.suivant ? `${niveau.restant} pts avant « ${niveau.suivant} »` : 'Niveau maximal';
        const jauge = u.$('#jaugeNiveau');
        jauge.setAttribute('aria-valuenow', niveau.progression);
        requestAnimationFrame(() => { jauge.firstElementChild.style.width = `${niveau.progression}%`; });
        u.$('#membreDepuis').textContent = p.created_at
            ? new Date(p.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
            : 'aujourd\'hui';

        const badges = p.badges || [];
        D.gamification.afficherBadges(u.$('#grilleBadges'), badges);
        u.$('#compteBadges').textContent = `${badges.length} sur ${D.BADGES.length}`;

        this.lierEvenements();
        await Promise.all([this.chargerSignalements(), this.chargerHistorique(), this.chargerRang()]);
    },

    async chargerSignalements() {
        const D = window.debrisat;
        const u = D.utils;
        const zone = u.$('#mesSignalements');
        zone.innerHTML = u.htmlSquelettes(3);
        try {
            const liste = await D.donnees.mesSignalements();
            zone.innerHTML = liste.length ? liste.slice(0, 8).map(s => {
                const type = u.infoType(s.type_obstruction);
                return `
                    <a class="card-signalement" href="app.html#carte">
                        ${u.htmlVisuel(s, 'vignette')}
                        <span class="meta">
                            <span class="titre"><i class="bi ${type.icone}" aria-hidden="true"></i>${u.echapper(type.label)}</span>
                            <span class="adresse">${u.echapper(s.adresse)}, ${u.echapper(s.commune)}</span>
                            <span class="pied">${u.htmlStatut(s.statut)}<span>${u.formatDate(s.created_at)}</span><span><i class="bi bi-check-circle" aria-hidden="true"></i> ${s.nombre_confirmations || 0}</span></span>
                        </span>
                    </a>`;
            }).join('') : '<div class="etat-vide"><i class="bi bi-camera" aria-hidden="true"></i><p>Vous n\'avez encore rien signalé.</p></div>';
        } catch (e) {
            zone.innerHTML = '<div class="etat-vide"><i class="bi bi-wifi-off" aria-hidden="true"></i><p>Impossible de charger vos signalements.</p></div>';
        } finally {
            zone.setAttribute('aria-busy', 'false');
        }
    },

    async chargerHistorique() {
        const D = window.debrisat;
        const u = D.utils;
        const zone = u.$('#historiquePoints');
        try {
            const historique = await D.donnees.historiquePoints();
            zone.innerHTML = historique.length ? historique.slice(0, 12).map(h => `
                <li>
                    <span class="avatar" aria-hidden="true"><i class="bi ${this.ICONES_RAISON[h.raison] || 'bi-star'}"></i></span>
                    <div>
                        <p>${u.echapper(h.libelle || this.LIBELLES_RAISON[h.raison] || h.raison)}</p>
                        <time datetime="${u.echapper(h.created_at)}">${u.formatDate(h.created_at)}</time>
                    </div>
                    <span class="gain">+${h.points}</span>
                </li>`).join('') : '<li class="etat-vide"><i class="bi bi-star" aria-hidden="true"></i><p>Aucun point gagné pour le moment.</p></li>';
        } catch (e) {
            zone.innerHTML = '<li class="etat-vide"><p>Historique indisponible.</p></li>';
        } finally {
            zone.setAttribute('aria-busy', 'false');
        }
    },

    async chargerRang() {
        const D = window.debrisat;
        try {
            const classement = await D.donnees.classement();
            const rang = classement.findIndex(p => p.id === D.auth.profil.id) + 1;
            D.utils.$('#rangProfil').textContent = rang ? `#${rang}` : '20+';
        } catch (e) {
            D.utils.$('#rangProfil').textContent = '—';
        }
    },

    lierEvenements() {
        const D = window.debrisat;
        document.addEventListener('click', async (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'deconnexion') {
                await D.auth.deconnexion();
                D.notifications.toast('Vous êtes déconnecté.', 'info', 3000);
                setTimeout(() => { location.href = 'index.html'; }, 600);
            }
            if (action === 'notifications') {
                const reponse = await D.notifications.demanderPermission();
                D.notifications.toast(
                    reponse === 'granted' ? 'Vous serez alerté des signalements à moins de 1 km.' : 'Notifications refusées ou non prises en charge par ce navigateur.',
                    reponse === 'granted' ? 'success' : 'warning', 4000
                );
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => window.debrisat.profil.init());
