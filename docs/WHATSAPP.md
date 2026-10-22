# DEBRISAT — Official WhatsApp agent ("DEBRISAT Assistant")

Number: **+221 78 427 72 29** (API format `221784277229`). Public link: `https://wa.me/221784277229?text=Bonjour%20DEBRISAT`.

## 1. Architecture

```
Citizen (WhatsApp) ──> Meta WhatsApp Business Cloud API ──> Supabase Edge Function `whatsapp-meta`
                                                                │  verify X-Hub-Signature-256 (401 if invalid)
                                                                │  answer 200 at once, process in EdgeRuntime.waitUntil
                                                                ├─> Postgres: sessions_whatsapp, whatsapp_messages_traites,
                                                                │            whatsapp_contacts, signalements, profils
                                                                ├─> Storage bucket `photos` (citizen photo)
                                                                └─> Meta Graph API /messages (replies, templates)
Supabase Database Webhook (signalements UPDATE) ──> whatsapp-meta?evenement=statut (header x-debrisat-secret)
```

- Official Cloud API only (rule W1, decision D2). No unofficial library.
- The legacy **Twilio** bot (`webhook-whatsapp`) stays deployed until the Meta number is verified and live, then is retired (section 9).
- Code: `supabase/functions/whatsapp-meta/` — `index.ts` (Deno wiring, Supabase, env), `logique.ts` (pure conversation logic), `meta.ts` (Graph API client), `ia.ts` (optional Claude fallback). Database: migration `supabase/migrations/008_whatsapp_meta.sql`.

## 2. Meta setup (one time)

1. **Meta Business account**: create or reuse one at business.facebook.com (business verification may be requested for higher limits).
2. **Meta app**: developers.facebook.com > My apps > Create app > type *Business* > add the **WhatsApp** product and link it to the Business account.
3. **Add and verify the number** +221 78 427 72 29 in WhatsApp Manager > Phone numbers (SMS or voice code). Set the display name "DEBRISAT" (Meta reviews it).
   > **Warning:** a number registered on the Cloud API **cannot be active in the regular WhatsApp or WhatsApp Business app at the same time**. Back up and delete the account on the phone app first, or the registration fails. This cannot be undone quickly.
4. **Permanent token**: Business Settings > Users > System users > add a system user (Admin) > assign the app and the WhatsApp account > *Generate new token* with permissions `whatsapp_business_messaging` and `whatsapp_business_management`, expiry *Never*. This is `WHATSAPP_TOKEN`. The temporary 24 h token from the API Setup page is for testing only.
5. **IDs**: WhatsApp Manager > API Setup gives the **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`) and the **WhatsApp Business Account ID** (`WHATSAPP_BUSINESS_ACCOUNT_ID`).
6. **App secret**: App Dashboard > App settings > Basic > App secret (`WHATSAPP_APP_SECRET`). It signs every webhook call.
7. **Webhook**: App Dashboard > WhatsApp > Configuration > Webhook:
   - Callback URL: `https://<project-ref>.supabase.co/functions/v1/whatsapp-meta`
   - Verify token: the random string you chose for `WHATSAPP_VERIFY_TOKEN`
   - Click *Verify and save* (the function answers the `hub.challenge` only if the token matches, otherwise 403).
   - Under *Webhook fields*, **subscribe to `messages`**.
8. **Graph API version**: the function uses `WHATSAPP_GRAPH_VERSION` (default `v21.0`). Check Meta's current version in the changelog and set it explicitly.

## 3. Deploy

```bash
# 1. Database (or paste supabase/migrations/008_whatsapp_meta.sql in the SQL editor)
supabase db push

# 2. Secrets (see .env.example for every variable)
supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_BUSINESS_ACCOUNT_ID=... \
  WHATSAPP_VERIFY_TOKEN=... WHATSAPP_APP_SECRET=... WHATSAPP_INTERNAL_SECRET=... \
  WHATSAPP_GRAPH_VERSION=v21.0 TEAM_ALERT_NUMBER=2217XXXXXXXX

# 3. Function (Meta does not send a Supabase JWT; the signature replaces it)
supabase functions deploy whatsapp-meta --no-verify-jwt
```

After the templates are approved (section 5): `supabase secrets set WHATSAPP_TEMPLATE_STATUT=debrisat_statut_signalement WHATSAPP_TEMPLATE_EQUIPE=debrisat_alerte_equipe`.

Optional: `ANTHROPIC_API_KEY` (and `CLAUDE_MODELE`) enable the AI fallback for free text.

## 4. Status notifications (Database Webhook)

Supabase Dashboard > Database > Webhooks > *Create a new hook*:

| Field | Value |
|---|---|
| Table | `public.signalements` |
| Events | `UPDATE` |
| Type | HTTP Request, `POST` |
| URL | `https://<project-ref>.supabase.co/functions/v1/whatsapp-meta?evenement=statut` |
| HTTP header | `x-debrisat-secret: <WHATSAPP_INTERNAL_SECRET>` |

The function ignores updates where `statut` did not change. A message is sent only when the report's author enabled "Recevoir le suivi de mes signalements sur WhatsApp" in their profile **and** that phone number has written to the bot and not replied STOP (double opt-in, decision D9). Inside the 24 h customer-service window it sends a normal message; outside it, only the approved template (rule W5); without `WHATSAPP_TEMPLATE_STATUT` it logs and skips.

## 5. Message templates to submit (WhatsApp Manager > Message templates)

Category **UTILITY**, language **French (fr)**.

**`debrisat_statut_signalement`** — body:

> Bonjour, votre signalement {{1}} a changé de statut : {{2}}. Merci de contribuer à prévenir les inondations à Dakar. Répondez STOP pour ne plus recevoir ces messages.

Sample values: `{{1}}` = `DBS-2026-00123`, `{{2}}` = `Intervention en cours`.

**`debrisat_alerte_equipe`** — body:

> Une personne demande à parler à un membre de l'équipe Debrisat sur WhatsApp. Numéro à recontacter : {{1}}.

Sample value: `{{1}}` = `+221 77 000 00 00`.

## 6. Conversation

Main menu (interactive list), shown on a greeting, "menu", or any unknown text:

| Row | What happens |
|---|---|
| Signaler | Report flow below |
| Suivre | Send a code `DBS-2026-00123` (or just the number) → current status, date, commune |
| Près de moi | Share a location → the 5 closest open reports within 5 km, with code, type, distance |
| Comment ça marche | Short explanation: Signaler, Vérifier, Curer |
| Parler à un humain | Team alerted on `TEAM_ALERT_NUMBER` (template if configured, plain message otherwise); citizen gets a holding message |

Report flow (state stored in `sessions_whatsapp`, expires after 30 min of silence):

`IDLE → attente_photo → attente_localisation → attente_type → attente_description → confirmation → saved`

- A photo sent at any time starts a new report and skips to the location step.
- Type: interactive list of the 9 obstruction types (a number 1–9 also works).
- Description: free text (500 characters max) or the "Passer" button.
- Confirmation: summary + "Confirmer" / "Annuler". On confirm the report is saved (source `whatsapp`, linked to a site account when the phone number matches a profile), the photo analysis is started, and the citizen receives the code `DBS-<year>-<number>` (decision D10).
- "annuler" (or the Annuler button) at any step returns to IDLE.
- STOP / ARRET unsubscribe at once; START re-subscribes (rule W6).
- Wolof greetings and thanks ("Salam", "Nanga def", "Jamm", "Jërëjëf") are understood; replies stay in simple French (rule W9).

## 7. Rules summary (W1–W9)

| ID | How it is met |
|---|---|
| W1 | Graph API calls only (`meta.ts`), no unofficial library |
| W2 | 200 returned before processing; work runs in `EdgeRuntime.waitUntil` |
| W3 | `message.id` inserted in `whatsapp_messages_traites` first; a duplicate is skipped |
| W4 | `sessions_whatsapp` with 30-minute expiry; an expired flow restarts with a short notice |
| W5 | Outside 24 h (`whatsapp_contacts.dernier_message_le`), templates only |
| W6 | STOP / START update `whatsapp_contacts.abonne` immediately |
| W7 | Every reply is French, at most 5 lines, with buttons (≤ 3) or a list when there is a choice |
| W8 | The menu and the AI fallback never promise a date, give legal or medical advice, or answer off-topic |
| W9 | Wolof greeting and thanks intents mapped to the French menu |

Security: invalid `X-Hub-Signature-256` → 401 (S2); per-sender throttle above 15 messages per minute answers 200 and skips (D8); phone numbers are masked in logs as `2217842****` (S6); secrets only in Supabase secrets (S1).

## 8. Local tests

```bash
node --test supabase/functions/whatsapp-meta/
```

Node 24 runs the TypeScript tests directly (decision D12). They cover GET verification, valid and invalid signatures, duplicate messages, the full report flow, STOP / START, Wolof greetings, cancel, session expiry, tracking codes, phone masking, throttling and the size limits of every message.

Manual signed request (bash), useful to test a deployed function:

```bash
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET" | sed 's/^.* //')
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/whatsapp-meta" \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=$SIG" --data "$BODY"
```

## 9. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Every POST gets **401** | `WHATSAPP_APP_SECRET` wrong, or the body was modified before hashing (proxy). Use the app secret of the app that owns the webhook. |
| "Verify and save" fails in Meta | `WHATSAPP_VERIFY_TOKEN` differs from the one typed in Meta, or the function was deployed with JWT verification (redeploy with `--no-verify-jwt`). |
| Bot never answers | Webhook not subscribed to `messages`; token expired (use a System User token); `WHATSAPP_PHONE_NUMBER_ID` wrong; check `supabase functions logs whatsapp-meta`. |
| Error 131047 / message not delivered | Outside the 24 h window: only an approved template can be sent. Check `WHATSAPP_TEMPLATE_STATUT`. |
| Template rejected or "does not exist" | Not approved yet, wrong name, or wrong language code (`fr`). |
| Number registration fails | The number is still active in the WhatsApp phone app (section 2, step 3). |

## 10. Retiring Twilio

When the Meta number answers correctly for a few days:
1. Remove the webhook URL in the Twilio console (WhatsApp sender).
2. `supabase functions delete webhook-whatsapp` and remove its block from `supabase/config.toml`.
3. Unset `TWILIO_NUMERO_WHATSAPP` and `TWILIO_WEBHOOK_URL`. Keep `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_NUMERO_SMS` only if SMS alerts (`envoyer-alerte`) are still used.
4. In migration terms nothing changes: the `attente_localisation` and `attente_type` steps are shared by both bots.
