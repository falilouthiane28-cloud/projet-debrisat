// Fonction Edge : proxy de tuiles Airbus OneAtlas.
// La cle API reste ici (supabase secrets) : le navigateur ne la voit jamais.
// Le proxy echange la cle contre un token Bearer, le met en cache, et transmet la tuile.
import { identifierAppelant, estAutorite, json, preflight, CORS } from '../_shared/commun.ts';

const URL_TOKEN = 'https://authenticate.foundation.api.oneatlas.airbus.com/auth/realms/IDP/protocol/openid-connect/token';
const URL_TUILES = 'https://view-bm.api.oneatlas.airbus.com/basemap/xyz';
const API_KEY = Deno.env.get('ONEATLAS_API_KEY');

let jeton: { valeur: string; expire: number } | null = null;

async function obtenirJeton(): Promise<string> {
  if (jeton && jeton.expire > Date.now() + 60_000) return jeton.valeur;
  const reponse = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ apikey: API_KEY!, grant_type: 'api_key', client_id: 'IDP' }),
  });
  if (!reponse.ok) throw new Error(`Authentification OneAtlas refusee (${reponse.status})`);
  const d = await reponse.json();
  jeton = { valeur: d.access_token, expire: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return jeton.valeur;
}

Deno.serve(async (req) => {
  const reponsePreflight = preflight(req);
  if (reponsePreflight) return reponsePreflight;

  // Diagnostic public
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/proxy-oneatlas')) {
    if (!API_KEY) return json({ configure: false, authentification: 'absente' });
    try {
      await obtenirJeton();
      return json({ configure: true, authentification: 'acceptee' });
    } catch (err) {
      return json({ configure: true, authentification: 'refusee', detail: String((err as Error).message) });
    }
  }

  if (req.method !== 'GET') return json({ erreur: 'Methode non autorisee' }, 405);

  const appelant = await identifierAppelant(req);
  if (!estAutorite(appelant)) return json({ erreur: 'Reserve aux agents et aux administrateurs' }, 403);
  if (!API_KEY) return json({ erreur: "La cle API OneAtlas n'est pas configuree (ONEATLAS_API_KEY)." }, 503);

  try {
    const url = new URL(req.url);
    const z = url.searchParams.get('z');
    const x = url.searchParams.get('x');
    const y = url.searchParams.get('y');
    const couche = url.searchParams.get('layer') || 'advancedBasemap';
    const taille = url.searchParams.get('size') || '256';

    if (!z || !x || !y) return json({ erreur: 'Parametres z, x, y requis' }, 400);

    const urlTuile = `${URL_TUILES}/${couche}/${taille}?z=${z}&x=${x}&y=${y}`;
    const token = await obtenirJeton();
    const reponse = await fetch(urlTuile, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!reponse.ok) {
      if (reponse.status === 403) return json({ erreur: 'Acces refuse par OneAtlas. Verifiez votre autorisation basemap.' }, 403);
      return json({ erreur: `OneAtlas a refuse la requete (${reponse.status})` }, 502);
    }

    const corps = await reponse.arrayBuffer();
    return new Response(corps, {
      headers: {
        ...CORS,
        'Content-Type': reponse.headers.get('Content-Type') || 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('Erreur proxy-oneatlas', err);
    return json({ erreur: 'Erreur interne' }, 500);
  }
});
