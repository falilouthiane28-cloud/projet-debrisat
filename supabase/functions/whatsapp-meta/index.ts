// Fonction Edge : agent WhatsApp officiel DEBRISAT (WhatsApp Business Cloud API de Meta).
// A deployer sans verification JWT : Meta signe ses appels (X-Hub-Signature-256), et le webhook
// interne de changement de statut presente un secret partage (x-debrisat-secret).
import { admin, SUPABASE_URL, normaliserTelephone } from '../_shared/commun.ts';
import {
  type Contexte,
  type Depot,
  type Etape,
  extraireMessages,
  masquerTelephone,
  traiterEvenementStatut,
  traiterMessage,
  verifierAbonnementWebhook,
  verifierSignature,
} from './logique.ts';
import { creerExpediteurMeta, telechargerMedia, VERSION_GRAPH_PAR_DEFAUT } from './meta.ts';
import { creerIa } from './ia.ts';

const env = (nom: string) => Deno.env.get(nom) ?? '';
const OBLIGATOIRES = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];

const configMeta = () => ({
  jeton: env('WHATSAPP_TOKEN'),
  idNumero: env('WHATSAPP_PHONE_NUMBER_ID'),
  version: env('WHATSAPP_GRAPH_VERSION') || VERSION_GRAPH_PAR_DEFAUT,
});

function journal(niveau: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) {
  (niveau === 'error' ? console.error : niveau === 'warn' ? console.warn : console.log)(`[whatsapp-meta] ${message}`, details ?? '');
}

function attendreEnArrierePlan(tache: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(tache);
}

function variantesTelephone(tel: string): string[] {
  const sansPlus = tel.replace(/^\+/, '');
  const local = sansPlus.startsWith('221') ? sansPlus.slice(3) : sansPlus;
  return [...new Set([tel, sansPlus, local])];
}

async function geocoder(lat: number, lng: number) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=fr&zoom=17`, {
      headers: { 'User-Agent': 'Debrisat/1.0 (prevention des inondations, Dakar)' },
    });
    const d = await r.json();
    const a = d.address ?? {};
    return {
      adresse: d.display_name ?? null,
      quartier: a.neighbourhood ?? a.suburb ?? a.quarter ?? null,
      commune: (a.city_district ?? a.town ?? a.city ?? '').replace(/^Commune (de |d')?/i, '') || null,
    };
  } catch {
    return { adresse: null, quartier: null, commune: null };
  }
}

const depot: Depot = {
  async marquerTraite(messageId, empreinte) {
    const { error } = await admin.from('whatsapp_messages_traites').insert({ message_id: messageId, empreinte_telephone: empreinte });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw error;
  },
  async compterRecents(empreinte, depuis) {
    const { count, error } = await admin.from('whatsapp_messages_traites')
      .select('message_id', { count: 'exact', head: true })
      .eq('empreinte_telephone', empreinte)
      .gte('recu_le', new Date(depuis).toISOString());
    if (error) throw error;
    return count ?? 0;
  },
  async lireSession(telephone) {
    const { data } = await admin.from('sessions_whatsapp').select('etape, donnees, updated_at').eq('telephone', telephone).maybeSingle();
    if (!data) return null;
    return { etape: data.etape as Etape, donnees: (data.donnees ?? {}) as Record<string, unknown>, misAJour: Date.parse(data.updated_at) };
  },
  async ecrireSession(telephone, etape, donnees) {
    const { error } = await admin.from('sessions_whatsapp').upsert({ telephone, etape, donnees, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async supprimerSession(telephone) {
    await admin.from('sessions_whatsapp').delete().eq('telephone', telephone);
  },
  async noterContact(telephone) {
    const maintenant = new Date().toISOString();
    const { error } = await admin.from('whatsapp_contacts').upsert({ telephone, dernier_message_le: maintenant, updated_at: maintenant });
    if (error) throw error;
  },
  async definirAbonnement(telephone, abonne) {
    const { error } = await admin.from('whatsapp_contacts').upsert({ telephone, abonne, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async lireContact(telephone) {
    const { data } = await admin.from('whatsapp_contacts').select('abonne, dernier_message_le').eq('telephone', telephone).maybeSingle();
    if (!data) return null;
    return { abonne: data.abonne, dernierMessageLe: data.dernier_message_le ? Date.parse(data.dernier_message_le) : null };
  },
  async creerSignalement(telephone, d) {
    const { data: profil } = await admin.from('profils').select('id').in('telephone', variantesTelephone(telephone)).limit(1).maybeSingle();
    const lieu = await geocoder(d.lat, d.lng);
    const { data, error } = await admin.from('signalements').insert({
      user_id: profil?.id ?? null,
      type_obstruction: d.type,
      description: d.description,
      severite: 3,
      photo_url: d.photoUrl,
      localisation: `SRID=4326;POINT(${d.lng} ${d.lat})`,
      source: 'whatsapp',
      ...lieu,
    }).select('id, numero_suivi, created_at').single();
    if (error) throw error;

    // Analyse de la photo en arriere-plan, comme pour l'ancien bot
    const analyse = fetch(`${SUPABASE_URL}/functions/v1/analyser-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ signalement_id: data.id }),
    }).catch((e) => journal('warn', 'Analyse non lancée', { erreur: String(e) }));
    attendreEnArrierePlan(analyse);

    return { numero: Number(data.numero_suivi), creeLe: data.created_at as string, compteConnu: !!profil };
  },
  async trouverParNumero(numero) {
    const { data } = await admin.from('signalements')
      .select('numero_suivi, statut, created_at, commune, type_obstruction')
      .eq('numero_suivi', numero).maybeSingle();
    if (!data) return null;
    return { numero: Number(data.numero_suivi), statut: data.statut, creeLe: data.created_at, commune: data.commune, type: data.type_obstruction };
  },
  async proches(lat, lng, limite) {
    const { data, error } = await admin.rpc('signalements_proches', { p_lat: lat, p_lng: lng, p_limite: limite });
    if (error) throw error;
    return (data ?? []).map((s: Record<string, unknown>) => ({
      numero: Number(s.numero_suivi),
      type: String(s.type_obstruction),
      statut: String(s.statut),
      distanceM: Number(s.distance_m),
      creeLe: String(s.created_at),
    }));
  },
  async profilAuteur(userId) {
    const { data } = await admin.from('profils').select('telephone, notifications_whatsapp').eq('id', userId).maybeSingle();
    if (!data) return null;
    return { telephone: data.telephone, notifications: data.notifications_whatsapp === true };
  },
};

async function enregistrerPhoto(mediaId: string, mime: string, telephone: string): Promise<string | null> {
  const media = await telechargerMedia(configMeta(), mediaId);
  if (!media || !media.mime.startsWith('image/')) return null;
  const extension = media.mime.includes('png') ? 'png' : media.mime.includes('webp') ? 'webp' : 'jpg';
  // Le numero n'apparait pas dans l'URL publique de la photo : seulement une empreinte
  const empreinte = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(telephone))))
    .slice(0, 8).map((o) => o.toString(16).padStart(2, '0')).join('');
  const chemin = `whatsapp/${empreinte}/${Date.now()}.${extension}`;
  const { error } = await admin.storage.from('photos').upload(chemin, media.contenu, { contentType: media.mime || mime });
  if (error) {
    journal('error', 'Envoi de la photo vers le stockage', { telephone: masquerTelephone(telephone), code: error.message });
    return null;
  }
  return admin.storage.from('photos').getPublicUrl(chemin).data.publicUrl;
}

function contexte(): Contexte {
  const cleIa = env('ANTHROPIC_API_KEY');
  return {
    depot,
    medias: { enregistrerPhoto },
    expediteur: creerExpediteurMeta(configMeta()),
    ia: cleIa ? creerIa(cleIa, env('CLAUDE_MODELE') || 'claude-opus-5-5') : undefined,
    maintenant: () => Date.now(),
    journal,
    numeroEquipe: env('TEAM_ALERT_NUMBER') ? normaliserTelephone(env('TEAM_ALERT_NUMBER')) : undefined,
    modeleEquipe: env('WHATSAPP_TEMPLATE_EQUIPE') || undefined,
    modeleStatut: env('WHATSAPP_TEMPLATE_STATUT') || undefined,
    normaliserTelephone,
  };
}

function texte(corps: string, statut: number) {
  return new Response(corps, { status: statut, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (!env('WHATSAPP_VERIFY_TOKEN')) {
      journal('error', 'configuration manquante : WHATSAPP_VERIFY_TOKEN');
      return texte('Configuration manquante', 500);
    }
    const { statut, corps } = verifierAbonnementWebhook(url.searchParams, env('WHATSAPP_VERIFY_TOKEN'));
    return texte(corps, statut);
  }
  if (req.method !== 'POST') return texte('Méthode non autorisée', 405);

  // Webhook de base de donnees : changement de statut d'un signalement
  if (url.searchParams.get('evenement') === 'statut') {
    const secret = env('WHATSAPP_INTERNAL_SECRET');
    if (!secret) {
      journal('error', 'configuration manquante : WHATSAPP_INTERNAL_SECRET');
      return texte('Configuration manquante', 500);
    }
    if (!egalTempsConstant(req.headers.get('x-debrisat-secret') ?? '', secret)) return texte('Non autorisé', 401);
    try {
      const resultat = await traiterEvenementStatut(await req.json(), contexte());
      journal('info', 'Événement de statut', { resultat });
      return new Response(JSON.stringify({ resultat }), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      journal('error', 'Événement de statut en échec', { erreur: String(err) });
      return texte('Erreur', 500);
    }
  }

  const manquantes = OBLIGATOIRES.filter((nom) => !env(nom));
  if (manquantes.length) {
    journal('error', `configuration manquante : ${manquantes.join(', ')}`);
    return texte('Configuration manquante', 500);
  }

  const brut = new Uint8Array(await req.arrayBuffer());
  if (!(await verifierSignature(brut, req.headers.get('X-Hub-Signature-256'), env('WHATSAPP_APP_SECRET')))) {
    return texte('Signature invalide', 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(brut));
  } catch {
    return texte('Corps invalide', 400);
  }

  // W2 : reponse immediate a Meta ; les messages d'un meme envoi sont traites dans l'ordre, en arriere-plan
  const messages = extraireMessages(payload);
  if (messages.length) {
    const ctx = contexte();
    attendreEnArrierePlan((async () => {
      for (const m of messages) {
        try {
          await traiterMessage(m, ctx);
        } catch (err) {
          journal('error', 'Message non traité', { telephone: masquerTelephone(m.de), erreur: String(err) });
        }
      }
    })());
  }
  return texte('ok', 200);
});

function egalTempsConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}
