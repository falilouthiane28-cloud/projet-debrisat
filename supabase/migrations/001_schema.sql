-- =====================================================================
-- Debrisat : schema initial
-- Les points, badges, compteurs et transitions de statut sont calcules
-- par des declencheurs : un client ne peut jamais se les attribuer.
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.profils (
    id uuid primary key references auth.users(id) on delete cascade,
    nom_complet text not null check (char_length(nom_complet) between 2 and 120),
    telephone text unique check (telephone is null or telephone ~ '^\+?[0-9]{9,15}$'),
    commune text,
    role text not null default 'citoyen' check (role in ('citoyen', 'agent_municipal', 'autorite', 'admin')),
    points_total integer not null default 0,
    badges jsonb not null default '[]'::jsonb,
    avatar_url text,
    nombre_signalements integer not null default 0,
    nombre_verifications integer not null default 0,
    created_at timestamptz not null default now()
);

create table public.signalements (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profils(id) on delete set null,
    type_obstruction text not null check (type_obstruction in (
        'dechets_solides', 'tas_sable', 'gravats', 'plastiques',
        'pneus', 'encombrants', 'eau_stagnante', 'canal_bouche', 'autre'
    )),
    description text check (description is null or char_length(description) <= 500),
    severite integer not null default 1 check (severite between 1 and 5),
    -- Facultative uniquement pour les detections satellite ; l'application l'exige
    photo_url text,
    photo_analyse jsonb,
    localisation extensions.geography(point, 4326) not null,
    -- Colonnes calculees : PostgREST et Realtime renvoient la geographie en binaire
    lat double precision generated always as (extensions.st_y(localisation::extensions.geometry)) stored,
    lng double precision generated always as (extensions.st_x(localisation::extensions.geometry)) stored,
    adresse text,
    commune text,
    quartier text,
    statut text not null default 'en_attente' check (statut in ('en_attente', 'verifie', 'en_cours', 'resolu', 'rejete')),
    source text not null default 'webapp' check (source in ('webapp', 'whatsapp', 'satellite')),
    nombre_confirmations integer not null default 0,
    nombre_infirmations integer not null default 0,
    priorite text not null default 'normale' check (priorite in ('basse', 'normale', 'haute', 'critique')),
    assigne_a uuid references public.profils(id) on delete set null,
    resolu_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_signalements_localisation on public.signalements using gist (localisation);
create index idx_signalements_statut on public.signalements (statut);
create index idx_signalements_commune on public.signalements (commune);
create index idx_signalements_created on public.signalements (created_at desc);
create index idx_signalements_user on public.signalements (user_id);

create table public.verifications (
    id uuid primary key default gen_random_uuid(),
    signalement_id uuid not null references public.signalements(id) on delete cascade,
    user_id uuid not null references public.profils(id) on delete cascade,
    confirme boolean not null,
    commentaire text check (commentaire is null or char_length(commentaire) <= 300),
    photo_verification text,
    created_at timestamptz not null default now(),
    unique (signalement_id, user_id)
);

create table public.points_historique (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profils(id) on delete cascade,
    points integer not null,
    raison text not null check (raison in ('signalement', 'verification', 'signalement_verifie', 'signalement_resolu', 'badge')),
    signalement_id uuid references public.signalements(id) on delete set null,
    created_at timestamptz not null default now()
);
create index idx_points_user on public.points_historique (user_id, created_at desc);

create table public.badges (
    id text primary key,
    nom text not null,
    description text not null,
    icone text not null,                -- classe Bootstrap Icons, par exemple 'bi-flag'
    condition_points integer,
    condition_signalements integer,
    condition_verifications integer
);

create table public.zones_risque (
    id uuid primary key default gen_random_uuid(),
    nom text not null,
    commune text,
    zone extensions.geography(polygon, 4326) not null,
    score_risque numeric not null default 0 check (score_risque between 0 and 100),
    nombre_signalements_actifs integer not null default 0,
    dernier_calcul timestamptz not null default now(),
    historique_inondations jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);
create index idx_zones_risque_zone on public.zones_risque using gist (zone);

create table public.alertes (
    id uuid primary key default gen_random_uuid(),
    zone_id uuid references public.zones_risque(id) on delete set null,
    type_alerte text not null check (type_alerte in ('info', 'attention', 'danger', 'critique')),
    titre text not null check (char_length(titre) between 4 and 90),
    message text not null check (char_length(message) between 10 and 320),
    canal text not null default 'webapp' check (canal in ('webapp', 'sms', 'whatsapp', 'tous')),
    envoyee boolean not null default false,
    cree_par uuid default auth.uid() references public.profils(id) on delete set null,
    created_at timestamptz not null default now()
);

create table public.images_satellite (
    id uuid primary key default gen_random_uuid(),
    source text not null check (source in ('sentinel2', 'google_earth', 'drone')),
    url text not null,
    bbox extensions.geography(polygon, 4326),
    date_capture timestamptz not null,
    resolution_m numeric,
    analyse_ia jsonb,
    created_at timestamptz not null default now()
);

create table public.stats_communes (
    commune text primary key,
    total_signalements integer not null default 0,
    signalements_resolus integer not null default 0,
    signalements_en_cours integer not null default 0,
    score_risque_moyen numeric not null default 0,
    temps_resolution_moyen interval,
    updated_at timestamptz not null default now()
);

-- Etat des conversations WhatsApp : les fonctions Edge sont sans etat entre deux messages
create table public.sessions_whatsapp (
    telephone text primary key,
    etape text not null check (etape in ('attente_localisation', 'attente_type')),
    donnees jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------

create or replace function public.est_autorite()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.profils
        where id = auth.uid() and role in ('agent_municipal', 'autorite', 'admin')
    );
$$;

create or replace function public.est_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (select 1 from public.profils where id = auth.uid() and role = 'admin');
$$;

-- Vrai quand la requete vient directement d'un client (et non d'une fonction serveur ou du service role)
create or replace function public.appel_client()
returns boolean
language sql stable set search_path = ''
as $$
    select current_user in ('authenticated', 'anon');
$$;

create or replace function public.verifier_badges(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
    v_profil public.profils;
begin
    select * into v_profil from public.profils where id = p_user;
    if not found then return; end if;
    update public.profils set badges = coalesce((
        select jsonb_agg(b.id order by b.id)
        from public.badges b
        where (b.condition_signalements is not null and v_profil.nombre_signalements >= b.condition_signalements)
           or (b.condition_verifications is not null and v_profil.nombre_verifications >= b.condition_verifications)
           or (b.condition_points is not null and v_profil.points_total >= b.condition_points)
    ), '[]'::jsonb)
    where id = p_user;
end;
$$;

create or replace function public.attribuer_points(p_user uuid, p_points integer, p_raison text, p_signalement uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
    if p_user is null then return; end if;
    insert into public.points_historique (user_id, points, raison, signalement_id)
    values (p_user, p_points, p_raison, p_signalement);
    update public.profils set points_total = points_total + p_points where id = p_user;
    perform public.verifier_badges(p_user);
end;
$$;

-- ---------------------------------------------------------------------
-- Declencheurs : profils
-- ---------------------------------------------------------------------

-- Le profil est cree a l'inscription, meme si la confirmation par e-mail retarde la session
create or replace function public.creer_profil_utilisateur()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
    v_nom text := nullif(trim(new.raw_user_meta_data ->> 'nom_complet'), '');
    v_tel text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'telephone', ''), '[^0-9+]', '', 'g'), '');
begin
    insert into public.profils (id, nom_complet, commune, telephone)
    values (
        new.id,
        coalesce(v_nom, split_part(new.email, '@', 1)),
        nullif(new.raw_user_meta_data ->> 'commune', ''),
        case when v_tel ~ '^\+?[0-9]{9,15}$'
                  and not exists (select 1 from public.profils where telephone = v_tel)
             then v_tel end
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger tr_creer_profil
after insert on auth.users
for each row execute function public.creer_profil_utilisateur();

-- Un utilisateur modifie son nom, sa commune, son telephone ; jamais son role ni ses points
create or replace function public.proteger_profil()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if public.appel_client() and not public.est_admin() then
        new.role := old.role;
        new.points_total := old.points_total;
        new.badges := old.badges;
        new.nombre_signalements := old.nombre_signalements;
        new.nombre_verifications := old.nombre_verifications;
        new.created_at := old.created_at;
    end if;
    return new;
end;
$$;

create trigger tr_proteger_profil
before update on public.profils
for each row execute function public.proteger_profil();

-- ---------------------------------------------------------------------
-- Declencheurs : signalements
-- ---------------------------------------------------------------------

create or replace function public.preparer_signalement()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if public.appel_client() then
        new.statut := 'en_attente';
        new.source := 'webapp';
        new.nombre_confirmations := 0;
        new.nombre_infirmations := 0;
        new.assigne_a := null;
        new.resolu_at := null;
        new.photo_analyse := null;
    end if;
    new.priorite := case
        when new.severite >= 5 then 'critique'
        when new.severite >= 4 then 'haute'
        when new.severite <= 1 then 'basse'
        else 'normale' end;
    return new;
end;
$$;

create trigger tr_preparer_signalement
before insert on public.signalements
for each row execute function public.preparer_signalement();

create or replace function public.proteger_signalement()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    -- L'auteur ne corrige que la description et la severite ; le reste releve des autorites
    if public.appel_client() and not public.est_autorite() then
        new.user_id := old.user_id;
        new.type_obstruction := old.type_obstruction;
        new.photo_url := old.photo_url;
        new.photo_analyse := old.photo_analyse;
        new.localisation := old.localisation;
        new.statut := old.statut;
        new.source := old.source;
        new.priorite := old.priorite;
        new.assigne_a := old.assigne_a;
        new.nombre_confirmations := old.nombre_confirmations;
        new.nombre_infirmations := old.nombre_infirmations;
    end if;
    if new.statut = 'resolu' and old.statut <> 'resolu' then
        new.resolu_at := now();
    elsif new.statut <> 'resolu' then
        new.resolu_at := null;
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
    return new;
end;
$$;

create trigger tr_proteger_signalement
before update on public.signalements
for each row execute function public.proteger_signalement();

create or replace function public.apres_creation_signalement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if new.user_id is not null then
        update public.profils set nombre_signalements = nombre_signalements + 1 where id = new.user_id;
        perform public.attribuer_points(new.user_id, 10, 'signalement', new.id);
    end if;
    return null;
end;
$$;

create trigger tr_apres_creation_signalement
after insert on public.signalements
for each row execute function public.apres_creation_signalement();

create or replace function public.apres_changement_statut()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if new.statut = 'resolu' and old.statut <> 'resolu' then
        perform public.attribuer_points(new.user_id, 20, 'signalement_resolu', new.id);
    end if;
    return null;
end;
$$;

create trigger tr_apres_changement_statut
after update of statut on public.signalements
for each row execute function public.apres_changement_statut();

-- ---------------------------------------------------------------------
-- Declencheurs : verifications communautaires
-- ---------------------------------------------------------------------

create or replace function public.apres_verification()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
    v_sig public.signalements;
begin
    update public.signalements
    set nombre_confirmations = nombre_confirmations + case when new.confirme then 1 else 0 end,
        nombre_infirmations = nombre_infirmations + case when new.confirme then 0 else 1 end
    where id = new.signalement_id
    returning * into v_sig;

    update public.profils set nombre_verifications = nombre_verifications + 1 where id = new.user_id;
    perform public.attribuer_points(new.user_id, 3, 'verification', new.signalement_id);

    -- Trois confirmations : verifie et prioritaire ; trois infirmations : rejete
    if v_sig.statut = 'en_attente' and v_sig.nombre_confirmations >= 3 then
        update public.signalements
        set statut = 'verifie', priorite = case when priorite = 'critique' then 'critique' else 'haute' end
        where id = v_sig.id;
        perform public.attribuer_points(v_sig.user_id, 5, 'signalement_verifie', v_sig.id);
    elsif v_sig.statut in ('en_attente', 'verifie') and v_sig.nombre_infirmations >= 3 then
        update public.signalements set statut = 'rejete' where id = v_sig.id;
    end if;
    return null;
end;
$$;

create trigger tr_apres_verification
after insert on public.verifications
for each row execute function public.apres_verification();

-- ---------------------------------------------------------------------
-- Calcul du risque (appele par la fonction Edge calculer-risque ou par pg_cron)
-- ---------------------------------------------------------------------

create or replace function public.calculer_scores_risque()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
    update public.zones_risque z
    set nombre_signalements_actifs = coalesce(s.actifs, 0),
        score_risque = least(100, round(
            40 + 9 * jsonb_array_length(z.historique_inondations) + 1.6 * coalesce(s.somme_severite, 0)
        )),
        dernier_calcul = now()
    from public.zones_risque z2
    left join lateral (
        select count(*) as actifs, sum(sg.severite) as somme_severite
        from public.signalements sg
        where sg.statut in ('en_attente', 'verifie', 'en_cours')
          and extensions.st_intersects(z2.zone, sg.localisation)
    ) s on true
    where z.id = z2.id;

    insert into public.stats_communes as sc (commune, total_signalements, signalements_resolus, signalements_en_cours, score_risque_moyen, temps_resolution_moyen, updated_at)
    select s.commune,
           count(*),
           count(*) filter (where s.statut = 'resolu'),
           count(*) filter (where s.statut = 'en_cours'),
           coalesce((select avg(z.score_risque) from public.zones_risque z where z.commune = s.commune), 0),
           avg(s.resolu_at - s.created_at) filter (where s.statut = 'resolu'),
           now()
    from public.signalements s
    where s.commune is not null
    group by s.commune
    on conflict (commune) do update set
        total_signalements = excluded.total_signalements,
        signalements_resolus = excluded.signalements_resolus,
        signalements_en_cours = excluded.signalements_en_cours,
        score_risque_moyen = excluded.score_risque_moyen,
        temps_resolution_moyen = excluded.temps_resolution_moyen,
        updated_at = excluded.updated_at;
end;
$$;

-- ---------------------------------------------------------------------
-- Vues
-- ---------------------------------------------------------------------

create view public.vue_zones_risque with (security_invoker = true) as
select id, nom, commune, score_risque, nombre_signalements_actifs, dernier_calcul,
       historique_inondations, extensions.st_asgeojson(zone)::json as geojson
from public.zones_risque;

-- Classement public : sans telephone ni donnees personnelles.
-- Volontairement en security definer : la table profils n'est lisible que par son proprietaire.
create view public.classement_public as
select id, nom_complet, commune, role, points_total, nombre_signalements, nombre_verifications, badges
from public.profils;

-- ---------------------------------------------------------------------
-- Securite au niveau des lignes
-- ---------------------------------------------------------------------

alter table public.profils enable row level security;
alter table public.signalements enable row level security;
alter table public.verifications enable row level security;
alter table public.points_historique enable row level security;
alter table public.badges enable row level security;
alter table public.zones_risque enable row level security;
alter table public.alertes enable row level security;
alter table public.images_satellite enable row level security;
alter table public.stats_communes enable row level security;
alter table public.sessions_whatsapp enable row level security;

create policy "Lire son profil" on public.profils
    for select using (auth.uid() = id or public.est_autorite());
create policy "Modifier son profil" on public.profils
    for update using (auth.uid() = id or public.est_admin());

create policy "Signalements visibles par tous" on public.signalements
    for select using (true);
create policy "Creer un signalement a son nom" on public.signalements
    for insert to authenticated with check (auth.uid() = user_id);
create policy "Modifier son signalement ou en tant qu'autorite" on public.signalements
    for update to authenticated using (auth.uid() = user_id or public.est_autorite());

create policy "Verifications visibles" on public.verifications
    for select using (true);
create policy "Verifier le signalement d'un autre" on public.verifications
    for insert to authenticated with check (
        auth.uid() = user_id
        and not exists (select 1 from public.signalements s where s.id = signalement_id and s.user_id = auth.uid())
        and exists (select 1 from public.signalements s where s.id = signalement_id and s.statut in ('en_attente', 'verifie'))
    );

create policy "Lire son historique de points" on public.points_historique
    for select using (auth.uid() = user_id);

create policy "Badges visibles" on public.badges for select using (true);

create policy "Zones visibles" on public.zones_risque for select using (true);
create policy "Autorites gerent les zones" on public.zones_risque
    for all to authenticated using (public.est_autorite()) with check (public.est_autorite());

create policy "Alertes visibles" on public.alertes for select using (true);
create policy "Autorites creent les alertes" on public.alertes
    for insert to authenticated with check (public.est_autorite());

create policy "Images satellite visibles" on public.images_satellite for select using (true);
create policy "Statistiques visibles" on public.stats_communes for select using (true);
-- sessions_whatsapp : aucune politique, seule la cle service (fonction Edge) y accede

grant select on public.classement_public to anon, authenticated;
grant select on public.vue_zones_risque to anon, authenticated;

revoke execute on function public.calculer_scores_risque() from public, anon, authenticated;
revoke execute on function public.attribuer_points(uuid, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.verifier_badges(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Stockage des photos
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Chaque utilisateur depose ses photos dans un dossier a son identifiant
create policy "Deposer ses photos" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Photos lisibles par tous" on storage.objects
    for select using (bucket_id = 'photos');

-- ---------------------------------------------------------------------
-- Temps reel
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.signalements;
alter publication supabase_realtime add table public.alertes;

-- ---------------------------------------------------------------------
-- Donnees de reference
-- ---------------------------------------------------------------------

insert into public.badges (id, nom, description, icone, condition_signalements, condition_verifications) values
    ('premier_signalement', 'Premier pas', 'Premier signalement effectué', 'bi-flag', 1, null),
    ('sentinelle_5', 'Sentinelle', '5 signalements effectués', 'bi-eye', 5, null),
    ('gardien_10', 'Gardien du quartier', '10 signalements effectués', 'bi-shield-check', 10, null),
    ('protecteur_25', 'Protecteur de Dakar', '25 signalements effectués', 'bi-trophy', 25, null),
    ('champion_50', 'Champion anti-inondation', '50 signalements effectués', 'bi-star', 50, null),
    ('verificateur_10', 'Vérificateur', '10 vérifications effectuées', 'bi-patch-check', null, 10);

insert into public.zones_risque (nom, commune, zone, score_risque, historique_inondations) values
    ('Pikine Centre', 'Pikine',
     extensions.st_geogfromtext('SRID=4326;POLYGON((-17.39 14.75, -17.37 14.75, -17.37 14.77, -17.39 14.77, -17.39 14.75))'), 85,
     '[{"annee": 2009, "degats": "majeurs"}, {"annee": 2012, "degats": "majeurs"}, {"annee": 2022, "degats": "sévères"}]'),
    ('Guédiawaye Nord', 'Guédiawaye',
     extensions.st_geogfromtext('SRID=4326;POLYGON((-17.40 14.77, -17.38 14.77, -17.38 14.79, -17.40 14.79, -17.40 14.77))'), 90,
     '[{"annee": 2009, "degats": "majeurs"}, {"annee": 2022, "degats": "majeurs"}]'),
    ('Keur Massar', 'Keur Massar',
     extensions.st_geogfromtext('SRID=4326;POLYGON((-17.32 14.78, -17.30 14.78, -17.30 14.80, -17.32 14.80, -17.32 14.78))'), 88,
     '[{"annee": 2012, "degats": "critiques"}, {"annee": 2022, "degats": "critiques"}]'),
    ('Diamaguène', 'Diamaguène Sicap Mbao',
     extensions.st_geogfromtext('SRID=4326;POLYGON((-17.38 14.76, -17.36 14.76, -17.36 14.78, -17.38 14.78, -17.38 14.76))'), 82,
     '[{"annee": 2022, "degats": "majeurs"}]'),
    ('Parcelles Assainies', 'Parcelles Assainies',
     extensions.st_geogfromtext('SRID=4326;POLYGON((-17.44 14.76, -17.42 14.76, -17.42 14.78, -17.44 14.78, -17.44 14.76))'), 70,
     '[]');
