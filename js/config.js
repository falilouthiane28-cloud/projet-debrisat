// Renseigner ces deux valeurs active le mode Supabase ; sinon l'app tourne en mode demo.
export const SUPABASE_URL = 'https://bezkifetuusykmmwwiad.supabase.co';
// Cle publiable (sb_publishable_...) : publique par conception, la securite repose sur la RLS
export const SUPABASE_ANON_KEY = 'sb_publishable_RJDBYG0hgdsxNnJtgoDXlg_Ymy9xSAW';

const configure = /^https:\/\//.test(SUPABASE_URL) && !SUPABASE_ANON_KEY.startsWith('YOUR_');

export const MODE_DEMO = !configure || !window.supabase;

export const supabase = MODE_DEMO
    ? null
    : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
    });

export const BUCKET_PHOTOS = 'photos';

export const DAKAR_CENTRE = [14.6928, -17.4467];
export const ZOOM_DEFAUT = 12;
// Rectangle de la region de Dakar, pour borner la recherche d'adresses
export const LIMITES_DAKAR = { ouest: -17.55, sud: 14.62, est: -17.15, nord: 14.86 };

export const TYPES_OBSTRUCTION = {
    dechets_solides: { libelle: 'Déchets solides', icone: 'bi-trash3' },
    tas_sable: { libelle: 'Tas de sable', icone: 'bi-moisture' },
    canal_bouche: { libelle: 'Canal bouché', icone: 'bi-water' },
    gravats: { libelle: 'Gravats', icone: 'bi-bricks' },
    plastiques: { libelle: 'Plastiques', icone: 'bi-bag' },
    pneus: { libelle: 'Pneus', icone: 'bi-record-circle' },
    encombrants: { libelle: 'Encombrants', icone: 'bi-box-seam' },
    eau_stagnante: { libelle: 'Eau stagnante', icone: 'bi-droplet-half' },
    autre: { libelle: 'Autre', icone: 'bi-three-dots' }
};

export const STATUTS = {
    en_attente: { libelle: 'En attente', icone: 'bi-hourglass-split', classe: 'badge-warning', couleur: 'var(--accent-warning)' },
    verifie: { libelle: 'Vérifié', icone: 'bi-check-circle', classe: 'badge-neutral', couleur: 'var(--color-bright)' },
    en_cours: { libelle: 'En cours', icone: 'bi-arrow-repeat', classe: 'badge-info', couleur: 'var(--accent-info)' },
    resolu: { libelle: 'Résolu', icone: 'bi-check-lg', classe: 'badge-success', couleur: 'var(--accent-success)' },
    rejete: { libelle: 'Rejeté', icone: 'bi-x-circle', classe: 'badge-danger', couleur: 'var(--accent-danger)' }
};

export const STATUTS_ACTIFS = ['en_attente', 'verifie', 'en_cours'];

export const SEVERITES = {
    1: { libelle: 'Mineure', couleur: '#4ADE80', explication: "Quelques déchets épars, l'écoulement n'est pas gêné." },
    2: { libelle: 'Faible', couleur: '#A3E635', explication: "Accumulation visible, l'eau circule encore normalement." },
    3: { libelle: 'Modérée', couleur: '#FACC15', explication: 'Obstruction partielle : le débit du canal est réduit.' },
    4: { libelle: 'Élevée', couleur: '#FB923C', explication: 'Canal presque bouché, débordement probable à la prochaine pluie.' },
    5: { libelle: 'Critique', couleur: '#EF4444', explication: 'Canal totalement obstrué ou eau déjà stagnante près des habitations.' }
};

export const PRIORITES = {
    basse: 'Basse', normale: 'Normale', haute: 'Haute', critique: 'Critique'
};

export const TYPES_ALERTE = {
    info: { libelle: 'Information', icone: 'bi-info-circle', classe: 'badge-info' },
    attention: { libelle: 'Attention', icone: 'bi-exclamation-triangle', classe: 'badge-warning' },
    danger: { libelle: 'Danger', icone: 'bi-exclamation-triangle', classe: 'badge-danger' },
    critique: { libelle: 'Critique', icone: 'bi-exclamation-octagon', classe: 'badge-danger' }
};

export const CANAUX_ALERTE = {
    webapp: 'Application', sms: 'SMS', whatsapp: 'WhatsApp', tous: 'Tous les canaux'
};

// Les points sont attribues cote serveur (declencheurs SQL) ; ces valeurs servent a l'affichage.
export const POINTS = {
    signalement: 10,
    verification: 3,
    signalement_verifie: 5,
    signalement_resolu: 20
};

export const SEUIL_VERIFICATION = 3;

export const COMMUNES = [
    'Dakar-Plateau', 'Médina', 'Grand Dakar', 'Grand Yoff', 'Parcelles Assainies',
    'Hann Bel-Air', 'Pikine', 'Thiaroye', 'Diamaguène Sicap Mbao', 'Guinaw Rails',
    'Yeumbeul', 'Malika', 'Keur Massar', 'Guédiawaye', 'Rufisque'
];

export const ROLES = {
    citoyen: 'Citoyen',
    agent_municipal: 'Agent municipal',
    admin: 'Administrateur'
};

export const ROLES_AUTORITE = ['agent_municipal', 'admin'];

// Page d'arrivee de chaque role apres connexion
export const ACCUEIL_ROLE = { citoyen: 'app.html', agent_municipal: 'dashboard.html', admin: 'admin.html' };

export const RAYON_PROXIMITE_KM = 1;
