import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserCode,
  type Contexte,
  type Depot,
  detecterIntention,
  DUREE_SESSION_MS,
  type Etape,
  extraireMessages,
  formaterCode,
  formaterDistance,
  LIMITE_MESSAGES_MINUTE,
  masquerTelephone,
  type MessageEntrant,
  type MessageSortant,
  MESSAGES,
  respecteLimites,
  type Session,
  traiterEvenementStatut,
  traiterMessage,
  verifierAbonnementWebhook,
  verifierSignature,
} from './logique.ts';

const TEL = '+221771234567';
const T0 = Date.UTC(2026, 9, 22, 10, 0, 0);

function fabriquer(options: { ia?: boolean; equipe?: boolean; modeleStatut?: string } = {}) {
  let horloge = T0;
  const traites = new Map<string, { empreinte: string; t: number }>();
  const sessions = new Map<string, Session>();
  const contacts = new Map<string, { abonne: boolean; dernierMessageLe: number | null }>();
  const signalements: Array<Record<string, unknown>> = [];
  const profils = new Map<string, { telephone: string | null; notifications: boolean }>();
  const envois: Array<{ tel: string; message: MessageSortant }> = [];
  const journal: string[] = [];

  const depot: Depot = {
    async marquerTraite(id, empreinte) {
      if (traites.has(id)) return false;
      traites.set(id, { empreinte, t: horloge });
      return true;
    },
    async compterRecents(empreinte, depuis) {
      return [...traites.values()].filter((x) => x.empreinte === empreinte && x.t >= depuis).length;
    },
    async lireSession(tel) { return sessions.get(tel) ?? null; },
    async ecrireSession(tel, etape: Etape, donnees) { sessions.set(tel, { etape, donnees, misAJour: horloge }); },
    async supprimerSession(tel) { sessions.delete(tel); },
    async noterContact(tel) {
      const c = contacts.get(tel);
      contacts.set(tel, { abonne: c?.abonne ?? true, dernierMessageLe: horloge });
    },
    async definirAbonnement(tel, abonne) {
      const c = contacts.get(tel);
      contacts.set(tel, { abonne, dernierMessageLe: c?.dernierMessageLe ?? null });
    },
    async lireContact(tel) { return contacts.get(tel) ?? null; },
    async creerSignalement(tel, d) {
      const numero = 123 + signalements.length;
      signalements.push({ tel, ...d, numero });
      return { numero, creeLe: new Date(horloge).toISOString(), compteConnu: true };
    },
    async trouverParNumero(numero) {
      return numero === 123 ? { numero, statut: 'verifie', creeLe: '2026-10-21T08:00:00Z', commune: 'Pikine', type: 'canal_bouche' } : null;
    },
    async proches() {
      return [
        { numero: 7, type: 'tas_sable', statut: 'en_attente', distanceM: 340, creeLe: '2026-10-20T08:00:00Z' },
        { numero: 8, type: 'gravats', statut: 'en_cours', distanceM: 2450, creeLe: '2026-10-19T08:00:00Z' },
      ];
    },
    async profilAuteur(id) { return profils.get(id) ?? null; },
  };

  const ctx: Contexte = {
    depot,
    medias: { async enregistrerPhoto(id) { return id === 'media-ko' ? null : `https://exemple.invalid/photos/${id}.jpg`; } },
    expediteur: { async envoyer(tel, message) { envois.push({ tel, message }); } },
    ia: options.ia ? { async repondre() { return 'Je ne peux aider que sur DEBRISAT.\nUtilisez le menu.'; } } : undefined,
    maintenant: () => horloge,
    journal: (_n, message) => { journal.push(message); },
    numeroEquipe: options.equipe ? '+221700000000' : undefined,
    modeleStatut: options.modeleStatut,
  };

  let compteur = 0;
  const msg = (partiel: Partial<MessageEntrant>): MessageEntrant => ({ id: `wamid.${++compteur}`, de: TEL, type: 'text', ...partiel });
  const avancer = (ms: number) => { horloge += ms; };
  const dernier = () => envois[envois.length - 1]?.message;
  return { ctx, msg, envois, sessions, contacts, signalements, profils, journal, avancer, dernier, traites };
}

const corpsDe = (m?: MessageSortant) => (m && 'corps' in m ? m.corps : '');

// ============ Signature et verification ============

async function signer(corps: string, secret: string): Promise<string> {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(corps)));
  return 'sha256=' + Array.from(mac).map((o) => o.toString(16).padStart(2, '0')).join('');
}

test('signature : valide, invalide, absente, mauvais secret', async () => {
  const corps = '{"object":"whatsapp_business_account"}';
  const octets = new TextEncoder().encode(corps);
  const entete = await signer(corps, 'secret-app');
  assert.equal(await verifierSignature(octets, entete, 'secret-app'), true);
  assert.equal(await verifierSignature(octets, entete.toUpperCase().replace('SHA256=', 'sha256='), 'secret-app'), true);
  assert.equal(await verifierSignature(new TextEncoder().encode(corps + ' '), entete, 'secret-app'), false);
  assert.equal(await verifierSignature(octets, null, 'secret-app'), false);
  assert.equal(await verifierSignature(octets, 'sha256=abc', 'secret-app'), false);
  assert.equal(await verifierSignature(octets, entete, 'autre-secret'), false);
  assert.equal(await verifierSignature(octets, entete.replace('sha256=', ''), 'secret-app'), false);
});

test('verification du webhook (GET)', () => {
  const ok = verifierAbonnementWebhook(new URLSearchParams('hub.mode=subscribe&hub.verify_token=jeton&hub.challenge=42'), 'jeton');
  assert.deepEqual(ok, { statut: 200, corps: '42' });
  assert.equal(verifierAbonnementWebhook(new URLSearchParams('hub.mode=subscribe&hub.verify_token=faux&hub.challenge=42'), 'jeton').statut, 403);
  assert.equal(verifierAbonnementWebhook(new URLSearchParams('hub.mode=unsubscribe&hub.verify_token=jeton'), 'jeton').statut, 403);
  assert.equal(verifierAbonnementWebhook(new URLSearchParams('hub.mode=subscribe&hub.verify_token='), '').statut, 403);
});

test('extraction des messages Meta', () => {
  const payload = {
    entry: [{ changes: [{ value: {
      statuses: [{ id: 'ignore' }],
      messages: [
        { id: 'a', from: '221771234567', type: 'text', text: { body: 'Salam' } },
        { id: 'b', from: '221771234567', type: 'image', image: { id: 'm1', mime_type: 'image/jpeg' } },
        { id: 'c', from: '221771234567', type: 'location', location: { latitude: 14.75, longitude: -17.39 } },
        { id: 'd', from: '221771234567', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'menu_suivre', title: 'Suivre' } } },
        { id: 'e', from: '221771234567', type: 'sticker', sticker: {} },
      ],
    } }] }],
  };
  const m = extraireMessages(payload);
  assert.equal(m.length, 5);
  assert.equal(m[0].de, TEL);
  assert.equal(m[1].mediaId, 'm1');
  assert.equal(m[2].lat, 14.75);
  assert.equal(m[3].reponseId, 'menu_suivre');
  assert.equal(m[4].type, 'autre');
  assert.deepEqual(extraireMessages({}), []);
});

// ============ Conversation ============

test('un meme message recu deux fois ne produit qu\'une reponse', async () => {
  const f = fabriquer();
  const m = f.msg({ texte: 'Bonjour' });
  assert.equal(await traiterMessage(m, f.ctx), 'traite');
  assert.equal(await traiterMessage(m, f.ctx), 'doublon');
  assert.equal(f.envois.length, 1);
});

test('limite de debit : un seul avertissement puis silence', async () => {
  const f = fabriquer();
  for (let i = 0; i < LIMITE_MESSAGES_MINUTE + 4; i++) await traiterMessage(f.msg({ texte: 'Bonjour' }), f.ctx);
  const avertissements = f.envois.filter((e) => corpsDe(e.message).includes('Patientez une minute'));
  assert.equal(avertissements.length, 1);
  assert.equal(f.envois.length, LIMITE_MESSAGES_MINUTE + 1);
  f.avancer(61_000);
  assert.equal(await traiterMessage(f.msg({ texte: 'Bonjour' }), f.ctx), 'traite');
});

test('parcours complet de signalement jusqu\'au code de suivi', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'menu_signaler' }), f.ctx);
  assert.equal(f.sessions.get(TEL)?.etape, 'attente_photo');
  await traiterMessage(f.msg({ texte: 'voici' }), f.ctx);
  assert.match(corpsDe(f.dernier()), /J'attends une photo/);
  await traiterMessage(f.msg({ type: 'image', mediaId: 'p1', mime: 'image/jpeg' }), f.ctx);
  assert.equal(f.sessions.get(TEL)?.etape, 'attente_localisation');
  await traiterMessage(f.msg({ texte: 'à Pikine' }), f.ctx);
  assert.match(corpsDe(f.dernier()), /position/);
  await traiterMessage(f.msg({ type: 'location', lat: 14.7581, lng: -17.3915 }), f.ctx);
  assert.equal(f.sessions.get(TEL)?.etape, 'attente_type');
  await traiterMessage(f.msg({ texte: '12' }), f.ctx);
  assert.equal(f.sessions.get(TEL)?.etape, 'attente_type');
  await traiterMessage(f.msg({ texte: '3' }), f.ctx);
  assert.equal(f.sessions.get(TEL)?.donnees.type, 'canal_bouche');
  await traiterMessage(f.msg({ texte: 'x'.repeat(501) }), f.ctx);
  assert.match(corpsDe(f.dernier()), /dépasse 500/);
  await traiterMessage(f.msg({ texte: 'Canal rempli de sable devant l\'école' }), f.ctx);
  assert.equal(f.sessions.get(TEL)?.etape, 'confirmation');
  assert.match(corpsDe(f.dernier()), /Canal bouché/);
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'confirmer' }), f.ctx);
  assert.equal(f.signalements.length, 1);
  assert.equal(f.signalements[0].type, 'canal_bouche');
  assert.equal(f.signalements[0].photoUrl, 'https://exemple.invalid/photos/p1.jpg');
  assert.equal(f.sessions.has(TEL), false);
  assert.match(corpsDe(f.dernier()), /DBS-2026-00123/);
  assert.match(corpsDe(f.dernier()), /10 points/);
});

test('une photo envoyee sans parcours demarre le signalement ; « Passer » saute la description', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ type: 'image', mediaId: 'p2', mime: 'image/png' }), f.ctx);
  await traiterMessage(f.msg({ type: 'location', lat: 14.7, lng: -17.4 }), f.ctx);
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'type_gravats' }), f.ctx);
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'passer' }), f.ctx);
  assert.match(corpsDe(f.dernier()), /Description : aucune/);
  await traiterMessage(f.msg({ texte: 'oui' }), f.ctx);
  assert.equal(f.signalements[0].description, null);
});

test('photo illisible : on reste en attente de photo', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ type: 'image', mediaId: 'media-ko', mime: 'image/jpeg' }), f.ctx);
  assert.equal(f.sessions.get(TEL)?.etape, 'attente_photo');
  assert.match(corpsDe(f.dernier()), /n'a pas pu être enregistrée/);
});

test('annuler en cours de parcours efface la session', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ type: 'image', mediaId: 'p3', mime: 'image/jpeg' }), f.ctx);
  await traiterMessage(f.msg({ texte: 'Annuler' }), f.ctx);
  assert.equal(f.sessions.has(TEL), false);
  assert.match(corpsDe(f.dernier()), /annulé/);
  await traiterMessage(f.msg({ type: 'image', mediaId: 'p4', mime: 'image/jpeg' }), f.ctx);
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'annuler' }), f.ctx);
  assert.equal(f.sessions.has(TEL), false);
});

test('session expiree apres 30 minutes : message puis nouveau depart', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ type: 'image', mediaId: 'p5', mime: 'image/jpeg' }), f.ctx);
  f.avancer(DUREE_SESSION_MS + 1000);
  await traiterMessage(f.msg({ type: 'location', lat: 14.7, lng: -17.4 }), f.ctx);
  const corps = f.envois.slice(-2).map((e) => corpsDe(e.message));
  assert.match(corps[0], /expiré/);
  assert.match(corps[1], /obstruction/);
  assert.equal(f.sessions.has(TEL), false);
});

test('session reprise avant expiration : etat conserve', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ type: 'image', mediaId: 'p6', mime: 'image/jpeg' }), f.ctx);
  f.avancer(DUREE_SESSION_MS - 60_000);
  await traiterMessage(f.msg({ type: 'location', lat: 14.7, lng: -17.4 }), f.ctx);
  assert.equal(f.sessions.get(TEL)?.etape, 'attente_type');
});

test('STOP puis START', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ texte: 'STOP' }), f.ctx);
  assert.equal(f.contacts.get(TEL)?.abonne, false);
  assert.match(corpsDe(f.dernier()), /START/);
  await traiterMessage(f.msg({ texte: 'arrêt' }), f.ctx);
  assert.equal(f.contacts.get(TEL)?.abonne, false);
  await traiterMessage(f.msg({ texte: 'start' }), f.ctx);
  assert.equal(f.contacts.get(TEL)?.abonne, true);
  assert.equal(f.dernier()?.type, 'liste');
});

test('salutations francaises et wolof : menu ; remerciements', async () => {
  for (const salut of ['Salam', 'Salamalekoum', 'Assalamou aleykoum', 'Nanga def ?', 'na nga def', 'Jamm rek', 'BONJOUR', 'salut debrisat', 'menu', 'Aide']) {
    const f = fabriquer();
    await traiterMessage(f.msg({ texte: salut }), f.ctx);
    assert.equal(f.dernier()?.type, 'liste', salut);
    assert.equal((f.dernier() as { lignes: unknown[] }).lignes.length, 5, salut);
  }
  for (const merci of ['Jërëjëf', 'jerejef', 'Merci beaucoup']) {
    const f = fabriquer();
    await traiterMessage(f.msg({ texte: merci }), f.ctx);
    assert.match(corpsDe(f.dernier()), /Avec plaisir/, merci);
  }
  assert.equal(detecterIntention('ARRÊT'), 'stop');
  assert.equal(detecterIntention('je veux signaler un canal'), null);
});

test('texte libre : repli IA si disponible, toujours suivi du menu', async () => {
  const sans = fabriquer();
  await traiterMessage(sans.msg({ texte: 'Quel temps fera-t-il demain ?' }), sans.ctx);
  assert.equal(sans.envois.length, 1);
  assert.equal(sans.dernier()?.type, 'liste');
  const avec = fabriquer({ ia: true });
  await traiterMessage(avec.msg({ texte: 'Quel temps fera-t-il demain ?' }), avec.ctx);
  assert.equal(avec.envois.length, 2);
  assert.equal(avec.envois[0].message.type, 'texte');
  assert.equal(avec.envois[1].message.type, 'liste');
});

test('suivi : code complet, code court, code inconnu, code illisible', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'menu_suivre' }), f.ctx);
  await traiterMessage(f.msg({ texte: 'n importe quoi' }), f.ctx);
  assert.match(corpsDe(f.dernier()), /ne reconnais pas/);
  await traiterMessage(f.msg({ texte: 'dbs 2026 123' }), f.ctx);
  assert.match(corpsDe(f.dernier()), /Vérifié par les habitants/);
  assert.match(corpsDe(f.dernier()), /21\/10\/2026 à Pikine/);
  await traiterMessage(f.msg({ texte: 'DBS-2026-00999' }), f.ctx);
  assert.match(corpsDe(f.dernier()), /Aucun signalement ne correspond à DBS-2026-00999/);
  await traiterMessage(f.msg({ texte: 'DBS-2025-00123' }), f.ctx);
  assert.match(corpsDe(f.dernier()), /Aucun signalement/);
});

test('format et analyse des codes', () => {
  assert.equal(formaterCode(123, '2026-10-21T23:30:00Z'), 'DBS-2026-00123');
  assert.equal(formaterCode(1234567, '2027-01-01T00:00:00Z'), 'DBS-2027-1234567');
  assert.deepEqual(analyserCode('DBS-2026-00123'), { numero: 123, annee: 2026 });
  assert.deepEqual(analyserCode('mon code est dbs 2026 45'), { numero: 45, annee: 2026 });
  assert.deepEqual(analyserCode('#77'), { numero: 77, annee: null });
  assert.equal(analyserCode('0'), null);
  assert.equal(analyserCode('bonjour'), null);
  assert.equal(analyserCode(''), null);
});

test('obstructions proches : liste de 5 au plus, distances lisibles', async () => {
  const f = fabriquer();
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'menu_proches' }), f.ctx);
  await traiterMessage(f.msg({ type: 'location', lat: 14.75, lng: -17.39 }), f.ctx);
  const liste = f.dernier() as { type: string; lignes: Array<{ id: string; titre: string; description: string }> };
  assert.equal(liste.type, 'liste');
  assert.equal(liste.lignes[0].titre, 'DBS-2026-00007');
  assert.match(liste.lignes[0].description, /Tas de sable · 340 m · En attente/);
  assert.match(liste.lignes[1].description, /2,5 km/);
  assert.equal(formaterDistance(4), '10 m');
  assert.equal(formaterDistance(999), '1000 m');
  assert.equal(formaterDistance(1000), '1,0 km');
  assert.equal(MESSAGES.proches([]).type, 'boutons');
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'suivi_123' }), f.ctx);
  assert.match(corpsDe(f.dernier()), /DBS-2026-00123/);
});

test('parler a un humain : alerte equipe ou indisponible', async () => {
  const f = fabriquer({ equipe: true });
  await traiterMessage(f.msg({ type: 'interactive', reponseId: 'menu_humain' }), f.ctx);
  assert.equal(f.envois[0].tel, '+221700000000');
  assert.match(corpsDe(f.envois[0].message), /\+221771234567/);
  assert.match(corpsDe(f.envois[1].message), /va vous répondre/);
  const g = fabriquer();
  await traiterMessage(g.msg({ type: 'interactive', reponseId: 'menu_humain' }), g.ctx);
  assert.match(corpsDe(g.dernier()), /pas encore disponible/);
  assert.ok(g.journal.some((l) => l.includes('TEAM_ALERT_NUMBER')));
});

test('masquage des numeros dans les journaux', () => {
  assert.equal(masquerTelephone('+221784277229'), '2217842****');
  assert.equal(masquerTelephone('221 78 427 72 29'), '2217842****');
});

test('tous les messages respectent les limites WhatsApp et la regle des 5 lignes', () => {
  const recap = { type: 'canal_bouche', lat: 14.7, lng: -17.4, description: 'x'.repeat(500) };
  const suivi = { numero: 1, statut: 'resolu', creeLe: '2026-10-21T08:00:00Z', commune: 'Guédiawaye', type: 'pneus' };
  const proches = Array.from({ length: 8 }, (_, i) => ({ numero: 10_000 + i, type: 'eau_stagnante', statut: 'en_cours', distanceM: 4999, creeLe: '2026-10-21T08:00:00Z' }));
  const tous: MessageSortant[] = [
    MESSAGES.menu(), MESSAGES.menu('Vous êtes de nouveau abonné à DEBRISAT.'), MESSAGES.merci(), MESSAGES.stop(), MESSAGES.annule(),
    MESSAGES.expire(), MESSAGES.tropDeMessages(), MESSAGES.demanderPhoto(), MESSAGES.attentePhoto(), MESSAGES.photoIllisible(),
    MESSAGES.demanderPosition(), MESSAGES.attentePosition(), MESSAGES.demanderType(), MESSAGES.demanderDescription(),
    MESSAGES.descriptionTropLongue(), MESSAGES.recapitulatif(recap), MESSAGES.enregistre('DBS-2026-00123', true),
    MESSAGES.enregistre('DBS-2026-00123', false), MESSAGES.erreurEnregistrement(), MESSAGES.demanderCode(), MESSAGES.codeIllisible(),
    MESSAGES.codeInconnu('DBS-2026-99999'), MESSAGES.suivi(suivi), MESSAGES.demanderPositionProches(), MESSAGES.proches(proches),
    MESSAGES.proches([]), MESSAGES.commentCaMarche(), MESSAGES.humainDemande(), MESSAGES.humainIndisponible(),
    MESSAGES.alerteEquipe(TEL), MESSAGES.notificationStatut('DBS-2026-00123', 'en_cours'),
  ];
  for (const m of tous) assert.ok(respecteLimites(m), JSON.stringify(m).slice(0, 120));
  assert.equal(respecteLimites({ type: 'boutons', corps: 'a', boutons: [1, 2, 3, 4].map((i) => ({ id: String(i), titre: 'x' })) }), false);
  assert.equal(respecteLimites({ type: 'texte', corps: '1\n2\n3\n4\n5\n6' }), false);
  assert.equal(respecteLimites({ type: 'liste', corps: 'a', bouton: 'b', lignes: [{ id: 'x', titre: 'y'.repeat(25) }] }), false);
});

// ============ Notification de statut ============

function evenement(statut: string, ancien = 'en_attente', userId: string | null = 'u1') {
  return { type: 'UPDATE', table: 'signalements', record: { statut, user_id: userId, numero_suivi: 123, created_at: '2026-10-21T08:00:00Z' }, old_record: { statut: ancien } };
}

test('statut : texte dans la fenetre de 24 h, modele au-dela, sinon ignore', async () => {
  const f = fabriquer({ modeleStatut: 'debrisat_statut' });
  f.profils.set('u1', { telephone: '+221771234567', notifications: true });
  f.contacts.set(TEL, { abonne: true, dernierMessageLe: T0 - 3_600_000 });
  assert.equal(await traiterEvenementStatut(evenement('en_cours'), f.ctx), 'texte');
  assert.match(corpsDe(f.dernier()), /DBS-2026-00123 est maintenant : Intervention en cours/);

  f.contacts.set(TEL, { abonne: true, dernierMessageLe: T0 - 25 * 3_600_000 });
  assert.equal(await traiterEvenementStatut(evenement('resolu', 'en_cours'), f.ctx), 'modele');
  assert.deepEqual(f.dernier(), { type: 'modele', nom: 'debrisat_statut', langue: 'fr', parametres: ['DBS-2026-00123', 'Résolu'] });

  const sansModele = fabriquer();
  sansModele.profils.set('u1', { telephone: '+221771234567', notifications: true });
  sansModele.contacts.set(TEL, { abonne: true, dernierMessageLe: null });
  assert.equal(await traiterEvenementStatut(evenement('resolu'), sansModele.ctx), 'ignore:sans_modele');
  assert.equal(sansModele.envois.length, 0);
});

test('statut : aucune notification sans double accord', async () => {
  const f = fabriquer({ modeleStatut: 'debrisat_statut' });
  assert.equal(await traiterEvenementStatut(evenement('resolu', 'resolu'), f.ctx), 'ignore:statut_inchange');
  assert.equal(await traiterEvenementStatut(evenement('resolu', 'en_cours', null), f.ctx), 'ignore:sans_auteur');
  f.profils.set('u1', { telephone: '+221771234567', notifications: false });
  assert.equal(await traiterEvenementStatut(evenement('resolu'), f.ctx), 'ignore:sans_optin');
  f.profils.set('u1', { telephone: '+221771234567', notifications: true });
  assert.equal(await traiterEvenementStatut(evenement('resolu'), f.ctx), 'ignore:non_abonne');
  f.contacts.set(TEL, { abonne: false, dernierMessageLe: T0 });
  assert.equal(await traiterEvenementStatut(evenement('resolu'), f.ctx), 'ignore:non_abonne');
  assert.equal(await traiterEvenementStatut({ type: 'INSERT', table: 'signalements' }, f.ctx), 'ignore:type');
  assert.equal(f.envois.length, 0);
});
