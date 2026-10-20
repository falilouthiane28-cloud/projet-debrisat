// Page du concept DPGI : comparaison Sentinel-2, couches d'eau, exposition OpenStreetMap.
// Tous les chiffres viennent de assets/satellite/*.json, produits par scripts/analyse_ndwi.py.
import { $, $$, echapper, formatNombre, formatDate } from './utils.js';
import { initTheme } from './theme.js';
import { initRetourTactile } from './animations.js';
import { chargerAnalyse, boundsAnalyse, ComparateurAvantApres, ATTRIBUTION_SCENES } from './satellite.js';

initTheme();
initRetourTactile();

const SAT = 'assets/satellite/';
const nombre = (v, d = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(v);

function carteResultat(icone, valeur, libelle, detail, ton = '') {
    return `<article class="card-stat glass-card">
        <span class="icone-ronde ${ton}"><i class="bi ${icone}" aria-hidden="true"></i></span>
        <p class="valeur chiffre">${valeur}</p>
        <p class="libelle">${libelle}</p>
        ${detail ? `<p class="texte-xs texte-muet">${detail}</p>` : ''}
    </article>`;
}

function rendreChiffres(metadata, exposition) {
    const [seche, pluies] = metadata.scenes;
    const plage = Object.values(metadata.eau_nouvelle_ha_par_seuil);
    const min = Math.min(...plage);
    const max = Math.max(...plage);
    $('#descDemo').textContent = `Scènes Sentinel-2 du ${formatDate(seche.date)} (saison sèche) et du ${formatDate(pluies.date)} (saison des pluies), tuile ${seche.tuile.replace('MGRS-', '')}. Faites glisser le curseur pour comparer.`;
    $('#grilleResultats').innerHTML = [
        carteResultat('bi-droplet-half', `${nombre(metadata.eau_nouvelle_ha)} ha`, "Eau nouvelle (MNDWI > 0, hors mer)", `Plage selon le seuil : ${nombre(min)} à ${nombre(max)} ha`, 'info'),
        exposition ? carteResultat('bi-sign-turn-right', `${nombre(exposition.longueur_routes_exposees_km, 2)} km`, `de routes dans l'eau nouvelle`, `${formatNombre(exposition.routes_exposees)} tronçons sur ${formatNombre(exposition.routes_osm_total)} cartographiés`, 'alerte') : '',
        exposition ? carteResultat('bi-house', formatNombre(exposition.batiments_exposes), "bâtiments dans l'eau nouvelle", `sur ${formatNombre(exposition.batiments_osm_total)} bâtiments OpenStreetMap (minimum)`, 'alerte') : '',
        carteResultat('bi-cloud', `${nombre(seche.nuages_zone_pct)} % / ${nombre(pluies.nuages_zone_pct)} %`, 'Nuages sur la zone (SCL)', 'Saison sèche / saison des pluies', 'succes')
    ].join('');

    const seuils = Object.keys(metadata.eau_nouvelle_ha_par_seuil);
    $('#tableSensibilite tbody').innerHTML = seuils.map(s => `
        <tr${Number(s) === metadata.methode.seuil_eau ? ' class="selectionnee"' : ''}>
            <td class="chiffre">${echapper(s)}${Number(s) === metadata.methode.seuil_eau ? ' <span class="badge badge-info">retenu</span>' : ''}</td>
            <td class="chiffre">${nombre(seche.eau_mndwi_ha_par_seuil[s])}</td>
            <td class="chiffre">${nombre(pluies.eau_mndwi_ha_par_seuil[s])}</td>
            <td class="chiffre">${nombre(metadata.eau_nouvelle_ha_par_seuil[s])}</td>
        </tr>`).join('');

    $('#infoGeneration').innerHTML = `Résultats générés le ${formatDate(metadata.genere_le, true)}. Scènes : `
        + metadata.scenes.map(s => `<a href="${echapper(s.lien)}" target="_blank" rel="noopener">${echapper(s.scene)}</a>`).join(', ') + '.';
}

async function demarrer() {
    const carte = L.map('carteDemo', { zoomControl: true, zoomSnap: 0.25, attributionControl: true });
    carte.attributionControl.setPrefix(false);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 16, maxZoom: 18, attribution: 'Fond © Esri'
    }).addTo(carte);

    let analyse;
    try {
        analyse = await chargerAnalyse();
    } catch (err) {
        $('#etatCarte').innerHTML = `<i class="bi bi-exclamation-triangle" aria-hidden="true"></i>${echapper(err.message)}`;
        carte.setView([14.77, -17.39], 13);
        return;
    }
    const { metadata, exposition } = analyse;
    const bounds = boundsAnalyse(metadata);
    carte.fitBounds(bounds);
    carte.setMaxBounds(L.latLngBounds(bounds).pad(0.5));
    const [seche, pluies] = metadata.scenes;

    new ComparateurAvantApres(carte, {
        avant: SAT + 'seche-rgb.png',
        apres: SAT + 'pluies-rgb.png',
        bounds,
        libelleAvant: `Saison sèche · ${formatDate(seche.date)}`,
        libelleApres: `Saison des pluies · ${formatDate(pluies.date)}`
    });

    // Les masques passent au-dessus des deux scenes ; la carte comparee reste lisible dessous
    carte.createPane('analyse');
    carte.getPane('analyse').style.zIndex = 420;
    const couches = {
        eauSeche: L.imageOverlay(SAT + 'seche-eau.png', bounds, { pane: 'analyse', opacity: 0.8, alt: 'Eau détectée en saison sèche' }),
        eauPluies: L.imageOverlay(SAT + 'pluies-eau.png', bounds, { pane: 'analyse', opacity: 0.8, alt: 'Eau détectée en saison des pluies' }),
        changement: L.imageOverlay(SAT + 'changement.png', bounds, { pane: 'analyse', opacity: 0.95, alt: 'Eau nouvelle' }),
        routes: exposition ? L.geoJSON(exposition.routes, {
            pane: 'analyse',
            style: { color: '#FF6B35', weight: 3, opacity: 0.95 },
            onEachFeature: (f, couche) => couche.bindTooltip(echapper(f.properties.nom || `Voie (${f.properties.type})`))
        }) : null,
        batiments: exposition ? L.layerGroup(exposition.batiments.map(([lon, lat]) =>
            L.circleMarker([lat, lon], { pane: 'analyse', radius: 4, color: '#FAFAFA', weight: 1, fillColor: '#FF6B35', fillOpacity: 1 }))) : null
    };
    for (const caseCouche of $$('[data-couche]')) {
        const couche = couches[caseCouche.dataset.couche];
        if (!couche) {
            caseCouche.disabled = true;
            continue;
        }
        if (caseCouche.checked) couche.addTo(carte);
        caseCouche.addEventListener('change', () => (caseCouche.checked ? couche.addTo(carte) : couche.remove()));
    }
    carte.attributionControl.addAttribution(ATTRIBUTION_SCENES);
    $('#etatCarte').hidden = true;
    rendreChiffres(metadata, exposition);
}

demarrer();
