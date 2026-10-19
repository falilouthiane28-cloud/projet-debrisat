// Gamification Debrisat
window.debrisat.gamification = {
    async ajouterPoints(points, raison, signalementId = null) {
        if (!window.debrisat.auth.estConnecte()) return;
        const userId = window.debrisat.auth.utilisateur.id;

        await window.debrisat.supabase.from('points_historique').insert({
            user_id: userId,
            points: points,
            raison: raison,
            signalement_id: signalementId
        });

        const { data: profil } = await window.debrisat.supabase
            .from('profils')
            .select('points_total, nombre_signalements, badges')
            .eq('id', userId)
            .single();

        if (profil) {
            const nouveauxPoints = (profil.points_total || 0) + points;
            const updates = { points_total: nouveauxPoints };
            if (raison === 'signalement') {
                updates.nombre_signalements = (profil.nombre_signalements || 0) + 1;
            }

            await window.debrisat.supabase
                .from('profils')
                .update(updates)
                .eq('id', userId);

            await this.verifierBadges(userId, nouveauxPoints, updates.nombre_signalements || profil.nombre_signalements);
            await window.debrisat.auth.chargerProfil();
        }
    },

    async verifierBadges(userId, points, nbSignalements) {
        const { data: badges } = await window.debrisat.supabase.from('badges').select('*');
        if (!badges) return;

        const { data: profil } = await window.debrisat.supabase
            .from('profils')
            .select('badges')
            .eq('id', userId)
            .single();

        const badgesActuels = profil?.badges || [];
        const idsActuels = badgesActuels.map(b => b.id || b);

        for (const badge of badges) {
            if (idsActuels.includes(badge.id)) continue;
            let debloque = false;
            if (badge.condition_signalements && nbSignalements >= badge.condition_signalements) debloque = true;
            if (badge.condition_points && points >= badge.condition_points) debloque = true;

            if (debloque) {
                badgesActuels.push({ id: badge.id, date: new Date().toISOString() });
                await window.debrisat.supabase
                    .from('profils')
                    .update({ badges: badgesActuels })
                    .eq('id', userId);

                window.debrisat.utils.toast(
                    `${badge.icone} Badge debloque : ${badge.nom} !`, 'success', 5000
                );
            }
        }
    },

    async chargerClassement() {
        const { data } = await window.debrisat.supabase
            .from('profils')
            .select('id, nom_complet, points_total, nombre_signalements, badges, commune')
            .order('points_total', { ascending: false })
            .limit(20);
        return data || [];
    },

    async chargerHistoriquePoints() {
        if (!window.debrisat.auth.estConnecte()) return [];
        const { data } = await window.debrisat.supabase
            .from('points_historique')
            .select('*')
            .eq('user_id', window.debrisat.auth.utilisateur.id)
            .order('created_at', { ascending: false })
            .limit(50);
        return data || [];
    },

    afficherClassement(container, classement) {
        if (!container) return;
        container.innerHTML = classement.map((u, i) => {
            const rang = i + 1;
            const classeRang = rang <= 3 ? ` top-${rang}` : '';
            const initiale = (u.nom_complet || '?').charAt(0).toUpperCase();
            return `
                <div class="leaderboard-item">
                    <div class="leaderboard-rank${classeRang}">${rang}</div>
                    <div class="avatar">${initiale}</div>
                    <div style="flex:1">
                        <div style="font-weight:600;font-size:0.9375rem">${u.nom_complet}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary)">${u.commune || ''} · ${u.nombre_signalements || 0} signalements</div>
                    </div>
                    <div style="font-weight:800;color:var(--primary)">${u.points_total || 0} pts</div>
                </div>
            `;
        }).join('');
    },

    afficherBadges(container, badgesUtilisateur = []) {
        if (!container) return;
        const tousLesBadges = [
            { id: 'premier_signalement', nom: 'Premier Pas', icone: '🌱' },
            { id: 'sentinelle_5', nom: 'Sentinelle', icone: '👀' },
            { id: 'gardien_10', nom: 'Gardien', icone: '🛡️' },
            { id: 'protecteur_25', nom: 'Protecteur', icone: '🏆' },
            { id: 'champion_50', nom: 'Champion', icone: '⭐' },
            { id: 'verificateur_10', nom: 'Verificateur', icone: '✅' }
        ];

        const idsObtenus = badgesUtilisateur.map(b => b.id || b);
        container.innerHTML = tousLesBadges.map(b => `
            <div class="badge-item ${idsObtenus.includes(b.id) ? '' : 'locked'}">
                <div class="badge-icon">${b.icone}</div>
                <div class="badge-name">${b.nom}</div>
            </div>
        `).join('');
    }
};
