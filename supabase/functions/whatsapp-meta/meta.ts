// Client minimal de l'API WhatsApp Business Cloud (Meta), sans dependance : fetch est injecte pour les tests.
import type { Expediteur, MessageSortant } from './logique.ts';

export type ConfigMeta = {
  jeton: string;
  idNumero: string;
  version: string;
  fetch?: typeof fetch;
};

export const VERSION_GRAPH_PAR_DEFAUT = 'v21.0';

const base = (c: ConfigMeta) => `https://graph.facebook.com/${c.version || VERSION_GRAPH_PAR_DEFAUT}`;

export function construireCorps(telephone: string, message: MessageSortant): Record<string, unknown> {
  const commun = { messaging_product: 'whatsapp', recipient_type: 'individual', to: telephone.replace(/\D/g, '') };
  switch (message.type) {
    case 'texte':
      return { ...commun, type: 'text', text: { body: message.corps, preview_url: false } };
    case 'boutons':
      return {
        ...commun,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message.corps },
          action: { buttons: message.boutons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titre } })) },
        },
      };
    case 'liste':
      return {
        ...commun,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: message.corps },
          action: {
            button: message.bouton,
            sections: [{ rows: message.lignes.map((l) => ({ id: l.id, title: l.titre, ...(l.description ? { description: l.description } : {}) })) }],
          },
        },
      };
    case 'modele':
      return {
        ...commun,
        type: 'template',
        template: {
          name: message.nom,
          language: { code: message.langue },
          components: message.parametres.length
            ? [{ type: 'body', parameters: message.parametres.map((t) => ({ type: 'text', text: t })) }]
            : [],
        },
      };
  }
}

export function creerExpediteurMeta(config: ConfigMeta): Expediteur {
  const f = config.fetch ?? fetch;
  return {
    async envoyer(telephone, message) {
      const reponse = await f(`${base(config)}/${config.idNumero}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.jeton}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(construireCorps(telephone, message)),
      });
      if (!reponse.ok) {
        // Le detail de l'erreur Meta ne contient ni jeton ni contenu de message
        let code = '';
        try {
          const d = await reponse.json();
          code = `${d?.error?.code ?? ''} ${d?.error?.error_subcode ?? ''} ${d?.error?.message ?? ''}`.trim();
        } catch { /* corps illisible */ }
        throw new Error(`Envoi WhatsApp refusé (HTTP ${reponse.status}) ${code}`.trim());
      }
    },
  };
}

export const TAILLE_MAX_MEDIA = 10 * 1024 * 1024;

// Un media Meta se recupere en deux temps : l'URL temporaire, puis le fichier (meme jeton dans les deux cas)
export async function telechargerMedia(config: ConfigMeta, mediaId: string): Promise<{ contenu: ArrayBuffer; mime: string } | null> {
  const f = config.fetch ?? fetch;
  const auth = { Authorization: `Bearer ${config.jeton}` };
  const info = await f(`${base(config)}/${encodeURIComponent(mediaId)}`, { headers: auth });
  if (!info.ok) return null;
  const d = await info.json();
  if (!d?.url || (d.file_size && Number(d.file_size) > TAILLE_MAX_MEDIA)) return null;
  const fichier = await f(d.url, { headers: auth });
  if (!fichier.ok) return null;
  const contenu = await fichier.arrayBuffer();
  if (contenu.byteLength > TAILLE_MAX_MEDIA) return null;
  return { contenu, mime: String(d.mime_type ?? fichier.headers.get('content-type') ?? 'image/jpeg') };
}
