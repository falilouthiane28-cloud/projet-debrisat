// Imagerie satellite : mosaique Sentinel-2 sans nuages (EOX, sans cle d'API)
window.debrisat.satellite = {
    URL_TUILES: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg',
    ATTRIBUTION: '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> par EOX — données Copernicus Sentinel modifiées (2021)',

    creer(carte) {
        let couche = null;
        let visible = false;

        return {
            basculer(forcer) {
                visible = typeof forcer === 'boolean' ? forcer : !visible;
                if (visible) {
                    if (!couche) {
                        couche = L.tileLayer(window.debrisat.satellite.URL_TUILES, {
                            attribution: window.debrisat.satellite.ATTRIBUTION,
                            maxZoom: 17,
                            opacity: 0.9
                        });
                        couche.on('tileerror', window.debrisat.utils.debounce(() => {
                            window.debrisat.utils.toast('Certaines tuiles satellite sont indisponibles.', 'warning', 4000);
                        }, 2000));
                    }
                    couche.addTo(carte);
                    couche.bringToBack();
                    carte._tuilesDebrisat?.setOpacity(0);
                } else if (couche) {
                    carte.removeLayer(couche);
                    carte._tuilesDebrisat?.setOpacity(1);
                }
                return visible;
            },

            estVisible() {
                return visible;
            }
        };
    }
};
