# CLAUDE.md — Instructions pour Claude Code

## Projet
Debrisat — plateforme citoyenne de prevention des inondations a Dakar, Senegal.
Detecte et suit les obstructions de canaux de drainage (dechets, sable, gravats).

## Stack
- **Frontend** : Vanilla JS pur (PAS de framework, PAS de React/Vue/jQuery)
- **Backend** : Supabase (PostgreSQL + PostGIS + Auth + Storage + Realtime + Edge Functions)
- **Carte** : Leaflet.js + leaflet.heat + leaflet.markercluster, fonds CartoDB Dark Matter / Positron
- **Graphiques** : Chart.js (dashboard uniquement)
- **Icones** : Bootstrap Icons 1.11.3 (CDN) — seule source d'icones
- **Bot** : Twilio WhatsApp
- **PWA** : Service Worker + IndexedDB pour offline

## Regles strictes
- **Zero emoji** : nulle part (HTML, JS, CSS, SQL, messages). Toujours `<i class="bi bi-...">`.
- **Langue** : code, commentaires, variables en **francais** (sans accents dans les identifiants). Textes d'interface en francais correctement accentue.
- **Pas de frameworks JS** : HTML/CSS/JS vanilla uniquement
- **CDN only** : pas de npm/node_modules, toutes les libs via CDN avec versions exactes
- **PostGIS** : les localisations utilisent `GEOGRAPHY(POINT, 4326)` (lues en EWKB hex cote client, voir `utils.extraireCoordonnees`)
- **Theme** : sombre par defaut, clair via `data-theme="light"` sur `<html>` (bascule persistee, `js/theme.js` charge dans `<head>`)
- **Mobile-first** : 375px d'abord, puis 768 / 1024 / 1440. Cibles tactiles de 44px minimum.
- **Accessibilite** : `aria-label` en francais sur chaque bouton icone, `<label>` visible sur chaque champ, lien d'evitement, focus visible, `prefers-reduced-motion` respecte.

## Structure
```
debrisat/
├── index.html          # Accueil (hero, fonctionnement, carte en direct, chiffres, technologies)
├── app.html            # App citoyen : carte plein ecran, filtres, liste, classement, assistant 4 etapes
├── dashboard.html      # Espace autorites : stats, carte/tableau/alertes, zones, statistiques
├── auth.html           # Connexion / inscription
├── profil.html         # Profil : niveau, badges, signalements, historique de points
├── css/                # tokens, reset, base, components, landing, app, dashboard, responsive
├── js/                 # voir ci-dessous
├── sw.js               # Service Worker (coquille + CDN + tuiles)
├── manifest.json       # PWA manifest
├── img/                # logo.png, logo-mark.png, icon-192/512.png, photos
└── supabase/
    ├── migrations/001_schema.sql
    └── functions/      # webhook-whatsapp, analyser-image, calculer-risque, envoyer-alerte
```

### Modules JS (namespace `window.debrisat`)
- `theme.js` (dans `<head>`), `config.js`, `utils.js` (helpers, modales + piege de focus), `donnees.js` (couche de donnees)
- `notifications.js` (toasts), `i18n.js` (francais/wolof), `animations.js` (revelations, compteurs)
- `auth.js`, `router.js` (vues par ancre), `map.js`, `heatmap.js`, `satellite.js`, `gamification.js`
- `signalement.js` (assistant), `realtime.js`, `ia-analysis.js`, `pwa.js`
- Scripts de page : `landing.js`, `app.js`, `dashboard.js`, `profil.js`

## Mode demonstration
Tant que `js/config.js` contient `YOUR_SUPABASE_URL`, `donnees.js` sert des donnees fictives realistes
(168 signalements dans 18 communes, generees avec une graine fixe). Les ajouts et changements de statut
sont conserves dans `localStorage` (`debrisat-demo-v1`). Un badge « Demo » est affiche dans l'interface.
Toute nouvelle lecture/ecriture passe par `donnees.js` pour fonctionner dans les deux modes.

## Supabase
- Config dans `js/config.js` — remplacer `YOUR_SUPABASE_URL` et `YOUR_SUPABASE_ANON_KEY`
- Schema complet dans `supabase/migrations/001_schema.sql`
- RLS active sur toutes les tables
- Fonction RPC `incrementer_confirmations` pour les verifications communautaires
- Bucket Storage `photos` (public)

## Design system « Obsidian Glass »
- Tokens dans `css/tokens.css` (couleurs, verre, espacements 8px, typo, rayons, transitions, z-index)
- Verre : `var(--glass-bg)` + `backdrop-filter: blur(var(--glass-blur))` + `var(--glass-border)`
- Accents (avec parcimonie) : danger `#FF3B30`, attention `#FF9500`, succes `#30D158`, info `#5E9FFF`
- Severite 1 a 5 : `--severity-1` (#4ADE80) a `--severity-5` (#EF4444)
- Series de graphiques : `--serie-1` a `--serie-5` + `--serie-autre` (palette validee daltonisme)
- Chiffres : `font-mono`, `tabular-nums`

## Conventions
- Pas de commentaires sauf si le "pourquoi" est non-evident
- Noms de variables en francais (camelCase)
- Fonctions async/await partout
- Gestion d'erreurs avec try/catch + toast utilisateur en francais (`notifications.erreur`)
- Echapper tout contenu utilisateur injecte en HTML (`utils.echapper`)
- Pas d'abstraction prematuree
