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
- **Fonds de carte** : OpenStreetMap (sans clé), filtre CSS `invert+hue-rotate` pour le mode sombre. **CARTO et Esri Canvas exigent désormais des clés : ne pas les utiliser.**
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
index.html, app.html, dashboard.html (agents), admin.html (admin, même js/dashboard.js), auth.html, profil.html, hackathon.html
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
- Rôles en vigueur (migration 005) : `citoyen`, `agent_municipal`, `admin`. Le rôle « autorite » de la 004 n'existe plus.
- Ne jamais `await` un appel Supabase dans un rappel `onAuthStateChange` : le rappel s'exécute sous le verrou d'auth et bloque tout le client (voir docs/AUDIT.md).

---

# Rules for the `refonte-ux-whatsapp` workstream (master prompt §2)

Keywords: **MUST** = mandatory, **NEVER** = forbidden. If a rule blocks you, stop and ask the user instead of bending it. Every rule has a **Check** that must pass before a task counts as done.

**Adaptations to this repo** (decided in `docs/DECISIONS.md`): `styles/tokens.css` means `css/tokens.css`; `/dashboard` means the role's home page (`app.html` for citoyen, `dashboard.html` for agent_municipal, `admin.html` for admin); `auth-guard.js` means `js/auth.js` + `js/guard.js`. Existing code keeps its French identifiers (rule 2 above). New docs, commits and new code comments are in English. All UI and WhatsApp copy stays in French.

## Process
| ID | Rule | Check |
|---|---|---|
| P1 | MUST produce `docs/AUDIT.md` before modifying any source file. | Committed before any page/source change. |
| P2 | Work on branch `refonte-ux-whatsapp`. NEVER commit to `main`. NEVER force-push. | `git branch --show-current`. |
| P3 | Atomic Conventional Commits (`fix(auth):`, `feat(ui):`, `feat(whatsapp):`, `test:`, `docs:`). | `git log --oneline`. |
| P4 | NEVER deploy to production. Vercel preview only. | No `vercel --prod`. |
| P5 | Keep the stack (vanilla JS, Supabase, no build). Any change justified in `docs/DECISIONS.md` first and approved by the user. | DECISIONS entry precedes change. |
| P6 | NEVER delete a feature without a working replacement. | AUDIT feature inventory still satisfied. |
| P7 | NEVER invent facts (credentials, schema, Meta IDs). Missing info goes to `docs/TO_PROVIDE.md`; continue with a labeled mock. | No hard-coded fake IDs. |
| P8 | Re-read the relevant rules before marking a task done. | — |

## Security
| ID | Rule | Check |
|---|---|---|
| S1 | NEVER commit secrets. Env vars + documented `.env.example`. | `git grep -nE "(EAA[A-Za-z0-9]{20,}\|sk-ant-\|service_role\|AIza[0-9A-Za-z_-]{30,})"` empty. |
| S2 | WhatsApp webhook verifies `X-Hub-Signature-256` (HMAC-SHA256, `WHATSAPP_APP_SECRET`, timing-safe); invalid → 401. | Bad-signature test → 401. |
| S3 | Validate all input server-side; escape on render. NEVER `innerHTML` with user data unescaped. | `innerHTML` review. |
| S4 | Users edit/delete only their own reports; admin actions need admin role. | User B cannot modify A's report. |
| S5 | Rate-limit login, report creation and webhook. | Burst → 429. |
| S6 | No phone/email/token in clear in logs. Mask phones as `2217842****`. | Log review. |
| S7 | No new dependency without a one-line justification in DECISIONS.md. | Diff review. |

## Auth & navigation
| ID | Rule | Check |
|---|---|---|
| A1 | After login (email or Google) land on the role home, or the same-origin `?retour=` target, within 2 s. | E2E. |
| A2 | Logged-in user on `auth.html` is redirected to the role home. | E2E. |
| A3 | Logged-out user on a protected page → `auth.html?retour=<path>`. | E2E. |
| A4 | Auth state lives in ONE shared module; NEVER duplicate per page. | Single auth-state listener. |
| A5 | Every authenticated screen shows a visible "Se déconnecter" (avatar menu on desktop, ≤ 2 taps on mobile). | E2E at 360 and 1280 px. |
| A6 | Logout clears session and cached user data, redirects to `auth.html`, toast "Vous êtes déconnecté". | E2E. |
| A7 | Secondary pages have "Retour" or breadcrumb. Modals close via close button, "Annuler" and Esc. No dead ends. | E2E + screenshots. |
| A8 | Submit buttons show loading and are disabled in flight. | Double-click → 1 request. |
| A9 | Human, specific French errors. NEVER raw provider errors. | Wrong password / unknown email tests. |

## UI/UX
| ID | Rule | Check |
|---|---|---|
| U1 | Colors, font sizes, spacing, radii, shadows come from `css/tokens.css`. | No hex outside tokens.css. |
| U2 | Mobile-first, no horizontal scroll at 360/768/1280/1920. | Screenshots at 4 widths. |
| U3 | WCAG 2.1 AA (contrast 4.5:1, focus rings, labels, alt, keyboard). | axe: 0 serious/critical. |
| U4 | Loading (skeleton), empty and error states for every data view. | Screenshots. |
| U5 | Feedback for every user action. | Review. |
| U6 | Light and dark themes both work; choice persists. | Screenshots both themes. |
| U7 | Lighthouse mobile ≥ 90 (Perf, A11y, BP, SEO) on `/`, `auth.html`, role home. | Report in `docs/`. |
| U8 | Zero console errors, zero failed requests. | Playwright console listener. |
| U9 | Correct French, consistent warm civic voice. | Proofread. |

## WhatsApp agent
| ID | Rule | Check |
|---|---|---|
| W1 | Official WhatsApp Business Cloud API (Meta) only. NEVER unofficial libraries. | Code review. |
| W2 | Webhook answers 200 in < 5 s; heavy work async. | Timing test. |
| W3 | Idempotent: store processed `message.id`, skip duplicates. | Same payload twice → 1 reply. |
| W4 | Conversation state in DB, 30-min expiry. | Resume / expiry tests. |
| W5 | Outside the 24 h window, approved templates only. | Code review. |
| W6 | "STOP" unsubscribes immediately; "START" re-subscribes. | Test. |
| W7 | French replies, ≤ 5 lines, interactive buttons/lists when choices exist. | Builder review. |
| W8 | Never promise dates, give legal/medical advice or answer off-topic; redirect to menu. | AI prompt + tests. |
| W9 | Understand basic Wolof greetings/intents ("Salam", "Nanga def", "Jërëjëf"); reply in simple French. | Test. |

## Definition of Done
Committed, tested in a real browser or against a simulated webhook, all applicable Checks pass, no regressions, documented, and QA sign-off in `docs/FINAL_REPORT.md`.
