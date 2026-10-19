// Analyse IA des images Debrisat
window.debrisat.iaAnalyse = {
    async analyserImage(signalementId, photoUrl) {
        try {
            const { data, error } = await window.debrisat.supabase.functions.invoke('analyser-image', {
                body: { signalement_id: signalementId, photo_url: photoUrl }
            });
            if (error) throw error;

            if (data?.analyse) {
                await window.debrisat.supabase
                    .from('signalements')
                    .update({
                        photo_analyse: data.analyse,
                        severite: data.analyse.severite_suggeree || undefined
                    })
                    .eq('id', signalementId);
            }
            return data;
        } catch(e) {
            console.error('Erreur analyse IA:', e);
            return null;
        }
    }
};
