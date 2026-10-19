// Fonction Edge : recalcule le score de risque de chaque zone et les statistiques par commune.
// A appeler par une autorite depuis le tableau de bord, ou toutes les heures par pg_cron (voir projet.md).
import { admin, identifierAppelant, estAutorite, json, preflight } from '../_shared/commun.ts';

Deno.serve(async (req) => {
  const reponsePreflight = preflight(req);
  if (reponsePreflight) return reponsePreflight;
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const appelant = await identifierAppelant(req);
  if (!estAutorite(appelant)) return json({ erreur: 'Réservé aux autorités' }, 403);

  const { error } = await admin.rpc('calculer_scores_risque');
  if (error) {
    console.error('Calcul du risque', error);
    return json({ erreur: 'Le calcul a échoué' }, 500);
  }
  const { data: zones } = await admin.from('zones_risque')
    .select('id, nom, score_risque, nombre_signalements_actifs')
    .order('score_risque', { ascending: false });
  return json({ zones });
});
