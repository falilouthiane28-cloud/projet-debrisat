// Donnees de demonstration : generees de facon deterministe pour que la demo soit stable d'un chargement a l'autre.

function generateur(graine) {
    let a = graine >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const LIEUX = [
    { commune: 'Pikine', centre: [14.7552, -17.3925], rayon: 0.007, poids: 9, quartiers: ['Pikine Ancien', 'Icotaf', 'Technopole', 'Bountou Pikine'] },
    { commune: 'Guédiawaye', centre: [14.7745, -17.3965], rayon: 0.007, poids: 9, quartiers: ['Médina Gounass', 'Wakhinane Nimzatt', 'Ndiarème Limamoulaye', 'Golf Sud', 'Sam Notaire'] },
    { commune: 'Keur Massar', centre: [14.7835, -17.3135], rayon: 0.008, poids: 9, quartiers: ['Jaxaay', 'Unité 3', 'Boune', 'Aladji Pathé'] },
    { commune: 'Thiaroye', centre: [14.7520, -17.3600], rayon: 0.005, poids: 5, quartiers: ['Thiaroye Gare', 'Thiaroye Azur'] },
    { commune: 'Diamaguène Sicap Mbao', centre: [14.7610, -17.3720], rayon: 0.005, poids: 5, quartiers: ['Diamaguène', 'Sicap Mbao', 'Fass Mbao'] },
    { commune: 'Yeumbeul', centre: [14.7705, -17.3490], rayon: 0.006, poids: 6, quartiers: ['Yeumbeul Nord', 'Yeumbeul Sud', 'Darou Salam'] },
    { commune: 'Parcelles Assainies', centre: [14.7625, -17.4385], rayon: 0.006, poids: 5, quartiers: ['Unité 15', 'Unité 22', 'Unité 26'] },
    { commune: 'Guinaw Rails', centre: [14.7445, -17.4005], rayon: 0.004, poids: 4, quartiers: ['Guinaw Rails Nord', 'Guinaw Rails Sud'] },
    { commune: 'Malika', centre: [14.7880, -17.3380], rayon: 0.005, poids: 3, quartiers: ['Malika Sonatel', 'Mbeubeuss'] },
    { commune: 'Grand Yoff', centre: [14.7355, -17.4590], rayon: 0.004, poids: 3, quartiers: ['Arafat', 'Khar Yalla', 'Cité Millionnaire'] },
    { commune: 'Médina', centre: [14.6895, -17.4495], rayon: 0.003, poids: 3, quartiers: ['Gueule Tapée', 'Fass', 'Rebeuss'] },
    { commune: 'Grand Dakar', centre: [14.7085, -17.4555], rayon: 0.003, poids: 2, quartiers: ['Niary Tally', 'Sicap Baobab'] },
    { commune: 'Hann Bel-Air', centre: [14.7210, -17.4325], rayon: 0.004, poids: 2, quartiers: ['Hann Maristes', 'Bel-Air'] },
    { commune: 'Rufisque', centre: [14.7175, -17.2750], rayon: 0.004, poids: 2, quartiers: ['Diokoul', 'Colobane', 'Keury Souf'] }
];

const DESCRIPTIONS = {
    dechets_solides: [
        "Tas d'ordures ménagères déversé dans le canal, l'eau ne s'écoule plus vers le bassin.",
        'Dépôt sauvage de sacs poubelles devant la bouche d\'égout depuis plus d\'une semaine.',
        'Ordures accumulées sur une vingtaine de mètres le long du caniveau principal.'
    ],
    tas_sable: [
        "Sable apporté par le vent qui recouvre complètement la grille d'évacuation.",
        'Tas de sable de chantier laissé sur la chaussée, il glisse dans le caniveau à chaque pluie.',
        'Le caniveau est ensablé sur toute sa longueur, impossible de voir le fond.'
    ],
    canal_bouche: [
        "Canal à ciel ouvert entièrement bouché au niveau du pont, l'eau remonte déjà.",
        "Buse sous la route bouchée, l'eau contourne et inonde la ruelle.",
        'Ouvrage de drainage obstrué par un mélange de vase et de déchets.'
    ],
    gravats: [
        'Gravats de démolition déposés dans le lit du canal.',
        'Blocs de béton et briques cassées qui bloquent le passage de l\'eau.'
    ],
    plastiques: [
        "Bouteilles et sachets plastiques coincés contre la grille, l'eau déborde.",
        'Amas de sachets d\'eau vides qui forment un bouchon flottant.'
    ],
    pneus: [
        'Une dizaine de pneus usagés jetés dans le canal.',
        'Pneus empilés à la sortie du collecteur, risque de bouchon total.'
    ],
    encombrants: [
        'Vieux matelas et carcasse de réfrigérateur dans le caniveau.',
        'Meubles cassés abandonnés sur la grille d\'évacuation.'
    ],
    eau_stagnante: [
        "Eau stagnante depuis la dernière pluie, odeur forte et moustiques.",
        'Grande flaque permanente au carrefour, les enfants passent dedans pour aller à l\'école.'
    ],
    autre: [
        'Branches et troncs tombés dans le canal après le coup de vent.',
        'Effondrement partiel de la paroi du canal, la terre bloque l\'écoulement.'
    ]
};

const POIDS_TYPES = [
    ['dechets_solides', 22], ['tas_sable', 16], ['canal_bouche', 14], ['plastiques', 13],
    ['eau_stagnante', 10], ['gravats', 8], ['encombrants', 6], ['pneus', 6], ['autre', 5]
];

const POIDS_STATUTS = [['en_attente', 30], ['verifie', 18], ['en_cours', 20], ['resolu', 27], ['rejete', 5]];

const NOMS = [
    'Aminata Diallo', 'Moussa Ndiaye', 'Fatou Sow', 'Ibrahima Fall', 'Awa Diop', 'Cheikh Mbaye',
    'Khady Sarr', 'Ousmane Guèye', 'Mariama Ba', 'Abdoulaye Faye', 'Ndèye Fatou Cissé', 'Pape Sy',
    'Seynabou Thiam', 'Mamadou Kane', 'Coumba Ndao', 'Babacar Seck', 'Aïssatou Dieng', 'Modou Lô',
    'Rokhaya Niang', 'Serigne Mboup', 'Astou Gaye', 'Lamine Diatta'
];

function tirer(alea, poids) {
    const total = poids.reduce((s, [, p]) => s + p, 0);
    let r = alea() * total;
    for (const [valeur, p] of poids) {
        r -= p;
        if (r <= 0) return valeur;
    }
    return poids[0][0];
}

function uuid(alea) {
    const h = () => Math.floor(alea() * 16).toString(16);
    const bloc = n => Array.from({ length: n }, h).join('');
    return `${bloc(8)}-${bloc(4)}-4${bloc(3)}-a${bloc(3)}-${bloc(12)}`;
}

export const ID_DEMO = '00000000-0000-4000-a000-00000000d3e0';

export function genererDonnees() {
    const alea = generateur(20261018);
    const maintenant = Date.now();
    const HEURE = 3600 * 1000;

    const profils = NOMS.map((nom, i) => ({
        id: uuid(alea),
        nom_complet: nom,
        commune: LIEUX[i % LIEUX.length].commune,
        role: i === 3 ? 'agent_municipal' : 'citoyen',
        points_total: 0,
        nombre_signalements: 0,
        nombre_verifications: 0,
        badges: [],
        created_at: new Date(maintenant - (60 + i * 3) * 24 * HEURE).toISOString()
    }));

    const moi = {
        id: ID_DEMO,
        nom_complet: 'Compte démo',
        telephone: null,
        commune: 'Pikine',
        role: 'admin',
        compte_actif: true,
        points_total: 0,
        nombre_signalements: 0,
        nombre_verifications: 0,
        badges: [],
        created_at: new Date(maintenant - 40 * 24 * HEURE).toISOString()
    };
    profils.push(moi);

    const totalPoidsLieux = LIEUX.reduce((s, l) => s + l.poids, 0);
    const signalements = [];
    const historique = [];

    // Environ trois mois d'historique, un peu plus dense recemment (debut de saison des pluies)
    for (let i = 0; i < 92; i++) {
        let r = alea() * totalPoidsLieux;
        const lieu = LIEUX.find(l => (r -= l.poids) <= 0) || LIEUX[0];
        const type = tirer(alea, POIDS_TYPES);
        const ageHeures = Math.pow(alea(), 1.2) * 96 * 24 + 0.5;
        const creeLe = maintenant - ageHeures * HEURE;
        let statut = tirer(alea, POIDS_STATUTS);
        if (ageHeures < 10 && statut === 'resolu') statut = 'en_attente';
        // Les signalements anciens ont eu le temps d'etre traites
        if (ageHeures > 40 * 24 && statut === 'en_attente') statut = alea() < 0.7 ? 'resolu' : 'en_cours';
        const severite = Math.max(1, Math.min(5, Math.round(1 + alea() * 4.4 + (type === 'canal_bouche' ? 0.8 : 0))));
        const auteur = i % 9 === 4 ? moi : profils[Math.floor(alea() * NOMS.length)];
        const descriptions = DESCRIPTIONS[type];
        const confirmations = statut === 'en_attente' ? Math.floor(alea() * 3) : statut === 'rejete' ? Math.floor(alea() * 2) : 3 + Math.floor(alea() * 5);
        const infirmations = statut === 'rejete' ? 3 + Math.floor(alea() * 2) : Math.floor(alea() * 2);
        const source = alea() < 0.24 ? 'whatsapp' : alea() < 0.06 ? 'satellite' : 'webapp';
        const angle = alea() * Math.PI * 2;
        const distance = Math.sqrt(alea()) * lieu.rayon;
        const resoluLe = statut === 'resolu' ? Math.min(maintenant - HEURE, creeLe + (18 + alea() * 130) * HEURE) : null;

        const s = {
            id: uuid(alea),
            user_id: source === 'satellite' ? null : auteur.id,
            type_obstruction: type,
            description: alea() < 0.85 ? descriptions[Math.floor(alea() * descriptions.length)] : '',
            severite,
            photo_url: null,
            photo_analyse: alea() < 0.55 ? analyseFictive(type, severite, alea) : null,
            lat: +(lieu.centre[0] + Math.sin(angle) * distance).toFixed(6),
            lng: +(lieu.centre[1] + Math.cos(angle) * distance * 1.1).toFixed(6),
            adresse: '',
            commune: lieu.commune,
            quartier: lieu.quartiers[Math.floor(alea() * lieu.quartiers.length)],
            statut,
            source,
            nombre_confirmations: confirmations,
            nombre_infirmations: infirmations,
            priorite: severite >= 5 ? 'critique' : severite >= 4 || confirmations >= 3 ? 'haute' : severite <= 1 ? 'basse' : 'normale',
            assigne_a: statut === 'en_cours' ? profils[3].id : null,
            resolu_at: resoluLe ? new Date(resoluLe).toISOString() : null,
            created_at: new Date(creeLe).toISOString(),
            updated_at: new Date(resoluLe || creeLe).toISOString()
        };
        s.adresse = `${s.quartier}, ${s.commune}, Dakar`;
        signalements.push(s);

        if (s.user_id) {
            const auteurProfil = profils.find(p => p.id === s.user_id);
            auteurProfil.nombre_signalements++;
            historique.push({ user_id: s.user_id, points: 10, raison: 'signalement', signalement_id: s.id, created_at: s.created_at });
            if (['verifie', 'en_cours', 'resolu'].includes(statut)) {
                historique.push({ user_id: s.user_id, points: 5, raison: 'signalement_verifie', signalement_id: s.id, created_at: new Date(creeLe + 6 * HEURE).toISOString() });
            }
            if (statut === 'resolu') {
                historique.push({ user_id: s.user_id, points: 20, raison: 'signalement_resolu', signalement_id: s.id, created_at: s.resolu_at });
            }
        }
    }

    // Verifications attribuees a des citoyens au hasard
    const verifications = [];
    for (const s of signalements) {
        const votants = new Set();
        const total = s.nombre_confirmations + s.nombre_infirmations;
        for (let k = 0; k < total; k++) {
            const p = profils[Math.floor(alea() * NOMS.length)];
            if (p.id === s.user_id || votants.has(p.id)) continue;
            votants.add(p.id);
            const date = new Date(new Date(s.created_at).getTime() + (1 + k * 2) * HEURE).toISOString();
            verifications.push({ signalement_id: s.id, user_id: p.id, confirme: k < s.nombre_confirmations, created_at: date });
            p.nombre_verifications++;
            historique.push({ user_id: p.id, points: 3, raison: 'verification', signalement_id: s.id, created_at: date });
        }
    }

    for (const p of profils) {
        p.points_total = historique.filter(h => h.user_id === p.id).reduce((s, h) => s + h.points, 0);
    }

    const zones = [
        { nom: 'Pikine Centre', commune: 'Pikine', bbox: [-17.39, 14.75, -17.37, 14.77], historique: [{ annee: 2009, degats: 'majeurs' }, { annee: 2012, degats: 'majeurs' }, { annee: 2022, degats: 'sévères' }] },
        { nom: 'Guédiawaye Nord', commune: 'Guédiawaye', bbox: [-17.40, 14.77, -17.38, 14.79], historique: [{ annee: 2009, degats: 'majeurs' }, { annee: 2022, degats: 'majeurs' }] },
        { nom: 'Keur Massar', commune: 'Keur Massar', bbox: [-17.32, 14.78, -17.30, 14.80], historique: [{ annee: 2012, degats: 'critiques' }, { annee: 2022, degats: 'critiques' }] },
        { nom: 'Diamaguène', commune: 'Diamaguène Sicap Mbao', bbox: [-17.38, 14.76, -17.36, 14.78], historique: [{ annee: 2022, degats: 'majeurs' }] },
        { nom: 'Parcelles Assainies', commune: 'Parcelles Assainies', bbox: [-17.44, 14.76, -17.42, 14.78], historique: [] }
    ].map((z, i) => {
        const [o, s, e, n] = z.bbox;
        const actifs = signalements.filter(x => ['en_attente', 'verifie', 'en_cours'].includes(x.statut) && x.lat >= s && x.lat <= n && x.lng >= o && x.lng <= e);
        const score = Math.min(100, Math.round(42 + z.historique.length * 9 + actifs.reduce((t, x) => t + x.severite, 0) * 1.6));
        return {
            id: `zone-${i + 1}`,
            nom: z.nom,
            commune: z.commune,
            coordonnees: [[s, o], [s, e], [n, e], [n, o]],
            score_risque: score,
            nombre_signalements_actifs: actifs.length,
            historique_inondations: z.historique,
            dernier_calcul: new Date(maintenant - 2 * HEURE).toISOString()
        };
    });

    const alertes = [
        { type_alerte: 'critique', titre: 'Fortes pluies attendues ce soir', message: "Cumuls de 40 à 70 mm prévus entre 18 h et minuit. Évitez les axes inondables de Keur Massar et Pikine, et ne traversez pas les zones d'eau stagnante.", canal: 'tous', zone_id: 'zone-3', age: 3 },
        { type_alerte: 'danger', titre: 'Canal de Wakhinane presque obstrué', message: "Une équipe d'intervention est dépêchée demain matin. Merci de ne plus déposer de déchets aux abords du canal.", canal: 'whatsapp', zone_id: 'zone-2', age: 20 },
        { type_alerte: 'attention', titre: 'Opération de curage à Pikine Centre', message: 'Curage des caniveaux de la zone Icotaf samedi de 8 h à 13 h. Circulation perturbée.', canal: 'webapp', zone_id: 'zone-1', age: 46 },
        { type_alerte: 'info', titre: '12 signalements résolus cette semaine', message: 'Merci aux citoyens de Guédiawaye et Yeumbeul pour leurs signalements vérifiés.', canal: 'webapp', zone_id: null, age: 90 }
    ].map((a, i) => ({ id: `alerte-${i + 1}`, envoyee: true, ...a, created_at: new Date(maintenant - a.age * HEURE).toISOString() }));

    const badges = [
        { id: 'premier_signalement', nom: 'Premier pas', description: 'Premier signalement effectué', icone: 'bi-flag', condition_signalements: 1, condition_verifications: null },
        { id: 'sentinelle_5', nom: 'Sentinelle', description: '5 signalements effectués', icone: 'bi-eye', condition_signalements: 5, condition_verifications: null },
        { id: 'gardien_10', nom: 'Gardien du quartier', description: '10 signalements effectués', icone: 'bi-shield-check', condition_signalements: 10, condition_verifications: null },
        { id: 'protecteur_25', nom: 'Protecteur de Dakar', description: '25 signalements effectués', icone: 'bi-trophy', condition_signalements: 25, condition_verifications: null },
        { id: 'champion_50', nom: 'Champion anti-inondation', description: '50 signalements effectués', icone: 'bi-star', condition_signalements: 50, condition_verifications: null },
        { id: 'verificateur_10', nom: 'Vérificateur', description: '10 vérifications effectuées', icone: 'bi-patch-check', condition_signalements: null, condition_verifications: 10 }
    ];

    for (const p of profils) p.badges = badgesMerites(p, badges);

    return { profils, signalements, verifications, historique, zones, alertes, badges };
}

export function badgesMerites(profil, badges) {
    return badges
        .filter(b => (b.condition_signalements && profil.nombre_signalements >= b.condition_signalements)
            || (b.condition_verifications && profil.nombre_verifications >= b.condition_verifications))
        .map(b => b.id);
}

export function analyseFictive(type, severite, alea = Math.random) {
    const volumes = ['moins de 1 m³', 'environ 1 à 3 m³', 'environ 3 à 8 m³', 'plus de 8 m³'];
    const sev = Math.max(1, Math.min(5, severite + (alea() < 0.3 ? (alea() < 0.5 ? -1 : 1) : 0)));
    return {
        type_detecte: type,
        severite_suggeree: sev,
        confiance: +(0.62 + alea() * 0.33).toFixed(2),
        volume_estime: volumes[Math.min(3, Math.floor(sev / 1.4))],
        proximite_drainage: sev >= 3 ? 'directe' : 'proche',
        risque_inondation: sev >= 4 ? 'élevé' : sev >= 3 ? 'modéré' : 'faible',
        description_ia: sev >= 4
            ? "L'obstruction couvre la majeure partie de la section du canal. Un débordement est probable dès une pluie modérée."
            : sev >= 3
                ? "Obstruction partielle de l'ouvrage : le débit est réduit mais l'eau s'écoule encore."
                : "Accumulation limitée, sans effet notable sur l'écoulement pour l'instant.",
        modele: 'simulation'
    };
}

const MODELES_NOUVEAUX = [
    { lieu: 0, type: 'dechets_solides', severite: 4 },
    { lieu: 2, type: 'canal_bouche', severite: 5 },
    { lieu: 1, type: 'plastiques', severite: 3 },
    { lieu: 5, type: 'tas_sable', severite: 3 },
    { lieu: 3, type: 'eau_stagnante', severite: 4 }
];

// Fabrique un signalement realiste pour simuler l'arrivee de donnees en direct
export function signalementSimule(index, profils) {
    const alea = generateur(9000 + index);
    const modele = MODELES_NOUVEAUX[index % MODELES_NOUVEAUX.length];
    const lieu = LIEUX[modele.lieu];
    const auteur = profils[Math.floor(alea() * (profils.length - 1))];
    const quartier = lieu.quartiers[Math.floor(alea() * lieu.quartiers.length)];
    const descriptions = DESCRIPTIONS[modele.type];
    const maintenant = new Date().toISOString();
    return {
        id: uuid(alea),
        user_id: auteur.id,
        type_obstruction: modele.type,
        description: descriptions[Math.floor(alea() * descriptions.length)],
        severite: modele.severite,
        photo_url: null,
        photo_analyse: null,
        lat: +(lieu.centre[0] + (alea() - 0.5) * lieu.rayon * 1.4).toFixed(6),
        lng: +(lieu.centre[1] + (alea() - 0.5) * lieu.rayon * 1.4).toFixed(6),
        adresse: `${quartier}, ${lieu.commune}, Dakar`,
        commune: lieu.commune,
        quartier,
        statut: 'en_attente',
        source: alea() < 0.4 ? 'whatsapp' : 'webapp',
        nombre_confirmations: 0,
        nombre_infirmations: 0,
        priorite: modele.severite >= 5 ? 'critique' : 'haute',
        assigne_a: null,
        resolu_at: null,
        created_at: maintenant,
        updated_at: maintenant
    };
}
