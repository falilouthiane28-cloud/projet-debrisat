# DEBRISAT — Decisions log

Each entry precedes the change it allows (rule P5). Approved by the user at checkpoint 1 (2026-10-21) unless stated otherwise.

## D1 — Repo mapping of the master prompt
`styles/tokens.css` → `css/tokens.css`. `/dashboard` → the role home (`app.html` citoyen, `dashboard.html` agent_municipal, `admin.html` admin). `auth-guard.js` → `js/auth.js` (state) + `js/guard.js` (page access). Existing French identifiers are kept to avoid churn; new docs and commits are in English.

## D2 — WhatsApp on Meta Cloud API, inside Supabase
The official agent uses the WhatsApp Business Cloud API (rule W1) in a **new Supabase Edge Function** (`whatsapp-meta`), not a Vercel `/api` function, so the project keeps a single backend runtime and its existing DB access (P5). The Twilio function `webhook-whatsapp` stays live until the Meta number is verified, then is retired.

## D3 — Emoji only inside WhatsApp messages
The project rule "zero emoji" still applies to the site, SQL and code comments. Emoji are allowed **only in WhatsApp message strings**, where Bootstrap Icons cannot render.

## D4 — Owner delete (rule S4)
A citizen may delete their own report while its status is `en_attente`. Any later status requires an admin. Enforced by RLS, not by the client.

## D5 — Dev-only test tooling
Playwright, axe-core and Lighthouse live in `tests/` with their own `package.json` (dev dependencies only). The site stays build-free and loads nothing from `tests/`. Justification (S7): these tools have no zero-dependency equivalent for E2E, accessibility and performance checks.

## D6 — Auth state listener (fix for the AUDIT §4.1 deadlock)
The `onAuthStateChange` callback is synchronous: it updates the user immediately and loads the profile in a deferred task (`setTimeout(…, 0)`), outside the auth lock. No Supabase call is ever awaited inside the callback. `js/auth.js` stays the single owner of auth state and of logout.

## D7 — Logout lands on auth.html
Every logout goes through `deconnexion()` in `js/auth.js`: sign out, clear user-scoped local data, redirect to `auth.html`, toast "Vous êtes déconnecté" shown there. Previously two pages sent users to `index.html`.
