# Inventaire des sources, outils et contributions

## Données utilisées dans le résultat

| Source | Produit | Résolution | Période | Licence | Usage | Accès |
|---|---|---|---|---|---|---|
| Copernicus (ESA) | Sentinel-2 L2A : B02, B03, B04, B08, B11, SCL | 10 m (B11, SCL : 20 m) | 3 avril et 31 août 2026 | Accès libre et gratuit (règlement UE 1159/2013) | Eau saison sèche et saison des pluies | Earth Search (Element 84), AWS Open Data |
| OpenStreetMap | Routes (`highway`), bâtiments (`building`) | Vecteur | Extraction du 20 octobre 2026 | ODbL 1.0 | Exposition des infrastructures | API Overpass |

## Données utilisées par l'application

| Source | Produit | Licence | Usage |
|---|---|---|---|
| Esri | Fonds de carte Canvas gris foncé et gris clair | Gratuit avec attribution | Fond des cartes |
| EOX | Sentinel-2 cloudless 2020 | CC BY-NC-SA 4.0 | Couche satellite de l'application |
| OpenStreetMap / Nominatim | Géocodage inverse | ODbL, politique d'usage Nominatim | Adresse d'un signalement |
| Signalements citoyens | Photo, position, type, sévérité, confirmations | Données du projet, consentement à l'inscription | Vérité terrain des obstructions |

## Données prévues (non utilisées dans ce résultat)

| Source | Produit | Résolution | Licence | Usage prévu |
|---|---|---|---|---|
| Copernicus (ESA) | Sentinel-1 GRD (radar) | 10 m | Libre et gratuite | Eau sous les nuages d'hivernage |
| CHIRPS (UCSB) | Précipitations journalières | 0,05° | Domaine public | Relier l'eau détectée aux pluies |
| ESA WorldCover | Occupation du sol | 10 m | CC BY 4.0 | Exclure les plans d'eau permanents |

## Chiffres de contexte

| Chiffre | Source |
|---|---|
| 360 000 personnes touchées, environ 104 M USD de dommages et pertes (inondations de 2009) | Gouvernement du Sénégal, Banque mondiale, GFDRR : évaluation des besoins post-catastrophe (PDNA), 2010 |

## Logiciels et bibliothèques

| Outil | Version | Usage |
|---|---|---|
| Python | 3.14.0 | Analyse |
| rasterio | 1.5.2 | Lecture des COG, reprojection |
| NumPy | 2.5.4 | Calcul des indices |
| Pillow | 13.0.0 | Images de sortie |
| pyproj | 3.8.0 | Systèmes de coordonnées |
| requests | 2.34.2 | Appels STAC et Overpass |
| Leaflet | 1.9.4 | Cartes web |
| Chart.js | 4.4.1 | Graphiques du tableau de bord |
| Supabase (PostgreSQL, PostGIS, Auth, Realtime, Edge Functions) | supabase-js 2.58.0 | Base de données et services |
| Bootstrap Icons | 1.11.3 | Icônes |
| Vercel | — | Hébergement du site |

## Outils d'intelligence artificielle

| Outil | Usage | Où |
|---|---|---|
| Claude (Anthropic) | Assistance à l'écriture du code, de la méthode et des documents | Développement |
| Claude, vision (Anthropic) | Analyse automatique des photos citoyennes : type d'obstruction, sévérité suggérée | Fonction serveur `analyser-image` |
| Roboflow | Détection d'objets sur photo, en option | Non activé pour ce résultat |

Aucun résultat chiffré de cette note n'est produit par un modèle d'IA : surfaces et comptes viennent du script d'analyse.

## Contributions de l'équipe

| Membre | Rôle | Contributions |
|---|---|---|
| Mouhameth Falilou Thiane (Satur Studio) | Porteur du projet | Conception, produit, coordination, présentation |
| *À compléter* | | |
