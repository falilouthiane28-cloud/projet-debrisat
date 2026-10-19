// Fonction Edge : diffusion d'une alerte par SMS et / ou WhatsApp via Twilio.
// Reservee aux autorites ; cible les habitants de la commune de la zone si une zone est indiquee.
import { admin, identifierAppelant, estAutorite, json, preflight } from '../_shared/commun.ts';

const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_JETON = Deno.env.get('TWILIO_AUTH_TOKEN');
const NUMERO_SMS = Deno.env.get('TWILIO_NUMERO_SMS');
const NUMERO_WHATSAPP = Deno.env.get('TWILIO_NUMERO_WHATSAPP');
const ENVOIS_SIMULTANES = 5;

async function envoyerTwilio(depuis: string, vers: string, texte: string): Promise<boolean> {
  const reponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_JETON}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: depuis, To: vers, Body: texte }),
  });
  if (!reponse.ok) console.warn('Envoi Twilio refusé', reponse.status, await reponse.text());
  return reponse.ok;
}

Deno.serve(async (req) => {
  const reponsePreflight = preflight(req);
  if (reponsePreflight) return reponsePreflight;
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  try {
    const appelant = await identifierAppelant(req);
    if (!estAutorite(appelant)) return json({ erreur: 'Réservé aux autorités' }, 403);
    if (!TWILIO_SID || !TWILIO_JETON) return json({ erreur: 'Twilio n\'est pas configuré' }, 503);

    const { alerte_id } = await req.json();
    const { data: alerte } = await admin.from('alertes').select('*, zones_risque(commune)').eq('id', alerte_id).maybeSingle();
    if (!alerte) return json({ erreur: 'Alerte introuvable' }, 404);
    if (alerte.envoyee) return json({ erreur: 'Alerte déjà envoyée' }, 409);

    let requete = admin.from('profils').select('telephone').not('telephone', 'is', null);
    const commune = alerte.zones_risque?.commune;
    if (commune) requete = requete.eq('commune', commune);
    const { data: destinataires } = await requete;

    const prefixe = { critique: 'ALERTE CRITIQUE', danger: 'DANGER', attention: 'ATTENTION', info: 'INFO' }[alerte.type_alerte as string] ?? 'INFO';
    const texte = `Debrisat · ${prefixe}\n${alerte.titre}\n${alerte.message}`;
    const canaux: Array<[string, (t: string) => string]> = [];
    if ((alerte.canal === 'sms' || alerte.canal === 'tous') && NUMERO_SMS) canaux.push([NUMERO_SMS, (t) => t]);
    if ((alerte.canal === 'whatsapp' || alerte.canal === 'tous') && NUMERO_WHATSAPP) canaux.push([`whatsapp:${NUMERO_WHATSAPP}`, (t) => `whatsapp:${t}`]);

    const taches = (destinataires ?? []).flatMap((d) => canaux.map(([depuis, format]) => () => envoyerTwilio(depuis, format(d.telephone), texte)));
    let envoyes = 0;
    let echecs = 0;
    for (let i = 0; i < taches.length; i += ENVOIS_SIMULTANES) {
      const resultats = await Promise.all(taches.slice(i, i + ENVOIS_SIMULTANES).map((t) => t().catch(() => false)));
      envoyes += resultats.filter(Boolean).length;
      echecs += resultats.filter((r) => !r).length;
    }

    await admin.from('alertes').update({ envoyee: true }).eq('id', alerte_id);
    return json({ envoyes, echecs, destinataires: destinataires?.length ?? 0 });
  } catch (err) {
    console.error('Erreur envoyer-alerte', err);
    return json({ erreur: 'Erreur interne' }, 500);
  }
});
