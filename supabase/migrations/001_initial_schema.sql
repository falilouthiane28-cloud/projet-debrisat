-- Schema initial Debrisat
-- Extension PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Profils utilisateurs
CREATE TABLE public.profils (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    nom_complet TEXT NOT NULL,
    telephone TEXT,
    commune TEXT,
    role TEXT DEFAULT 'citoyen' CHECK (role IN ('citoyen', 'agent_municipal', 'autorite', 'admin')),
    points_total INTEGER DEFAULT 0,
    badges JSONB DEFAULT '[]'::jsonb,
    avatar_url TEXT,
    nombre_signalements INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Signalements
CREATE TABLE public.signalements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profils(id),
    type_obstruction TEXT NOT NULL CHECK (type_obstruction IN (
        'dechets_solides', 'tas_sable', 'gravats', 'plastiques',
        'pneus', 'encombrants', 'eau_stagnante', 'canal_bouche', 'autre'
    )),
    description TEXT,
    severite INTEGER DEFAULT 1 CHECK (severite BETWEEN 1 AND 5),
    photo_url TEXT NOT NULL,
    photo_analyse JSONB,
    localisation GEOGRAPHY(POINT, 4326) NOT NULL,
    adresse TEXT,
    commune TEXT,
    quartier TEXT,
    statut TEXT DEFAULT 'en_attente' CHECK (statut IN (
        'en_attente', 'verifie', 'en_cours', 'resolu', 'rejete'
    )),
    source TEXT DEFAULT 'webapp' CHECK (source IN ('webapp', 'whatsapp', 'satellite')),
    nombre_confirmations INTEGER DEFAULT 0,
    priorite TEXT DEFAULT 'normale' CHECK (priorite IN ('basse', 'normale', 'haute', 'critique')),
    assigne_a UUID REFERENCES public.profils(id),
    resolu_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_signalements_localisation ON public.signalements USING GIST (localisation);
CREATE INDEX idx_signalements_statut ON public.signalements (statut);
CREATE INDEX idx_signalements_commune ON public.signalements (commune);
CREATE INDEX idx_signalements_created ON public.signalements (created_at DESC);

-- Verifications communautaires
CREATE TABLE public.verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    signalement_id UUID REFERENCES public.signalements(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profils(id),
    confirme BOOLEAN NOT NULL,
    commentaire TEXT,
    photo_verification TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(signalement_id, user_id)
);

-- Points historique
CREATE TABLE public.points_historique (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profils(id),
    points INTEGER NOT NULL,
    raison TEXT NOT NULL,
    signalement_id UUID REFERENCES public.signalements(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Badges
CREATE TABLE public.badges (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    description TEXT NOT NULL,
    icone TEXT NOT NULL,
    condition_points INTEGER,
    condition_signalements INTEGER
);

-- Zones a risque
CREATE TABLE public.zones_risque (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nom TEXT NOT NULL,
    commune TEXT,
    zone GEOGRAPHY(POLYGON, 4326) NOT NULL,
    score_risque NUMERIC DEFAULT 0 CHECK (score_risque BETWEEN 0 AND 100),
    nombre_signalements_actifs INTEGER DEFAULT 0,
    dernier_calcul TIMESTAMPTZ DEFAULT now(),
    historique_inondations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_zones_risque_zone ON public.zones_risque USING GIST (zone);

-- Alertes
CREATE TABLE public.alertes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_id UUID REFERENCES public.zones_risque(id),
    type_alerte TEXT NOT NULL CHECK (type_alerte IN ('info', 'attention', 'danger', 'critique')),
    titre TEXT NOT NULL,
    message TEXT NOT NULL,
    canal TEXT DEFAULT 'webapp' CHECK (canal IN ('webapp', 'sms', 'whatsapp', 'tous')),
    envoyee BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Images satellite
CREATE TABLE public.images_satellite (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    bbox GEOGRAPHY(POLYGON, 4326),
    date_capture TIMESTAMPTZ NOT NULL,
    resolution_m NUMERIC,
    analyse_ia JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Stats communes
CREATE TABLE public.stats_communes (
    commune TEXT PRIMARY KEY,
    total_signalements INTEGER DEFAULT 0,
    signalements_resolus INTEGER DEFAULT 0,
    signalements_en_cours INTEGER DEFAULT 0,
    score_risque_moyen NUMERIC DEFAULT 0,
    temps_resolution_moyen INTERVAL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.profils ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones_risque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profils visibles par tous" ON public.profils FOR SELECT USING (true);
CREATE POLICY "Modifier son profil" ON public.profils FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Creer son profil" ON public.profils FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Signalements visibles par tous" ON public.signalements FOR SELECT USING (true);
CREATE POLICY "Creer signalement" ON public.signalements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Modifier signalement" ON public.signalements FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profils WHERE id = auth.uid() AND role IN ('agent_municipal', 'autorite', 'admin'))
);

CREATE POLICY "Verifications visibles" ON public.verifications FOR SELECT USING (true);
CREATE POLICY "Creer verification" ON public.verifications FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Points visibles" ON public.points_historique FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Creer points" ON public.points_historique FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Alertes visibles" ON public.alertes FOR SELECT USING (true);
CREATE POLICY "Creer alerte" ON public.alertes FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profils WHERE id = auth.uid() AND role IN ('autorite', 'admin'))
);

CREATE POLICY "Zones visibles" ON public.zones_risque FOR SELECT USING (true);
CREATE POLICY "Badges visibles" ON public.badges FOR SELECT USING (true);

-- Fonction RPC pour incrementer confirmations
CREATE OR REPLACE FUNCTION incrementer_confirmations(sig_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.signalements
    SET nombre_confirmations = nombre_confirmations + 1,
        updated_at = now()
    WHERE id = sig_id;

    -- Auto-verification apres 3 confirmations
    UPDATE public.signalements
    SET statut = 'verifie', priorite = 'haute'
    WHERE id = sig_id AND nombre_confirmations >= 3 AND statut = 'en_attente';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Donnees de base: badges
INSERT INTO public.badges (id, nom, description, icone, condition_signalements) VALUES
('premier_signalement', 'Premier Pas', 'Premier signalement effectue', '🌱', 1),
('sentinelle_5', 'Sentinelle', '5 signalements valides', '👀', 5),
('gardien_10', 'Gardien du Quartier', '10 signalements valides', '🛡️', 10),
('protecteur_25', 'Protecteur de Dakar', '25 signalements valides', '🏆', 25),
('champion_50', 'Champion Anti-Inondation', '50 signalements valides', '⭐', 50),
('verificateur_10', 'Verificateur', '10 verifications effectuees', '✅', NULL);

-- Donnees de base: zones a risque
INSERT INTO public.zones_risque (nom, commune, zone, score_risque, historique_inondations) VALUES
('Pikine Centre', 'Pikine', ST_GeogFromText('SRID=4326;POLYGON((-17.39 14.75, -17.37 14.75, -17.37 14.77, -17.39 14.77, -17.39 14.75))'), 85, '[{"annee": 2024, "degats": "majeurs"}, {"annee": 2026, "degats": "severes"}]'),
('Guediawaye Nord', 'Guediawaye', ST_GeogFromText('SRID=4326;POLYGON((-17.40 14.77, -17.38 14.77, -17.38 14.79, -17.40 14.79, -17.40 14.77))'), 90, '[{"annee": 2024, "degats": "majeurs"}]'),
('Keur Massar', 'Keur Massar', ST_GeogFromText('SRID=4326;POLYGON((-17.32 14.78, -17.30 14.78, -17.30 14.80, -17.32 14.80, -17.32 14.78))'), 88, '[{"annee": 2024, "degats": "critiques"}, {"annee": 2026, "degats": "severes"}]'),
('Diamaguene', 'Pikine', ST_GeogFromText('SRID=4326;POLYGON((-17.38 14.76, -17.36 14.76, -17.36 14.78, -17.38 14.78, -17.38 14.76))'), 82, '[{"annee": 2026, "degats": "majeurs"}]'),
('Parcelles Assainies', 'Parcelles Assainies', ST_GeogFromText('SRID=4326;POLYGON((-17.44 14.76, -17.42 14.76, -17.42 14.78, -17.44 14.78, -17.44 14.76))'), 70, '[]');
