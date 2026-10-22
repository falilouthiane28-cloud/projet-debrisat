// Logique de l'agent WhatsApp DEBRISAT, sans dependance a Deno ni a Supabase : testable avec `node --test`.
// Les acces a la base, a Meta et a l'horloge sont injectes (voir index.ts pour le branchement reel).

export type Etape =
  | 'attente_photo'
  | 'attente_localisation'
  | 'attente_type'
  | 'attente_description'
  | 'confirmation'
  | 'attente_suivi'
  | 'attente_proximite';

export type Session = { etape: Etape; donnees: Record<string, unknown>; misAJour: number };

export type MessageEntrant = {
  id: string;
  de: string;
  type: 'text' | 'image' | 'location' | 'interactive' | 'autre';
  texte?: string;
  reponseId?: string;
  mediaId?: string;
  mime?: string;
  lat?: number;
  lng?: number;
};

export type Bouton = { id: string; titre: string };
export type Ligne = { id: string; titre: string; description?: string };

export type MessageSortant =
  | { type: 'texte'; corps: string }
  | { type: 'boutons'; corps: string; boutons: Bouton[] }
  | { type: 'liste'; corps: string; bouton: string; lignes: Ligne[] }
  | { type: 'modele'; nom: string; langue: string; parametres: string[] };

export type SignalementSuivi = { numero: number; statut: string; creeLe: string; commune: string | null; type: string };
export type SignalementProche = { numero: number; type: string; statut: string; distanceM: number; creeLe: string };

export interface Depot {
  marquerTraite(messageId: string, empreinte: string): Promise<boolean>;
  compterRecents(empreinte: string, depuis: number): Promise<number>;
  lireSession(telephone: string): Promise<Session | null>;
  ecrireSession(telephone: string, etape: Etape, donnees: Record<string, unknown>): Promise<void>;
  supprimerSession(telephone: string): Promise<void>;
  noterContact(telephone: string): Promise<void>;
  definirAbonnement(telephone: string, abonne: boolean): Promise<void>;
  lireContact(telephone: string): Promise<{ abonne: boolean; dernierMessageLe: number | null } | null>;
  creerSignalement(
    telephone: string,
    donnees: { photoUrl: string; lat: number; lng: number; type: string; description: string | null },
  ): Promise<{ numero: number; creeLe: string; compteConnu: boolean }>;
  trouverParNumero(numero: number): Promise<SignalementSuivi | null>;
  proches(lat: number, lng: number, limite: number): Promise<SignalementProche[]>;
  profilAuteur(userId: string): Promise<{ telephone: string | null; notifications: boolean } | null>;
}

export interface Medias {
  enregistrerPhoto(mediaId: string, mime: string, telephone: string): Promise<string | null>;
}

export interface Expediteur {
  envoyer(telephone: string, message: MessageSortant): Promise<void>;
}

export interface Ia {
  repondre(texte: string): Promise<string | null>;
}

export type Contexte = {
  depot: Depot;
  medias: Medias;
  expediteur: Expediteur;
  ia?: Ia;
  maintenant: () => number;
  journal: (niveau: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) => void;
  numeroEquipe?: string;
  modeleEquipe?: string;
  modeleStatut?: string;
  normaliserTelephone?: (brut: string) => string;
};

export const DUREE_SESSION_MS = 30 * 60 * 1000;
export const FENETRE_SERVICE_MS = 24 * 60 * 60 * 1000;
export const LIMITE_MESSAGES_MINUTE = 15;
export const MAX_DESCRIPTION = 500;

export const TYPES: Array<[string, string]> = [
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
const LIBELLE_TYPE = new Map(TYPES);

export const STATUTS: Record<string, string> = {
  en_attente: 'En attente de vérification',
  verifie: 'Vérifié par les habitants',
  en_cours: 'Intervention en cours',
  resolu: 'Résolu',
  rejete: 'Rejeté',
};

// ============ Outils ============

export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// S6 : jamais de numero en clair dans les journaux
export function masquerTelephone(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, '');
  return chiffres.slice(0, 7) + '****';
}

export async function empreinteTelephone(telephone: string): Promise<string> {
  const octets = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(telephone)));
  return Array.from(octets.slice(0, 16)).map((o) => o.toString(16).padStart(2, '0')).join('');
}

export function formaterCode(numero: number, creeLe: string): string {
  // Dakar est en UTC toute l'annee : l'annee UTC est celle de Dakar
  const annee = new Date(creeLe).getUTCFullYear();
  return `DBS-${annee}-${String(numero).padStart(5, '0')}`;
}

export function analyserCode(texte: string): { numero: number; annee: number | null } | null {
  const brut = texte.trim();
  const complet = /dbs\s*[-_ ]?\s*(\d{4})\s*[-_ ]?\s*(\d{1,7})\b/i.exec(brut);
  if (complet) return { numero: Number(complet[2]), annee: Number(complet[1]) };
  const seul = /^#?\s*(\d{1,7})$/.exec(brut);
  if (seul && Number(seul[1]) > 0) return { numero: Number(seul[1]), annee: null };
  return null;
}

export function formaterDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  return `${(metres / 1000).toFixed(1).replace('.', ',')} km`;
}

function formaterDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function tronquer(texte: string, max: number): string {
  return texte.length <= max ? texte : texte.slice(0, max - 1).trimEnd() + '…';
}

export function limiterLignes(texte: string, max = 5): string {
  return texte.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, max).join('\n');
}

// Limites de l'API WhatsApp et regle W7 (5 lignes au plus)
export function respecteLimites(message: MessageSortant): boolean {
  if (message.type === 'modele') return message.nom.length > 0;
  const corps = message.corps;
  if (!corps || corps.length > 1024 || corps.split('\n').length > 5) return false;
  if (message.type === 'boutons') {
    return message.boutons.length >= 1 && message.boutons.length <= 3 &&
      message.boutons.every((b) => b.titre.length >= 1 && b.titre.length <= 20 && b.id.length <= 256);
  }
  if (message.type === 'liste') {
    return message.bouton.length <= 20 && message.lignes.length >= 1 && message.lignes.length <= 10 &&
      message.lignes.every((l) => l.titre.length <= 24 && (l.description ?? '').length <= 72 && l.id.length <= 200);
  }
  return true;
}

// ============ Intentions ============

export type Intention = 'stop' | 'start' | 'annuler' | 'menu' | 'salutation' | 'merci' | 'signaler' | 'suivre' | 'proches';

export function detecterIntention(texteBrut: string): Intention | null {
  const t = normaliser(texteBrut);
  if (!t) return null;
  if (/^(stop|arret|desabonner|desinscrire|unsubscribe)$/.test(t)) return 'stop';
  if (/^(start|demarrer|reabonner|subscribe)$/.test(t)) return 'start';
  if (/^(annuler|annule|annulation|cancel|recommencer)$/.test(t)) return 'annuler';
  if (/^(menu|aide|help|options?)$/.test(t)) return 'menu';
  if (/^(merci|jerejef|jere jef|jerejeff|dieuredieuf|dieureudieuf)\b/.test(t)) return 'merci';
  if (/^(bonjour|bonsoir|salut|hello|coucou|bjr|as+alam\w*|as salam\w*|salam\w*|salaam\w*|nanga ?def|na nga def|jamm)\b/.test(t)) return 'salutation';
  if (/^(signaler|signalement|nouveau signalement)$/.test(t)) return 'signaler';
  if (/^(suivre|suivi|suivre mon signalement)$/.test(t)) return 'suivre';
  if (/^(pres de moi|autour de moi|proches?|a proximite)$/.test(t)) return 'proches';
  return null;
}

// ============ Messages ============

const BOUTON_MENU: Bouton = { id: 'menu', titre: 'Menu' };
const BOUTON_ANNULER: Bouton = { id: 'annuler', titre: 'Annuler' };

export const MESSAGES = {
  menu(intro?: string): MessageSortant {
    return {
      type: 'liste',
      corps: limiterLignes(`${intro ?? 'Bienvenue sur DEBRISAT 👋'}\nJ'aide à prévenir les inondations à Dakar en signalant les canaux bouchés.\nQue souhaitez-vous faire ?`),
      bouton: 'Ouvrir le menu',
      lignes: [
        { id: 'menu_signaler', titre: '📍 Signaler', description: 'Signaler une obstruction (photo + position)' },
        { id: 'menu_suivre', titre: '🔎 Suivre', description: 'Suivre mon signalement avec son code DBS' },
        { id: 'menu_proches', titre: '🗺️ Près de moi', description: 'Obstructions signalées près de moi' },
        { id: 'menu_aide', titre: 'ℹ️ Comment ça marche', description: 'Signaler, vérifier, curer : en 3 étapes' },
        { id: 'menu_humain', titre: '👤 Parler à un humain', description: "Un membre de l'équipe vous répondra ici" },
      ],
    };
  },
  merci(): MessageSortant {
    return { type: 'boutons', corps: 'Avec plaisir, jërëjëf ! 🙏\nÉcrivez « menu » à tout moment pour revoir les options.', boutons: [BOUTON_MENU] };
  },
  stop(): MessageSortant {
    return { type: 'texte', corps: 'Vous ne recevrez plus de messages de DEBRISAT.\nÉcrivez START pour vous réabonner.' };
  },
  annule(): MessageSortant {
    return { type: 'boutons', corps: "C'est annulé, rien n'a été envoyé.", boutons: [{ id: 'menu_signaler', titre: 'Nouveau signalement' }, BOUTON_MENU] };
  },
  expire(): MessageSortant {
    return { type: 'texte', corps: 'Votre conversation précédente a expiré après 30 minutes sans réponse.\nOn reprend depuis le début.' };
  },
  tropDeMessages(): MessageSortant {
    return { type: 'texte', corps: 'Vous envoyez beaucoup de messages en peu de temps.\nPatientez une minute avant de continuer.' };
  },
  demanderPhoto(): MessageSortant {
    return {
      type: 'boutons',
      corps: "📸 Envoyez une photo de l'obstruction (canal, caniveau, déchets…).\nAppuyez sur l'appareil photo ou le trombone.",
      boutons: [BOUTON_ANNULER],
    };
  },
  attentePhoto(): MessageSortant {
    return { type: 'boutons', corps: "J'attends une photo de l'obstruction.\nAppuyez sur l'appareil photo ou le trombone.", boutons: [BOUTON_ANNULER] };
  },
  photoIllisible(): MessageSortant {
    return { type: 'boutons', corps: "La photo n'a pas pu être enregistrée.\nRéessayez avec une autre photo.", boutons: [BOUTON_ANNULER] };
  },
  demanderPosition(): MessageSortant {
    return {
      type: 'boutons',
      corps: '📍 Photo reçue. Partagez maintenant la position de l\'obstruction :\ntrombone, puis « Position », puis « Envoyer ma position actuelle ».',
      boutons: [BOUTON_ANNULER],
    };
  },
  attentePosition(): MessageSortant {
    return { type: 'boutons', corps: "J'attends la position de l'obstruction :\ntrombone, puis « Position ».", boutons: [BOUTON_ANNULER] };
  },
  demanderType(): MessageSortant {
    return {
      type: 'liste',
      corps: "Position reçue. Quel type d'obstruction ?\nChoisissez dans la liste (ou répondez par un chiffre de 1 à 9).",
      bouton: 'Choisir le type',
      lignes: TYPES.map(([cle, libelle], i) => ({ id: `type_${cle}`, titre: libelle, description: `Réponse rapide : ${i + 1}` })),
    };
  },
  demanderDescription(): MessageSortant {
    return {
      type: 'boutons',
      corps: "✍️ Décrivez l'obstruction en une phrase (facultatif).\nExemple : « Canal rempli de sable devant l'école ».",
      boutons: [{ id: 'passer', titre: 'Passer' }, BOUTON_ANNULER],
    };
  },
  descriptionTropLongue(): MessageSortant {
    return {
      type: 'boutons',
      corps: `Votre description dépasse ${MAX_DESCRIPTION} caractères.\nRaccourcissez-la ou appuyez sur « Passer ».`,
      boutons: [{ id: 'passer', titre: 'Passer' }, BOUTON_ANNULER],
    };
  },
  recapitulatif(donnees: Record<string, unknown>): MessageSortant {
    const type = LIBELLE_TYPE.get(String(donnees.type)) ?? 'Autre';
    const description = donnees.description ? tronquer(String(donnees.description), 80) : 'aucune';
    return {
      type: 'boutons',
      corps: [
        'Récapitulatif de votre signalement :',
        `Type : ${type}`,
        `Position : ${Number(donnees.lat).toFixed(4)}, ${Number(donnees.lng).toFixed(4)}`,
        `Description : ${description}`,
        "Confirmez-vous l'envoi ?",
      ].join('\n'),
      boutons: [{ id: 'confirmer', titre: 'Confirmer' }, BOUTON_ANNULER],
    };
  },
  enregistre(code: string, compteConnu: boolean): MessageSortant {
    return {
      type: 'boutons',
      corps: [
        `✅ Merci ! Signalement ${code} enregistré.`,
        'Les habitants du quartier vont le vérifier, puis les équipes de curage le priorisent.',
        compteConnu ? 'Vous gagnez 10 points sur votre compte DEBRISAT.' : 'Créez un compte DEBRISAT avec ce numéro pour gagner des points.',
        'Gardez ce code pour suivre votre signalement.',
      ].join('\n'),
      boutons: [{ id: 'menu_suivre', titre: 'Suivre' }, BOUTON_MENU],
    };
  },
  erreurEnregistrement(): MessageSortant {
    return { type: 'boutons', corps: "Le signalement n'a pas pu être enregistré.\nRéessayez dans un instant.", boutons: [{ id: 'confirmer', titre: 'Réessayer' }, BOUTON_ANNULER] };
  },
  demanderCode(): MessageSortant {
    return { type: 'boutons', corps: '🔎 Envoyez le code de votre signalement.\nExemple : DBS-2026-00123', boutons: [BOUTON_ANNULER] };
  },
  codeIllisible(): MessageSortant {
    return { type: 'boutons', corps: 'Je ne reconnais pas ce code.\nIl ressemble à DBS-2026-00123.', boutons: [BOUTON_ANNULER] };
  },
  codeInconnu(code: string): MessageSortant {
    return {
      type: 'boutons',
      corps: `Aucun signalement ne correspond à ${code}.\nVérifiez le code reçu lors de l'envoi.`,
      boutons: [{ id: 'menu_suivre', titre: 'Autre code' }, BOUTON_MENU],
    };
  },
  suivi(s: SignalementSuivi): MessageSortant {
    return {
      type: 'boutons',
      corps: [
        `Signalement ${formaterCode(s.numero, s.creeLe)}`,
        `Type : ${LIBELLE_TYPE.get(s.type) ?? 'Autre'}`,
        `Statut : ${STATUTS[s.statut] ?? s.statut}`,
        `Signalé le ${formaterDate(s.creeLe)}${s.commune ? ` à ${s.commune}` : ''}.`,
      ].join('\n'),
      boutons: [{ id: 'menu_suivre', titre: 'Autre code' }, BOUTON_MENU],
    };
  },
  demanderPositionProches(): MessageSortant {
    return {
      type: 'boutons',
      corps: "🗺️ Partagez votre position pour voir les obstructions signalées autour de vous :\ntrombone, puis « Position ».",
      boutons: [BOUTON_ANNULER],
    };
  },
  proches(liste: SignalementProche[]): MessageSortant {
    if (!liste.length) {
      return { type: 'boutons', corps: 'Aucune obstruction ouverte signalée à moins de 5 km.\nMerci de veiller sur votre quartier.', boutons: [{ id: 'menu_signaler', titre: 'Signaler' }, BOUTON_MENU] };
    }
    const n = liste.length;
    return {
      type: 'liste',
      corps: `${n} obstruction${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''} à moins de 5 km.\nTouchez-en une pour voir son suivi.`,
      bouton: 'Voir la liste',
      lignes: liste.slice(0, 5).map((s) => ({
        id: `suivi_${s.numero}`,
        titre: formaterCode(s.numero, s.creeLe),
        description: tronquer(`${LIBELLE_TYPE.get(s.type) ?? 'Autre'} · ${formaterDistance(s.distanceM)} · ${STATUTS[s.statut] ?? s.statut}`, 72),
      })),
    };
  },
  commentCaMarche(): MessageSortant {
    return {
      type: 'boutons',
      corps: [
        'DEBRISAT aide à prévenir les inondations à Dakar.',
        '1. Vous signalez un canal ou caniveau bouché (photo + position).',
        '2. Les habitants du quartier vérifient le signalement.',
        '3. Les équipes de curage priorisent les interventions.',
        'Chaque signalement utile vous rapporte des points.',
      ].join('\n'),
      boutons: [{ id: 'menu_signaler', titre: 'Signaler' }, BOUTON_MENU],
    };
  },
  humainDemande(): MessageSortant {
    return {
      type: 'texte',
      corps: "👤 C'est noté : un membre de l'équipe DEBRISAT va vous répondre ici.\nGardez cette conversation ouverte.",
    };
  },
  humainIndisponible(): MessageSortant {
    return { type: 'boutons', corps: "Le contact avec l'équipe n'est pas encore disponible.\nUtilisez le menu en attendant.", boutons: [BOUTON_MENU] };
  },
  alerteEquipe(telephone: string): MessageSortant {
    return { type: 'texte', corps: `DEBRISAT : un habitant demande à parler à un humain.\nNuméro : ${telephone}` };
  },
  notificationStatut(code: string, statut: string): MessageSortant {
    return {
      type: 'boutons',
      corps: `📣 Votre signalement ${code} est maintenant : ${STATUTS[statut] ?? statut}.\nMerci pour votre vigilance.`,
      boutons: [{ id: 'menu_suivre', titre: 'Suivre' }, BOUTON_MENU],
    };
  },
};

// ============ Analyse des webhooks Meta ============

export async function verifierSignature(corps: Uint8Array, entete: string | null, secret: string): Promise<boolean> {
  if (!entete || !secret || !entete.startsWith('sha256=')) return false;
  const recu = entete.slice('sha256='.length).trim().toLowerCase();
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cle, corps));
  const attendu = Array.from(mac).map((o) => o.toString(16).padStart(2, '0')).join('');
  if (recu.length !== attendu.length) return false;
  let ecart = 0;
  for (let i = 0; i < attendu.length; i++) ecart |= attendu.charCodeAt(i) ^ recu.charCodeAt(i);
  return ecart === 0;
}

export function verifierAbonnementWebhook(parametres: URLSearchParams, jetonAttendu: string): { statut: number; corps: string } {
  const mode = parametres.get('hub.mode');
  const jeton = parametres.get('hub.verify_token');
  const defi = parametres.get('hub.challenge') ?? '';
  if (mode === 'subscribe' && jetonAttendu && jeton === jetonAttendu) return { statut: 200, corps: defi };
  return { statut: 403, corps: 'Jeton de vérification invalide' };
}

type Brut = Record<string, any>;

export function extraireMessages(payload: Brut): MessageEntrant[] {
  const sortie: MessageEntrant[] = [];
  for (const entree of payload?.entry ?? []) {
    for (const changement of entree?.changes ?? []) {
      for (const m of changement?.value?.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const base = { id: String(m.id), de: '+' + String(m.from).replace(/\D/g, '') };
        if (m.type === 'text') sortie.push({ ...base, type: 'text', texte: String(m.text?.body ?? '') });
        else if (m.type === 'image') sortie.push({ ...base, type: 'image', mediaId: m.image?.id, mime: m.image?.mime_type ?? 'image/jpeg' });
        else if (m.type === 'location') sortie.push({ ...base, type: 'location', lat: Number(m.location?.latitude), lng: Number(m.location?.longitude) });
        else if (m.type === 'interactive') {
          const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
          sortie.push({ ...base, type: 'interactive', reponseId: r?.id, texte: r?.title });
        } else if (m.type === 'button') sortie.push({ ...base, type: 'interactive', reponseId: m.button?.payload, texte: m.button?.text });
        else sortie.push({ ...base, type: 'autre' });
      }
    }
  }
  return sortie;
}

// ============ Conversation ============

async function envoyer(ctx: Contexte, telephone: string, message: MessageSortant): Promise<void> {
  await ctx.expediteur.envoyer(telephone, message);
}

function coordonneesValides(m: MessageEntrant): boolean {
  return Number.isFinite(m.lat) && Number.isFinite(m.lng) && Math.abs(m.lat!) <= 90 && Math.abs(m.lng!) <= 180;
}

function typeChoisi(m: MessageEntrant): string | null {
  if (m.reponseId?.startsWith('type_')) {
    const cle = m.reponseId.slice(5);
    return LIBELLE_TYPE.has(cle) ? cle : null;
  }
  const n = Number.parseInt((m.texte ?? '').trim(), 10);
  if (String(n) === (m.texte ?? '').trim() && n >= 1 && n <= TYPES.length) return TYPES[n - 1][0];
  return null;
}

async function demarrerPhoto(ctx: Contexte, tel: string, m: MessageEntrant): Promise<void> {
  const url = m.mediaId && (m.mime ?? '').startsWith('image/') ? await ctx.medias.enregistrerPhoto(m.mediaId, m.mime ?? 'image/jpeg', tel) : null;
  if (!url) {
    await ctx.depot.ecrireSession(tel, 'attente_photo', {});
    await envoyer(ctx, tel, MESSAGES.photoIllisible());
    return;
  }
  await ctx.depot.ecrireSession(tel, 'attente_localisation', { photoUrl: url });
  await envoyer(ctx, tel, MESSAGES.demanderPosition());
}

async function repondreSuivi(ctx: Contexte, tel: string, code: { numero: number; annee: number | null }): Promise<void> {
  const s = await ctx.depot.trouverParNumero(code.numero);
  const affiche = code.annee ? `DBS-${code.annee}-${String(code.numero).padStart(5, '0')}` : `n° ${code.numero}`;
  if (!s || (code.annee && new Date(s.creeLe).getUTCFullYear() !== code.annee)) {
    await envoyer(ctx, tel, MESSAGES.codeInconnu(affiche));
    return;
  }
  await envoyer(ctx, tel, MESSAGES.suivi(s));
}

async function demanderHumain(ctx: Contexte, tel: string): Promise<void> {
  if (!ctx.numeroEquipe) {
    ctx.journal('warn', 'configuration manquante : TEAM_ALERT_NUMBER');
    await envoyer(ctx, tel, MESSAGES.humainIndisponible());
    return;
  }
  const alerte: MessageSortant = ctx.modeleEquipe
    ? { type: 'modele', nom: ctx.modeleEquipe, langue: 'fr', parametres: [tel] }
    : MESSAGES.alerteEquipe(tel);
  try {
    await envoyer(ctx, ctx.numeroEquipe, alerte);
  } catch (err) {
    ctx.journal('error', "Alerte équipe non envoyée", { erreur: String(err) });
  }
  await envoyer(ctx, tel, MESSAGES.humainDemande());
}

// Choix du menu ou mot-cle equivalent, valables a toute etape : ils remplacent le parcours en cours
async function traiterChoixMenu(ctx: Contexte, tel: string, choix: string): Promise<boolean> {
  switch (choix) {
    case 'menu':
      await ctx.depot.supprimerSession(tel);
      await envoyer(ctx, tel, MESSAGES.menu('Voici le menu DEBRISAT.'));
      return true;
    case 'menu_signaler':
      await ctx.depot.ecrireSession(tel, 'attente_photo', {});
      await envoyer(ctx, tel, MESSAGES.demanderPhoto());
      return true;
    case 'menu_suivre':
      await ctx.depot.ecrireSession(tel, 'attente_suivi', {});
      await envoyer(ctx, tel, MESSAGES.demanderCode());
      return true;
    case 'menu_proches':
      await ctx.depot.ecrireSession(tel, 'attente_proximite', {});
      await envoyer(ctx, tel, MESSAGES.demanderPositionProches());
      return true;
    case 'menu_aide':
      await ctx.depot.supprimerSession(tel);
      await envoyer(ctx, tel, MESSAGES.commentCaMarche());
      return true;
    case 'menu_humain':
      await ctx.depot.supprimerSession(tel);
      await demanderHumain(ctx, tel);
      return true;
  }
  if (choix.startsWith('suivi_')) {
    await ctx.depot.supprimerSession(tel);
    const numero = Number(choix.slice(6));
    if (Number.isInteger(numero) && numero > 0) await repondreSuivi(ctx, tel, { numero, annee: null });
    return true;
  }
  return false;
}

const CHOIX_PAR_INTENTION: Partial<Record<Intention, string>> = {
  menu: 'menu',
  signaler: 'menu_signaler',
  suivre: 'menu_suivre',
  proches: 'menu_proches',
};

export type Resultat = 'traite' | 'doublon' | 'limite';

export async function traiterMessage(m: MessageEntrant, ctx: Contexte): Promise<Resultat> {
  const tel = m.de;
  const empreinte = await empreinteTelephone(tel);
  if (!(await ctx.depot.marquerTraite(m.id, empreinte))) return 'doublon';

  const recents = await ctx.depot.compterRecents(empreinte, ctx.maintenant() - 60_000);
  if (recents > LIMITE_MESSAGES_MINUTE) {
    if (recents === LIMITE_MESSAGES_MINUTE + 1) await envoyer(ctx, tel, MESSAGES.tropDeMessages());
    ctx.journal('warn', 'Expéditeur limité', { telephone: masquerTelephone(tel) });
    return 'limite';
  }
  await ctx.depot.noterContact(tel);

  const intention = m.type === 'text' ? detecterIntention(m.texte ?? '') : null;
  if (intention === 'stop') {
    await ctx.depot.definirAbonnement(tel, false);
    await ctx.depot.supprimerSession(tel);
    await envoyer(ctx, tel, MESSAGES.stop());
    return 'traite';
  }
  if (intention === 'start') {
    await ctx.depot.definirAbonnement(tel, true);
    await envoyer(ctx, tel, MESSAGES.menu('Vous êtes de nouveau abonné à DEBRISAT.'));
    return 'traite';
  }
  if (intention === 'annuler' || m.reponseId === 'annuler') {
    await ctx.depot.supprimerSession(tel);
    await envoyer(ctx, tel, MESSAGES.annule());
    return 'traite';
  }

  let session = await ctx.depot.lireSession(tel);
  if (session && ctx.maintenant() - session.misAJour > DUREE_SESSION_MS) {
    await ctx.depot.supprimerSession(tel);
    session = null;
    await envoyer(ctx, tel, MESSAGES.expire());
  }

  const choix = m.reponseId ?? (intention ? CHOIX_PAR_INTENTION[intention] : undefined);
  if (choix && (await traiterChoixMenu(ctx, tel, choix))) return 'traite';

  // Une nouvelle photo relance toujours le parcours de signalement
  if (m.type === 'image') {
    await demarrerPhoto(ctx, tel, m);
    return 'traite';
  }

  if (!session) {
    await traiterSansSession(ctx, tel, m, intention);
    return 'traite';
  }

  const d = session.donnees;
  switch (session.etape) {
    case 'attente_photo':
      await envoyer(ctx, tel, MESSAGES.attentePhoto());
      break;
    case 'attente_localisation':
      if (m.type === 'location' && coordonneesValides(m)) {
        await ctx.depot.ecrireSession(tel, 'attente_type', { ...d, lat: m.lat, lng: m.lng });
        await envoyer(ctx, tel, MESSAGES.demanderType());
      } else {
        await envoyer(ctx, tel, MESSAGES.attentePosition());
      }
      break;
    case 'attente_type': {
      const type = typeChoisi(m);
      if (type) {
        await ctx.depot.ecrireSession(tel, 'attente_description', { ...d, type });
        await envoyer(ctx, tel, MESSAGES.demanderDescription());
      } else {
        await envoyer(ctx, tel, MESSAGES.demanderType());
      }
      break;
    }
    case 'attente_description': {
      if (m.reponseId === 'passer') {
        const suite = { ...d, description: null };
        await ctx.depot.ecrireSession(tel, 'confirmation', suite);
        await envoyer(ctx, tel, MESSAGES.recapitulatif(suite));
        break;
      }
      const texte = m.type === 'text' ? (m.texte ?? '').trim() : '';
      if (!texte || intention === 'salutation') {
        await envoyer(ctx, tel, MESSAGES.demanderDescription());
      } else if (texte.length > MAX_DESCRIPTION) {
        await envoyer(ctx, tel, MESSAGES.descriptionTropLongue());
      } else {
        const suite = { ...d, description: texte };
        await ctx.depot.ecrireSession(tel, 'confirmation', suite);
        await envoyer(ctx, tel, MESSAGES.recapitulatif(suite));
      }
      break;
    }
    case 'confirmation':
      if (m.reponseId === 'confirmer' || normaliser(m.texte ?? '') === 'confirmer' || normaliser(m.texte ?? '') === 'oui') {
        try {
          const cree = await ctx.depot.creerSignalement(tel, {
            photoUrl: String(d.photoUrl),
            lat: Number(d.lat),
            lng: Number(d.lng),
            type: String(d.type),
            description: d.description ? String(d.description) : null,
          });
          await ctx.depot.supprimerSession(tel);
          await envoyer(ctx, tel, MESSAGES.enregistre(formaterCode(cree.numero, cree.creeLe), cree.compteConnu));
        } catch (err) {
          ctx.journal('error', 'Signalement non enregistré', { telephone: masquerTelephone(tel), erreur: String(err) });
          await envoyer(ctx, tel, MESSAGES.erreurEnregistrement());
        }
      } else {
        await envoyer(ctx, tel, MESSAGES.recapitulatif(d));
      }
      break;
    case 'attente_suivi': {
      const code = analyserCode(m.texte ?? '');
      if (!code) {
        await envoyer(ctx, tel, MESSAGES.codeIllisible());
      } else {
        await ctx.depot.supprimerSession(tel);
        await repondreSuivi(ctx, tel, code);
      }
      break;
    }
    case 'attente_proximite':
      if (m.type === 'location' && coordonneesValides(m)) {
        await ctx.depot.supprimerSession(tel);
        await envoyer(ctx, tel, MESSAGES.proches(await ctx.depot.proches(m.lat!, m.lng!, 5)));
      } else {
        await envoyer(ctx, tel, MESSAGES.demanderPositionProches());
      }
      break;
  }
  return 'traite';
}

async function traiterSansSession(ctx: Contexte, tel: string, m: MessageEntrant, intention: Intention | null): Promise<void> {
  if (m.type === 'location' && coordonneesValides(m)) {
    await envoyer(ctx, tel, MESSAGES.proches(await ctx.depot.proches(m.lat!, m.lng!, 5)));
    return;
  }
  if (intention === 'merci') {
    await envoyer(ctx, tel, MESSAGES.merci());
    return;
  }
  if (intention === 'salutation' || m.type !== 'text') {
    await envoyer(ctx, tel, MESSAGES.menu());
    return;
  }
  const code = /dbs/i.test(m.texte ?? '') ? analyserCode(m.texte ?? '') : null;
  if (code) {
    await repondreSuivi(ctx, tel, code);
    return;
  }
  if (ctx.ia && (m.texte ?? '').trim().length >= 3) {
    try {
      const reponse = await ctx.ia.repondre(m.texte ?? '');
      if (reponse) await envoyer(ctx, tel, { type: 'texte', corps: limiterLignes(reponse, 5) });
    } catch (err) {
      ctx.journal('warn', 'Réponse IA indisponible', { erreur: String(err) });
    }
  }
  await envoyer(ctx, tel, MESSAGES.menu('Je peux vous aider avec ces options :'));
}

// ============ Notification de changement de statut (webhook de base de donnees) ============

export async function traiterEvenementStatut(payload: Brut, ctx: Contexte): Promise<string> {
  if (payload?.type !== 'UPDATE' || payload?.table !== 'signalements') return 'ignore:type';
  const nouveau = payload.record ?? {};
  const ancien = payload.old_record ?? {};
  if (!nouveau.statut || nouveau.statut === ancien.statut) return 'ignore:statut_inchange';
  if (!nouveau.user_id) return 'ignore:sans_auteur';
  const profil = await ctx.depot.profilAuteur(String(nouveau.user_id));
  if (!profil?.telephone || !profil.notifications) return 'ignore:sans_optin';
  const tel = (ctx.normaliserTelephone ?? ((t: string) => t))(profil.telephone);
  const contact = await ctx.depot.lireContact(tel);
  if (!contact || !contact.abonne) return 'ignore:non_abonne';
  if (!nouveau.numero_suivi || !nouveau.created_at) return 'ignore:sans_numero';

  const code = formaterCode(Number(nouveau.numero_suivi), String(nouveau.created_at));
  if (contact.dernierMessageLe && ctx.maintenant() - contact.dernierMessageLe < FENETRE_SERVICE_MS) {
    await envoyer(ctx, tel, MESSAGES.notificationStatut(code, nouveau.statut));
    return 'texte';
  }
  if (!ctx.modeleStatut) {
    ctx.journal('warn', 'configuration manquante : WHATSAPP_TEMPLATE_STATUT (hors fenêtre de 24 h)', { telephone: masquerTelephone(tel) });
    return 'ignore:sans_modele';
  }
  await envoyer(ctx, tel, { type: 'modele', nom: ctx.modeleStatut, langue: 'fr', parametres: [code, STATUTS[nouveau.statut] ?? nouveau.statut] });
  return 'modele';
}
