// Abonnements temps reel (Supabase Realtime) et simulation en mode demo
window.debrisat.realtime = {
    position: null,
    canal: null,

    async init({ surInsertion, surMiseAJour, notifierProximite = true } = {}) {
        const D = window.debrisat;
        if (notifierProximite) {
            D.utils.obtenirPosition().then(p => { this.position = p; }).catch(() => {});
        }

        const recevoir = (s, nouveau) => {
            if (nouveau) {
                surInsertion?.(s);
                if (notifierProximite) this.notifierSiProche(s);
            } else {
                surMiseAJour?.(s);
            }
        };

        if (D.modeDemo) {
            this.simuler(s => recevoir(s, true));
            return;
        }

        this.canal = D.supabase
            .channel(`signalements-${Math.random().toString(36).slice(2, 8)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'signalements' }, (payload) => {
                if (payload.eventType === 'DELETE') return;
                recevoir(D.donnees.normaliser(payload.new), payload.eventType === 'INSERT');
            })
            .subscribe((statut) => {
                if (statut === 'CHANNEL_ERROR') D.notifications.toast('Connexion temps réel interrompue. Rechargez la page.', 'warning');
            });
    },

    notifierSiProche(s) {
        const D = window.debrisat;
        if (!this.position || s.lat == null) return;
        const km = D.utils.distance(this.position.lat, this.position.lng, s.lat, s.lng);
        if (km > 1) return;
        const type = D.utils.infoType(s.type_obstruction).label;
        D.notifications.envoyer('Signalement près de vous', `${type} à ${Math.round(km * 1000)} m — ${s.adresse || s.commune}`, 'info');
    },

    // En demo, un signalement fictif arrive de temps en temps pour illustrer le temps reel
    simuler(rappel) {
        const D = window.debrisat;
        const modeles = [
            { type_obstruction: 'plastiques', severite: 3, commune: 'Pikine', adresse: 'Marché Zinc', lat: 14.7561, lng: -17.3897, auteur: 'Moussa Ndiaye', source: 'webapp' },
            { type_obstruction: 'canal_bouche', severite: 5, commune: 'Guédiawaye', adresse: 'Golf Sud, canal de drainage', lat: 14.7802, lng: -17.3978, auteur: 'Khady Gueye', source: 'whatsapp' },
            { type_obstruction: 'tas_sable', severite: 2, commune: 'Parcelles Assainies', adresse: 'Unité 10, caniveau Est', lat: 14.7652, lng: -17.4371, auteur: 'Pape Diouf', source: 'webapp' },
            { type_obstruction: 'eau_stagnante', severite: 4, commune: 'Keur Massar', adresse: 'Jaaxaay, Unité 3', lat: 14.7851, lng: -17.3133, auteur: 'Détection Sentinel-2', source: 'satellite' }
        ];
        let index = 0;
        const planifier = (delai) => setTimeout(() => {
            if (document.hidden) {
                planifier(30000);
                return;
            }
            const m = modeles[index++ % modeles.length];
            const maintenant = new Date().toISOString();
            rappel({
                ...m,
                id: `demo-direct-${Date.now()}`,
                user_id: m.source === 'satellite' ? null : 'citoyen-direct',
                description: 'Nouveau signalement reçu en direct.',
                photo_url: null,
                statut: 'en_attente',
                nombre_confirmations: 0,
                priorite: m.severite >= 4 ? 'haute' : 'normale',
                created_at: maintenant,
                updated_at: maintenant
            });
            if (index < modeles.length) planifier(90000);
        }, delai);
        planifier(25000);
    }
};
