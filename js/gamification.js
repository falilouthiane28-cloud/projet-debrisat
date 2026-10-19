// Points, niveaux, badges et classement
window.debrisat.gamification = {
    NIVEAUX: [
        { min: 0, nom: 'Observateur' },
        { min: 50, nom: 'Vigie' },
        { min: 150, nom: 'Sentinelle' },
        { min: 300, nom: 'Gardien' },
        { min: 600, nom: 'Protecteur' },
        { min: 1000, nom: 'Légende de Dakar' }
    ],

    niveau(points = 0) {
        const index = this.NIVEAUX.findLastIndex(n => points >= n.min);
        const actuel = this.NIVEAUX[index];
        const suivant = this.NIVEAUX[index + 1];
        return {
            numero: index + 1,
            nom: actuel.nom,
            suivant: suivant?.nom || null,
            restant: suivant ? suivant.min - points : 0,
            progression: suivant ? Math.round(((points - actuel.min) / (suivant.min - actuel.min)) * 100) : 100
        };
    },

    async ajouterPoints(points, raison, signalementId = null) {
        const D = window.debrisat;
        if (!D.auth.estConnecte()) return [];

        let profil;
        if (D.modeDemo) {
            const etat = D.donnees.demo.etat();
            profil = { ...D.donnees.demo.profil() };
            profil.points_total += points;
            if (raison === 'signalement') profil.nombre_signalements += 1;
            if (raison === 'verification') profil.nombre_verifications = (profil.nombre_verifications || 0) + 1;
            etat.profil = { ...(etat.profil || {}), ...profil };
            D.donnees.demo.sauver(etat);
        } else {
            const userId = D.auth.utilisateur.id;
            await D.supabase.from('points_historique').insert({ user_id: userId, points, raison, signalement_id: signalementId });
            const { data } = await D.supabase.from('profils').select('*').eq('id', userId).single();
            if (!data) return [];
            const maj = { points_total: (data.points_total || 0) + points };
            if (raison === 'signalement') maj.nombre_signalements = (data.nombre_signalements || 0) + 1;
            await D.supabase.from('profils').update(maj).eq('id', userId);
            profil = { ...data, ...maj };
        }

        const nouveaux = await this.verifierBadges(profil);
        await D.auth.chargerProfil();
        D.auth.majUI();
        return nouveaux;
    },

    async verifierBadges(profil) {
        const D = window.debrisat;
        const obtenus = (profil.badges || []).map(b => b.id || b);
        const nouveaux = D.BADGES.filter(b => {
            if (obtenus.includes(b.id)) return false;
            if (b.condition_signalements) return (profil.nombre_signalements || 0) >= b.condition_signalements;
            if (b.condition_verifications) return (profil.nombre_verifications || 0) >= b.condition_verifications;
            return false;
        });
        if (!nouveaux.length) return [];

        const badges = [...(profil.badges || []), ...nouveaux.map(b => ({ id: b.id, date: new Date().toISOString() }))];
        if (D.modeDemo) {
            const etat = D.donnees.demo.etat();
            etat.profil = { ...(etat.profil || {}), badges };
            D.donnees.demo.sauver(etat);
        } else {
            await D.supabase.from('profils').update({ badges }).eq('id', profil.id);
        }
        nouveaux.forEach(b => D.notifications.toast(`${b.nom} — ${b.description}`, 'success', 6000, 'Badge débloqué'));
        return nouveaux;
    },

    afficherClassement(conteneur, classement, idMoi) {
        const u = window.debrisat.utils;
        if (!classement.length) {
            conteneur.innerHTML = '<li class="etat-vide"><i class="bi bi-trophy" aria-hidden="true"></i><p>Aucun participant pour le moment.</p></li>';
            return;
        }
        conteneur.innerHTML = classement.map((p, i) => {
            const rang = i + 1;
            const moi = p.id === idMoi;
            const initiales = (p.nom_complet || '?').split(/\s+/).map(m => m[0]).slice(0, 2).join('').toUpperCase();
            const rangHtml = rang <= 3
                ? `<i class="bi bi-award-fill" aria-hidden="true"></i><span class="sr-only">${rang}</span>`
                : rang;
            return `
                <li class="${moi ? 'moi' : ''}" ${moi ? 'aria-current="true"' : ''}>
                    <span class="rang rang-${rang}">${rangHtml}</span>
                    <span class="avatar" aria-hidden="true">${u.echapper(initiales)}</span>
                    <div style="min-width:0">
                        <p class="nom">${u.echapper(p.nom_complet)}${moi ? ' <span class="badge badge-neutral">Vous</span>' : ''}</p>
                        <p class="sous-texte">${u.echapper(p.commune || 'Dakar')} · ${p.nombre_signalements || 0} signalements</p>
                    </div>
                    <span class="points">${u.formatNombre(p.points_total || 0)}<small>points</small></span>
                </li>`;
        }).join('');
    },

    afficherBadges(conteneur, badgesObtenus = []) {
        const u = window.debrisat.utils;
        const obtenus = new Map(badgesObtenus.map(b => [b.id || b, b.date]));
        conteneur.innerHTML = window.debrisat.BADGES.map(b => {
            const date = obtenus.get(b.id);
            const debloque = obtenus.has(b.id);
            return `
                <li class="card card-badge ${debloque ? '' : 'verrouille'}">
                    <span class="badge-medaille"><i class="bi ${debloque ? b.icone : 'bi-lock'}" aria-hidden="true"></i></span>
                    <span class="badge-nom">${u.echapper(b.nom)}</span>
                    <span class="badge-desc">${u.echapper(b.description)}</span>
                    <span class="texte-xs ${debloque ? 'texte-secondaire' : 'texte-muet'}">
                        ${debloque ? `<i class="bi bi-award" aria-hidden="true"></i> Obtenu${date ? ' le ' + new Date(date).toLocaleDateString('fr-FR') : ''}` : 'À débloquer'}
                    </span>
                </li>`;
        }).join('');
    }
};
