# Reproduire l'analyse

Tout le résultat de la démonstration (images, surfaces, exposition) sort d'un seul script, sans compte ni clé d'API.

## Avec le script (recommandé)

```bash
pip install rasterio==1.5.2 numpy==2.5.4 pillow==13.0.0 requests==2.34.2 pyproj==3.8.0
python scripts/analyse_ndwi.py
```

Le script écrit dans `assets/satellite/` :

| Fichier | Contenu |
|---|---|
| `seche-rgb.png`, `pluies-rgb.png` | Couleurs naturelles (B04, B03, B02), réflectance 0 à 3000, gamma 1,4 |
| `seche-eau.png`, `pluies-eau.png` | Eau détectée (MNDWI > 0), nuages masqués |
| `changement.png` | Eau nouvelle en saison des pluies, hors mer |
| `metadata.json` | Scènes, nuages, méthode, surfaces par seuil |
| `exposition.json` | Routes et bâtiments OpenStreetMap dans l'eau nouvelle |

L'extraction OpenStreetMap est gardée dans `.cache/osm-pikine.json` (non versionné). Supprimer ce fichier pour la refaire.

## Paramètres

| Paramètre | Valeur | Raison |
|---|---|---|
| Emprise | 17,42° O à 17,36° O, 14,74° N à 14,80° N | Pikine et Guédiawaye, zones inondées chaque hivernage |
| Grille | EPSG:4326, pas 0,00009° (environ 10 m) | Superposition directe sur la carte web |
| Scène saison sèche | `S2A_28PBB_20260403_0_L2A` | 0,1 % de nuages sur la tuile |
| Scène saison des pluies | `S2A_28PBB_20260831_0_L2A` | 0,8 % de nuages sur la tuile, cœur de l'hivernage |
| Indice | MNDWI = (B03 − B11) / (B03 + B11) | Plus fiable en ville que le NDWI (Xu, 2006) |
| Seuil | 0 (sensibilité : −0,1, 0,1, 0,2, 0,3) | Valeur de référence de l'indice |
| Masque nuages | SCL 0, 1, 3, 8, 9, 10 exclues | Pas de donnée, saturé, ombre, nuages, cirrus |
| Masque mer | Eau reliée au bord nord en saison sèche, plus 500 m | Exclut le déferlement et le sable mouillé |
| Exposition | Milieu de chaque segment de route, centre de chaque bâtiment, dans un pixel d'eau nouvelle | Compte simple et vérifiable |

## Liens des scènes

- https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_28PBB_20260403_0_L2A
- https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_28PBB_20260831_0_L2A

Les mêmes produits sont consultables dans le Copernicus Browser : https://browser.dataspace.copernicus.eu (Sentinel-2 L2A, tuile 28PBB, dates ci-dessus).

## Équivalent manuel dans QGIS

1. Copernicus Browser : chercher Sentinel-2 L2A sur l'emprise, aux deux dates ; télécharger B03, B11 et SCL.
2. QGIS : rééchantillonner B11 et SCL à 10 m sur la grille de B03.
3. Calculatrice raster : `("B03" - "B11") / ("B03" + "B11")`, puis `MNDWI > 0` et exclusion des classes SCL citées.
4. Différence : `eau_pluies = 1 AND eau_seche = 0`.
5. Masquer la mer (numériser la ligne de côte du 3 avril et un tampon de 500 m).
6. Télécharger les routes et bâtiments OpenStreetMap (extension QuickOSM, clés `highway` et `building`).
7. Compter les entités qui intersectent le masque d'eau nouvelle.

Les résultats peuvent différer légèrement selon le rééchantillonnage (bilinéaire dans le script).
