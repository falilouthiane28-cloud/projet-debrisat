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
- `b4fc3b6` — feat: initialisation complete de Debrisat (ancien dépôt ; le projet a depuis son propre dépôt GitHub, premier commit `b866fd9`)

---

## 2026-10-19 — Refonte complète « Obsidian Glass »

### Ce qui a changé
- Nouveau design system sombre par défaut, glassmorphism inspiré d'Apple (`css/tokens.css` à `css/responsive.css`, 8 fichiers ; `variables.css` supprimé).
- Zéro emoji : toutes les icônes passent par Bootstrap Icons 1.11.3. Interface réécrite en français accentué.
- Deux pages ajoutées : `auth.html` (connexion, inscription, réinitialisation) et `profil.html`.
- JavaScript réécrit en modules ES, avec une couche d'accès unique (`js/donnees.js`) et un **mode démo** complet quand Supabase n'est pas configuré.
- Assistant de signalement en 4 étapes dans une feuille glissante (glisser pour fermer, ressort interruptible), file d'attente hors ligne IndexedDB.
- Tableau de bord : indicateurs, carte d'administration, tableau triable avec actions groupées et assignation, zones à risque, statistiques, export CSV.
- Logo recadré sur fond transparent (`img/logo.png`), symbole seul (`img/symbole.png`), icônes PWA générées.

### Décisions et pourquoi
- **Fonds de carte Esri Canvas au lieu de CARTO** : les tuiles CARTO renvoient désormais « API KEY REQUIRED ». Esri fonctionne sans clé.
- **Satellite : Sentinel-2 cloudless d'EOX** : l'ancienne couche Sentinel Hub exigeait un identifiant d'instance et ne s'affichait pas.
- **Indicateurs « En attente » et « En cours » sans tendance** : comparer des stocks par période de création donnait des +1 700 % trompeurs ; on affiche à la place le nombre de cas graves et d'assignés.
- **Repère fixe au centre de la mini-carte** (la carte glisse dessous) plutôt qu'un marqueur à faire glisser : plus précis au doigt.
- **Contrastes** : `--color-muted` passé de #666 à #8A8A8A (et accents assombris en mode clair) pour respecter 4,5:1.
- **Pas de fond animé dans le hero** : les animations plein écran en boucle sont déconseillées (vestibulaire).
- **Wolof limité à quelques libellés sûrs** (`i18n/wo.json`) en attendant la relecture d'un locuteur natif.
- **Historique d'inondations des zones** : 2009, 2012 et 2022 (événements documentés) au lieu de 2024 / 2026.

### Failles de sécurité corrigées (version précédente)
- Un utilisateur pouvait se donner le rôle admin et des points (politique UPDATE sur son profil sans restriction) → déclencheur `proteger_profil`.
- Les points étaient ajoutés par le client → déclencheurs SQL uniquement, plus de politique INSERT sur `points_historique`.
- La fonction `incrementer_confirmations` était appelable par n'importe qui → remplacée par un déclencheur sur `verifications`.
- Les numéros de téléphone étaient lisibles publiquement → vue `classement_public` sans téléphone.
- `envoyer-alerte` permettait à quiconque d'envoyer des SMS à tous les inscrits → réservé aux autorités.
- Le webhook WhatsApp n'authentifiait pas Twilio, échappait mal le XML et gardait son état en mémoire (perdu entre deux appels) → signature vérifiée, table `sessions_whatsapp`.
- Contenu utilisateur injecté sans échappement dans le HTML (XSS) → `echapper()` systématique.
- Redirection ouverte possible via `?retour=` → liste blanche de pages.
- Export CSV : protection contre l'injection de formules Excel.

### Points d'attention
- Le chiffre « 137,5 mm, record de pluie oct. 2026 » vient du cahier des charges et n'a pas été vérifié.
- Les signalements de démo n'ont pas de photo réelle : une vignette par type les remplace.
- Les fonctions Edge n'ont pas été déployées ni exécutées (pas de projet Supabase connecté).

---

## 2026-10-21 — UX : menu utilisateur et navigation

### Ce qui a change
- `index.html` : liens de connexion/inscription pointent vers `auth.html?retour=app.html` pour rediriger vers l'app apres connexion.
- `app.html` : avatar remplace par un menu dropdown (profil, espace agent pour les autorites, deconnexion) avec animation et effet de verre.
- `js/page-app.js` : logique du menu dropdown, toast de bienvenue apres connexion, fermeture au clic exterieur.
- `css/app.css` : styles du menu dropdown avec glassmorphism et animation.
- `css/components.css` : indicateur actif (point lumineux) sur la barre de navigation mobile.
- `css/dashboard.css` : stats du profil centrees avec typographie amelioree.
- `profil.html` : bouton retour vers l'application dans l'en-tete.
- `js/config.js` : URL et cle Supabase renseignees.

### Decisions et pourquoi
- **Menu dropdown au lieu d'un lien direct** : permet d'acceder au profil, au tableau de bord (si autorite) et de se deconnecter sans quitter l'app.
- **Redirection explicite via `retour=app.html`** : la logique `destinationRetour()` / `accueilRole()` fonctionnait deja mais l'ajout du parametre rend le comportement explicite depuis la landing.
- **Toast de bienvenue** : retour visuel apres connexion, une seule fois par session (`sessionStorage`).

### Commit
- `09e2373`

---

## Format des entrees futures

Chaque modification importante sera documentee ici avec :
- **Date**
- **Ce qui a change** (fichiers, fonctionnalites)
- **Pourquoi** (contexte de la decision)
- **Commit** associe

## 2026-10-19 — Mise en service Supabase et rôles
- **Ce qui a changé** : config.js pointe sur le projet `bezkifetuusykmmwwiad` avec la clé publiable ; supabase-js passe en 2.58.0 (2.39.3 ne connaît pas les clés `sb_publishable_`) ; migrations 002_securite, 003_performance, 004_roles ; message d'erreur d'inscription explicite (auth.js) ; logo du pied de page qui était étiré (base.css).
- **Pourquoi** : première exécution réelle. Le conseiller Supabase exposait les fonctions de déclencheur via /rpc. Rôles réduits à `citoyen` / `autorite` à la demande de l'équipe : plus de rôle admin côté client, la promotion se fait en SQL.
- **Commit** : non commité.

## 2026-10-19 — Finitions mobiles
- **Ce qui a changé** : bouton flottant de signalement réservé à la tablette et au-delà ; `.btn-sm` à 44 px sur écran tactile ; `preconnect` dans les 5 pages.
- **Pourquoi** : doublon avec « Signaler » de la barre du bas, règle des cibles 44 × 44, connexions ouvertes plus tôt.
- **Commit** : non commité.

## 2026-10-19 — Navigation et connexion Google
- **Ce qui a changé** : barre de l'app en pilule flottante, barre latérale du tableau de bord en tuiles repliables, bouton Google (`connexionGoogle` dans auth.js).
- **Pourquoi** : références visuelles fournies par l'équipe (barre Tourera, barre latérale à tuiles). Google vérifie d'abord `/auth/v1/settings` : sans ce contrôle, un fournisseur désactivé mène à une page d'erreur JSON de Supabase.
- **Commit** : non commité.

## 2026-10-21 — Correctif auth : interblocage et déconnexion unique
- **Ce qui a changé** : le rappel `onAuthStateChange` (`js/auth.js`) est devenu synchrone, le profil est chargé hors du verrou d'auth ; `deconnexion()` unique (bouton `data-action="deconnexion"` sur toutes les pages), qui renvoie sur `auth.html` avec le toast « Vous êtes déconnecté » ; bouton de déconnexion dans l'en-tête de `dashboard.html`, `admin.html` et `profil.html` ; les pages protégées renvoient vers la connexion quand la session se termine ; message « Profil indisponible » au lieu d'un rôle citoyen silencieux.
- **Pourquoi** : le rappel `async` attendait une requête Supabase sous le verrou d'auth. Au retour sur l'onglet ou au renouvellement du jeton, tout le client restait bloqué (connexion, données, déconnexion). Reproduit puis corrigé (docs/AUDIT.md §4.1).
- **Commit** : branche `refonte-ux-whatsapp`.
## 2026-10-21 — Bugs visuels et barre latérale
- **Ce qui a changé** : les cartes Leaflet et leurs légendes sont isolées (`isolation: isolate`) pour rester sous les tiroirs, feuilles et voiles ; photo de la page de connexion collante sur grand écran ; plus de défilement horizontal à 360 px (vue d'ensemble, paramètres, hackathon) ; cibles tactiles de 44 px ; contrastes corrigés ; menu utilisateur fermable avec Échap ; barre latérale agent et admin en lignes simples.
- **Pourquoi** : `--z-modal` (400) entrait en concurrence avec les panneaux Leaflet (400 à 1000), d'où la carte au-dessus du menu ouvert. Relevé par une revue visuelle de toutes les pages à 360, 768 et 1280 px, dans les deux thèmes.
- **Commit** : `797417b`, `6763720`.

## 2026-10-22 — Refonte des pages restantes (approche apple-design)
- **Ce qui a changé** :
  - Accueil : proposition de valeur en une phrase, « Signaler maintenant » et bouton WhatsApp (wa.me/221784277229), étapes Signaler → Vérifier → Curer.
  - Nouvelle page `404.html`.
  - Application : étape de récapitulatif avant envoi, brouillon local (sans la photo, 7 jours, par compte), frise de suivi construite seulement à partir des champs enregistrés, contrôles de carte en verre uniforme.
  - Profil : carte d'identité, badges obtenus et verrouillés, réglages en listes groupées, styles déplacés dans `css/profil.css`.
  - Service worker v7 (`404.html` et `profil.css` mis en cache).
- **Pourquoi** : point de contrôle 2 validé ; les pages restantes alignées sur l'espace agent. Commentaires sur un signalement, suppression de compte et adhésion WhatsApp reportés : il faut d'abord une table ou une fonction côté serveur.
- **Commit** : `440406e`, `2f537da`, `37c1f91`.
