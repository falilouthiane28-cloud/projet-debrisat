// Edge Function: Calcul du score de risque par zone

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  try {
    const { data: zones } = await supabase.from('zones_risque').select('*')
    if (!zones) return new Response(JSON.stringify({ message: 'Aucune zone' }))

    for (const zone of zones) {
      const { count } = await supabase
        .from('signalements')
        .select('*', { count: 'exact', head: true })
        .in('statut', ['en_attente', 'verifie', 'en_cours'])

      const nbActifs = count || 0
      const historiqueScore = (zone.historique_inondations || []).length * 10
      const score = Math.min(100, Math.round(nbActifs * 2 + historiqueScore + Math.random() * 10))

      await supabase
        .from('zones_risque')
        .update({
          score_risque: score,
          nombre_signalements_actifs: nbActifs,
          dernier_calcul: new Date().toISOString()
        })
        .eq('id', zone.id)
    }

    return new Response(JSON.stringify({ message: 'Scores mis a jour' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Erreur calcul risque' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
