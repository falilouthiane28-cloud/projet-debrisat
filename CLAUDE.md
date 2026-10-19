# CLAUDE.md — Instructions pour Claude Code

## Projet
Debrisat — plateforme citoyenne de prevention des inondations a Dakar, Senegal.
Detecte et suit les obstructions de canaux de drainage (dechets, sable, gravats).

## Stack
- **Frontend** : Vanilla JS pur (PAS de framework, PAS de React/Vue)
- **Backend** : Supabase (PostgreSQL + PostGIS + Auth + Storage + Realtime + Edge Functions)
- **Carte** : Leaflet.js + leaflet.heat + leaflet.markercluster
- **Graphiques** : Chart.js (dashboard uniquement)
- **Bot** : Twilio WhatsApp
- **PWA** : Service Worker + IndexedDB pour offline

## Regles strictes
- **Langue** : tout le code, commentaires, UI, variables en **francais**. Anglais interdit dans le code.
- **Pas de frameworks JS** : HTML/CSS/JS vanilla uniquement
- **CDN only** : pas de npm/node_modules, toutes les libs via CDN avec versions exactes
- **PostGIS** : les localisations utilisent `GEOGRAPHY(POINT, 4326)`
- **Dark mode** : via CSS custom properties + `prefers-color-scheme`
- **Mobile-first** : responsive, PWA installable

## Structure
```
debrisat/
├── index.html          # Landing page
├── app.html            # App carte + signalements
├── dashboard.html      # Dashboard autorites
├── css/                # 6 fichiers CSS (variables, base, components, landing, app, dashboard)
├── js/                 # 12 modules JS (config, utils, auth, map, signalement, gamification, realtime, notifications, ia-analysis, satellite, heatmap, dashboard, pwa)
├── sw.js               # Service Worker
├── manifest.json       # PWA manifest
├── supabase/
│   ├── migrations/     # Schema SQL + seed data
│   └── functions/      # 4 Edge Functions (webhook-whatsapp, analyser-image, calculer-risque, envoyer-alerte)
└── assets/             # Icons et images
```

## Supabase
- Config dans `js/config.js` — remplacer `YOUR_SUPABASE_URL` et `YOUR_SUPABASE_ANON_KEY`
- Schema complet dans `supabase/migrations/001_initial_schema.sql`
- RLS active sur toutes les tables
- Fonction RPC `incrementer_confirmations` pour les verifications communautaires

## Palette couleurs
- Primary: `#1B4D3E` (vert profond)
- Secondary: `#2196F3` (bleu)
- Accent: `#FF6B35` (orange)
- Success: `#4CAF50` / Danger: `#E53935`

## Conventions
- Pas de commentaires sauf si le "pourquoi" est non-evident
- Noms de variables en francais (camelCase)
- Fonctions async/await partout
- Gestion d'erreurs avec try/catch + toast utilisateur
- Pas d'abstraction prematuree
