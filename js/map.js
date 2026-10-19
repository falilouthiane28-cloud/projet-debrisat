import { DAKAR_CENTRE, ZOOM_DEFAUT, SEVERITES, TYPES_OBSTRUCTION, STATUTS, SEUIL_VERIFICATION } from './config.js';
import { echapper, htmlSeverite, htmlStatut, htmlVignette, formatRelatif, lieuSignalement } from './utils.js';
import { themeEffectif } from './theme.js';

// Fonds Esri « Canvas » gris fonce / gris clair : sans cle d'API (CARTO exige desormais une cle).
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const TUILES = {
    sombre: { fond: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, etiquettes: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
    clair: { fond: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, etiquettes: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}` }
};
const ATTRIBUTION = 'Fond de carte &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, HERE, Garmin, &copy; contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export function creerCarte(element, { interactive = true, centre = DAKAR_CENTRE, zoom = ZOOM_DEFAUT } = {}) {
    const carte = L.map(element, {
        zoomControl: false,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        zoomSnap: 0.5,
        wheelPxPerZoomLevel: 90
    }).setView(centre, zoom);
    carte.attributionControl.setPrefix(false);

    // Les noms de lieux passent au-dessus des zones a risque mais sous les marqueurs
    carte.createPane('etiquettes');
    carte.getPane('etiquettes').style.zIndex = 450;
    carte.getPane('etiquettes').style.pointerEvents = 'none';

    const tuiles = TUILES[themeEffectif()];
    const options = { maxNativeZoom: 16, maxZoom: 19, crossOrigin: true };
    const fond = L.tileLayer(tuiles.fond, { ...options, attribution: ATTRIBUTION }).addTo(carte);
    const etiquettes = L.tileLayer(tuiles.etiquettes, { ...options, pane: 'etiquettes' }).addTo(carte);
    document.addEventListener('theme-change', e => {
        fond.setUrl(TUILES[e.detail.theme].fond);
        etiquettes.setUrl(TUILES[e.detail.theme].etiquettes);
    });
    carte.fond = fond;
    carte.etiquettes = etiquettes;
    return carte;
}

// Pastille coloree par severite dans une zone tactile de 44 px
export function iconeMarqueur(s, { animer = false } = {}) {
    const diametre = 12 + (Number(s.severite) || 1) * 3;
    const couleur = SEVERITES[s.severite]?.couleur || SEVERITES[3].couleur;
    const attenue = s.statut === 'resolu' || s.statut === 'rejete';
    return L.divIcon({
        className: 'marqueur-signalement',
        html: `<span class="pastille-marqueur${animer ? ' marqueur-pop' : ''}${attenue ? ' attenue' : ''}${s.severite >= 5 && !attenue ? ' critique' : ''}" style="--c:${couleur};--d:${diametre}px"></span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -diametre / 2 - 6]
    });
}

export function contenuPopup(s, { admin = false, peutVerifier = true } = {}) {
    const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
    const sev = SEVERITES[s.severite] || SEVERITES[3];
    const actionsCitoyen = `
        ${peutVerifier && ['en_attente', 'verifie'].includes(s.statut) ? `<button type="button" class="btn btn-primary btn-sm" data-action="confirmer" data-id="${s.id}"><i class="bi bi-check-circle" aria-hidden="true"></i>Confirmer</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-action="detail" data-id="${s.id}">Voir le détail<i class="bi bi-arrow-right" aria-hidden="true"></i></button>`;
    const actionsAdmin = `
        <label class="sr-only" for="statut-${s.id}">Changer le statut</label>
        <select id="statut-${s.id}" class="select compact" data-action="statut" data-id="${s.id}">
            ${Object.entries(STATUTS).map(([cle, v]) => `<option value="${cle}"${cle === s.statut ? ' selected' : ''}>${v.libelle}</option>`).join('')}
        </select>`;
    return `
        <article class="popup-signalement">
            <div class="popup-photo">
                ${htmlVignette(s, 'large')}
                <span class="badge"><i class="bi ${type.icone}" aria-hidden="true"></i>${echapper(type.libelle)}</span>
            </div>
            <div class="popup-corps">
                <div class="rangee-entre">
                    ${htmlSeverite(s.severite)}
                    ${htmlStatut(s.statut)}
                </div>
                <p class="popup-titre">${echapper(sev.libelle)} · ${echapper(type.libelle)}</p>
                <p class="popup-ligne"><i class="bi bi-geo-alt" aria-hidden="true"></i><span class="tronque">${echapper(lieuSignalement(s))}</span></p>
                <p class="popup-ligne"><i class="bi bi-clock" aria-hidden="true"></i>${echapper(formatRelatif(s.created_at))}</p>
                <p class="popup-ligne"><i class="bi bi-check-circle" aria-hidden="true"></i>${s.nombre_confirmations} confirmation${s.nombre_confirmations > 1 ? 's' : ''}${s.statut === 'en_attente' ? ` sur ${SEUIL_VERIFICATION}` : ''}</p>
                <div class="popup-actions">${admin ? actionsAdmin : actionsCitoyen}</div>
            </div>
        </article>`;
}

function iconeCluster(groupe) {
    const n = groupe.getChildCount();
    const taille = n < 10 ? 40 : n < 30 ? 48 : 56;
    return L.divIcon({
        html: `<span>${n}</span>`,
        className: 'marker-cluster-sombre',
        iconSize: [taille, taille]
    });
}

export class CoucheSignalements {
    constructor(carte, { regroupement = true, optionsPopup = {}, surOuverture } = {}) {
        this.carte = carte;
        this.donnees = new Map();
        this.marqueurs = new Map();
        this.optionsPopup = optionsPopup;
        this.predicat = () => true;
        this.surOuverture = surOuverture;
        this.groupe = regroupement && L.markerClusterGroup
            ? L.markerClusterGroup({
                showCoverageOnHover: false,
                maxClusterRadius: 46,
                spiderfyOnMaxZoom: true,
                disableClusteringAtZoom: 17,
                chunkedLoading: true,
                iconCreateFunction: iconeCluster
            })
            : L.featureGroup();
        this.groupe.addTo(carte);
    }

    creerMarqueur(s, animer) {
        const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
        const m = L.marker([s.lat, s.lng], {
            icon: iconeMarqueur(s, { animer }),
            title: `${type.libelle}, sévérité ${s.severite} sur 5, ${lieuSignalement(s)}`,
            alt: type.libelle,
            riseOnHover: true,
            keyboard: true
        });
        m.bindPopup(() => contenuPopup(this.donnees.get(s.id), this.optionsPopup), {
            maxWidth: 280, minWidth: 260, autoPanPaddingTopLeft: [16, 110], autoPanPaddingBottomRight: [68, 130], closeButton: false
        });
        m.on('popupopen', () => this.surOuverture?.(this.donnees.get(s.id)));
        return m;
    }

    definir(liste) {
        this.groupe.clearLayers();
        this.donnees.clear();
        this.marqueurs.clear();
        const visibles = [];
        for (const s of liste) {
            if (s.lat == null || s.lng == null) continue;
            this.donnees.set(s.id, s);
            const m = this.creerMarqueur(s, false);
            this.marqueurs.set(s.id, m);
            if (this.predicat(s)) visibles.push(m);
        }
        if (this.groupe.addLayers) this.groupe.addLayers(visibles);
        else visibles.forEach(m => this.groupe.addLayer(m));
    }

    ajouter(s, { animer = true } = {}) {
        if (s.lat == null || this.donnees.has(s.id)) return this.mettreAJour(s);
        this.donnees.set(s.id, s);
        const m = this.creerMarqueur(s, animer);
        this.marqueurs.set(s.id, m);
        if (this.predicat(s)) this.groupe.addLayer(m);
    }

    mettreAJour(s) {
        const ancien = this.marqueurs.get(s.id);
        if (!ancien) return this.ajouter(s);
        const fusion = { ...this.donnees.get(s.id), ...s };
        this.donnees.set(s.id, fusion);
        ancien.setIcon(iconeMarqueur(fusion));
        const visible = this.groupe.hasLayer(ancien);
        const doitEtreVisible = this.predicat(fusion);
        if (visible && !doitEtreVisible) this.groupe.removeLayer(ancien);
        if (!visible && doitEtreVisible) this.groupe.addLayer(ancien);
        if (ancien.isPopupOpen()) ancien.setPopupContent(contenuPopup(fusion, this.optionsPopup));
    }

    filtrer(predicat) {
        this.predicat = predicat;
        this.groupe.clearLayers();
        const visibles = [];
        for (const [id, s] of this.donnees) if (predicat(s)) visibles.push(this.marqueurs.get(id));
        if (this.groupe.addLayers) this.groupe.addLayers(visibles);
        else visibles.forEach(m => this.groupe.addLayer(m));
        return visibles.length;
    }

    ouvrir(id) {
        const m = this.marqueurs.get(id);
        if (!m) return;
        if (!this.groupe.hasLayer(m)) this.groupe.addLayer(m);
        const ouvrirPopup = () => m.openPopup();
        if (this.groupe.zoomToShowLayer) this.groupe.zoomToShowLayer(m, ouvrirPopup);
        else { this.carte.flyTo(m.getLatLng(), 16); ouvrirPopup(); }
    }

    visibles() {
        return [...this.donnees.values()].filter(this.predicat);
    }
}

export function couleurRisque(score) {
    return score >= 85 ? SEVERITES[5].couleur : score >= 70 ? SEVERITES[4].couleur : SEVERITES[3].couleur;
}

export function creerCoucheZones(zones, { surClic } = {}) {
    const groupe = L.featureGroup();
    for (const z of zones) {
        if (!z.coordonnees?.length) continue;
        const couleur = couleurRisque(z.score_risque);
        const polygone = L.polygon(z.coordonnees, {
            color: couleur,
            weight: 1.5,
            opacity: 0.9,
            dashArray: '4 4',
            fillColor: couleur,
            fillOpacity: 0.1,
            interactive: true
        });
        polygone.bindTooltip(`${echapper(z.nom)} · ${Math.round(z.score_risque)}/100`, { className: 'etiquette-zone', direction: 'center', sticky: true });
        polygone.on('mouseover', () => polygone.setStyle({ fillOpacity: 0.2 }));
        polygone.on('mouseout', () => polygone.setStyle({ fillOpacity: 0.1 }));
        if (surClic) polygone.on('click', () => surClic(z));
        groupe.addLayer(polygone);
    }
    return groupe;
}

export function marqueurPosition(carte, existant, { lat, lng, precision }) {
    if (existant) {
        existant.marqueur.setLatLng([lat, lng]);
        existant.cercle.setLatLng([lat, lng]).setRadius(precision || 30);
        return existant;
    }
    const cercle = L.circle([lat, lng], {
        radius: precision || 30, color: '#5E9FFF', weight: 1, fillColor: '#5E9FFF', fillOpacity: 0.12, interactive: false
    }).addTo(carte);
    const marqueur = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<span class="point-position"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        title: 'Votre position',
        keyboard: false,
        interactive: false
    }).addTo(carte);
    return { marqueur, cercle };
}
