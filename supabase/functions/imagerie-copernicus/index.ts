// Fonction Edge : image Sentinel a la demande via l'API Process du Copernicus Data Space Ecosystem (CDSE).
// Le secret OAuth reste ici (supabase secrets) : le navigateur ne le voit jamais.
// Reservee aux agents et administrateurs (le quota CDSE est partage).
import { identifierAppelant, estAutorite, json, preflight, CORS } from '../_shared/commun.ts';

const URL_JETON = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const URL_PROCESS = 'https://sh.dataspace.copernicus.eu/api/v1/process';
const CLIENT_ID = Deno.env.get('CDSE_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('CDSE_CLIENT_SECRET');

// Emprise autorisee : region de Dakar (evite d'utiliser le quota pour autre chose)
const LIMITES = { ouest: -17.6, sud: 14.55, est: -17.1, nord: 14.95 };
const COTE_MAX_DEG = 0.25;
const TAILLE_MAX_PX = 1500;

const PRODUITS: Record<string, { collection: string; evalscript: string; filtre?: Record<string, unknown> }> = {
  // Couleurs naturelles, etirement simple
  couleurs: {
    collection: 'sentinel-2-l2a',
    filtre: { maxCloudCoverage: 60, mosaickingOrder: 'leastCC' },
    evalscript: `//VERSION=3
function setup() { return { input: ['B02', 'B03', 'B04', 'dataMask'], output: { bands: 4 } }; }
function evaluatePixel(s) { return [2.8 * s.B04, 2.8 * s.B03, 2.8 * s.B02, s.dataMask]; }`,
  },
  // Eau Sentinel-2 : MNDWI > 0, nuages (SCL) transparents
  eau: {
    collection: 'sentinel-2-l2a',
    filtre: { maxCloudCoverage: 60, mosaickingOrder: 'leastCC' },
    evalscript: `//VERSION=3
function setup() { return { input: ['B03', 'B11', 'SCL', 'dataMask'], output: { bands: 4 } }; }
function evaluatePixel(s) {
  if (!s.dataMask || [0, 1, 3, 8, 9, 10].includes(s.SCL)) return [0, 0, 0, 0];
  const m = (s.B03 - s.B11) / (s.B03 + s.B11);
  return m > 0 ? [0.13, 0.59, 0.95, 0.85] : [0, 0, 0, 0];
}`,
  },
  // Radar Sentinel-1 : l'eau calme renvoie peu de signal (VV < -18 dB), visible meme sous les nuages
  radar: {
    collection: 'sentinel-1-grd',
    filtre: { acquisitionMode: 'IW', polarization: 'DV', resolution: 'HIGH', mosaickingOrder: 'mostRecent' },
    evalscript: `//VERSION=3
function setup() { return { input: ['VV', 'dataMask'], output: { bands: 4 } }; }
function evaluatePixel(s) {
  if (!s.dataMask) return [0, 0, 0, 0];
  const db = 10 * Math.log(Math.max(s.VV, 1e-5)) / Math.LN10;
  if (db < -18) return [0.13, 0.59, 0.95, 0.9];
  const g = Math.min(1, Math.max(0, (db + 25) / 25));
  return [g, g, g, 1];
}`,
  },
};

let jeton: { valeur: string; expire: number } | null = null;

async function obtenirJeton(): Promise<string> {
  if (jeton && jeton.expire > Date.now() + 30_000) return jeton.valeur;
  const reponse = await fetch(URL_JETON, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID!, client_secret: CLIENT_SECRET! }),
  });
  if (!reponse.ok) throw new Error(`Authentification CDSE refusée (${reponse.status})`);
  const d = await reponse.json();
  jeton = { valeur: d.access_token, expire: Date.now() + d.expires_in * 1000 };
  return jeton.valeur;
}

function dateValide(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

Deno.serve(async (req) => {
  const reponsePreflight = preflight(req);
  if (reponsePreflight) return reponsePreflight;
  // Diagnostic public : dit si le client OAuth est configure et accepte, sans rien reveler du secret
  if (req.method === 'GET') {
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ configure: false, authentification: 'absente' });
    try {
      await obtenirJeton();
      return json({ configure: true, authentification: 'acceptee' });
    } catch (err) {
      return json({ configure: true, authentification: 'refusee', detail: String((err as Error).message) });
    }
  }
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const appelant = await identifierAppelant(req);
  if (!estAutorite(appelant)) return json({ erreur: 'Réservé aux agents et aux administrateurs' }, 403);
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ erreur: "Le client OAuth Copernicus n'est pas configuré (CDSE_CLIENT_ID, CDSE_CLIENT_SECRET)." }, 503);

  try {
    const { produit, debut, fin, bbox } = await req.json();
    const p = PRODUITS[produit];
    if (!p) return json({ erreur: 'Produit inconnu (couleurs, eau ou radar)' }, 400);
    if (!dateValide(debut) || !dateValide(fin) || debut > fin) return json({ erreur: 'Dates invalides (AAAA-MM-JJ)' }, 400);
    if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n) => typeof n === 'number')) return json({ erreur: 'Emprise invalide' }, 400);
    const [o, s, e, n] = bbox;
    if (o < LIMITES.ouest || e > LIMITES.est || s < LIMITES.sud || n > LIMITES.nord || e <= o || n <= s) {
      return json({ erreur: 'Emprise hors de la région de Dakar' }, 400);
    }
    if (e - o > COTE_MAX_DEG || n - s > COTE_MAX_DEG) return json({ erreur: 'Emprise trop grande (0,25° au plus)' }, 400);

    // Environ 10 m par pixel, plafonne
    const largeur = Math.min(TAILLE_MAX_PX, Math.round(((e - o) * 111_320 * Math.cos((s * Math.PI) / 180)) / 10));
    const hauteur = Math.min(TAILLE_MAX_PX, Math.round(((n - s) * 110_574) / 10));

    const corps = {
      input: {
        bounds: { bbox: [o, s, e, n], properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
        data: [{
          type: p.collection,
          dataFilter: { timeRange: { from: `${debut}T00:00:00Z`, to: `${fin}T23:59:59Z` }, ...(p.filtre ?? {}) },
          ...(p.collection === 'sentinel-1-grd' ? { processing: { orthorectify: true, backCoeff: 'SIGMA0_ELLIPSOID' } } : {}),
        }],
      },
      output: { width: largeur, height: hauteur, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
      evalscript: p.evalscript,
    };

    const reponse = await fetch(URL_PROCESS, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await obtenirJeton()}`, 'Content-Type': 'application/json', Accept: 'image/png' },
      body: JSON.stringify(corps),
    });
    if (!reponse.ok) {
      const detail = await reponse.text();
      console.error('CDSE Process', reponse.status, detail.slice(0, 500));
      return json({ erreur: reponse.status === 429 ? 'Quota Copernicus atteint, réessayez plus tard.' : `Copernicus a refusé la requête (${reponse.status}).` }, 502);
    }
    return new Response(await reponse.arrayBuffer(), {
      headers: { ...CORS, 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (err) {
    console.error('Erreur imagerie-copernicus', err);
    return json({ erreur: 'Erreur interne' }, 500);
  }
});
