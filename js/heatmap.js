// Couche de chaleur (leaflet.heat) ponderee par la severite
window.debrisat.heatmap = {
    creer(carte) {
        let couche = null;
        let visible = false;
        let points = [];

        const construire = () => {
            if (typeof L.heatLayer !== 'function') return null;
            const s = getComputedStyle(document.documentElement);
            return L.heatLayer(points, {
                radius: 28,
                blur: 22,
                maxZoom: 15,
                minOpacity: 0.25,
                gradient: {
                    0.2: s.getPropertyValue('--severity-1').trim(),
                    0.45: s.getPropertyValue('--severity-3').trim(),
                    0.7: s.getPropertyValue('--severity-4').trim(),
                    1: s.getPropertyValue('--severity-5').trim()
                }
            });
        };

        return {
            mettreAJour(signalements) {
                points = signalements
                    .filter(s => s.lat != null && !['resolu', 'rejete'].includes(s.statut))
                    .map(s => [s.lat, s.lng, (s.severite || 1) / 5]);
                if (couche) couche.setLatLngs(points);
            },

            basculer(forcer) {
                visible = typeof forcer === 'boolean' ? forcer : !visible;
                if (visible) {
                    if (!couche) couche = construire();
                    if (!couche) {
                        window.debrisat.utils.toast('La carte de chaleur n\'a pas pu être chargée.', 'error');
                        visible = false;
                        return false;
                    }
                    couche.setLatLngs(points);
                    couche.addTo(carte);
                } else if (couche) {
                    carte.removeLayer(couche);
                }
                return visible;
            },

            estVisible() {
                return visible;
            }
        };
    }
};
