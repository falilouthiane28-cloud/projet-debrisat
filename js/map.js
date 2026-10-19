// Carte Leaflet Debrisat
window.debrisat.carte = {
    map: null,
    marqueurs: {},
    clusteur: null,
    heatLayer: null,
    zonesLayer: null,
    heatVisible: false,
    zonesVisible: true,

    init() {
        this.map = L.map('map', {
            zoomControl: false
        }).setView(
            [window.debrisat.DAKAR_CENTER.lat, window.debrisat.DAKAR_CENTER.lng],
            window.debrisat.ZOOM_DEFAUT
        );

        L.control.zoom({ position: 'topright' }).addTo(this.map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(this.map);

        this.clusteur = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                let taille = 'small';
                if (count > 10) taille = 'medium';
                if (count > 50) taille = 'large';
                return L.divIcon({
                    html: `<div class="cluster-${taille}"><span>${count}</span></div>`,
                    className: 'marker-cluster',
                    iconSize: [40, 40]
                });
            }
        });
        this.map.addLayer(this.clusteur);

        this.zonesLayer = L.layerGroup().addTo(this.map);

        this.chargerSignalements();
        this.chargerZonesRisque();
    },

    async chargerSignalements() {
        try {
            const { data, error } = await window.debrisat.supabase
                .from('signalements')
                .select('*')
                .neq('statut', 'rejete')
                .order('created_at', { ascending: false })
                .limit(500);

            if (error) throw error;
            if (data) {
                this.clusteur.clearLayers();
                this.marqueurs = {};
                data.forEach(s => this.ajouterMarqueur(s));
                this.mettreAJourHeatmap(data);
            }
        } catch (e) {
            console.error('Erreur chargement signalements:', e);
        }
    },

    ajouterMarqueur(signalement) {
        if (!signalement.localisation) return;
        let lat, lng;
        if (typeof signalement.localisation === 'string') {
            const match = signalement.localisation.match(/POINT\(([^ ]+) ([^)]+)\)/);
            if (match) { lng = parseFloat(match[1]); lat = parseFloat(match[2]); }
        } else if (signalement.localisation.coordinates) {
            [lng, lat] = signalement.localisation.coordinates;
        } else if (signalement.lat && signalement.lng) {
            lat = signalement.lat; lng = signalement.lng;
        }
        if (!lat || !lng) return;

        const typeInfo = window.debrisat.TYPES_OBSTRUCTION[signalement.type_obstruction] || { label: signalement.type_obstruction, icone: '📌' };
        const statutInfo = window.debrisat.STATUTS[signalement.statut] || { label: signalement.statut, classe: 'badge-neutral' };

        const marqueur = L.marker([lat, lng], {
            icon: window.debrisat.utils.creerIconeMarqueur(signalement.severite)
        });

        const popupHtml = `
            <div class="marker-popup">
                ${signalement.photo_url ? `<img src="${signalement.photo_url}" alt="Photo du signalement" loading="lazy">` : ''}
                <h4>${typeInfo.icone} ${typeInfo.label}</h4>
                <div class="popup-meta">
                    <span class="badge ${statutInfo.classe}">${statutInfo.label}</span>
                    <span>Severite: ${signalement.severite}/5</span>
                </div>
                <p style="font-size:0.8125rem;color:var(--text-secondary)">
                    ${signalement.adresse || signalement.commune || 'Localisation inconnue'}<br>
                    ${window.debrisat.utils.formatDate(signalement.created_at)}
                    ${signalement.nombre_confirmations > 0 ? ` · ${signalement.nombre_confirmations} confirmation(s)` : ''}
                </p>
                ${signalement.description ? `<p style="font-size:0.8125rem;margin-top:6px">${signalement.description}</p>` : ''}
                <div class="popup-actions">
                    <button class="btn btn-primary btn-sm" onclick="confirmerSignalement('${signalement.id}')">Confirmer</button>
                    <button class="btn btn-ghost btn-sm" onclick="voirDetails('${signalement.id}')">Details</button>
                </div>
            </div>
        `;
        marqueur.bindPopup(popupHtml, { maxWidth: 300 });
        this.clusteur.addLayer(marqueur);
        this.marqueurs[signalement.id] = { marqueur, data: signalement, lat, lng };
    },

    mettreAJourMarqueur(signalement) {
        if (this.marqueurs[signalement.id]) {
            this.clusteur.removeLayer(this.marqueurs[signalement.id].marqueur);
            delete this.marqueurs[signalement.id];
        }
        this.ajouterMarqueur(signalement);
    },

    async chargerZonesRisque() {
        try {
            const { data } = await window.debrisat.supabase.from('zones_risque').select('*');
            if (!data) return;
            this.zonesLayer.clearLayers();
            data.forEach(zone => {
                const couleur = zone.score_risque > 85 ? '#E53935' :
                               zone.score_risque > 70 ? '#FF6B35' : '#FFC107';
                try {
                    if (zone.zone && typeof zone.zone === 'object' && zone.zone.coordinates) {
                        const coords = zone.zone.coordinates[0].map(c => [c[1], c[0]]);
                        L.polygon(coords, {
                            color: couleur, fillColor: couleur, fillOpacity: 0.15,
                            weight: 2
                        }).addTo(this.zonesLayer).bindPopup(
                            `<b>${zone.nom}</b><br>Commune: ${zone.commune}<br>Score risque: <b>${zone.score_risque}/100</b>`
                        );
                    }
                } catch(e) {}
            });
        } catch(e) {}
    },

    mettreAJourHeatmap(data) {
        const points = [];
        Object.values(this.marqueurs).forEach(m => {
            points.push([m.lat, m.lng, m.data.severite / 5]);
        });
        if (this.heatLayer) this.map.removeLayer(this.heatLayer);
        if (typeof L.heatLayer === 'function') {
            this.heatLayer = L.heatLayer(points, {
                radius: 30, blur: 20, maxZoom: 15,
                gradient: { 0.2: '#4CAF50', 0.5: '#FFC107', 0.8: '#FF6B35', 1: '#E53935' }
            });
            if (this.heatVisible) this.heatLayer.addTo(this.map);
        }
    },

    toggleHeatmap() {
        this.heatVisible = !this.heatVisible;
        if (this.heatVisible && this.heatLayer) {
            this.heatLayer.addTo(this.map);
        } else if (this.heatLayer) {
            this.map.removeLayer(this.heatLayer);
        }
    },

    toggleZones() {
        this.zonesVisible = !this.zonesVisible;
        if (this.zonesVisible) {
            this.map.addLayer(this.zonesLayer);
        } else {
            this.map.removeLayer(this.zonesLayer);
        }
    },

    async centrerSurUtilisateur() {
        try {
            const pos = await window.debrisat.utils.obtenirPosition();
            this.map.setView([pos.lat, pos.lng], 15);
            L.circleMarker([pos.lat, pos.lng], {
                radius: 8, fillColor: '#2196F3', fillOpacity: 1,
                color: '#fff', weight: 3
            }).addTo(this.map).bindPopup('Vous etes ici');
        } catch(e) {
            window.debrisat.utils.toast('Impossible d\'obtenir votre position', 'error');
        }
    },

    filtrer(filtres) {
        this.clusteur.clearLayers();
        Object.values(this.marqueurs).forEach(m => {
            let visible = true;
            if (filtres.type && m.data.type_obstruction !== filtres.type) visible = false;
            if (filtres.statut && m.data.statut !== filtres.statut) visible = false;
            if (filtres.severiteMin && m.data.severite < filtres.severiteMin) visible = false;
            if (filtres.commune && m.data.commune !== filtres.commune) visible = false;
            if (visible) this.clusteur.addLayer(m.marqueur);
        });
    }
};
