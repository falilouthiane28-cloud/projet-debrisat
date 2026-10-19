// Configuration Debrisat
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabaseClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

window.debrisat = {
    supabase: supabaseClient,
    DAKAR_CENTER: { lat: 14.6928, lng: -17.4467 },
    ZOOM_DEFAUT: 12,
    TYPES_OBSTRUCTION: {
        dechets_solides: { label: 'Dechets solides', icone: '🗑️' },
        tas_sable: { label: 'Tas de sable', icone: '⏳' },
        gravats: { label: 'Gravats', icone: '🧱' },
        plastiques: { label: 'Plastiques', icone: '🥤' },
        pneus: { label: 'Pneus', icone: '⭕' },
        encombrants: { label: 'Encombrants', icone: '🛋️' },
        eau_stagnante: { label: 'Eau stagnante', icone: '💧' },
        canal_bouche: { label: 'Canal bouche', icone: '🚫' },
        autre: { label: 'Autre', icone: '📌' }
    },
    STATUTS: {
        en_attente: { label: 'En attente', classe: 'badge-warning' },
        verifie: { label: 'Verifie', classe: 'badge-info' },
        en_cours: { label: 'En cours', classe: 'badge-info' },
        resolu: { label: 'Resolu', classe: 'badge-success' },
        rejete: { label: 'Rejete', classe: 'badge-danger' }
    },
    POINTS: {
        signalement: 10,
        verification: 3,
        signalement_verifie: 5,
        signalement_resolu: 20
    },
    COMMUNES: [
        'Dakar Plateau', 'Medina', 'Fann', 'Grand Dakar', 'Pikine',
        'Guediawaye', 'Keur Massar', 'Parcelles Assainies', 'Grand Yoff',
        'Ouakam', 'Ngor', 'Rufisque', 'Diamaguene', 'Thiaroye'
    ]
};
