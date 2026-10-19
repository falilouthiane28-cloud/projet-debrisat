# Debrisat — Document Projet

## Vision
Plateforme citoyenne pour prevenir les inondations a Dakar en detectant et signalant les obstructions de canaux de drainage — la cause principale des inondations urbaines.

**Equipe** : Saturn (Satur Studio)
**Tagline** : "Prevenir les inondations, un signalement a la fois"

## Contexte
- 104M USD de degats en une saison
- 360 000 personnes touchees (2009)
- 137,5 mm de pluie record en 24 h (octobre 2026)
- Zones critiques : Pikine, Guediawaye, Keur Massar, Parcelles Assainies, Yeumbeul, Diamaguene

## Acces
| Environnement | Adresse |
|---------------|---------|
| Production (GitHub Pages) | https://falilouthiane28-cloud.github.io/projet-debrisat/ (en ligne une fois Pages active, voir ci-dessous) |
| Apercu prive (Artifact Claude) | https://claude.ai/artifact/GUK37bxVCZUMeL8Xf7s2bB |
| Code source | https://github.com/falilouthiane28-cloud/projet-debrisat |

Le site est deploye par `.github/workflows/deploiement-pages.yml` a chaque push sur `main`
(et sur la branche de travail `claude/fervent-johnson-0vrd98`). Aucune etape de build : les fichiers sont servis tels quels.
Tant que Supabase n'est pas configure, le site tourne en **mode demonstration** (donnees fictives).

**Activation (une seule fois, par le proprietaire du depot)** : un workflow ne peut pas activer Pages lui-meme.
1. Settings → Pages → Build and deployment → Source : **GitHub Actions**
2. Pour deployer depuis la branche de travail : Settings → Environments → `github-pages` → Deployment branches → ajouter `claude/fervent-johnson-0vrd98` (sinon, fusionner dans `main`)
3. Actions → « Deploiement GitHub Pages » → Run workflow

## Architecture technique

### Frontend (Vanilla JS, design system « Obsidian Glass »)
| Page | Role |
|------|------|
| `index.html` | Accueil : hero, fonctionnement en 3 etapes, carte en direct, chiffres cles, technologies |
| `app.html` | App citoyen : carte plein ecran, filtres, liste, classement, assistant de signalement en 4 etapes, alertes |
| `dashboard.html` | Espace autorites : indicateurs, carte / tableau / alertes, actions groupees, export CSV, zones a risque, statistiques |
| `auth.html` | Connexion, inscription, mot de passe oublie |
| `profil.html` | Profil citoyen : niveau, badges, signalements, historique de points, parametres |

| Dossier | Contenu |
|---------|---------|
| `css/` | `tokens`, `reset`, `base`, `components`, `landing`, `app`, `dashboard`, `responsive` |
| `js/` | 21 modules sous `window.debrisat` (voir `CLAUDE.md`) |
| `img/` | `logo.png`, `logo-mark.png`, `icon-192.png`, `icon-512.png`, photos d'illustration |

### Backend (Supabase)
| Table | Usage |
|-------|-------|
| `profils` | Utilisateurs (extends auth.users) |
| `signalements` | Signalements avec geolocalisation PostGIS |
| `verifications` | Votes communautaires (confirmer/infirmer) |
| `points_historique` | Historique de gamification |
| `badges` | Definitions des badges (icone = classe Bootstrap Icons) |
| `zones_risque` | Polygones zones inondables avec score |
| `alertes` | Alertes envoyees aux citoyens |
| `images_satellite` | Imagerie satellite stockee |
| `stats_communes` | Statistiques agregees |

Schema : `supabase/migrations/001_schema.sql`.

### Edge Functions
| Fonction | Role |
|----------|------|
| `webhook-whatsapp` | Bot WhatsApp via Twilio |
| `analyser-image` | Analyse IA (Claude Vision) |
| `calculer-risque` | Score de risque par zone |
| `envoyer-alerte` | Dispatch alertes SMS/WhatsApp |

## Fonctionnalites cles

### Signalement (citoyen)
1. Photo (camera ou galerie, 10 Mo max)
2. Type d'obstruction (9 types)
3. Severite (1 a 5, avec description de chaque niveau)
4. Localisation (GPS ou epingle deplacable) + description facultative
→ Upload Supabase Storage → Insert DB → Analyse IA en arriere-plan

Hors-ligne : le signalement est mis en file d'attente (IndexedDB) et envoye au retour du reseau.

### Gamification
- +10 pts par signalement
- +3 pts par verification
- +5 pts si signalement verifie par la communaute
- +20 pts si signalement resolu
- 6 niveaux : Observateur, Vigie, Sentinelle, Gardien, Protecteur, Legende de Dakar
- 6 badges : Premier pas, Sentinelle, Gardien du quartier, Protecteur de Dakar, Champion anti-inondation, Verificateur

### Verification communautaire
- 3 confirmations → statut "verifie" + priorite haute
- 3 infirmations → statut "rejete"

### Temps reel
- Supabase Realtime sur la table signalements
- Nouveaux marqueurs animes sur la carte
- Notification si signalement a moins de 1 km

### Dashboard autorites
- Indicateurs avec tendance par rapport a la periode precedente (7, 30, 90 jours ou tout)
- Filtre par commune
- Carte d'administration (changement de statut depuis le marqueur), carte de chaleur, vue satellite Sentinel-2
- Tableau triable, recherche, pagination, actions groupees, export CSV (compatible Excel)
- Diffusion d'alertes (application, SMS, WhatsApp) et historique
- Zones a risque avec score et signalements actifs
- Statistiques : taux et delai de resolution, part WhatsApp, detections satellite, repartition par commune et par severite

### PWA
- Service Worker : coquille applicative, librairies CDN et tuiles de carte en cache
- Manifest installable avec raccourcis (Signaler, Espace Autorites)

## Dependances externes (CDN)
- Bootstrap Icons 1.11.3
- Leaflet 1.9.4, leaflet.heat 0.2.0, leaflet.markercluster 1.5.3
- Supabase JS 2.39.3
- Chart.js 4.4.1
- Fonds de carte CARTO (sombre / clair), mosaique Sentinel-2 cloudless (EOX), geocodage Nominatim

## Mise en production
1. Creer un projet Supabase
2. Executer `supabase/migrations/001_schema.sql`
3. Creer un bucket Storage "photos" (public)
4. Mettre les cles dans `js/config.js` (le mode demonstration se desactive automatiquement)
5. (Optionnel) Configurer Twilio et renseigner `NUMERO_WHATSAPP` dans `js/config.js`
6. (Optionnel) Ajouter `ANTHROPIC_API_KEY` aux secrets des Edge Functions pour l'analyse IA
7. Pousser sur `main` : GitHub Pages redeploie le site
