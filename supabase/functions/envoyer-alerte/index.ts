// Edge Function: Envoi d'alertes (SMS/WhatsApp via Twilio)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER')!

async function envoyerSMS(destinataire: string, message: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      From: TWILIO_PHONE,
      To: destinataire,
      Body: message
    })
  })
}

async function envoyerWhatsApp(destinataire: string, message: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      From: `whatsapp:${TWILIO_PHONE}`,
      To: `whatsapp:${destinataire}`,
      Body: message
    })
  })
}

serve(async (req) => {
  try {
    const { alerte_id } = await req.json()

    const { data: alerte } = await supabase
      .from('alertes')
      .select('*')
      .eq('id', alerte_id)
      .single()

    if (!alerte) {
      return new Response(JSON.stringify({ error: 'Alerte introuvable' }), { status: 404 })
    }

    const { data: profils } = await supabase
      .from('profils')
      .select('telephone')
      .not('telephone', 'is', null)

    const message = `DEBRISAT ALERTE\n${alerte.titre}\n${alerte.message}`
    let envoyes = 0

    if (profils) {
      for (const profil of profils) {
        if (!profil.telephone) continue
        try {
          if (alerte.canal === 'sms' || alerte.canal === 'tous') {
            await envoyerSMS(profil.telephone, message)
            envoyes++
          }
          if (alerte.canal === 'whatsapp' || alerte.canal === 'tous') {
            await envoyerWhatsApp(profil.telephone, message)
            envoyes++
          }
        } catch (e) {
          console.error(`Erreur envoi a ${profil.telephone}:`, e)
        }
      }
    }

    await supabase
      .from('alertes')
      .update({ envoyee: true })
      .eq('id', alerte_id)

    return new Response(JSON.stringify({ envoyes }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Erreur envoi alerte' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
