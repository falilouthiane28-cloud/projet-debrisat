// Integration imagerie satellite Debrisat
window.debrisat.satellite = {
    couche: null,
    visible: false,

    ajouterCoucheSentinel(carte) {
        this.couche = L.tileLayer.wms('https://services.sentinel-hub.com/ogc/wms/', {
            layers: 'TRUE-COLOR-S2-L1C',
            format: 'image/png',
            transparent: true,
            attribution: '&copy; Copernicus Sentinel',
            maxZoom: 18,
            opacity: 0.7
        });
    },

    toggle(carte) {
        this.visible = !this.visible;
        if (this.visible) {
            if (!this.couche) this.ajouterCoucheSentinel(carte);
            if (this.couche) this.couche.addTo(carte);
        } else if (this.couche) {
            carte.removeLayer(this.couche);
        }
    }
};
