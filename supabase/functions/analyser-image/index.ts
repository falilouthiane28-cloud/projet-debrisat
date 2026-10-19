// Fonction Edge : analyse automatique de la photo d'un signalement.
// Claude (vision) produit une analyse structuree ; Roboflow, s'il est configure, ajoute des detections d'objets.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { admin, identifierAppelant, estAutorite, json, preflight } from '../_shared/commun.ts';

const TYPES = ['dechets_solides', 'tas_sable', 'gravats', 'plastiques', 'pneus', 'encombrants', 'eau_stagnante', 'canal_bouche', 'autre'];

const SCHEMA_ANALYSE = {
  type: 'object',
  properties: {
    type_detecte: { type: 'string', enum: TYPES },
    severite_suggeree: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    confiance: { type: 'number', description: 'Entre 0 et 1' },
    obstruction_visible: { type: 'boolean' },
    proximite_drainage: { type: 'string', enum: ['directe', 'proche', 'eloignee', 'inconnue'] },
    volume_estime: { type: 'string', description: "Ordre de grandeur, par exemple 'environ 2 m³'" },
    risque_inondation: { type: 'string', enum: ['faible', 'modéré', 'élevé'] },
    description_ia: { type: 'string', description: 'Deux phrases maximum, en français' },
  },
  required: ['type_detecte', 'severite_suggeree', 'confiance', 'obstruction_visible', 'proximite_drainage', 'volume_estime', 'risque_inondation', 'description_ia'],
  additionalProperties: false,
};

const CONSIGNE = `Tu examines une photo envoyée par un habitant de Dakar (Sénégal) pour signaler une obstruction de canal ou de caniveau, cause principale des inondations urbaines pendant l'hivernage.

Évalue :
- le type d'obstruction dominant ;
- la sévérité de 1 à 5 : 1 = quelques déchets épars sans effet sur l'écoulement, 3 = obstruction partielle qui réduit le débit, 5 = canal totalement bouché ou eau déjà stagnante près des habitations ;
- la proximité avec un ouvrage de drainage (canal, caniveau, grille, buse) ;
- le volume approximatif et le risque d'inondation si rien n'est fait.

Si la photo ne montre aucune obstruction (selfie, photo floue, sujet sans rapport), mets obstruction_visible à false, une sévérité de 1 et explique-le dans description_ia. Rédige description_ia en français, en deux phrases au plus.`;

async function analyserAvecClaude(photoUrl: string) {
  const cle = Deno.env.get('ANTHROPIC_API_KEY');
  if (!cle) return null;
  const client = new Anthropic({ apiKey: cle });
  const reponse = await client.beta.messages.create({
    model: Deno.env.get('CLAUDE_MODELE') ?? 'claude-opus-5-5',
    max_tokens: 16000,
    // Classification visuelle simple : un effort faible suffit et reduit le cout par photo
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_ANALYSE } },
    // Un refus des filtres de securite est relance automatiquement sur le modele de repli recommande
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: photoUrl } },
        { type: 'text', text: CONSIGNE },
      ],
    }],
  });

  if (reponse.stop_reason === 'refusal') {
    console.warn('Analyse refusee', reponse.stop_details);
    return null;
  }
  const bloc = reponse.content.find((b) => b.type === 'text');
  if (!bloc || bloc.type !== 'text') return null;
  const brut = JSON.parse(bloc.text);
  return {
    type_detecte: TYPES.includes(brut.type_detecte) ? brut.type_detecte : 'autre',
    severite_suggeree: Math.min(5, Math.max(1, Math.round(Number(brut.severite_suggeree) || 1))),
    confiance: Math.min(1, Math.max(0, Number(brut.confiance) || 0)),
    obstruction_visible: Boolean(brut.obstruction_visible),
    proximite_drainage: String(brut.proximite_drainage),
    volume_estime: String(brut.volume_estime).slice(0, 60),
    risque_inondation: String(brut.risque_inondation),
    description_ia: String(brut.description_ia).slice(0, 400),
    modele: reponse.model,
  };
}

// Option : modele de detection de dechets entraine sur Roboflow (offre gratuite : 1 000 inferences / mois)
async function detecterAvecRoboflow(photoUrl: string) {
  const cle = Deno.env.get('ROBOFLOW_API_KEY');
  const modele = Deno.env.get('ROBOFLOW_MODELE');
  if (!cle || !modele) return null;
  const url = `https://detect.roboflow.com/${modele}?api_key=${encodeURIComponent(cle)}&image=${encodeURIComponent(photoUrl)}&confidence=40`;
  const reponse = await fetch(url, { method: 'POST' });
  if (!reponse.ok) {
    console.warn('Roboflow indisponible', reponse.status);
    return null;
  }
  const resultat = await reponse.json();
  const predictions: Array<{ class: string; confidence: number; width: number; height: number }> = resultat.predictions ?? [];
  const surfaceImage = (resultat.image?.width ?? 1) * (resultat.image?.height ?? 1);
  const couverture = predictions.reduce((t, p) => t + (p.width * p.height) / surfaceImage, 0);
  return {
    nombre_objets: predictions.length,
    classes: [...new Set(predictions.map((p) => p.class))],
    confiance_moyenne: predictions.length ? +(predictions.reduce((t, p) => t + p.confidence, 0) / predictions.length).toFixed(2) : 0,
    couverture: +Math.min(1, couverture).toFixed(2),
  };
}

Deno.serve(async (req) => {
  const reponsePreflight = preflight(req);
  if (reponsePreflight) return reponsePreflight;
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  try {
    const appelant = await identifierAppelant(req);
    if (!appelant) return json({ erreur: 'Authentification requise' }, 401);

    const { signalement_id } = await req.json();
    if (typeof signalement_id !== 'string') return json({ erreur: 'signalement_id manquant' }, 400);

    // L'URL de la photo est lue en base : on n'analyse jamais une URL fournie par l'appelant
    const { data: sig, error } = await admin.from('signalements').select('id, user_id, photo_url, severite').eq('id', signalement_id).maybeSingle();
    if (error || !sig) return json({ erreur: 'Signalement introuvable' }, 404);
    const autorise = estAutorite(appelant) || (appelant.type === 'utilisateur' && appelant.id === sig.user_id);
    if (!autorise) return json({ erreur: 'Accès refusé' }, 403);
    if (!sig.photo_url) return json({ erreur: 'Aucune photo à analyser' }, 422);

    const [claude, roboflow] = await Promise.allSettled([analyserAvecClaude(sig.photo_url), detecterAvecRoboflow(sig.photo_url)]);
    const analyseClaude = claude.status === 'fulfilled' ? claude.value : null;
    const detections = roboflow.status === 'fulfilled' ? roboflow.value : null;
    if (claude.status === 'rejected') console.error('Erreur Claude', claude.reason);
    if (!analyseClaude && !detections) return json({ erreur: 'Analyse indisponible (aucun service configuré ou réponse invalide)' }, 503);

    const analyse = {
      ...(analyseClaude ?? {
        type_detecte: detections!.classes[0] ?? 'autre',
        severite_suggeree: Math.min(5, 1 + Math.round(detections!.couverture * 6)),
        confiance: detections!.confiance_moyenne,
        description_ia: `${detections!.nombre_objets} objet(s) détecté(s) sur la photo.`,
        modele: 'roboflow',
      }),
      ...(detections ? { detections } : {}),
      analyse_le: new Date().toISOString(),
    };

    // L'IA ne fait que relever la severite : sous-estimer un canal bouche est plus risque que l'inverse
    const champs: Record<string, unknown> = { photo_analyse: analyse };
    if (analyse.severite_suggeree > sig.severite && (analyseClaude?.obstruction_visible ?? true)) {
      champs.severite = analyse.severite_suggeree;
    }
    const { data: maj, error: errMaj } = await admin.from('signalements').update(champs).eq('id', sig.id)
      .select('id,user_id,type_obstruction,description,severite,photo_url,photo_analyse,lat,lng,adresse,commune,quartier,statut,source,nombre_confirmations,nombre_infirmations,priorite,assigne_a,resolu_at,created_at,updated_at')
      .single();
    if (errMaj) throw errMaj;
    return json({ signalement: maj });
  } catch (err) {
    console.error('Erreur analyser-image', err);
    return json({ erreur: 'Erreur interne' }, 500);
  }
});
