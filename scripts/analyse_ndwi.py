"""
Debrisat : comparaison saison seche / saison des pluies sur Pikine-Guediawaye (Sentinel-2 L2A).

Produit dans assets/satellite/ :
  - <id>-rgb.png       : couleurs naturelles (B04, B03, B02), etiree 0-3000
  - <id>-eau.png       : eau detectee (MNDWI > seuil), nuages masques
  - changement.png     : eau presente en saison des pluies et absente en saison seche
  - metadata.json      : scenes, dates, nuages locaux (bande SCL), seuils, surfaces
  - exposition.json    : routes et batiments OpenStreetMap dans les pixels d'eau nouvelle

Donnees : catalogue STAC Earth Search (Element 84), produits Copernicus Sentinel-2 L2A
en COG publics sur AWS ; OpenStreetMap via l'API Overpass. Aucune cle requise.

Installation : pip install rasterio==1.5.2 numpy==2.5.4 pillow==13.0.0 requests==2.34.2 pyproj==3.8.0
Lancement    : python scripts/analyse_ndwi.py
"""
import json
import math
import pathlib
import time
from datetime import datetime, timezone

import numpy as np
import rasterio
import requests
from PIL import Image
from rasterio.warp import Resampling, reproject
from rasterio.transform import from_bounds

# ---------------------------------------------------------------------------
# Parametres (tous documentes dans docs/reproduction.md)
# ---------------------------------------------------------------------------
BBOX = (-17.42, 14.74, -17.36, 14.80)          # ouest, sud, est, nord (WGS84)
PAS_DEG = 0.00009                               # environ 10 m a cette latitude
SCENES = {
    'seche': 'S2A_28PBB_20260403_0_L2A',
    'pluies': 'S2A_28PBB_20260831_0_L2A',
}
# Indice principal : MNDWI (Xu, 2006), plus fiable en ville que le NDWI (le bati y est negatif).
# Le NDWI (McFeeters, 1996) est calcule a titre de comparaison.
SEUIL_EAU = 0.0
SEUILS_SENSIBILITE = [-0.1, 0.0, 0.1, 0.2, 0.3]   # incertitude : surfaces selon le seuil
# Classes SCL exclues : 0 sans donnee, 1 saturee, 3 ombre de nuage, 8-10 nuages et cirrus
SCL_INVALIDES = {0, 1, 3, 8, 9, 10}
TAMPON_COTE_PX = 50                             # 500 m : deferlement, ecume et sable mouille exclus du changement
STAC = 'https://earth-search.aws.element84.com/v1'
# Serveurs Overpass publics, essayes dans l'ordre (ils saturent parfois)
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'assets' / 'satellite'
SORTIE.mkdir(parents=True, exist_ok=True)

LARGEUR = round((BBOX[2] - BBOX[0]) / PAS_DEG)
HAUTEUR = round((BBOX[3] - BBOX[1]) / PAS_DEG)
GRILLE = from_bounds(*BBOX, LARGEUR, HAUTEUR)
SURFACE_PIXEL_HA = (PAS_DEG * 111_320 * math.cos(math.radians(14.77))) * (PAS_DEG * 110_574) / 10_000


def item_stac(identifiant):
    r = requests.get(f'{STAC}/collections/sentinel-2-l2a/items/{identifiant}', timeout=60)
    r.raise_for_status()
    return r.json()


def lire_bande(url, resampling=Resampling.bilinear):
    """Lit une bande COG distante et la reechantillonne sur la grille WGS84 commune."""
    destination = np.zeros((HAUTEUR, LARGEUR), dtype=np.float32)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', AWS_NO_SIGN_REQUEST='YES'):
        with rasterio.open(url) as src:
            reproject(
                source=rasterio.band(src, 1), destination=destination,
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=GRILLE, dst_crs='EPSG:4326', resampling=resampling,
            )
    return destination


def png_rvb(r, v, b, chemin):
    pile = np.stack([r, v, b], axis=-1)
    pile = np.clip(pile / 3000.0, 0, 1) ** (1 / 1.4)   # etirement lineaire puis gamma doux
    Image.fromarray((pile * 255).astype(np.uint8), 'RGB').save(chemin, optimize=True)


def png_masque(masque, couleur, chemin, opacite=200):
    image = np.zeros((HAUTEUR, LARGEUR, 4), dtype=np.uint8)
    image[masque] = (*couleur, opacite)
    Image.fromarray(image, 'RGBA').save(chemin, optimize=True)


def analyser(cle, identifiant):
    item = item_stac(identifiant)
    a = item['assets']
    print(f'[{cle}] {identifiant} : lecture des bandes')
    b02, b03, b04, b08, b11 = (lire_bande(a[n]['href']) for n in ('blue', 'green', 'red', 'nir', 'swir16'))
    scl = lire_bande(a['scl']['href'], Resampling.nearest).astype(np.uint8)

    valide = ~np.isin(scl, list(SCL_INVALIDES))
    with np.errstate(divide='ignore', invalid='ignore'):
        ndwi = np.where((b03 + b08) > 0, (b03 - b08) / (b03 + b08), np.nan)
        mndwi = np.where((b03 + b11) > 0, (b03 - b11) / (b03 + b11), np.nan)

    png_rvb(b04, b03, b02, SORTIE / f'{cle}-rgb.png')
    eau = valide & (mndwi > SEUIL_EAU)
    png_masque(eau, (33, 150, 243), SORTIE / f'{cle}-eau.png')

    return {
        'id': cle,
        'scene': identifiant,
        'date': item['properties']['datetime'][:10],
        'satellite': item['properties'].get('platform', 'sentinel-2'),
        'tuile': item['properties'].get('grid:code', ''),
        'nuages_tuile_pct': round(item['properties']['eo:cloud_cover'], 2),
        'nuages_zone_pct': round(100 * float((~valide).mean()), 2),
        'eau_mndwi_ha_par_seuil': {str(s): round(float((valide & (mndwi > s)).sum()) * SURFACE_PIXEL_HA, 1) for s in SEUILS_SENSIBILITE},
        'eau_ndwi_ha_par_seuil': {str(s): round(float((valide & (ndwi > s)).sum()) * SURFACE_PIXEL_HA, 1) for s in SEUILS_SENSIBILITE},
        'lien': f'{STAC}/collections/sentinel-2-l2a/items/{identifiant}',
        '_eau': eau,
        '_mndwi': mndwi,
        '_valide': valide,
    }


def osm():
    """Routes (lignes) et batiments (centres) dans l'emprise, via Overpass."""
    s, o, n, e = BBOX[1], BBOX[0], BBOX[3], BBOX[2]
    requete = f"""[out:json][timeout:120];
    (way["highway"]({s},{o},{n},{e}););out geom;
    (way["building"]({s},{o},{n},{e}););out center;"""
    # Extraction gardee en cache local (non versionne) : Overpass est lent et parfois sature
    cache = RACINE / '.cache' / 'osm-pikine.json'
    if cache.exists():
        elements = json.loads(cache.read_text(encoding='utf-8'))
        return trier_osm(elements)
    elements = None
    for tentative in range(3):
        for serveur in OVERPASS:
            try:
                r = requests.post(serveur, data={'data': requete}, timeout=180, headers={'User-Agent': 'Debrisat/1.0 (hackathon EO Senegal)'})
                r.raise_for_status()
                elements = r.json()['elements']
                break
            except (requests.RequestException, ValueError) as err:
                print(f'  Overpass indisponible ({serveur}) : {err}')
        if elements is not None:
            break
        time.sleep(20 * (tentative + 1))
    if elements is None:
        raise SystemExit('OpenStreetMap injoignable : relancer le script plus tard.')
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps(elements), encoding='utf-8')
    return trier_osm(elements)


def trier_osm(elements):
    routes = [el for el in elements if el.get('tags', {}).get('highway') and 'geometry' in el]
    batiments = [el for el in elements if el.get('tags', {}).get('building') and 'center' in el]
    return routes, batiments


def pixel(lon, lat):
    col = int((lon - BBOX[0]) / PAS_DEG)
    lig = int((BBOX[3] - lat) / PAS_DEG)
    return (lig, col) if 0 <= lig < HAUTEUR and 0 <= col < LARGEUR else None


def masque_ocean(mndwi_seche):
    """Mer = eau continue depuis le bord nord (la cote court d'ouest en est), elargie de TAMPON_COTE_PX."""
    eau = np.nan_to_num(mndwi_seche, nan=1.0) > 0
    masque = np.zeros_like(eau)
    for col in range(LARGEUR):
        if not eau[0, col]:
            continue
        terre = np.flatnonzero(~eau[:, col])
        limite = terre[0] if terre.size else HAUTEUR
        masque[:min(HAUTEUR, limite + TAMPON_COTE_PX), col] = True
    return masque


def main():
    seche = analyser('seche', SCENES['seche'])
    pluies = analyser('pluies', SCENES['pluies'])

    # Eau nouvelle : detectee en saison des pluies, absente en saison seche, pixel valide aux deux dates
    ocean = masque_ocean(seche['_mndwi'])
    valide = seche['_valide'] & pluies['_valide'] & ~ocean
    nouvelle = valide & pluies['_eau'] & ~seche['_eau']
    sensibilite = {
        str(s): round(float((valide & (pluies['_mndwi'] > s) & ~(seche['_mndwi'] > s)).sum()) * SURFACE_PIXEL_HA, 1)
        for s in SEUILS_SENSIBILITE
    }
    png_masque(nouvelle, (255, 107, 53), SORTIE / 'changement.png', opacite=220)

    print('OpenStreetMap : routes et batiments')
    routes, batiments = osm()
    exposees = []
    longueur_exposee_m = 0.0
    for route in routes:
        points = route['geometry']
        dedans = 0
        for p1, p2 in zip(points, points[1:]):
            milieu = pixel((p1['lon'] + p2['lon']) / 2, (p1['lat'] + p2['lat']) / 2)
            if milieu and nouvelle[milieu]:
                dedans += 1
                dx = (p2['lon'] - p1['lon']) * 111_320 * math.cos(math.radians(p1['lat']))
                dy = (p2['lat'] - p1['lat']) * 110_574
                longueur_exposee_m += math.hypot(dx, dy)
        if dedans:
            exposees.append({
                'type': 'Feature',
                'properties': {'nom': route['tags'].get('name', ''), 'type': route['tags']['highway']},
                'geometry': {'type': 'LineString', 'coordinates': [[q['lon'], q['lat']] for q in points]},
            })
    batiments_exposes = []
    for b in batiments:
        p = pixel(b['center']['lon'], b['center']['lat'])
        if p and nouvelle[p]:
            batiments_exposes.append([round(b['center']['lon'], 6), round(b['center']['lat'], 6)])

    genere = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    scenes = [{k: v for k, v in s.items() if not k.startswith('_')} for s in (seche, pluies)]
    metadata = {
        'genere_le': genere,
        'emprise': {'ouest': BBOX[0], 'sud': BBOX[1], 'est': BBOX[2], 'nord': BBOX[3]},
        'grille': {'crs': 'EPSG:4326', 'pas_deg': PAS_DEG, 'largeur': LARGEUR, 'hauteur': HAUTEUR},
        'methode': {
            'indice': 'MNDWI = (B03 - B11) / (B03 + B11) (Xu, 2006) ; NDWI (B03, B08) en comparaison',
            'seuil_eau': SEUIL_EAU,
            'masque_nuages': 'SCL exclues : ' + ', '.join(map(str, sorted(SCL_INVALIDES))),
            'changement': 'eau en saison des pluies ET pas d\'eau en saison seche, pixel valide aux deux dates, hors mer',
            'masque_mer': f'eau reliee au bord nord en saison seche, elargie de {TAMPON_COTE_PX * 10} m (deferlement)',
        },
        'scenes': scenes,
        'eau_nouvelle_ha': round(float(nouvelle.sum()) * SURFACE_PIXEL_HA, 1),
        'eau_nouvelle_ha_par_seuil': sensibilite,
        'source': 'Copernicus Sentinel-2 L2A (ESA), via Earth Search / AWS Open Data',
        'licence': 'Donnees Copernicus : acces libre et gratuit (reglement UE 1159/2013)',
    }
    (SORTIE / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')

    exposition = {
        'genere_le': genere,
        'routes_osm_total': len(routes),
        'batiments_osm_total': len(batiments),
        'routes_exposees': len(exposees),
        'longueur_routes_exposees_km': round(longueur_exposee_m / 1000, 2),
        'batiments_exposes': len(batiments_exposes),
        'source': '© contributeurs OpenStreetMap (ODbL), extraction Overpass du ' + genere[:10],
        'routes': {'type': 'FeatureCollection', 'features': exposees},
        'batiments': batiments_exposes,
    }
    (SORTIE / 'exposition.json').write_text(json.dumps(exposition, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    print(json.dumps({k: v for k, v in metadata.items() if k in ('scenes', 'eau_nouvelle_ha', 'eau_nouvelle_ha_par_seuil')}, ensure_ascii=False, indent=1))
    print({k: v for k, v in exposition.items() if k not in ('routes', 'batiments')})


if __name__ == '__main__':
    main()
