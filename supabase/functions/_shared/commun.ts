// Outils partages par les fonctions Edge Debrisat
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.39.3';

export const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGINE_AUTORISEE') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: CORS }) : null;
}

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Client « service role » : contourne la RLS, a n'utiliser qu'apres avoir verifie l'appelant
export const admin: SupabaseClient = createClient(SUPABASE_URL, CLE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Appelant =
  | { type: 'service' }
  | { type: 'utilisateur'; id: string; role: string };

// Identifie l'appelant a partir de l'en-tete Authorization (JWT utilisateur ou cle service)
export async function identifierAppelant(req: Request): Promise<Appelant | null> {
  const jeton = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jeton) return null;
  if (jeton === CLE_SERVICE) return { type: 'service' };
  const { data, error } = await admin.auth.getUser(jeton);
  if (error || !data.user) return null;
  const { data: profil } = await admin.from('profils').select('role').eq('id', data.user.id).maybeSingle();
  return { type: 'utilisateur', id: data.user.id, role: profil?.role ?? 'citoyen' };
}

export const ROLES_AUTORITE = ['agent_municipal', 'admin'];

export function estAutorite(appelant: Appelant | null): boolean {
  return appelant?.type === 'service' || (appelant?.type === 'utilisateur' && ROLES_AUTORITE.includes(appelant.role));
}

// Numero au format E.164 (+221...) a partir de saisies variees
export function normaliserTelephone(brut: string): string {
  const chiffres = brut.replace(/^whatsapp:/, '').replace(/[^\d+]/g, '');
  if (chiffres.startsWith('+')) return chiffres;
  if (chiffres.startsWith('00')) return '+' + chiffres.slice(2);
  if (/^7\d{8}$/.test(chiffres)) return '+221' + chiffres;
  return '+' + chiffres;
}
