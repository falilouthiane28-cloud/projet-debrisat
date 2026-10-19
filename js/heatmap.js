// Heatmap Debrisat — gere via map.js (L.heatLayer)
// Ce fichier expose des utilitaires supplementaires

window.debrisat.heatmap = {
    genererDonneesHeatmap(signalements) {
        return signalements.map(s => {
            let lat, lng;
            if (typeof s.localisation === 'string') {
                const m = s.localisation.match(/POINT\(([^ ]+) ([^)]+)\)/);
                if (m) { lng = parseFloat(m[1]); lat = parseFloat(m[2]); }
            } else if (s.localisation?.coordinates) {
                [lng, lat] = s.localisation.coordinates;
            }
            if (!lat || !lng) return null;
            return [lat, lng, (s.severite || 1) / 5];
        }).filter(Boolean);
    }
};
