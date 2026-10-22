# DEBRISAT — To provide or do (user only)

Items the code cannot invent (rule P7). Tick each one when done.

## Meta / WhatsApp (see docs/WHATSAPP.md)
- [ ] Meta Business account and Meta app (type Business) with the WhatsApp product
- [ ] Number **+221 78 427 72 29** removed from the WhatsApp phone app, then added and verified in WhatsApp Manager
- [ ] Display name "DEBRISAT" approved
- [ ] `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_BUSINESS_ACCOUNT_ID` (WhatsApp Manager > API Setup)
- [ ] Permanent System User token `WHATSAPP_TOKEN` (permissions `whatsapp_business_messaging`, `whatsapp_business_management`)
- [ ] App secret `WHATSAPP_APP_SECRET`
- [ ] Choose a random `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_INTERNAL_SECRET` (e.g. `openssl rand -hex 32`)
- [ ] Webhook configured (callback URL, verify token, `messages` field subscribed)
- [ ] Templates `debrisat_statut_signalement` and `debrisat_alerte_equipe` submitted and **approved**, then their names set as secrets
- [ ] Team number for human handoff `TEAM_ALERT_NUMBER`
- [ ] Confirm the current Graph API version for `WHATSAPP_GRAPH_VERSION` (default v21.0)
- [ ] Database Webhook on `signalements` UPDATE created (docs/WHATSAPP.md section 4)

## Supabase
- [ ] Run migration `supabase/migrations/008_whatsapp_meta.sql` (`supabase db push` or SQL editor) — **not yet executed against the real project**
- [ ] Deploy the function: `supabase functions deploy whatsapp-meta --no-verify-jwt`, then set the secrets
- [ ] Authentication > URL Configuration: add to **Redirect URLs** the production domain, the Vercel preview domains (e.g. `https://*-team-dakar-house.vercel.app/**`) and `http://localhost:5501/**`, so Google sign-in returns to `auth.html` (docs/AUDIT.md §4.2)
- [ ] **Service-role key rotation**: `progress.md` records that the service-role key leaked once. Confirm it has been rotated (Project Settings > API > roll the key), then update the secret everywhere it is used
- [ ] Optional: `ANTHROPIC_API_KEY` for photo analysis and the bot's AI fallback

## Product decisions still open
- [ ] One manual login on the Vercel preview to confirm the original "stuck on auth.html" symptom is gone (docs/AUDIT.md §4.2)
- [ ] Production deployment approval (rule P4: preview only until then)
