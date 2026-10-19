# Memory — Debrisat

Journal des decisions, changements et points d'attention du projet.

---

## 2026-10-18 — Initialisation du projet

### Decisions prises
- Stack choisie : Vanilla JS + Supabase (pas de framework)
- 3 pages HTML : landing, app citoyen, dashboard autorites
- Gamification integree des le depart (points + badges)
- PWA avec support offline via IndexedDB
- Bot WhatsApp via Twilio Edge Function
- Analyse IA via Claude Vision API (Edge Function)

### Architecture
- 29 fichiers crees, 4000 lignes de code
- Schema SQL complet avec 9 tables, RLS, indexes spatiaux PostGIS
- 4 Edge Functions Supabase (Deno/TypeScript)
- Service Worker avec strategie Network-first + cache tuiles OSM

### Donnees de seed
- 6 badges predefinis
- 5 zones a risque (Pikine, Guediawaye, Keur Massar, Diamaguene, Parcelles Assainies)
- 14 communes de Dakar

### A configurer
- [ ] Cles Supabase dans `js/config.js`
- [ ] Bucket Storage "photos" (public)
- [ ] Twilio (optionnel) pour WhatsApp
- [ ] ANTHROPIC_API_KEY (optionnel) pour analyse IA
- [x] Icones PWA dans `img/` (192x192 et 512x512)

### Commit
- `b4fc3b6` — feat: initialisation complete de Debrisat

---

## 2026-10-19 — Refonte complete « Obsidian Glass »

### Ce qui a change
- Nouveau design system sombre a effet verre (inspiration Apple) : `css/tokens.css`, `reset.css`, `base.css`, `components.css`, `responsive.css` + CSS par page. `css/variables.css` supprime.
- 2 nouvelles pages : `auth.html` (connexion/inscription) et `profil.html` (niveau, badges, historique).
- Icones : Bootstrap Icons 1.11.3 partout, zero emoji (y compris SQL des badges et messages Twilio).
- Carte : fonds CartoDB sombre/clair synchronises avec le theme, marqueurs circulaires par severite, popups en verre, couche satellite Sentinel-2 cloudless (EOX, sans cle).
- Nouveaux modules : `donnees.js` (couche de donnees demo/Supabase), `theme.js`, `router.js`, `animations.js`, `i18n.js`, `landing.js`, `app.js`, `profil.js`.
- Mode demonstration : l'app fonctionne sans Supabase avec des donnees fictives de Dakar.
- Images renommees (noms sans espaces ni emoji) ; logo transparent `img/logo.png`, `img/logo-mark.png`, icones PWA generees.
- Migration renommee en `supabase/migrations/001_schema.sql`.

### Pourquoi
- Interface plus professionnelle et credible pour les autorites, accessible (WCAG AA) et utilisable sur mobile.
- La couche `donnees.js` permet une demo complete avant la configuration de Supabase.

### Points d'attention
- Le passage d'un signalement en « resolu » n'attribue plus de points a l'agent connecte (bug de l'ancien dashboard). L'attribution a l'auteur doit se faire cote serveur (trigger ou Edge Function).
- Traductions wolof partielles dans `js/i18n.js`, a faire relire par un locuteur natif.
- Les photos des donnees de demo sont remplacees par une tuile icone + couleur de severite.

---

## Format des entrees futures

Chaque modification importante sera documentee ici avec :
- **Date**
- **Ce qui a change** (fichiers, fonctionnalites)
- **Pourquoi** (contexte de la decision)
- **Commit** associe
