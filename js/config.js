// Configuration Debrisat
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Numero WhatsApp du bot Twilio, format international sans "+" (ex. 221771234567). Vide = lien masque.
const NUMERO_WHATSAPP = '';

const modeDemo = SUPABASE_URL.startsWith('YOUR_') || !window.supabase;

window.debrisat = Object.assign(window.debrisat || {}, {
    supabase: modeDemo ? null : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    modeDemo,
    NUMERO_WHATSAPP,

    DAKAR_CENTRE: { lat: 14.7167, lng: -17.4100 },
    ZOOM_DEFAUT: 12,

    TUILES: {
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    },

    TYPES_OBSTRUCTION: {
        dechets_solides: { label: 'Déchets solides', icone: 'bi-trash3' },
        tas_sable: { label: 'Tas de sable', icone: 'bi-moisture' },
        gravats: { label: 'Gravats', icone: 'bi-bricks' },
        plastiques: { label: 'Plastiques', icone: 'bi-bag' },
        pneus: { label: 'Pneus', icone: 'bi-life-preserver' },
        encombrants: { label: 'Encombrants', icone: 'bi-box-seam' },
        eau_stagnante: { label: 'Eau stagnante', icone: 'bi-droplet-half' },
        canal_bouche: { label: 'Canal bouché', icone: 'bi-water' },
        autre: { label: 'Autre', icone: 'bi-three-dots' }
    },

    STATUTS: {
        en_attente: { label: 'En attente', classe: 'badge-warning', icone: 'bi-hourglass-split', couleur: 'var(--accent-warning)' },
        verifie: { label: 'Vérifié', classe: 'badge-neutral', icone: 'bi-check-circle', couleur: 'var(--color-bright)' },
        en_cours: { label: 'En cours', classe: 'badge-info', icone: 'bi-arrow-repeat', couleur: 'var(--accent-info)' },
        resolu: { label: 'Résolu', classe: 'badge-success', icone: 'bi-check-lg', couleur: 'var(--accent-success)' },
        rejete: { label: 'Rejeté', classe: 'badge-danger', icone: 'bi-x-circle', couleur: 'var(--accent-danger)' }
    },

    SEVERITES: {
        1: { label: 'Mineure', description: 'Quelques déchets, l\'eau s\'écoule normalement.', couleur: '#4ADE80' },
        2: { label: 'Faible', description: 'Accumulation visible, écoulement légèrement ralenti.', couleur: '#A3E635' },
        3: { label: 'Modérée', description: 'Obstruction partielle, risque en cas de forte pluie.', couleur: '#FACC15' },
        4: { label: 'Grave', description: 'Canal majoritairement bouché, débordement probable.', couleur: '#FB923C' },
        5: { label: 'Critique', description: 'Canal totalement obstrué, inondation imminente.', couleur: '#EF4444' }
    },

    POINTS: {
        signalement: 10,
        verification: 3,
        signalement_verifie: 5,
        signalement_resolu: 20
    },

    BADGES: [
        { id: 'premier_signalement', nom: 'Premier pas', description: 'Premier signalement effectué', icone: 'bi-flag', condition_signalements: 1 },
        { id: 'sentinelle_5', nom: 'Sentinelle', description: '5 signalements validés', icone: 'bi-eye', condition_signalements: 5 },
        { id: 'gardien_10', nom: 'Gardien du quartier', description: '10 signalements validés', icone: 'bi-shield-check', condition_signalements: 10 },
        { id: 'protecteur_25', nom: 'Protecteur de Dakar', description: '25 signalements validés', icone: 'bi-trophy', condition_signalements: 25 },
        { id: 'champion_50', nom: 'Champion anti-inondation', description: '50 signalements validés', icone: 'bi-star', condition_signalements: 50 },
        { id: 'verificateur_10', nom: 'Vérificateur', description: '10 vérifications effectuées', icone: 'bi-patch-check', condition_verifications: 10 }
    ],

    COMMUNES: [
        'Dakar-Plateau', 'Médina', 'Fann-Point E', 'Grand Dakar', 'HLM', 'Grand Yoff',
        'Parcelles Assainies', 'Ouakam', 'Ngor', 'Yoff', 'Pikine', 'Thiaroye',
        'Guédiawaye', 'Keur Massar', 'Diamaguène', 'Yeumbeul', 'Mbao', 'Rufisque'
    ]
});
