// Edge Function: Webhook WhatsApp (Twilio)
// Gere les signalements via WhatsApp

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!

interface SessionUtilisateur {
  etape: 'photo' | 'localisation' | 'type' | 'confirmation'
  photoUrl?: string
  lat?: number
  lng?: number
  type?: string
}

const sessions: Map<string, SessionUtilisateur> = new Map()

const TYPES_MENU = `Quel type d'obstruction ?
1. Dechets solides
2. Tas de sable
3. Gravats
4. Plastiques
5. Pneus
6. Encombrants
7. Eau stagnante
8. Canal bouche
9. Autre`

const TYPE_MAP: Record<string, string> = {
  '1': 'dechets_solides', '2': 'tas_sable', '3': 'gravats',
  '4': 'plastiques', '5': 'pneus', '6': 'encombrants',
  '7': 'eau_stagnante', '8': 'canal_bouche', '9': 'autre'
}

serve(async (req) => {
  try {
    const formData = await req.formData()
    const from = formData.get('From') as string
    const body = (formData.get('Body') as string || '').trim()
    const mediaUrl = formData.get('MediaUrl0') as string | null
    const latitude = formData.get('Latitude') as string | null
    const longitude = formData.get('Longitude') as string | null

    let session = sessions.get(from)
    let reponse = ''

    if (!session) {
      if (mediaUrl) {
        // Telecharger et stocker la photo
        const photoResponse = await fetch(mediaUrl)
        const photoBlob = await photoResponse.blob()
        const nomFichier = `whatsapp/${Date.now()}_${from.replace(/[^0-9]/g, '')}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(nomFichier, photoBlob, { contentType: 'image/jpeg' })

        if (uploadError) {
          reponse = 'Erreur lors du telechargement de la photo. Veuillez reessayer.'
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('photos')
            .getPublicUrl(nomFichier)

          sessions.set(from, { etape: 'localisation', photoUrl: publicUrl })
          reponse = 'Photo recue ! Maintenant, partagez votre localisation (bouton 📎 > Localisation dans WhatsApp).'
        }
      } else {
        reponse = `Bienvenue sur Debrisat ! Pour signaler une obstruction de canal, envoyez une photo.`
      }
    } else if (session.etape === 'localisation') {
      if (latitude && longitude) {
        session.lat = parseFloat(latitude)
        session.lng = parseFloat(longitude)
        session.etape = 'type'
        reponse = `Localisation recue ! ${TYPES_MENU}\n\nRepondez avec le numero.`
      } else {
        reponse = 'Veuillez partager votre localisation GPS (bouton 📎 > Localisation).'
      }
    } else if (session.etape === 'type') {
      const typeChoisi = TYPE_MAP[body]
      if (typeChoisi) {
        session.type = typeChoisi
        session.etape = 'confirmation'

        // Creer le signalement
        const { data, error } = await supabase.from('signalements').insert({
          type_obstruction: typeChoisi,
          severite: 3,
          photo_url: session.photoUrl!,
          localisation: `POINT(${session.lng} ${session.lat})`,
          source: 'whatsapp',
          statut: 'en_attente'
        }).select().single()

        if (error) {
          reponse = 'Erreur lors de la creation du signalement. Veuillez reessayer.'
        } else {
          reponse = `Signalement enregistre avec succes ! Merci pour votre contribution a la prevention des inondations. Vous avez gagne +10 points ! Pour un nouveau signalement, envoyez une photo.`
        }
        sessions.delete(from)
      } else {
        reponse = `Numero invalide. ${TYPES_MENU}`
      }
    }

    // Repondre via Twilio TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${reponse}</Message>
</Response>`

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    })

  } catch (error) {
    console.error('Erreur webhook WhatsApp:', error)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Erreur interne. Veuillez reessayer.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }
})
