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
- [ ] Icones PWA dans `assets/icons/` (192x192 et 512x512)

### Commit
- `b4fc3b6` — feat: initialisation complete de Debrisat

---

## Format des entrees futures

Chaque modification importante sera documentee ici avec :
- **Date**
- **Ce qui a change** (fichiers, fonctionnalites)
- **Pourquoi** (contexte de la decision)
- **Commit** associe
