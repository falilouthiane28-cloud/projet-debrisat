// Fonction Edge : bot WhatsApp (webhook Twilio).
// Parcours : photo -> localisation -> type -> signalement cree.
// A deployer sans verification JWT (Twilio ne l'envoie pas) : la signature Twilio la remplace.
import { admin, SUPABASE_URL, normaliserTelephone } from '../_shared/commun.ts';

const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_JETON = Deno.env.get('TWILIO_AUTH_TOKEN')!;
// URL publique exacte configuree dans la console Twilio : elle entre dans le calcul de la signature
const URL_WEBHOOK = Deno.env.get('TWILIO_WEBHOOK_URL') ?? `${SUPABASE_URL}/functions/v1/webhook-whatsapp`;
const DUREE_SESSION_MS = 30 * 60 * 1000;

const TYPES: Array<[string, string]> = [
  ['dechets_solides', 'Déchets solides'],
  ['tas_sable', 'Tas de sable'],
  ['canal_bouche', 'Canal bouché'],
  ['gravats', 'Gravats'],
  ['plastiques', 'Plastiques'],
  ['pneus', 'Pneus'],
  ['encombrants', 'Encombrants'],
  ['eau_stagnante', 'Eau stagnante'],
  ['autre', 'Autre'],
];
const MENU_TYPES = TYPES.map(([, nom], i) => `${i + 1}. ${nom}`).join('\n');

const MESSAGES = {
  accueil: "Bienvenue sur Debrisat. Pour signaler un canal ou un caniveau bouché, envoyez une photo de l'obstruction.",
  photoRecue: 'Photo reçue. Partagez maintenant la position : trombone, puis « Position », puis « Envoyer ma position actuelle ».',
  attentePosition: "J'attends la position de l'obstruction : trombone, puis « Position ». Envoyez « annuler » pour recommencer.",
  positionRecue: `Position reçue. Quel est le type d'obstruction ? Répondez avec le numéro :\n${MENU_TYPES}`,
  numeroInvalide: `Numéro non reconnu. Répondez avec un chiffre de 1 à ${TYPES.length} :\n${MENU_TYPES}`,
  annule: 'Signalement annulé. Envoyez une nouvelle photo quand vous voulez.',
  erreurPhoto: "La photo n'a pas pu être enregistrée. Réessayez dans un instant.",
  erreur: 'Une erreur est survenue. Réessayez dans un instant.',
};

function echapperXml(texte: string): string {
  return texte.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

function twiml(message: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${echapperXml(message)}</Message></Response>`, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

// Signature Twilio : HMAC-SHA1 de l'URL suivie des parametres tries (cle + valeur), encodee en base64
async function signatureValide(signature: string | null, parametres: URLSearchParams): Promise<boolean> {
  if (!signature) return false;
  const cles = [...new Set(parametres.keys())].sort();
  const donnees = URL_WEBHOOK + cles.map((k) => k + parametres.getAll(k).join('')).join('');
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(TWILIO_JETON), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(donnees)));
  const attendu = btoa(String.fromCharCode(...mac));
  if (attendu.length !== signature.length) return false;
  let ecart = 0;
  for (let i = 0; i < attendu.length; i++) ecart |= attendu.charCodeAt(i) ^ signature.charCodeAt(i);
  return ecart === 0;
}

async function lireSession(telephone: string) {
  const { data } = await admin.from('sessions_whatsapp').select('*').eq('telephone', telephone).maybeSingle();
  if (!data) return null;
  if (Date.now() - new Date(data.updated_at).getTime() > DUREE_SESSION_MS) {
    await admin.from('sessions_whatsapp').delete().eq('telephone', telephone);
    return null;
  }
  return data as { telephone: string; etape: string; donnees: Record<string, unknown> };
}

async function ecrireSession(telephone: string, etape: string, donnees: Record<string, unknown>) {
  await admin.from('sessions_whatsapp').upsert({ telephone, etape, donnees, updated_at: new Date().toISOString() });
}

async function supprimerSession(telephone: string) {
  await admin.from('sessions_whatsapp').delete().eq('telephone', telephone);
}

// Les medias Twilio exigent une authentification HTTP Basic
async function enregistrerPhoto(urlMedia: string, typeMedia: string, telephone: string): Promise<string | null> {
  const reponse = await fetch(urlMedia, { headers: { Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_JETON}`) } });
  if (!reponse.ok) return null;
  const contenu = await reponse.arrayBuffer();
  if (contenu.byteLength > 10 * 1024 * 1024) return null;
  const extension = typeMedia.includes('png') ? 'png' : typeMedia.includes('webp') ? 'webp' : 'jpg';
  // Le numero n'apparait pas dans l'URL publique de la photo : on en garde seulement une empreinte
  const empreinte = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(telephone))))
    .slice(0, 8).map((o) => o.toString(16).padStart(2, '0')).join('');
  const chemin = `whatsapp/${empreinte}/${Date.now()}.${extension}`;
  const { error } = await admin.storage.from('photos').upload(chemin, contenu, { contentType: typeMedia || 'image/jpeg' });
  if (error) {
    console.error('Envoi photo', error);
    return null;
  }
  return admin.storage.from('photos').getPublicUrl(chemin).data.publicUrl;
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

async function creerSignalement(telephone: string, donnees: Record<string, unknown>, type: string) {
  const { data: profil } = await admin.from('profils').select('id').eq('telephone', telephone).maybeSingle();
  const lat = Number(donnees.lat);
  const lng = Number(donnees.lng);
  const lieu = await geocoder(lat, lng);
  const { data, error } = await admin.from('signalements').insert({
    user_id: profil?.id ?? null,
    type_obstruction: type,
    severite: 3,
    photo_url: donnees.photo_url,
    localisation: `SRID=4326;POINT(${lng} ${lat})`,
    source: 'whatsapp',
    ...lieu,
  }).select('id').single();
  if (error) throw error;

  // Analyse de la photo en arriere-plan : la reponse WhatsApp ne l'attend pas,
  // waitUntil garde la fonction en vie jusqu'a la fin de la requete
  const analyse = fetch(`${SUPABASE_URL}/functions/v1/analyser-image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ signalement_id: data.id }),
  }).catch((e) => console.warn('Analyse non lancee', e));
  (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(analyse);

  return { id: data.id as string, connu: !!profil };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405 });
  const corps = await req.text();
  const parametres = new URLSearchParams(corps);

  if (!(await signatureValide(req.headers.get('X-Twilio-Signature'), parametres))) {
    return new Response('Signature invalide', { status: 403 });
  }

  const telephone = normaliserTelephone(parametres.get('From') ?? '');
  const texte = (parametres.get('Body') ?? '').trim();
  const nbMedias = Number(parametres.get('NumMedia') ?? '0');
  const urlMedia = parametres.get('MediaUrl0');
  const typeMedia = parametres.get('MediaContentType0') ?? '';
  const latitude = parametres.get('Latitude');
  const longitude = parametres.get('Longitude');

  try {
    if (/^(annuler|stop|recommencer)$/i.test(texte)) {
      await supprimerSession(telephone);
      return twiml(MESSAGES.annule);
    }

    // Une nouvelle photo relance toujours le parcours
    if (nbMedias > 0 && urlMedia && typeMedia.startsWith('image/')) {
      const photoUrl = await enregistrerPhoto(urlMedia, typeMedia, telephone);
      if (!photoUrl) return twiml(MESSAGES.erreurPhoto);
      await ecrireSession(telephone, 'attente_localisation', { photo_url: photoUrl });
      return twiml(MESSAGES.photoRecue);
    }

    const session = await lireSession(telephone);
    if (!session) return twiml(MESSAGES.accueil);

    if (session.etape === 'attente_localisation') {
      if (!latitude || !longitude) return twiml(MESSAGES.attentePosition);
      await ecrireSession(telephone, 'attente_type', { ...session.donnees, lat: Number(latitude), lng: Number(longitude) });
      return twiml(MESSAGES.positionRecue);
    }

    if (session.etape === 'attente_type') {
      const choix = Number.parseInt(texte, 10);
      if (!(choix >= 1 && choix <= TYPES.length)) return twiml(MESSAGES.numeroInvalide);
      const [type, nom] = TYPES[choix - 1];
      const { id, connu } = await creerSignalement(telephone, session.donnees, type);
      await supprimerSession(telephone);
      const reference = '#' + id.replace(/-/g, '').slice(0, 6).toUpperCase();
      return twiml(connu
        ? `Merci. Votre signalement ${reference} (${nom}) est enregistré et vous gagnez 10 points. Les habitants du quartier vont le vérifier.`
        : `Merci. Votre signalement ${reference} (${nom}) est enregistré. Créez un compte Debrisat avec ce numéro pour gagner des points à chaque signalement.`);
    }

    return twiml(MESSAGES.accueil);
  } catch (err) {
    console.error('Erreur webhook WhatsApp', err);
    return twiml(MESSAGES.erreur);
  }
});
