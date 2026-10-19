// Couche de donnees : Supabase en production, donnees de demonstration sinon
(() => {
    const D = window.debrisat;
    const CLE_DEMO = 'debrisat-demo-v1';

    // Generateur pseudo-aleatoire a graine fixe : les donnees de demo restent stables d'un chargement a l'autre
    function generateur(graine) {
        return () => {
            graine |= 0;
            graine = (graine + 0x6D2B79F5) | 0;
            let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const LIEUX = {
        'Dakar-Plateau': { lat: 14.6681, lng: -17.4360, poids: 2, lieux: ['Avenue Lamine Guèye', 'Rue Félix Faure', 'Corniche Est, Cap Manuel', 'Boulevard de la République'] },
        'Médina': { lat: 14.6830, lng: -17.4475, poids: 4, lieux: ['Canal IV, Rue 6', 'Avenue Blaise Diagne', 'Marché Tilène', 'Rue 11 x Rue 22'] },
        'Fann-Point E': { lat: 14.6935, lng: -17.4625, poids: 3, lieux: ['Canal IV, Avenue Cheikh Anta Diop', 'Rue de Fann Résidence', 'Point E, Rue A'] },
        'Grand Dakar': { lat: 14.7040, lng: -17.4510, poids: 4, lieux: ['Canal de Grand Dakar, Rue 10', 'Marché Grand Dakar', 'Niary Tally, Rue 15'] },
        'HLM': { lat: 14.7125, lng: -17.4425, poids: 3, lieux: ['Marché HLM 5', 'Canal HLM Grand Médine', 'HLM 4, Rue 23'] },
        'Grand Yoff': { lat: 14.7350, lng: -17.4560, poids: 4, lieux: ['Arafat, canal de Grand Yoff', 'Route du Front de Terre', 'Khar Yalla, Rue 7'] },
        'Parcelles Assainies': { lat: 14.7660, lng: -17.4400, poids: 7, lieux: ['Unité 15, canal principal', 'Rond-point Case-Bi', 'Unité 26, bassin de rétention', 'Unité 10, caniveau Est'] },
        'Ouakam': { lat: 14.7235, lng: -17.4915, poids: 2, lieux: ['Cité Avion', 'Route de la Corniche Ouest', 'Ouakam Village'] },
        'Ngor': { lat: 14.7480, lng: -17.5120, poids: 1, lieux: ['Village de Ngor', 'Route des Almadies'] },
        'Yoff': { lat: 14.7565, lng: -17.4745, poids: 3, lieux: ['Cité Djily Mbaye', 'Route de l\'Aéroport', 'Yoff Tonghor'] },
        'Pikine': { lat: 14.7545, lng: -17.3920, poids: 10, lieux: ['Route des Niayes', 'Marché Zinc', 'Pikine Rue 10', 'Bassin de Pikine Icotaf', 'Guinaw Rail Sud'] },
        'Thiaroye': { lat: 14.7465, lng: -17.3700, poids: 6, lieux: ['Thiaroye Gare', 'Thiaroye-sur-Mer, Route nationale 1', 'Thiaroye Azur'] },
        'Guédiawaye': { lat: 14.7785, lng: -17.3960, poids: 9, lieux: ['Hamo 5', 'Golf Sud, canal de drainage', 'Wakhinane Nimzatt', 'Sam Notaire, Rue 4'] },
        'Keur Massar': { lat: 14.7830, lng: -17.3150, poids: 9, lieux: ['Cité Aliou Sow', 'Jaaxaay, Unité 3', 'Boune, bassin de rétention', 'Keur Massar Village'] },
        'Diamaguène': { lat: 14.7600, lng: -17.3650, poids: 5, lieux: ['Marché de Diamaguène', 'Sicap Mbao, canal', 'Diamaguène Sud'] },
        'Yeumbeul': { lat: 14.7740, lng: -17.3480, poids: 6, lieux: ['Yeumbeul Nord, bassin de rétention', 'Cité Comico', 'Yeumbeul Sud, Rue 12'] },
        'Mbao': { lat: 14.7330, lng: -17.3300, poids: 3, lieux: ['Zone de captage', 'Petit Mbao', 'Grand Mbao, Route nationale'] },
        'Rufisque': { lat: 14.7165, lng: -17.2730, poids: 4, lieux: ['Canal de Rufisque, Keury Kao', 'Route de Bargny', 'Diokoul, Rue 3'] }
    };

    const DESCRIPTIONS = {
        dechets_solides: ['Ordures ménagères accumulées dans le canal à ciel ouvert.', 'Sacs poubelles déposés à l\'entrée de la buse.', 'Dépôt sauvage d\'ordures sur une dizaine de mètres.'],
        tas_sable: ['Le sable apporté par le vent bloque la grille d\'évacuation.', 'Sable de chantier déversé sur le caniveau.', 'Ensablement du canal après la dernière pluie.'],
        gravats: ['Gravats de démolition déversés dans le canal.', 'Briques et ciment cassés obstruent la buse.'],
        plastiques: ['Bouteilles et sachets plastiques bloquent l\'écoulement.', 'Amas de sachets d\'eau coincés sous la dalle.'],
        pneus: ['Pneus usagés coincés sous le pont du canal.', 'Une dizaine de pneus abandonnés dans le bassin.'],
        encombrants: ['Matelas et meubles abandonnés dans le caniveau.', 'Carcasse de réfrigérateur au milieu du canal.'],
        eau_stagnante: ['Eau stagnante depuis la dernière pluie, odeurs fortes.', 'Flaque permanente, moustiques nombreux.'],
        canal_bouche: ['Canal entièrement bouché sur une vingtaine de mètres.', 'Aucun écoulement, l\'eau remonte dans les maisons voisines.'],
        autre: ['Branches et végétation obstruent le passage de l\'eau.', 'Dalle effondrée dans le caniveau.']
    };

    const POIDS_TYPES = { dechets_solides: 24, plastiques: 18, tas_sable: 16, canal_bouche: 12, gravats: 10, eau_stagnante: 8, encombrants: 5, pneus: 4, autre: 3 };

    const CITOYENS = [
        'Aminata Diallo', 'Moussa Ndiaye', 'Fatou Sow', 'Ibrahima Fall', 'Awa Diop', 'Cheikh Mbaye', 'Mariama Ba',
        'Ousmane Sarr', 'Khady Gueye', 'Mamadou Faye', 'Ndeye Seck', 'Abdoulaye Kane', 'Coumba Thiam', 'Babacar Cissé',
        'Aïssatou Niang', 'Pape Diouf', 'Seynabou Camara', 'Modou Touré', 'Rokhaya Sy', 'Lamine Gaye', 'Astou Mbengue',
        'Serigne Lo', 'Bineta Ndour', 'Alioune Badji'
    ];

    const PROFIL_DEMO = {
        id: 'demo-moi',
        nom_complet: 'Ndeye Fatou Diop',
        email: 'ndeye.diop@exemple.sn',
        commune: 'Pikine',
        telephone: '',
        role: 'citoyen',
        points_total: 185,
        nombre_signalements: 14,
        nombre_verifications: 7,
        badges: [
            { id: 'premier_signalement', date: '2026-07-02T10:12:00Z' },
            { id: 'sentinelle_5', date: '2026-08-14T18:40:00Z' },
            { id: 'gardien_10', date: '2026-09-21T09:05:00Z' }
        ],
        created_at: '2026-07-01T08:00:00Z'
    };

    function choisirPondere(alea, poids) {
        const total = Object.values(poids).reduce((a, b) => a + b, 0);
        let r = alea() * total;
        for (const [cle, p] of Object.entries(poids)) {
            r -= p;
            if (r <= 0) return cle;
        }
        return Object.keys(poids)[0];
    }

    function genererSignalements() {
        const alea = generateur(20261019);
        const maintenant = Date.now();
        const poidsCommunes = Object.fromEntries(Object.entries(LIEUX).map(([c, v]) => [c, v.poids]));
        const liste = [];

        for (let i = 0; i < 168; i++) {
            const commune = choisirPondere(alea, poidsCommunes);
            const zone = LIEUX[commune];
            const type = choisirPondere(alea, POIDS_TYPES);
            // Distribution d'age biaisee vers les jours recents (saison des pluies en cours)
            const ageHeures = i < 6 ? 0.5 + alea() * 20 : Math.pow(alea(), 1.25) * 24 * 60;
            const date = new Date(maintenant - ageHeures * 3600000);
            const severiteBase = ['canal_bouche', 'eau_stagnante'].includes(type) ? 3 : 1;
            const severite = Math.min(5, severiteBase + Math.floor(alea() * 3.2));
            const ageJours = ageHeures / 24;
            let statut;
            const r = alea();
            if (ageJours < 1) statut = r < 0.75 ? 'en_attente' : 'verifie';
            else if (ageJours < 7) statut = r < 0.3 ? 'en_attente' : r < 0.55 ? 'verifie' : r < 0.85 ? 'en_cours' : 'resolu';
            else statut = r < 0.08 ? 'en_attente' : r < 0.18 ? 'verifie' : r < 0.32 ? 'en_cours' : r < 0.94 ? 'resolu' : 'rejete';
            const sourceR = alea();
            const source = sourceR < 0.7 ? 'webapp' : sourceR < 0.9 ? 'whatsapp' : 'satellite';
            const auteurIndex = Math.floor(alea() * CITOYENS.length);
            const descriptions = DESCRIPTIONS[type];
            const confirmations = statut === 'en_attente' ? Math.floor(alea() * 3) : 3 + Math.floor(alea() * 9);

            liste.push({
                id: `demo-${String(i + 1).padStart(4, '0')}-${Math.floor(alea() * 0xffffff).toString(16).padStart(6, '0')}`,
                user_id: source === 'satellite' ? null : `citoyen-${auteurIndex}`,
                auteur: source === 'satellite' ? 'Détection Sentinel-2' : CITOYENS[auteurIndex],
                type_obstruction: type,
                description: descriptions[Math.floor(alea() * descriptions.length)],
                severite,
                photo_url: null,
                lat: zone.lat + (alea() - 0.5) * 0.018,
                lng: zone.lng + (alea() - 0.5) * 0.018,
                adresse: zone.lieux[Math.floor(alea() * zone.lieux.length)],
                commune,
                quartier: '',
                statut,
                source,
                nombre_confirmations: confirmations,
                priorite: severite >= 5 ? 'critique' : severite >= 4 ? 'haute' : 'normale',
                created_at: date.toISOString(),
                updated_at: date.toISOString(),
                resolu_at: statut === 'resolu' ? new Date(date.getTime() + (1 + alea() * 4) * 86400000).toISOString() : null
            });
        }
        return liste.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const ZONES_DEMO = [
        { id: 'zone-1', nom: 'Pikine Centre', commune: 'Pikine', score_risque: 85, polygone: [[14.75, -17.39], [14.75, -17.37], [14.77, -17.37], [14.77, -17.39]], historique: '2024 : majeurs — 2026 : sévères' },
        { id: 'zone-2', nom: 'Guédiawaye Nord', commune: 'Guédiawaye', score_risque: 90, polygone: [[14.77, -17.40], [14.77, -17.38], [14.79, -17.38], [14.79, -17.40]], historique: '2024 : majeurs' },
        { id: 'zone-3', nom: 'Keur Massar', commune: 'Keur Massar', score_risque: 88, polygone: [[14.775, -17.325], [14.775, -17.305], [14.795, -17.305], [14.795, -17.325]], historique: '2024 : critiques — 2026 : sévères' },
        { id: 'zone-4', nom: 'Diamaguène', commune: 'Diamaguène', score_risque: 82, polygone: [[14.752, -17.375], [14.752, -17.355], [14.768, -17.355], [14.768, -17.375]], historique: '2026 : majeurs' },
        { id: 'zone-5', nom: 'Parcelles Assainies', commune: 'Parcelles Assainies', score_risque: 70, polygone: [[14.758, -17.45], [14.758, -17.43], [14.775, -17.43], [14.775, -17.45]], historique: '2022 : modérés' },
        { id: 'zone-6', nom: 'Yeumbeul Nord', commune: 'Yeumbeul', score_risque: 78, polygone: [[14.768, -17.356], [14.768, -17.340], [14.782, -17.340], [14.782, -17.356]], historique: '2024 : majeurs' },
        { id: 'zone-7', nom: 'Thiaroye-sur-Mer', commune: 'Thiaroye', score_risque: 64, polygone: [[14.740, -17.378], [14.740, -17.362], [14.752, -17.362], [14.752, -17.378]], historique: '2022 : modérés' }
    ];

    function alertesInitiales() {
        const il = h => new Date(Date.now() - h * 3600000).toISOString();
        return [
            { id: 'alerte-1', zone_id: 'zone-2', type_alerte: 'critique', titre: 'Canal de Golf Sud obstrué', message: 'Obstruction totale signalée par 9 citoyens. Équipe de curage demandée avant les pluies de jeudi.', canal: 'tous', envoyee: true, created_at: il(3) },
            { id: 'alerte-2', zone_id: null, type_alerte: 'danger', titre: 'Fortes pluies attendues', message: '45 à 60 mm prévus sur la région de Dakar dans la nuit de jeudi à vendredi. Évitez les zones basses.', canal: 'tous', envoyee: true, created_at: il(20) },
            { id: 'alerte-3', zone_id: 'zone-3', type_alerte: 'attention', titre: 'Bassin de Boune proche de la saturation', message: 'Le niveau du bassin de rétention a atteint 80 %. Pompage en cours.', canal: 'whatsapp', envoyee: true, created_at: il(46) },
            { id: 'alerte-4', zone_id: 'zone-5', type_alerte: 'info', titre: 'Curage terminé — Unité 15', message: 'Le canal principal de l\'Unité 15 a été curé sur 400 m. Merci aux 12 citoyens qui l\'ont signalé.', canal: 'webapp', envoyee: true, created_at: il(70) }
        ];
    }

    // --- Etat local de la demo (ajouts et modifications persistes dans ce navigateur) ---
    const demo = {
        _base: null,
        etat() {
            return D.utils.lireLocal(CLE_DEMO, null) || { ajouts: [], modifs: {}, alertes: null, profil: null, confirmes: [] };
        },
        sauver(etat) {
            D.utils.ecrireLocal(CLE_DEMO, etat);
        },
        signalements() {
            if (!this._base) this._base = genererSignalements();
            const etat = this.etat();
            return [...etat.ajouts, ...this._base].map(s => ({ ...s, ...(etat.modifs[s.id] || {}) }))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        },
        modifier(id, changements) {
            const etat = this.etat();
            etat.modifs[id] = { ...(etat.modifs[id] || {}), ...changements };
            this.sauver(etat);
        },
        profil() {
            return { ...PROFIL_DEMO, ...(this.etat().profil || {}) };
        }
    };

    function normaliser(s) {
        const coords = D.utils.extraireCoordonnees(s);
        return {
            ...s,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            auteur: s.auteur || s.profils?.nom_complet || (s.source === 'satellite' ? 'Détection Sentinel-2' : 'Citoyen')
        };
    }

    function verifierErreur(error, message) {
        if (error) throw new Error(`${message} (${error.message})`);
    }

    D.donnees = {
        demo,
        normaliser,

        async listerSignalements({ limite = 1000 } = {}) {
            if (D.modeDemo) return demo.signalements().slice(0, limite);
            const { data, error } = await D.supabase
                .from('signalements')
                .select('*, profils!signalements_user_id_fkey(nom_complet)')
                .order('created_at', { ascending: false })
                .limit(limite);
            verifierErreur(error, 'Impossible de charger les signalements');
            return (data || []).map(normaliser);
        },

        async creerSignalement(donnees) {
            if (D.modeDemo) {
                const profil = demo.profil();
                const nouveau = {
                    id: `demo-${Date.now().toString(36)}`,
                    user_id: profil.id,
                    auteur: profil.nom_complet,
                    type_obstruction: donnees.type_obstruction,
                    description: donnees.description || '',
                    severite: donnees.severite,
                    photo_url: donnees.apercuPhoto || null,
                    lat: donnees.lat,
                    lng: donnees.lng,
                    adresse: donnees.adresse || `${donnees.lat.toFixed(5)}, ${donnees.lng.toFixed(5)}`,
                    commune: donnees.commune || 'Dakar',
                    quartier: donnees.quartier || '',
                    statut: 'en_attente',
                    source: 'webapp',
                    nombre_confirmations: 0,
                    priorite: donnees.severite >= 5 ? 'critique' : donnees.severite >= 4 ? 'haute' : 'normale',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    resolu_at: null
                };
                // Les photos en base64 depassent vite le quota localStorage : on ne garde que les petites
                const aStocker = { ...nouveau, photo_url: (nouveau.photo_url || '').length < 400000 ? nouveau.photo_url : null };
                const etat = demo.etat();
                etat.ajouts.unshift(aStocker);
                demo.sauver(etat);
                return nouveau;
            }

            const photoUrl = await D.utils.uploaderPhoto(donnees.photo);
            const { data, error } = await D.supabase
                .from('signalements')
                .insert({
                    user_id: D.auth.utilisateur.id,
                    type_obstruction: donnees.type_obstruction,
                    description: donnees.description,
                    severite: donnees.severite,
                    photo_url: photoUrl,
                    localisation: `SRID=4326;POINT(${donnees.lng} ${donnees.lat})`,
                    adresse: donnees.adresse,
                    commune: donnees.commune,
                    quartier: donnees.quartier,
                    source: 'webapp'
                })
                .select()
                .single();
            verifierErreur(error, 'Le signalement n\'a pas pu être enregistré');
            return normaliser({ ...data, profils: { nom_complet: D.auth.profil?.nom_complet } });
        },

        async confirmerSignalement(id) {
            if (D.modeDemo) {
                const etat = demo.etat();
                if (etat.confirmes.includes(id)) throw new Error('Vous avez déjà confirmé ce signalement.');
                etat.confirmes.push(id);
                demo.sauver(etat);
                const s = demo.signalements().find(x => x.id === id);
                const total = (s?.nombre_confirmations || 0) + 1;
                const changements = { nombre_confirmations: total };
                if (total >= 3 && s?.statut === 'en_attente') Object.assign(changements, { statut: 'verifie', priorite: 'haute' });
                demo.modifier(id, changements);
                return { ...s, ...changements };
            }
            const { error } = await D.supabase
                .from('verifications')
                .insert({ signalement_id: id, user_id: D.auth.utilisateur.id, confirme: true });
            if (error?.code === '23505') throw new Error('Vous avez déjà confirmé ce signalement.');
            verifierErreur(error, 'La confirmation a échoué');
            const { error: errRpc } = await D.supabase.rpc('incrementer_confirmations', { sig_id: id });
            verifierErreur(errRpc, 'La confirmation a échoué');
            const { data } = await D.supabase.from('signalements').select('*').eq('id', id).single();
            return data ? normaliser(data) : null;
        },

        async changerStatut(ids, statut) {
            const liste = Array.isArray(ids) ? ids : [ids];
            const maintenant = new Date().toISOString();
            const changements = { statut, updated_at: maintenant, resolu_at: statut === 'resolu' ? maintenant : null };
            if (D.modeDemo) {
                liste.forEach(id => demo.modifier(id, changements));
                return;
            }
            const { error } = await D.supabase.from('signalements').update(changements).in('id', liste);
            verifierErreur(error, 'Le statut n\'a pas pu être modifié');
        },

        async listerZones() {
            const signalements = await this.listerSignalements();
            const actifs = signalements.filter(s => !['resolu', 'rejete'].includes(s.statut));
            if (D.modeDemo) {
                return ZONES_DEMO.map(z => ({
                    ...z,
                    nombre_signalements_actifs: actifs.filter(s => s.commune === z.commune).length
                }));
            }
            const { data, error } = await D.supabase.from('zones_risque').select('*').order('score_risque', { ascending: false });
            verifierErreur(error, 'Impossible de charger les zones à risque');
            return (data || []).map(z => ({
                ...z,
                polygone: z.zone?.coordinates?.[0]?.map(([lng, lat]) => [lat, lng]) || [],
                historique: (z.historique_inondations || []).map(h => `${h.annee} : ${h.degats}`).join(' — ')
            }));
        },

        async listerAlertes() {
            if (D.modeDemo) {
                const etat = demo.etat();
                return etat.alertes || alertesInitiales();
            }
            const { data, error } = await D.supabase.from('alertes').select('*').order('created_at', { ascending: false }).limit(50);
            verifierErreur(error, 'Impossible de charger les alertes');
            return data || [];
        },

        async creerAlerte(alerte) {
            if (D.modeDemo) {
                const etat = demo.etat();
                const nouvelle = { ...alerte, id: `alerte-${Date.now()}`, envoyee: true, created_at: new Date().toISOString() };
                etat.alertes = [nouvelle, ...(etat.alertes || alertesInitiales())];
                demo.sauver(etat);
                return nouvelle;
            }
            const { data, error } = await D.supabase.from('alertes').insert(alerte).select().single();
            verifierErreur(error, 'L\'alerte n\'a pas pu être créée');
            await D.supabase.functions.invoke('envoyer-alerte', { body: { alerte_id: data.id } }).catch(() => null);
            return data;
        },

        async classement() {
            if (D.modeDemo) {
                const alea = generateur(77);
                const profils = CITOYENS.map((nom, i) => {
                    const signalements = 3 + Math.floor(Math.pow(alea(), 1.8) * 48);
                    return {
                        id: `citoyen-${i}`,
                        nom_complet: nom,
                        commune: Object.keys(LIEUX)[Math.floor(alea() * Object.keys(LIEUX).length)],
                        nombre_signalements: signalements,
                        points_total: signalements * 10 + Math.floor(alea() * 120)
                    };
                });
                profils.push({ ...demo.profil() });
                return profils.sort((a, b) => b.points_total - a.points_total).slice(0, 20);
            }
            const { data, error } = await D.supabase
                .from('profils')
                .select('id, nom_complet, points_total, nombre_signalements, badges, commune')
                .order('points_total', { ascending: false })
                .limit(20);
            verifierErreur(error, 'Impossible de charger le classement');
            return data || [];
        },

        async statistiques() {
            const signalements = await this.listerSignalements();
            return {
                total: signalements.length,
                actifs: signalements.filter(s => !['resolu', 'rejete'].includes(s.statut)).length,
                resolus: signalements.filter(s => s.statut === 'resolu').length,
                citoyens: new Set(signalements.map(s => s.user_id).filter(Boolean)).size,
                communes: new Set(signalements.map(s => s.commune).filter(Boolean)).size
            };
        },

        async historiquePoints() {
            if (D.modeDemo) {
                const il = j => new Date(Date.now() - j * 86400000).toISOString();
                const etat = demo.etat();
                const recents = etat.ajouts.map(s => ({ points: 10, raison: 'signalement', created_at: s.created_at, libelle: `${D.utils.infoType(s.type_obstruction).label} — ${s.adresse}` }));
                return [
                    ...recents,
                    { points: 20, raison: 'signalement_resolu', created_at: il(1), libelle: 'Canal curé — Route des Niayes' },
                    { points: 3, raison: 'verification', created_at: il(2), libelle: 'Confirmation — Marché Zinc' },
                    { points: 10, raison: 'signalement', created_at: il(3), libelle: 'Plastiques — Pikine Rue 10' },
                    { points: 5, raison: 'signalement_verifie', created_at: il(4), libelle: 'Signalement vérifié — Guinaw Rail Sud' },
                    { points: 10, raison: 'signalement', created_at: il(6), libelle: 'Tas de sable — Guinaw Rail Sud' },
                    { points: 3, raison: 'verification', created_at: il(9), libelle: 'Confirmation — Thiaroye Gare' },
                    { points: 20, raison: 'signalement_resolu', created_at: il(12), libelle: 'Bassin dégagé — Pikine Icotaf' }
                ];
            }
            const { data, error } = await D.supabase
                .from('points_historique')
                .select('*')
                .eq('user_id', D.auth.utilisateur?.id)
                .order('created_at', { ascending: false })
                .limit(50);
            verifierErreur(error, 'Impossible de charger l\'historique');
            return data || [];
        },

        async mesSignalements() {
            const tous = await this.listerSignalements();
            const id = D.modeDemo ? demo.profil().id : D.auth.utilisateur?.id;
            const miens = tous.filter(s => s.user_id === id);
            if (D.modeDemo && miens.length < 5) {
                return [...miens, ...tous.filter(s => s.commune === 'Pikine' && s.source === 'webapp').slice(0, 6)];
            }
            return miens;
        }
    };
})();
