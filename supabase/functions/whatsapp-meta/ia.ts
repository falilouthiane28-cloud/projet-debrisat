// Repli IA facultatif (actif seulement si ANTHROPIC_API_KEY est defini) : reponses courtes, limitees a DEBRISAT (W8).
import Anthropic from 'npm:@anthropic-ai/sdk';
import type { Ia } from './logique.ts';

const CONSIGNES = `Tu es l'assistant WhatsApp de DEBRISAT, plateforme citoyenne de prévention des inondations à Dakar (Sénégal).
Les habitants y signalent les canaux et caniveaux bouchés (déchets, sable, gravats), la communauté vérifie, les équipes de curage interviennent.
Règles strictes :
- Réponds en français simple, en 5 lignes au maximum, sans titre ni liste à puces longue.
- Le message peut être en wolof : comprends-le et réponds en français simple.
- Ne parle que de DEBRISAT, des obstructions de drainage et de la prévention des inondations.
- Ne promets jamais de date ni de délai d'intervention.
- Ne donne aucun conseil juridique ni médical. En cas d'urgence vitale, dis d'appeler les secours (sapeurs-pompiers : 18).
- Pour toute question hors sujet, dis poliment que tu ne peux aider que sur DEBRISAT et invite à utiliser le menu.
- N'invente aucun chiffre, aucun statut de signalement, aucun nom d'agent.`;

export function creerIa(cle: string, modele: string): Ia {
  const client = new Anthropic({ apiKey: cle });
  return {
    async repondre(texte) {
      const reponse = await client.messages.create({
        model: modele,
        max_tokens: 300,
        system: CONSIGNES,
        messages: [{ role: 'user', content: texte.slice(0, 1000) }],
      });
      const morceaux = reponse.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text);
      return morceaux.join('\n').trim() || null;
    },
  };
}
