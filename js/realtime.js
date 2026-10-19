// Realtime subscriptions Debrisat
window.debrisat.realtime = {
    positionUtilisateur: null,

    init() {
        this.obtenirPositionUtilisateur();

        window.debrisat.supabase
            .channel('signalements-realtime')
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'signalements'
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    window.debrisat.carte.ajouterMarqueur(payload.new);
                    this.notifierSiProche(payload.new);
                }
                if (payload.eventType === 'UPDATE') {
                    window.debrisat.carte.mettreAJourMarqueur(payload.new);
                }
            })
            .subscribe();
    },

    async obtenirPositionUtilisateur() {
        try {
            this.positionUtilisateur = await window.debrisat.utils.obtenirPosition();
        } catch(e) {}
    },

    notifierSiProche(signalement) {
        if (!this.positionUtilisateur || !signalement.localisation) return;
        let lat, lng;
        if (typeof signalement.localisation === 'string') {
            const m = signalement.localisation.match(/POINT\(([^ ]+) ([^)]+)\)/);
            if (m) { lng = parseFloat(m[1]); lat = parseFloat(m[2]); }
        } else if (signalement.localisation.coordinates) {
            [lng, lat] = signalement.localisation.coordinates;
        }
        if (!lat || !lng) return;

        const dist = window.debrisat.utils.distance(
            this.positionUtilisateur.lat, this.positionUtilisateur.lng, lat, lng
        );
        if (dist < 1) {
            const typeInfo = window.debrisat.TYPES_OBSTRUCTION[signalement.type_obstruction] || {};
            window.debrisat.utils.toast(
                `${typeInfo.icone || '📍'} Nouveau signalement a ${Math.round(dist * 1000)}m de vous`,
                'info', 5000
            );
        }
    }
};
