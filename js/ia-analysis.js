import { MODE_DEMO, supabase, TYPES_OBSTRUCTION, SEVERITES } from './config.js';
import { enregistrerAnalyse, analyseDemo } from './donnees.js';
import { echapper } from './utils.js';

// L'analyse tourne cote serveur (fonction analyser-image) ; le client la declenche sans l'attendre.
export async function lancerAnalyse(signalement) {
    if (MODE_DEMO) {
        await new Promise(r => setTimeout(r, 1500));
        return enregistrerAnalyse(signalement.id, analyseDemo(signalement));
    }
    if (!signalement.photo_url) return null;
    const { data, error } = await supabase.functions.invoke('analyser-image', {
        body: { signalement_id: signalement.id }
    });
    if (error) {
        console.warn('Analyse IA indisponible', error);
        return null;
    }
    return data?.signalement || null;
}

export function htmlAnalyse(analyse, { avecPhoto = true } = {}) {
    if (!analyse) {
        return `<div class="bloc-ia"><p class="entete-ia"><i class="bi bi-cpu" aria-hidden="true"></i>Analyse automatique</p>
            <p class="texte-sm texte-secondaire">${avecPhoto ? "Analyse de la photo en cours." : "Aucune photo à analyser pour ce signalement."}</p></div>`;
    }
    const type = TYPES_OBSTRUCTION[analyse.type_detecte];
    const sev = SEVERITES[analyse.severite_suggeree];
    const simulee = analyse.modele === 'simulation';
    const confiance = analyse.confiance != null ? `${Math.round(analyse.confiance * 100)} %` : '—';
    return `
        <div class="bloc-ia">
            <p class="entete-ia"><i class="bi bi-cpu" aria-hidden="true"></i>Analyse automatique
                ${simulee ? '<span class="badge badge-demo">Simulée</span>' : ''}</p>
            ${analyse.description_ia ? `<p class="texte-sm">${echapper(analyse.description_ia)}</p>` : ''}
            <dl class="liste-def">
                <dt>Type détecté</dt><dd>${echapper(type?.libelle || analyse.type_detecte || '—')}</dd>
                <dt>Sévérité estimée</dt><dd>${sev ? `${analyse.severite_suggeree}/5 · ${echapper(sev.libelle)}` : '—'}</dd>
                <dt>Volume estimé</dt><dd>${echapper(analyse.volume_estime || '—')}</dd>
                <dt>Risque d'inondation</dt><dd>${echapper(analyse.risque_inondation || '—')}</dd>
                <dt>Confiance</dt><dd class="mono">${confiance}</dd>
            </dl>
        </div>`;
}
