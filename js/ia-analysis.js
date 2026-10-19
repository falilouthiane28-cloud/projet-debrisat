// Analyse IA des photos (Edge Function analyser-image : Claude Vision)
window.debrisat.iaAnalyse = {
    async analyserSignalement(signalement) {
        const D = window.debrisat;
        if (D.modeDemo || !signalement?.photo_url) return null;
        try {
            const { data, error } = await D.supabase.functions.invoke('analyser-image', {
                body: { signalement_id: signalement.id, photo_url: signalement.photo_url }
            });
            if (error) throw error;
            const analyse = data?.analyse;
            if (!analyse || analyse.type_detecte === 'non_analyse') return null;

            const type = D.TYPES_OBSTRUCTION[analyse.type_detecte]?.label || analyse.type_detecte;
            D.notifications.toast(
                `Type détecté : ${type}. Sévérité estimée : ${analyse.severite_suggeree}/5.`,
                'info', 6000, 'Analyse IA terminée'
            );
            return analyse;
        } catch (e) {
            console.warn('Analyse IA indisponible :', e);
            return null;
        }
    }
};
