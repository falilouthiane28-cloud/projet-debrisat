# Debrisat — Note de concept

**Défi pratique en observation de la Terre au Sénégal 2026** (TRL Space × Programme spatial du Sénégal, SENSAT)
**Thème :** Inondations et exposition
**Équipe :** Saturn (Satur Studio), Dakar
**ODD :** 11 (villes et communautés durables), 13 (action climatique)
**Démonstration en ligne :** https://projet-debrisat.vercel.app/hackathon.html

---

## 1. Problème

Pikine et Guédiawaye, dans la banlieue de Dakar, sont inondées presque chaque hivernage. Les inondations de 2009 ont touché environ 360 000 personnes et causé environ 104 millions de dollars de dommages et pertes (évaluation post-catastrophe PDNA, Gouvernement du Sénégal et Banque mondiale, 2010). Une partie du problème est simple et locale : des canaux et caniveaux bouchés par les déchets, le sable et les gravats empêchent l'eau de s'évacuer.

Aujourd'hui, l'information sur ces obstructions est dispersée : elle remonte par les habitants, les élus de quartier ou les équipes de terrain, sans carte commune ni lien avec les zones où l'eau s'accumule effectivement.

## 2. Utilisateur

**Utilisateur principal : la DPGI** (Direction de la Prévention et de la Gestion des Inondations).

| Question | Réponse |
|---|---|
| Information manquante | Une carte à jour des obstructions de canaux, reliée aux zones où l'eau stagne et aux infrastructures exposées |
| Décision préparée | Ordre de passage des équipes de curage, répartition des moyens par zone, messages d'alerte aux habitants |
| Fréquence | Continue pour les signalements ; à chaque scène Sentinel-2 exploitable (5 jours au mieux) |
| Format | Tableau de bord web par commune, file des interventions prioritaires, alertes WhatsApp et SMS |

Partenaires naturels : CSE (suivi environnemental), ANSD (population exposée), SGNS (sols et nappe), communes.

## 3. Solution

Debrisat associe trois sources :

1. **Le satellite** (Sentinel-2) montre **où** l'eau s'accumule pendant la saison des pluies et ne s'accumulait pas en saison sèche.
2. **Les habitants** signalent **pourquoi** : photo géolocalisée d'un canal bouché, depuis l'application web ou WhatsApp. Chaque signalement est confirmé ou infirmé par trois voisins.
3. **OpenStreetMap** indique **ce qui est exposé** : routes et bâtiments situés dans l'eau détectée.

Le prototype est fonctionnel : signalement citoyen, carte en temps réel, tableau de bord par commune pour les agents, file des dix interventions prioritaires pour la DPGI, administration des comptes et journal des actions.

## 4. Données

| Donnée | Produit | Résolution | Date | Licence |
|---|---|---|---|---|
| Copernicus Sentinel-2 L2A | B02, B03, B04, B08, B11, SCL | 10 m (B11, SCL : 20 m) | 3 avril et 31 août 2026 | Libre et gratuite |
| OpenStreetMap | Routes, bâtiments | Vecteur | Extraction du 20 octobre 2026 | ODbL |
| Signalements Debrisat | Photo, position, type, sévérité | Point GPS | Continu | Données du projet |

Inventaire complet : `docs/sources-inventaire.md`.

## 5. Démonstration sur données réelles

**Zone :** Pikine et Guédiawaye, emprise 17,42° O à 17,36° O, 14,74° N à 14,80° N (environ 6,5 × 6,6 km).

**Scènes :** `S2A_28PBB_20260403_0_L2A` (saison sèche) et `S2A_28PBB_20260831_0_L2A` (saison des pluies). Nuages mesurés sur la zone avec la bande SCL : 0,4 % et 0,9 %.

**Méthode :** indice MNDWI = (B03 − B11) / (B03 + B11) (Xu, 2006), seuil 0 ; pixels nuageux exclus ; eau « nouvelle » = eau le 31 août et pas le 3 avril ; mer et déferlement exclus (bande de 500 m depuis la côte).

**Résultats :**

| Indicateur | Valeur |
|---|---|
| Eau nouvelle (seuil retenu) | **11,0 ha** |
| Plage selon le seuil (−0,1 à 0,3) | 7,0 à 30,4 ha |
| Routes OpenStreetMap dans l'eau nouvelle | 29 tronçons, 0,61 km |
| Bâtiments OpenStreetMap dans l'eau nouvelle | 13 (sur 21 792 cartographiés) |

Sur l'image en couleurs naturelles, les dépressions inondées au nord-est de la zone apparaissent nettement le 31 août et sont absentes le 3 avril. La comparaison interactive est en ligne.

**Lecture pour la DPGI :** ces zones sont des points de départ pour une vérification de terrain et un contrôle des canaux voisins, à croiser avec les signalements citoyens de la commune.

## 6. Limites

- **Résolution de 10 m :** un canal bouché n'est pas visible ; le satellite montre l'effet (eau stagnante), les citoyens montrent la cause.
- **Dates :** le 31 août est une date de saison des pluies, pas le lendemain d'un épisode précis ; l'eau observée peut être plus ancienne ou déjà en partie évacuée.
- **Nuages :** peu de scènes optiques exploitables pendant l'hivernage ; le radar Sentinel-1 est nécessaire pour suivre un épisode donné.
- **Seuil :** la surface varie d'un facteur quatre selon le seuil ; nous publions la plage et non un chiffre unique. Toits sombres, ombres et sable humide peuvent créer des faux positifs, en particulier le long de l'autoroute et de la zone industrielle au sud.
- **OpenStreetMap :** la cartographie des bâtiments de Pikine est incomplète ; les comptes sont des minimums.
- **Analyse automatique des photos :** non encore évaluée sur des images de Dakar.

## 7. Prochaine étape

Pilote de trois mois avec la DPGI sur une commune (Pikine ou Keur Massar) :

1. 50 habitants testeurs et les agents de la commune sur Debrisat ;
2. ajout de Sentinel-1 pour les épisodes nuageux et de CHIRPS pour relier l'eau détectée aux pluies ;
3. comparaison des zones détectées avec les relevés d'intervention de la DPGI pour mesurer la précision (vrais et faux positifs) ;
4. ajustement du seuil et du masque à partir de ces relevés.

---

*Outils d'IA : Claude (Anthropic) pour l'assistance à l'écriture du code et des documents, et pour l'analyse automatique des photos citoyennes. Toutes les valeurs ci-dessus sont produites par `scripts/analyse_ndwi.py` et lisibles dans `assets/satellite/metadata.json` et `exposition.json`.*
