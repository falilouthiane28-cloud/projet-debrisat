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

## D8 — Webhook throttling answers 200, not 429 (rule S5)
Meta retries any non-2xx delivery and can disable a webhook that fails too often. Per-sender throttling (more than 15 messages in 60 s) therefore skips processing and answers **200**; the sender gets one "patientez une minute" message. Invalid signatures still get **401** (S2). Approved scope: A4, 2026-10-22.

## D9 — WhatsApp notifications need a double opt-in
A status notification is sent only if the profile enabled `notifications_whatsapp` **and** that phone number has written to the bot and not replied STOP (`whatsapp_contacts.abonne`). Typing someone else's number in a profile is not enough to message them.

## D10 — Tracking number
`signalements.numero_suivi` (identity column) gives a readable code `DBS-<year>-<number padded to 5>`, year taken from `created_at` in Africa/Dakar time.

## D11 — QR code generated at development time
The WhatsApp QR code is a static SVG in `img/`, generated once with the `qrcode` npm package via `npx` (dev-time only). The site loads no QR library (S7: zero runtime dependency).

## D12 — Bot logic testable without Deno
Pure logic lives in `supabase/functions/whatsapp-meta/logique.ts` and `meta.ts` (Web APIs only, dependencies injected) and is tested with `node --test` (Node 24 strips TypeScript types natively). `index.ts` only wires Deno, Supabase and the environment.

## D13 — Login lands on the role home; OAuth failures are shown
After login, citoyen goes to `app.html`, agent_municipal to `dashboard.html`, admin to `admin.html`. A `?retour=` target is kept only when it is a deep link (hash or query, e.g. `app.html#signaler`) or a specific page (profile, dashboard); generic entries (`index.html`, `app.html`, `auth.html`) give way to the role home. Errors Supabase returns in the URL after Google sign-in are now displayed in French instead of failing silently. Agents signing up with Google are taken to their profile to enter the access code.
