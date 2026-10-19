// Mosaique Sentinel-2 sans nuages (EOX, donnees Copernicus) : gratuite, sans cle d'API.
const URL_S2 = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg';
const ATTRIBUTION_S2 = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> par EOX IT Services GmbH (données Copernicus Sentinel modifiées, 2020)';

export function creerCoucheSatellite() {
    return L.tileLayer(URL_S2, {
        attribution: ATTRIBUTION_S2,
        maxNativeZoom: 15,
        maxZoom: 20,
        opacity: 1,
        crossOrigin: true
    });
}

export class BasculeSatellite {
    constructor(carte) {
        this.carte = carte;
        this.couche = null;
        this.active = false;
    }

    basculer() {
        this.active = !this.active;
        if (this.active) {
            this.couche ||= creerCoucheSatellite();
            this.couche.addTo(this.carte);
            // La mosaique remplace le fond mais reste sous les signalements
            this.couche.bringToBack();
            this.carte.fond?.setOpacity(0);
        } else {
            this.couche?.remove();
            this.carte.fond?.setOpacity(1);
        }
        return this.active;
    }
}
