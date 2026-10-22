import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireCorps, creerExpediteurMeta, telechargerMedia, TAILLE_MAX_MEDIA } from './meta.ts';

type Appel = { url: string; init?: RequestInit };

function fauxFetch(reponses: Array<(a: Appel) => Response>) {
  const appels: Appel[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const a = { url: String(url), init };
    appels.push(a);
    return reponses[appels.length - 1](a);
  }) as unknown as typeof fetch;
  return { f, appels };
}

test('corps Meta : texte, boutons, liste, modele', () => {
  const tel = '+221 77 123 45 67';
  assert.deepEqual(construireCorps(tel, { type: 'texte', corps: 'Salut' }), {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: '221771234567', type: 'text', text: { body: 'Salut', preview_url: false },
  });
  const boutons = construireCorps(tel, { type: 'boutons', corps: 'Choix', boutons: [{ id: 'a', titre: 'A' }] }) as Record<string, any>;
  assert.equal(boutons.interactive.type, 'button');
  assert.deepEqual(boutons.interactive.action.buttons[0], { type: 'reply', reply: { id: 'a', title: 'A' } });
  const liste = construireCorps(tel, { type: 'liste', corps: 'Menu', bouton: 'Ouvrir', lignes: [{ id: 'x', titre: 'X' }, { id: 'y', titre: 'Y', description: 'd' }] }) as Record<string, any>;
  assert.equal(liste.interactive.action.button, 'Ouvrir');
  assert.deepEqual(liste.interactive.action.sections[0].rows, [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y', description: 'd' }]);
  const modele = construireCorps(tel, { type: 'modele', nom: 'debrisat_statut', langue: 'fr', parametres: ['DBS-2026-00123', 'Résolu'] }) as Record<string, any>;
  assert.equal(modele.template.language.code, 'fr');
  assert.deepEqual(modele.template.components[0].parameters, [{ type: 'text', text: 'DBS-2026-00123' }, { type: 'text', text: 'Résolu' }]);
});

test('expediteur : URL, jeton, erreur sans fuite du jeton', async () => {
  const { f, appels } = fauxFetch([
    () => new Response('{}', { status: 200 }),
    () => new Response(JSON.stringify({ error: { code: 131047, message: 'Re-engagement message' } }), { status: 400 }),
  ]);
  const exp = creerExpediteurMeta({ jeton: 'JETON-SECRET', idNumero: '1234', version: 'v21.0', fetch: f });
  await exp.envoyer('+221771234567', { type: 'texte', corps: 'ok' });
  assert.equal(appels[0].url, 'https://graph.facebook.com/v21.0/1234/messages');
  assert.equal((appels[0].init?.headers as Record<string, string>).Authorization, 'Bearer JETON-SECRET');
  await assert.rejects(exp.envoyer('+221771234567', { type: 'texte', corps: 'ok' }), (e: Error) => {
    assert.match(e.message, /HTTP 400/);
    assert.match(e.message, /131047/);
    assert.doesNotMatch(e.message, /JETON-SECRET/);
    return true;
  });
});

test('telechargement de media en deux temps, taille limitee', async () => {
  const ok = fauxFetch([
    () => new Response(JSON.stringify({ url: 'https://lookaside.example/m1', mime_type: 'image/jpeg', file_size: 3 })),
    () => new Response(new Uint8Array([1, 2, 3])),
  ]);
  const media = await telechargerMedia({ jeton: 'j', idNumero: '1', version: 'v21.0', fetch: ok.f }, 'm1');
  assert.equal(media?.mime, 'image/jpeg');
  assert.equal(media?.contenu.byteLength, 3);
  assert.equal(ok.appels[0].url, 'https://graph.facebook.com/v21.0/m1');
  assert.equal((ok.appels[1].init?.headers as Record<string, string>).Authorization, 'Bearer j');

  const tropGros = fauxFetch([() => new Response(JSON.stringify({ url: 'https://x', mime_type: 'image/jpeg', file_size: TAILLE_MAX_MEDIA + 1 }))]);
  assert.equal(await telechargerMedia({ jeton: 'j', idNumero: '1', version: 'v21.0', fetch: tropGros.f }, 'm2'), null);
  const introuvable = fauxFetch([() => new Response('{}', { status: 404 })]);
  assert.equal(await telechargerMedia({ jeton: 'j', idNumero: '1', version: 'v21.0', fetch: introuvable.f }, 'm3'), null);
});
