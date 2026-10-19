// Edge Function: Analyse IA des images
// Utilise Claude Vision API pour analyser les photos de signalements

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

serve(async (req) => {
  try {
    const { signalement_id, photo_url } = await req.json()

    if (!signalement_id || !photo_url) {
      return new Response(JSON.stringify({ error: 'Parametres manquants' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let analyse = null

    if (ANTHROPIC_API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', url: photo_url }
              },
              {
                type: 'text',
                text: `Analyse cette photo prise a Dakar, Senegal. Identifie :
1) Type de dechet/obstruction (dechets solides, sable, gravats, plastiques, pneus, encombrants, eau stagnante, canal bouche)
2) Severite estimee (1-5, ou 1=mineur et 5=critique)
3) Proximite avec une infrastructure de drainage
4) Volume estime
5) Risque d'inondation si non traite

Reponds en JSON avec les champs: type_detecte, severite_suggeree, proximite_drainage, volume_estime, risque_inondation, description_ia`
              }
            ]
          }]
        })
      })

      if (response.ok) {
        const result = await response.json()
        const texte = result.content[0]?.text || ''
        try {
          const jsonMatch = texte.match(/\{[\s\S]*\}/)
          if (jsonMatch) analyse = JSON.parse(jsonMatch[0])
        } catch {
          analyse = { description_ia: texte, severite_suggeree: 3 }
        }
      }
    }

    if (!analyse) {
      analyse = {
        type_detecte: 'non_analyse',
        severite_suggeree: 3,
        description_ia: 'Analyse automatique non disponible',
        proximite_drainage: 'inconnue',
        volume_estime: 'inconnu',
        risque_inondation: 'a_evaluer'
      }
    }

    await supabase
      .from('signalements')
      .update({ photo_analyse: analyse })
      .eq('id', signalement_id)

    return new Response(JSON.stringify({ analyse }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Erreur analyse image:', error)
    return new Response(JSON.stringify({ error: 'Erreur interne' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
