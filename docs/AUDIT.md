# DEBRISAT — Audit (A1)

Branch `refonte-ux-whatsapp`, 2026-10-21. Read-only audit, produced before any source change (rule P1).

## 1. Stack (as found)

| Layer | Reality |
|---|---|
| Frontend | Static HTML + vanilla ES modules, no build, no `package.json`. CDN libs pinned (Leaflet 1.9.4, supabase-js 2.58.0 → auth-js 2.72.0, Chart.js 4.4.1, Bootstrap Icons 1.11.3). |
| Backend | Supabase project `bezkifetuusykmmwwiad` (Postgres + PostGIS, Auth, Storage, Realtime, Edge Functions in Deno). |
| Hosting | Vercel, static. `vercel.json`: `cleanUrls:false`, no rewrites, `no-cache` on `/sw.js`, `/js/*`, `/css/*`. **No `/api` folder.** |
| Service worker | `sw.js` `debrisat-v6`. Same-origin requests are network-first (`sw.js:89`), CDN and tiles cache-first. Stale JS after deploy is **not** a risk. |
| Tests / CI | None. |

Paths in the master prompt that do not exist here: `styles/tokens.css` (it is `css/tokens.css`), `/dashboard` (role homes are `app.html`, `dashboard.html`, `admin.html`), `api/whatsapp/` (server code lives in `supabase/functions/`).

## 2. Pages

| Page | JS | Access | Logout | Way back |
|---|---|---|---|---|
| `index.html` | `page-accueil.js` | public | n/a | n/a |
| `auth.html` | `page-auth.js` | public | n/a | logo only, no explicit "Retour" |
| `app.html` | `page-app.js` | public browsing, actions require login | avatar menu → `auth.html` (`page-app.js:623`) | top-level |
| `dashboard.html` | `dashboard.js` | `agent_municipal`, `admin` | **only inside "Paramètres"** (`dashboard.html:321`), goes to `index.html` (`dashboard.js:901`) | sidebar link to app |
| `admin.html` | `dashboard.js` (`ESPACE='admin'`) | `admin` | **only inside "Paramètres"** (`admin.html:407`) | sidebar links |
| `profil.html` | `page-profil.js` | logged in | button, goes to `index.html` (`page-profil.js:189`) | "Retour" to app |
| `hackathon.html` | `page-hackathon.js` | public | n/a | logo + "Prototype" link |
| 404 | — | — | — | **missing** |

Rule gaps: A5 fails on `dashboard.html` and `admin.html` (logout not in the header); A6 fails everywhere (no page lands on `auth.html` with the toast "Vous êtes déconnecté"; two go to `index.html`); A7 needs a pass on modals and `auth.html`.

## 3. Feature inventory (rule P6: must still work at the end)

- **Landing**: hero with live counter, 3 steps, live map preview, animated key figures, technologies, footer, legal notice.
- **Auth**: email login/signup, Google OAuth, password reset + new password (`#nouveau-mot-de-passe`), agent access code at signup and from profile, demo access, `?retour=` whitelist, disabled-account handling, inline validation, password strength meter.
- **App**: full-screen map (clusters, heatmap, risk zones, Sentinel-2, geolocation), filters (type, severity, status, commune, period), sortable list, leaderboard + podium, report detail (photo, AI analysis, confirm/dispute, share link), authority alerts, local + Nominatim search, 4-step report wizard, offline queue (IndexedDB), points/badges, realtime alerts within 1 km, user menu.
- **Dashboard (agent)**: KPIs with trends, DPGI priorities, sortable table (bulk actions, assignment), admin map with status edit, team, risk zones, alerts (create + history), statistics (Chart.js), CSV export, settings.
- **Admin**: dashboard features plus Satellite (Copernicus, OneAtlas), WhatsApp, users, access codes, site config (maintenance), audit journal.
- **Profile**: points, rank, next badge, badges, history, edit, theme, language, notifications, PWA install, access-code activation.
- **PWA**: manifest, service worker, install prompt, offline banner.

## 4. Auth bug — root cause (evidence-based)

### 4.1 Confirmed defect: auth-lock deadlock in the shared listener

`js/auth.js:21`:
```js
supabase.auth.onAuthStateChange(async (_evenement, nouvelleSession) => {
    await definirSession(nouvelleSession);   // -> obtenirProfil() -> supabase.from('profils')...
    notifier();
});
```
auth-js 2.72.0 awaits subscriber callbacks **while holding its internal lock** in three places: `_recoverAndRefresh()` (tab becomes visible again, `GoTrueClient.js:2138` → `:1819`), token refresh (`_callRefreshToken`, auto-refresh ticker), and session recovery at load. Our callback then awaits a PostgREST query, which calls `getSession()` → `_acquireLock()`. That call queues behind the lock holder, which is itself waiting on our callback. **Deadlock: every later Supabase call in that tab never resolves** (login, profile, data, `signOut`).

Reproduction (local, `http://localhost:5501`, isolated client with its own storage key and a fake local session, no credentials, no real user touched), simulating a tab refocus:

| Listener | Result |
|---|---|
| `async` + `await supabase…` (current `auth.js:21` pattern) | `getSession STILL PENDING after 6000 ms (deadlock)`; callback log stops at `cb:SIGNED_IN` |
| synchronous, query deferred with `setTimeout(…, 0)` | `getSession resolved in 1 ms`; `cb-done:SIGNED_IN` logged |

Supabase documents this: do not `await` Supabase calls inside `onAuthStateChange`; defer them.

Same hazard at `js/auth.js:48` (`await supabase.auth.signOut()` inside `definirSession`, reachable from the listener for disabled accounts).

User-visible effect: after any tab switch or token refresh (very common on mobile: camera, WhatsApp, password manager, Google account chooser), the page silently freezes. The login button keeps spinning or nothing happens, the UI never reflects the logged-in state, and logout does nothing.

### 4.2 Other suspects checked

| Suspect | Finding |
|---|---|
| Missing redirect after `signIn` | Present: `page-auth.js:148` `location.replace(destinationRetour())`. OK. |
| Listener registered too late | Registered after `getSession()`. Fine for the first paint, but there is **no single owner**: `page-auth.js:225` redirects only once at load, and every page re-implements its own reaction (A4). |
| Session persistence | `persistSession: true, autoRefreshToken: true` (`config.js:13`). OK. |
| Missing `await` / silent `catch` | `definirSession` swallows profile errors (`auth.js:40`) → `profil = null` → user is sent to `app.html` even if they are an agent. No user feedback. |
| Google OAuth redirect URLs | `redirectTo = <origin>/auth.html`. Cannot be verified from the repo; **the Supabase dashboard "Redirect URLs" must contain the Vercel domain and localhost** (→ TO_PROVIDE). If missing, Supabase sends the user to the Site URL instead. |
| Race between page scripts | `page-auth.js` registers a second `onAuthStateChange` (`auth.js:169`, recovery). Synchronous, harmless, but it is a second listener (A4). |
| Stale JS via service worker | Ruled out (network-first for same-origin). |

**Not yet reproduced end to end**: the exact "stuck on `auth.html` right after a successful email login". I did not log in with a real account. The policy forbids me from typing credentials that are sent to the production Supabase. The deadlock is the only defect found that freezes the auth UI. Confirming the exact symptom needs one manual login by the user on `localhost:5501` while I read the console and network.

### 4.3 Fix plan (A2)
1. Make the `auth.js` listener synchronous: update `utilisateur` immediately, then load the profile in a `setTimeout(…, 0)` task and notify subscribers when it resolves. Move the disabled-account `signOut` out of the lock in the same way.
2. One auth module owns redirects: `auth.html` reacts to `SIGNED_IN` (not only at load), protected pages react to `SIGNED_OUT`.
3. Single `deconnexion()` that signs out, clears cached user data (local/session storage keys, IndexedDB queue owner), redirects to `auth.html` and shows "Vous êtes déconnecté".
4. Logout in the header avatar menu of `dashboard.html`, `admin.html`, `profil.html` (A5).
5. Surface profile-load failure with a human message instead of silently downgrading the role.

## 5. Database

Migrations: `001` schema · `002` security · `003` performance/RLS · `004` two roles · `005` three roles + access codes + journal + `config_site` · `006` revoke `lire_config` · `007` journal reads the JWT role.

- **Roles in force: `citoyen`, `agent_municipal`, `admin`** (`005_roles_admin.sql:14`; `autorite` migrated to `agent_municipal`). `projet.md`, `progress.md` and the old CLAUDE.md still say "autorite": stale.
- `signalements` RLS: update by owner, admin, or agent of the same commune (`005:559-564`), column protection by trigger. **Delete is admin-only** (`005:565`); S4 asks for owner delete → decision needed.
- WhatsApp: `sessions_whatsapp` keyed by phone (`001:141`). No processed-message table (W3), no opt-in/opt-out column (W6).

## 6. WhatsApp today

`supabase/functions/webhook-whatsapp`: **Twilio** (TwiML replies), Twilio HMAC-SHA1 signature with constant-time compare, invalid → **403**, DB state with 30-minute expiry, no idempotency, no STOP/START, no interactive buttons (Twilio text). Conflicts with W1 (Meta Cloud API only), S2 (401, `X-Hub-Signature-256`), W3, W6, W7.

Env vars read by edge functions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORIGINE_AUTORISEE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMERO_SMS`, `TWILIO_NUMERO_WHATSAPP`, `TWILIO_WEBHOOK_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_MODELE`, `ROBOFLOW_API_KEY`, `ROBOFLOW_MODELE`, `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`, `ONEATLAS_API_KEY`.

## 7. Security and quality baseline

- S1 secret scan: no secret values in the repo. `js/config.js` holds the public URL and anon key (public by design). `progress.md:116` records that the service-role key leaked once: **rotation status unknown**. No `.env.example`.
- S3: 83 `innerHTML` lines in `js/`, 73 without `echapper()` on the same line. Most build markup from already-escaped values, but each needs a review.
- U1: 111 hex colors outside `css/tokens.css` (`landing.css` 26, `dashboard.css` 14, `responsive.css` 8, `components.css` 5, `app.css` 5, `hackathon.css` 4, JS 8).
- S5: login is rate-limited by Supabase Auth; no limit on report creation or the webhook.
- Docs drift: CLAUDE.md said Esri needs keys while `memory.md` uses Esri keyless; `projet.md` lists supabase-js 2.39.3 (real: 2.58.0); CLAUDE.md omitted `admin.html` (fixed).

## 8. Decisions needed from the user (checkpoint 1)

1. **WhatsApp backend**: the existing bot is Twilio in a Supabase Edge Function. W1 requires Meta Cloud API, and the prompt places it at Vercel `/api/whatsapp/webhook`. A Vercel function would add a second backend runtime (P5). Recommendation: **Meta Cloud API in a new Supabase Edge Function** (`whatsapp-meta`), keeping one backend and the existing DB access; keep the Twilio function until Meta is live.
2. **Emoji in the WhatsApp menu**: the project rule is "zero emoji anywhere". The prompt's menu uses emoji. Recommendation: allow emoji **only inside WhatsApp message strings**, nowhere in the site.
3. **Owner delete (S4)**: allow a citizen to delete their own report only while it is still `en_attente`? Today only admins can delete.
4. **Service-role key**: has it been rotated since the leak noted in `progress.md`?
5. **Test tooling**: Playwright, axe-core and Lighthouse need Node. Proposal: a dev-only `package.json` in `tests/`, with the site staying build-free.
6. **Reproduction**: one manual login by you on `localhost:5501` while I watch the console, to confirm the exact "stuck on auth" symptom.
