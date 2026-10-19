// Cartographie Leaflet : fonds sombre/clair, marqueurs de severite, popups en verre
window.debrisat.carte = {
    creer(element, { interactive = true, centre, zoom } = {}) {
        const D = window.debrisat;
        const depart = centre || D.DAKAR_CENTRE;
        const carte = L.map(element, {
            zoomControl: false,
            attributionControl: true,
            dragging: interactive,
            scrollWheelZoom: interactive,
            doubleClickZoom: interactive,
            touchZoom: interactive,
            boxZoom: interactive,
            keyboard: interactive,
            tap: interactive
        }).setView([depart.lat, depart.lng], zoom || D.ZOOM_DEFAUT);

        carte.attributionControl.setPrefix(false);
        const tuiles = L.tileLayer(D.TUILES[D.theme.actuel()], {
            attribution: D.TUILES.attribution,
            subdomains: 'abcd',
            maxZoom: 19,
            detectRetina: false
        }).addTo(carte);

        window.addEventListener('debrisat:theme', (e) => tuiles.setUrl(D.TUILES[e.detail.theme]));
        carte._tuilesDebrisat = tuiles;
        return carte;
    },

    icone(s) {
        const taille = 10 + (s.severite || 1) * 3;
        const resolu = s.statut === 'resolu' ? ' resolu' : '';
        return L.divIcon({
            className: `marqueur-signalement${resolu}`,
            html: `<span class="point" style="--sev:${window.debrisat.utils.couleurSeverite(s.severite)};width:${taille}px;height:${taille}px;margin:${(36 - taille) / 2}px"></span>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -14]
        });
    },

    iconeEpingle() {
        return L.divIcon({
            className: 'marqueur-epingle',
            html: '<i class="bi bi-geo-alt-fill" aria-hidden="true"></i>',
            iconSize: [40, 40],
            iconAnchor: [20, 38]
        });
    },

    iconeUtilisateur() {
        return L.divIcon({ className: 'marqueur-utilisateur', html: '<span class="point"></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
    },

    popup(s, { admin = false } = {}) {
        const u = window.debrisat.utils;
        const type = u.infoType(s.type_obstruction);
        const sevInfo = window.debrisat.SEVERITES[s.severite] || window.debrisat.SEVERITES[1];
        const source = s.source === 'whatsapp'
            ? '<span class="badge badge-neutral"><i class="bi bi-whatsapp" aria-hidden="true"></i>WhatsApp</span>'
            : s.source === 'satellite' ? '<span class="badge badge-neutral"><i class="bi bi-broadcast" aria-hidden="true"></i>Satellite</span>' : '';

        const actions = admin
            ? `<div class="popup-admin">
                    <label class="form-label" for="statut-${u.echapper(s.id)}" style="margin:0">Changer le statut</label>
                    <div class="select-enveloppe">
                        <select class="select" id="statut-${u.echapper(s.id)}" data-action="statut-popup" data-id="${u.echapper(s.id)}">
                            ${Object.entries(window.debrisat.STATUTS).map(([cle, v]) => `<option value="${cle}"${cle === s.statut ? ' selected' : ''}>${v.label}</option>`).join('')}
                        </select>
                    </div>
               </div>`
            : `<div class="popup-actions">
                    <button type="button" class="btn btn-primary btn-sm" data-action="confirmer" data-id="${u.echapper(s.id)}"${['resolu', 'rejete'].includes(s.statut) ? ' disabled' : ''}>
                        <i class="bi bi-check-circle" aria-hidden="true"></i><span data-i18n="action.confirmer">Confirmer</span>
                    </button>
                    <button type="button" class="btn-lien" data-action="voir-detail" data-id="${u.echapper(s.id)}">
                        Voir détail<i class="bi bi-arrow-right" aria-hidden="true"></i>
                    </button>
               </div>`;

        return `
            <article class="popup-glass" aria-label="Signalement ${u.echapper(type.label)}">
                ${u.htmlVisuel(s)}
                <div class="popup-corps">
                    <div class="popup-titre">
                        <span class="popup-type"><i class="bi ${type.icone}" aria-hidden="true"></i>${u.echapper(type.label)}</span>
                        ${u.htmlStatut(s.statut)}
                    </div>
                    <div class="popup-ligne">${u.htmlSeverite(s.severite)}<span>${sevInfo.label}</span>${source}</div>
                    <div class="popup-ligne"><i class="bi bi-geo-alt" aria-hidden="true"></i><span>${u.echapper(s.adresse || 'Adresse inconnue')}${s.commune ? ', ' + u.echapper(s.commune) : ''}</span></div>
                    <div class="popup-ligne">
                        <i class="bi bi-clock" aria-hidden="true"></i><span>${u.formatDate(s.created_at)}</span>
                        <span aria-hidden="true">·</span>
                        <i class="bi bi-check-circle" aria-hidden="true"></i><span data-compte-confirmations="${u.echapper(s.id)}">${s.nombre_confirmations || 0} confirmation${(s.nombre_confirmations || 0) > 1 ? 's' : ''}</span>
                    </div>
                    ${actions}
                </div>
            </article>`;
    },

    // Gere un ensemble de marqueurs (avec regroupement) sur une carte
    gestionnaire(carte, { regrouper = true, admin = false } = {}) {
        const groupe = regrouper && L.markerClusterGroup
            ? L.markerClusterGroup({
                maxClusterRadius: 48,
                showCoverageOnHover: false,
                spiderfyOnMaxZoom: true,
                iconCreateFunction: (cluster) => {
                    const n = cluster.getChildCount();
                    const taille = n < 10 ? 40 : n < 50 ? 48 : 56;
                    return L.divIcon({ html: `<div>${n}</div>`, className: 'cluster-verre', iconSize: [taille, taille] });
                }
            })
            : L.layerGroup();
        groupe.addTo(carte);

        const marqueurs = new Map();
        let filtre = () => true;

        const creerMarqueur = (s) => {
            const m = L.marker([s.lat, s.lng], {
                icon: this.icone(s),
                title: `${window.debrisat.utils.infoType(s.type_obstruction).label}, sévérité ${s.severite}`,
                alt: window.debrisat.utils.infoType(s.type_obstruction).label,
                keyboard: true,
                riseOnHover: true
            });
            m.bindPopup(() => this.popup(m.signalement, { admin }), { maxWidth: 300, minWidth: 280, autoPanPadding: [24, 80] });
            m.signalement = s;
            return m;
        };

        return {
            groupe,
            marqueurs,

            definir(signalements) {
                groupe.clearLayers();
                marqueurs.clear();
                signalements.filter(s => s.lat != null).forEach(s => marqueurs.set(s.id, creerMarqueur(s)));
                this.appliquerFiltre();
            },

            ajouter(s) {
                if (s.lat == null) return;
                const existant = marqueurs.get(s.id);
                if (existant) groupe.removeLayer(existant);
                const m = creerMarqueur(s);
                marqueurs.set(s.id, m);
                if (filtre(s)) groupe.addLayer(m);
            },

            filtrer(fn) {
                filtre = fn || (() => true);
                return this.appliquerFiltre();
            },

            appliquerFiltre() {
                groupe.clearLayers();
                const visibles = [];
                marqueurs.forEach(m => {
                    if (filtre(m.signalement)) visibles.push(m);
                });
                if (groupe.addLayers) groupe.addLayers(visibles);
                else visibles.forEach(m => groupe.addLayer(m));
                return visibles.map(m => m.signalement);
            },

            signalements() {
                return Array.from(marqueurs.values()).map(m => m.signalement);
            },

            ouvrir(id) {
                const m = marqueurs.get(id);
                if (!m) return;
                if (groupe.zoomToShowLayer) groupe.zoomToShowLayer(m, () => m.openPopup());
                else {
                    carte.setView(m.getLatLng(), 17);
                    m.openPopup();
                }
            }
        };
    },

    couleurZone(score) {
        if (score >= 85) return 'var(--severity-5)';
        if (score >= 75) return 'var(--severity-4)';
        return 'var(--severity-3)';
    },

    dessinerZones(carte, zones) {
        const couche = L.layerGroup();
        const styles = getComputedStyle(document.documentElement);
        zones.forEach(z => {
            if (!z.polygone?.length) return;
            const variable = this.couleurZone(z.score_risque).match(/--[\w-]+/)[0];
            const couleur = styles.getPropertyValue(variable).trim();
            L.polygon(z.polygone, { color: couleur, weight: 1, opacity: 0.7, fillColor: couleur, fillOpacity: 0.07, dashArray: '3 5' })
                .bindTooltip(`<strong>${window.debrisat.utils.echapper(z.nom)}</strong><br>Risque ${z.score_risque}/100`, { className: 'etiquette-zone', sticky: true })
                .addTo(couche);
        });
        return couche;
    }
};
