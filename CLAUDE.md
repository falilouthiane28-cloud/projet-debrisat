# CLAUDE.md — Instructions pour Claude Code

## Projet
Debrisat : plateforme citoyenne de prévention des inondations à Dakar (Sénégal), par l'équipe Saturn (Satur Studio).
Détecte et suit les obstructions de canaux de drainage (déchets, sable, gravats) par signalement citoyen, WhatsApp, IA et imagerie satellite.

## Documentation à tenir à jour
À **chaque modification importante**, mettre à jour : `projet.md` (architecture), `memory.md` (journal des décisions), `progress.md` (avancement) et ce fichier si une règle change.

## Stack
- **Frontend** : HTML5 + CSS3 + JavaScript ES2022 en **modules ES** (`<script type="module">`). Aucun framework, aucun jQuery, aucun build.
- **Backend** : Supabase (PostgreSQL + PostGIS + Auth + Storage + Realtime + Edge Functions Deno)
- **Carte** : Leaflet 1.9.4 + leaflet.heat 0.2.0 + leaflet.markercluster 1.5.3
- **Fonds de carte** : Esri Canvas gris foncé / gris clair (sans clé). **CARTO exige désormais une clé : ne pas l'utiliser.**
- **Satellite** : mosaïque Sentinel-2 cloudless 2020 d'EOX (sans clé)
- **Icônes** : Bootstrap Icons 1.11.3 uniquement
- **Graphiques** : Chart.js 4.4.1 (tableau de bord uniquement)
- **IA** : SDK Anthropic officiel (`npm:@anthropic-ai/sdk`) dans la fonction Edge, modèle `claude-opus-5-5` ; Roboflow en option
- **Bot** : Twilio WhatsApp

## Règles strictes
1. **Zéro emoji** nulle part (HTML, JS, CSS, SQL, commentaires). Tout indicateur visuel = `<i class="bi bi-…">`.
2. **Interface en français correct, avec accents** (é, è, à, ç…). Noms de variables et de fonctions en français sans accents.
3. **Vanilla JS uniquement**, bibliothèques via CDN avec versions exactes (cdnjs ou jsdelivr).
4. **Mobile d'abord** : conçu pour 375 px, puis 768 / 1024 / 1440 px. Cibles tactiles de 44 × 44 px minimum.
5. **Sombre par défaut** (`:root`), clair via `[data-theme="light"]` sur `<html>`. Les deux doivent être irréprochables.
6. **Verre** (« Obsidian Glass ») sur les cartes, panneaux, barres, modales et toasts : jetons dans `css/tokens.css`.
7. **Tout texte saisi par un utilisateur passe par `echapper()`** (`js/utils.js`) avant d'entrer dans du HTML.
8. Les points, badges, compteurs et transitions de statut sont **calculés par des déclencheurs SQL**, jamais par le client.

## Lancer en local
Les modules ES ne fonctionnent pas en `file://` : servir le dossier en HTTP.
```bash
python .claude/serveur-dev.py 5501
```
Puis ouvrir http://localhost:5501. Ce serveur désactive le cache (sinon Chrome sert d'anciens modules).

## Mode démo
Si `SUPABASE_URL` / `SUPABASE_ANON_KEY` (dans `js/config.js`) ne sont pas renseignés, l'application tourne avec des données fictives réalistes (`js/demo.js`), un compte démo de rôle « autorité » et un signalement simulé toutes les 90 s. Le badge « Mode démo » l'indique dans l'interface.

## Structure
```
index.html, app.html, dashboard.html, auth.html, profil.html
css/   tokens → reset → base → components → (landing | app | dashboard) → responsive
js/    config, utils, demo, donnees (accès aux données, Supabase ou démo), auth, router, theme,
       animations (apparitions, compteurs, Ressort, Feuille), notifications, map, heatmap, satellite,
       signalement (assistant 4 étapes), gamification, realtime, ia-analysis, i18n, pwa,
       page-accueil, page-app, page-auth, page-profil, dashboard
i18n/  fr.json (clés), wo.json (brouillon wolof à faire valider)
img/   logo.png, symbole.png, icons/ (PWA), photos de fond
supabase/migrations/001_schema.sql, supabase/functions/{_shared, analyser-image, webhook-whatsapp, calculer-risque, envoyer-alerte}
```

## Conventions
- Pas de commentaire sauf si le « pourquoi » n'est pas évident.
- `async` / `await` partout, erreurs en `try` / `catch` + toast en français.
- Mouvement : retour à l'appui (`:active`), ressorts interruptibles pour les gestes, `prefers-reduced-motion` respecté partout.
- Pas d'abstraction prématurée.
