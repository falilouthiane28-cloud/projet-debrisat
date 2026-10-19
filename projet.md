# Debrisat — Document Projet

## Vision
Plateforme citoyenne pour prevenir les inondations a Dakar en detectant et signalant les obstructions de canaux de drainage — la cause principale des inondations urbaines.

**Equipe** : Saturn (Satur Studio)
**Tagline** : "Prevenir les inondations, un signalement a la fois"

## Contexte
- 104M USD de degats estimes en 2024
- 360 000 personnes affectees
- 137.5mm de pluie record en 24h
- Zones critiques : Pikine, Guediawaye, Keur Massar, Parcelles Assainies

## Architecture technique

### Frontend (Vanilla JS)
| Page | Role |
|------|------|
| `index.html` | Landing page avec hero, stats, carte preview |
| `app.html` | Interface citoyen : carte Leaflet, signalements, gamification |
| `dashboard.html` | Interface autorites : stats, graphiques, gestion, alertes |
| `auth.html` | Connexion, inscription, mot de passe oublie |
| `profil.html` | Profil citoyen : niveau, badges, signalements, historique |

### Backend (Supabase)
| Table | Usage |
|-------|-------|
| `profils` | Utilisateurs (extends auth.users) |
| `signalements` | Signalements avec geolocalisation PostGIS |
| `verifications` | Votes communautaires (confirmer/infirmer) |
| `points_historique` | Historique de gamification |
| `badges` | Definitions des badges |
| `zones_risque` | Polygones zones inondables avec score |
| `alertes` | Alertes envoyees aux citoyens |
| `images_satellite` | Imagerie satellite stockee |
| `stats_communes` | Statistiques agregees |

### Edge Functions
| Fonction | Role |
|----------|------|
| `webhook-whatsapp` | Bot WhatsApp via Twilio |
| `analyser-image` | Analyse IA (Claude Vision) |
| `calculer-risque` | Score de risque par zone |
| `envoyer-alerte` | Dispatch alertes SMS/WhatsApp |

## Fonctionnalites cles

### Signalement (citoyen)
1. Photo (camera ou fichier)
2. Type d'obstruction (9 types)
3. Severite (1-5)
4. Localisation GPS ou selection sur carte
5. Description optionnelle
→ Upload Supabase Storage → Insert DB → Analyse IA

### Gamification
- +10 pts par signalement
- +3 pts par verification
- +5 pts si signalement verifie par la communaute
- +20 pts si signalement resolu
- 6 badges : Premier Pas, Sentinelle, Gardien, Protecteur, Champion, Verificateur

### Verification communautaire
- 3 confirmations → statut "verifie" + priorite haute
- 3 infirmations → statut "rejete"

### Temps reel
- Supabase Realtime sur table signalements
- Nouveaux marqueurs animes sur la carte
- Toast si signalement a moins de 1km

### Dashboard autorites
- Stats en temps reel (total, en attente, en cours, resolus, taux)
- Graphiques Chart.js (evolution 30j, par type, par commune)
- Tableau avec tri, filtre, recherche, pagination
- Changement de statut + export CSV
- Systeme d'alertes multi-canal

### PWA
- Service Worker avec cache app shell + tuiles carte
- File d'attente offline (IndexedDB) + sync auto
- Manifest installable

## Dependances externes (CDN)
- Leaflet 1.9.4
- leaflet.heat 0.2.0
- leaflet.markercluster 1.5.3
- Supabase JS 2.39.3
- Chart.js 4.4.1

## Configuration requise
1. Creer un projet Supabase
2. Executer `supabase/migrations/001_initial_schema.sql`
3. Creer un bucket Storage "photos" (public)
4. Mettre les cles dans `js/config.js`
5. (Optionnel) Configurer Twilio pour WhatsApp
6. (Optionnel) Ajouter `ANTHROPIC_API_KEY` pour l'analyse IA
