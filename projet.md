# Debrisat — Document projet

## Vision
Plateforme citoyenne pour prévenir les inondations à Dakar en détectant et signalant les obstructions de canaux de drainage, cause principale des inondations urbaines pendant l'hivernage.

**Équipe** : Saturn (Satur Studio) · **Slogan** : « Prévenir les inondations, un signalement à la fois »

## Contexte (chiffres affichés sur la page d'accueil)
| Chiffre | Libellé | Source |
|---|---|---|
| 360 000 | Personnes touchées en 2009 | Évaluation post-catastrophe (PDNA) 2009, Banque mondiale |
| 104 M$ | Dégâts en une saison | Même évaluation (inondations de 2009) |
| 137,5 mm | Record de pluie, oct. 2026 | Fourni dans le cahier des charges : **à vérifier avant diffusion** |

Zones historiquement touchées : Pikine, Guédiawaye, Keur Massar (2009, 2012, 2022), Diamaguène, Parcelles Assainies.

## Design system « Obsidian Glass »
- Minimalisme inspiré d'Apple + glassmorphism : panneaux de verre dépoli sur fond quasi noir.
- Jetons dans `css/tokens.css` (couleurs, verre, espacements de 4 px, typographie, rayons, courbes, z-index).
- Sombre par défaut, clair via `[data-theme="light"]`, préférences « Sombre / Clair / Système » dans le profil.
- `prefers-reduced-motion`, `prefers-reduced-transparency` et `prefers-contrast: more` pris en charge.
- Icônes : Bootstrap Icons 1.11.3 uniquement, zéro emoji.
- Mouvement : retour à l'appui, feuilles glissantes pilotées par un ressort interruptible (`js/animations.js` : `Ressort`, `Feuille`), projection de l'élan au relâchement, élastique en butée.

## Pages
| Page | Rôle |
|---|---|
| `index.html` | Accueil : hero (Terre vue de l'espace), fonctionnement en 3 étapes, carte en direct, chiffres clés animés, technologies, mentions légales |
| `app.html` | Carte citoyenne plein ecran : filtres, liste, classement, detail, alertes, recherche, assistant de signalement en 4 etapes, menu utilisateur (profil, espace agent, deconnexion) |
| `dashboard.html` | Autorités : indicateurs, carte d'administration, tableau triable avec actions groupées et assignation, alertes, zones à risque, statistiques, export CSV |
| `auth.html` | Connexion, inscription, mot de passe oublié et nouveau mot de passe, accès démo |
| `profil.html` | Points, rang, prochain badge, badges, historique, parametres (theme, langue, notifications, installation), bouton retour vers l'app |

Navigation interne par fragment d'URL (`js/router.js`) : `app.html#liste`, `#classement`, `#signaler`, `#carte?signalement=ID` (lien partageable) ; `dashboard.html#signalements`, `#carte`, `#zones`, `#alertes`, `#statistiques`, `#parametres`.

## Données
`js/donnees.js` expose une seule interface. Supabase si `js/config.js` est renseigné, sinon mode démo (`js/demo.js` : 92 signalements sur environ trois mois, 14 communes, 23 profils, 4 alertes, 5 zones, générés de façon déterministe ; les actions de l'utilisateur sont gardées dans le `localStorage`).

### Tables (`supabase/migrations/001_schema.sql`)
| Table | Usage |
|---|---|
| `profils` | Utilisateurs (créés automatiquement à l'inscription par déclencheur) |
| `signalements` | Signalements PostGIS, avec colonnes calculées `lat` / `lng` |
| `verifications` | Avis communautaires (un par personne, jamais sur son propre signalement) |
| `points_historique` | Historique de gamification (écrit uniquement par les déclencheurs) |
| `badges` | Définitions (icônes Bootstrap) |
| `zones_risque` | Polygones à risque avec score |
| `alertes` | Alertes des autorités |
| `images_satellite` | Imagerie stockée |
| `stats_communes` | Agrégats par commune |
| `sessions_whatsapp` | État des conversations du bot |

Vues : `vue_zones_risque` (GeoJSON), `classement_public` (sans téléphone).

### Règles métier (déclencheurs SQL)
- Nouveau signalement : +10 points, statut forcé à « en attente ».
- Vérification : +3 points au vérificateur ; 3 confirmations → « vérifié », priorité haute, +5 points à l'auteur ; 3 infirmations → « rejeté ».
- Passage à « résolu » : +20 points à l'auteur, `resolu_at` renseigné.
- Badges recalculés après chaque attribution de points.
- Un citoyen ne peut modifier ni son rôle ni ses points ; sur son signalement, seulement la description et la sévérité.

### Fonctions Edge (`supabase/functions/`)
| Fonction | Rôle | Accès |
|---|---|---|
| `analyser-image` | Analyse de la photo par Claude (`claude-opus-5-5`, sortie JSON structurée, repli serveur en cas de refus) et Roboflow en option ; relève la sévérité si besoin | Auteur du signalement, autorités, clé service |
| `webhook-whatsapp` | Bot Twilio : photo → position → type → signalement | Signature Twilio vérifiée, sans JWT |
| `calculer-risque` | Recalcul des scores de zones et des statistiques par commune | Autorités, clé service |
| `envoyer-alerte` | Diffusion SMS / WhatsApp, ciblée par commune de la zone | Autorités |

## Mise en production
1. Créer un projet Supabase, exécuter `supabase/migrations/001_schema.sql` (crée aussi le bucket `photos` et active le temps réel).
2. Renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `js/config.js`.
3. Donner le rôle `autorite` aux comptes concernés : `update profils set role = 'autorite' where id = '…';`
4. Secrets des fonctions : `supabase secrets set ANTHROPIC_API_KEY=… TWILIO_ACCOUNT_SID=… TWILIO_AUTH_TOKEN=… TWILIO_NUMERO_SMS=… TWILIO_NUMERO_WHATSAPP=… TWILIO_WEBHOOK_URL=…` (facultatifs : `ROBOFLOW_API_KEY`, `ROBOFLOW_MODELE`, `CLAUDE_MODELE`, `ORIGINE_AUTORISEE`).
5. Déployer : `supabase functions deploy` (le fichier `supabase/config.toml` désactive le JWT pour le webhook WhatsApp).
6. Dans Twilio, pointer le webhook WhatsApp entrant vers `TWILIO_WEBHOOK_URL`. Hors de la fenêtre de 24 h, WhatsApp n'accepte que des modèles de message approuvés : faire valider un modèle pour les alertes.
7. Recalcul horaire du risque (pg_cron + pg_net) : `select cron.schedule('risque', '0 * * * *', $$ select net.http_post(url := '<SUPABASE_URL>/functions/v1/calculer-risque', headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb) $$);`
8. Héberger les fichiers statiques (Vercel, Netlify, GitHub Pages) en HTTPS : obligatoire pour la géolocalisation, la caméra et le service worker.

## Dépendances (CDN)
Bootstrap Icons 1.11.3 · Leaflet 1.9.4 · leaflet.heat 0.2.0 · leaflet.markercluster 1.5.3 · Supabase JS 2.39.3 · Chart.js 4.4.1

## Feuille de route
- Phase 2 : Google Earth Engine pour la détection de changements, comparateur avant / après.
- Phase 3 : données météo de l'ANACIM si une API est disponible.
- Phase 4 : hébergement de production, Supabase Pro, imagerie haute résolution.
