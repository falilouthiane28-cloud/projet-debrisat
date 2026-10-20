-- =====================================================================
-- Debrisat : trois roles (citoyen, agent municipal, administrateur),
-- codes d'acces des agents, journal d'administration, configuration du site.
-- Un role ne vient jamais du client : il est attribue par un code d'acces
-- verifie ici, ou par un administrateur.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profils : roles et colonnes d'administration
-- ---------------------------------------------------------------------

alter table public.profils drop constraint profils_role_check;
update public.profils set role = 'agent_municipal' where role = 'autorite';
alter table public.profils add constraint profils_role_check check (role in ('citoyen', 'agent_municipal', 'admin'));

alter table public.profils
    add column compte_actif boolean not null default true,
    add column est_verifie boolean not null default false,
    add column commune_assignee text,
    add column derniere_connexion timestamptz;

-- ---------------------------------------------------------------------
-- Tables d'administration
-- ---------------------------------------------------------------------

create table public.config_site (
    cle text primary key,
    valeur jsonb not null,
    modifie_par uuid references public.profils(id) on delete set null,
    modifie_le timestamptz not null default now()
);

insert into public.config_site (cle, valeur) values
    ('nom_site', '"Debrisat"'),
    ('maintenance', 'false'),
    ('inscriptions_ouvertes', 'true'),
    ('points_signalement', '10'),
    ('points_verification', '3');

create table public.codes_acces (
    id uuid primary key default gen_random_uuid(),
    code text unique not null,
    commune text not null,
    utilise boolean not null default false,
    utilise_par uuid references public.profils(id) on delete set null,
    utilise_le timestamptz,
    revoque boolean not null default false,
    cree_par uuid default auth.uid() references public.profils(id) on delete set null,
    cree_le timestamptz not null default now(),
    expire_le timestamptz
);
create index idx_codes_acces_cree_par on public.codes_acces (cree_par);
create index idx_codes_acces_utilise_par on public.codes_acces (utilise_par);

create table public.logs_admin (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid references public.profils(id) on delete set null,
    action text not null,
    cible_type text check (cible_type in ('utilisateur', 'signalement', 'alerte', 'config', 'code', 'zone')),
    cible_id text,
    details jsonb,
    cree_le timestamptz not null default now()
);
create index idx_logs_admin_cree on public.logs_admin (cree_le desc);
create index idx_logs_admin_admin on public.logs_admin (admin_id);

-- ---------------------------------------------------------------------
-- Fonctions de role (security definer : evitent la recursion des politiques sur profils)
-- ---------------------------------------------------------------------

create or replace function public.est_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (select 1 from public.profils where id = auth.uid() and role = 'admin' and compte_actif);
$$;

create or replace function public.est_agent()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (select 1 from public.profils where id = auth.uid() and role = 'agent_municipal' and compte_actif);
$$;

-- Agent ou administrateur : acces a l'espace de gestion
create or replace function public.est_autorite()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (select 1 from public.profils where id = auth.uid() and role in ('agent_municipal', 'admin') and compte_actif);
$$;

create or replace function public.commune_agent()
returns text
language sql stable security definer set search_path = ''
as $$
    select commune_assignee from public.profils where id = auth.uid();
$$;

create or replace function public.est_actif()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select coalesce((select compte_actif from public.profils where id = auth.uid()), false);
$$;

create or replace function public.lire_config(p_cle text, p_defaut jsonb)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    select coalesce((select valeur from public.config_site where cle = p_cle), p_defaut);
$$;

create or replace function public.journaliser(p_action text, p_cible_type text, p_cible_id text, p_details jsonb)
returns void
language sql security definer set search_path = ''
as $$
    insert into public.logs_admin (admin_id, action, cible_type, cible_id, details)
    values (auth.uid(), p_action, p_cible_type, p_cible_id, p_details);
$$;

-- ---------------------------------------------------------------------
-- Creation du profil : un code d'acces valide fait de l'inscrit un agent
-- ---------------------------------------------------------------------

create or replace function public.creer_profil_utilisateur()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
    v_nom text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'nom_complet', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), '');
    v_tel text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'telephone', ''), '[^0-9+]', '', 'g'), '');
    v_code text := nullif(upper(trim(new.raw_user_meta_data ->> 'code_acces')), '');
    v_code_ligne public.codes_acces;
begin
    if v_code is not null then
        select * into v_code_ligne from public.codes_acces
        where code = v_code and not utilise and not revoque and (expire_le is null or expire_le > now())
        for update;
    end if;

    if v_code_ligne.id is null and not (public.lire_config('inscriptions_ouvertes', 'true'::jsonb))::boolean then
        raise exception 'Les inscriptions sont fermées pour le moment.' using errcode = 'P0001';
    end if;

    insert into public.profils (id, nom_complet, commune, telephone, avatar_url, role, commune_assignee, est_verifie)
    values (
        new.id,
        coalesce(v_nom, split_part(new.email, '@', 1)),
        coalesce(nullif(new.raw_user_meta_data ->> 'commune', ''), v_code_ligne.commune),
        case when v_tel ~ '^\+?[0-9]{9,15}$'
                  and not exists (select 1 from public.profils where telephone = v_tel)
             then v_tel end,
        nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
        case when v_code_ligne.id is not null then 'agent_municipal' else 'citoyen' end,
        v_code_ligne.commune,
        v_code_ligne.id is not null
    )
    on conflict (id) do nothing;

    if v_code_ligne.id is not null then
        update public.codes_acces set utilise = true, utilise_par = new.id, utilise_le = now() where id = v_code_ligne.id;
    end if;
    return new;
end;
$$;

-- Un citoyen deja inscrit (par exemple via Google) peut activer un code d'acces ensuite
create or replace function public.utiliser_code_acces(p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
    v_ligne public.codes_acces;
begin
    if auth.uid() is null then raise exception 'Connexion requise.' using errcode = 'P0001'; end if;
    select * into v_ligne from public.codes_acces
    where code = upper(trim(p_code)) and not utilise and not revoque and (expire_le is null or expire_le > now())
    for update;
    if v_ligne.id is null then raise exception 'Code invalide, expiré ou déjà utilisé.' using errcode = 'P0001'; end if;
    update public.profils set role = 'agent_municipal', commune_assignee = v_ligne.commune, est_verifie = true
    where id = auth.uid() and role = 'citoyen';
    if not found then raise exception 'Ce compte a déjà un rôle de gestion.' using errcode = 'P0001'; end if;
    update public.codes_acces set utilise = true, utilise_par = auth.uid(), utilise_le = now() where id = v_ligne.id;
    return v_ligne.commune;
end;
$$;

-- ---------------------------------------------------------------------
-- Protection des profils
-- ---------------------------------------------------------------------

create or replace function public.proteger_profil()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if public.appel_client() then
        if not public.est_admin() or old.id = auth.uid() then
            -- Personne ne change son propre role ; seul un administrateur change celui des autres
            new.role := old.role;
            new.compte_actif := old.compte_actif;
            new.est_verifie := old.est_verifie;
            new.commune_assignee := old.commune_assignee;
        end if;
        if not public.est_admin() then
            new.points_total := old.points_total;
            new.badges := old.badges;
        end if;
        new.nombre_signalements := old.nombre_signalements;
        new.nombre_verifications := old.nombre_verifications;
        new.created_at := old.created_at;
    end if;
    return new;
end;
$$;

create or replace function public.journaliser_profil()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if not public.appel_client() or not public.est_admin() then return null; end if;
    if new.role is distinct from old.role then
        perform public.journaliser('changement_role', 'utilisateur', new.id::text, jsonb_build_object('nom', new.nom_complet, 'avant', old.role, 'apres', new.role));
    end if;
    if new.compte_actif is distinct from old.compte_actif then
        perform public.journaliser(case when new.compte_actif then 'reactivation_compte' else 'desactivation_compte' end, 'utilisateur', new.id::text, jsonb_build_object('nom', new.nom_complet));
    end if;
    if new.commune_assignee is distinct from old.commune_assignee then
        perform public.journaliser('changement_commune', 'utilisateur', new.id::text, jsonb_build_object('nom', new.nom_complet, 'avant', old.commune_assignee, 'apres', new.commune_assignee));
    end if;
    if new.points_total is distinct from old.points_total then
        perform public.journaliser('modification_points', 'utilisateur', new.id::text, jsonb_build_object('nom', new.nom_complet, 'avant', old.points_total, 'apres', new.points_total));
    end if;
    return null;
end;
$$;

create trigger tr_journaliser_profil
after update on public.profils
for each row execute function public.journaliser_profil();

-- ---------------------------------------------------------------------
-- Signalements : les agents ne gerent que leur commune
-- ---------------------------------------------------------------------

create or replace function public.proteger_signalement()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if public.appel_client() and not (
        public.est_admin() or (public.est_agent() and old.commune is not distinct from public.commune_agent())
    ) then
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
    if public.appel_client() and not public.est_admin() then
        new.commune := old.commune;
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

create or replace function public.journaliser_signalement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if not public.appel_client() or not public.est_autorite() then return null; end if;
    if tg_op = 'DELETE' then
        perform public.journaliser('suppression_signalement', 'signalement', old.id::text, jsonb_build_object('commune', old.commune, 'type', old.type_obstruction));
        return null;
    end if;
    if new.statut is distinct from old.statut then
        perform public.journaliser('changement_statut', 'signalement', new.id::text, jsonb_build_object('commune', new.commune, 'avant', old.statut, 'apres', new.statut));
    end if;
    if new.assigne_a is distinct from old.assigne_a then
        perform public.journaliser('assignation', 'signalement', new.id::text, jsonb_build_object('commune', new.commune, 'agent', new.assigne_a));
    end if;
    if new.priorite is distinct from old.priorite then
        perform public.journaliser('changement_priorite', 'signalement', new.id::text, jsonb_build_object('avant', old.priorite, 'apres', new.priorite));
    end if;
    return null;
end;
$$;

create trigger tr_journaliser_signalement
after update or delete on public.signalements
for each row execute function public.journaliser_signalement();

-- Les points suivent la configuration du site
create or replace function public.apres_creation_signalement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if new.user_id is not null then
        update public.profils set nombre_signalements = nombre_signalements + 1 where id = new.user_id;
        perform public.attribuer_points(new.user_id, (public.lire_config('points_signalement', '10'::jsonb))::int, 'signalement', new.id);
    end if;
    return null;
end;
$$;

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
    perform public.attribuer_points(new.user_id, (public.lire_config('points_verification', '3'::jsonb))::int, 'verification', new.signalement_id);

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

-- ---------------------------------------------------------------------
-- Alertes, configuration, codes : journalisation
-- ---------------------------------------------------------------------

create or replace function public.journaliser_divers()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
    v_ligne jsonb;
begin
    if not public.appel_client() then return null; end if;
    v_ligne := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    if tg_table_name = 'alertes' then
        perform public.journaliser('envoi_alerte', 'alerte', v_ligne ->> 'id', jsonb_build_object('titre', v_ligne ->> 'titre', 'canal', v_ligne ->> 'canal'));
    elsif tg_table_name = 'config_site' then
        perform public.journaliser('modification_config', 'config', v_ligne ->> 'cle', jsonb_build_object('valeur', v_ligne -> 'valeur'));
    elsif tg_table_name = 'zones_risque' then
        perform public.journaliser(
            case tg_op when 'INSERT' then 'creation_zone' when 'UPDATE' then 'modification_zone' else 'suppression_zone' end,
            'zone', v_ligne ->> 'id', jsonb_build_object('nom', v_ligne ->> 'nom'));
    end if;
    return null;
end;
$$;

create trigger tr_journaliser_alerte after insert on public.alertes
for each row execute function public.journaliser_divers();
create trigger tr_journaliser_config after insert or update on public.config_site
for each row execute function public.journaliser_divers();
create trigger tr_journaliser_zone after insert or update or delete on public.zones_risque
for each row execute function public.journaliser_divers();

create or replace function public.horodater_config()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.modifie_par := auth.uid();
    new.modifie_le := now();
    return new;
end;
$$;
create trigger tr_horodater_config before insert or update on public.config_site
for each row execute function public.horodater_config();

-- ---------------------------------------------------------------------
-- Fonctions d'administration (appelees par admin.html)
-- ---------------------------------------------------------------------

-- Liste des comptes avec l'e-mail, qui vit dans auth.users
create or replace function public.admin_lister_utilisateurs()
returns table (
    id uuid, nom_complet text, email text, role text, commune text, commune_assignee text,
    points_total integer, nombre_signalements integer, nombre_verifications integer,
    compte_actif boolean, est_verifie boolean, created_at timestamptz, derniere_connexion timestamptz, fournisseur text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
    return query
    select p.id, p.nom_complet, u.email::text, p.role, p.commune, p.commune_assignee,
           p.points_total, p.nombre_signalements, p.nombre_verifications,
           p.compte_actif, p.est_verifie, p.created_at, coalesce(p.derniere_connexion, u.last_sign_in_at),
           coalesce(u.raw_app_meta_data ->> 'provider', 'email')
    from public.profils p join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

create or replace function public.admin_supprimer_utilisateur(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
    v_nom text;
begin
    if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
    if p_id = auth.uid() then raise exception 'Vous ne pouvez pas supprimer votre propre compte.' using errcode = 'P0001'; end if;
    select nom_complet into v_nom from public.profils where id = p_id;
    perform public.journaliser('suppression_compte', 'utilisateur', p_id::text, jsonb_build_object('nom', v_nom));
    delete from auth.users where id = p_id;
end;
$$;

create or replace function public.admin_generer_code(p_commune text, p_expire_le timestamptz default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
    v_code text;
begin
    if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
    -- Sans 0, O, 1, I : un code se dicte au telephone sans ambiguite
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    into v_code from generate_series(1, 8);
    v_code := 'AGT-' || substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
    insert into public.codes_acces (code, commune, expire_le) values (v_code, p_commune, p_expire_le);
    perform public.journaliser('creation_code', 'code', v_code, jsonb_build_object('commune', p_commune, 'expire_le', p_expire_le));
    return v_code;
end;
$$;

create or replace function public.admin_revoquer_code(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
    v_code text;
begin
    if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
    update public.codes_acces set revoque = true where id = p_id and not utilise returning code into v_code;
    if v_code is null then raise exception 'Ce code a déjà été utilisé.' using errcode = 'P0001'; end if;
    perform public.journaliser('revocation_code', 'code', v_code, null);
end;
$$;

-- Remise a zero des points d'un compte, ou de tous si p_id est nul
create or replace function public.admin_reinitialiser_points(p_id uuid default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
    v_nombre integer;
begin
    if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
    delete from public.points_historique where p_id is null or user_id = p_id;
    update public.profils set points_total = 0, badges = '[]'::jsonb where p_id is null or id = p_id;
    get diagnostics v_nombre = row_count;
    perform public.journaliser('reinitialisation_points', 'utilisateur', coalesce(p_id::text, 'tous'), jsonb_build_object('comptes', v_nombre));
    return v_nombre;
end;
$$;

create or replace function public.admin_purger_signalements(p_jours integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
    v_nombre integer;
begin
    if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
    if p_jours < 30 then raise exception 'La purge ne concerne que les signalements de plus de 30 jours.' using errcode = 'P0001'; end if;
    delete from public.signalements where statut in ('resolu', 'rejete') and updated_at < now() - make_interval(days => p_jours);
    get diagnostics v_nombre = row_count;
    perform public.journaliser('purge_signalements', 'signalement', null, jsonb_build_object('jours', p_jours, 'supprimes', v_nombre));
    return v_nombre;
end;
$$;

-- La derniere connexion est datee cote serveur
create or replace function public.marquer_connexion()
returns void
language sql security definer set search_path = ''
as $$
    update public.profils set derniere_connexion = now() where id = auth.uid();
$$;

revoke execute on function public.journaliser(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.journaliser_profil() from public, anon, authenticated;
revoke execute on function public.journaliser_signalement() from public, anon, authenticated;
revoke execute on function public.journaliser_divers() from public, anon, authenticated;
revoke execute on function public.horodater_config() from public, anon, authenticated;
revoke execute on function public.creer_profil_utilisateur() from public, anon, authenticated;
revoke execute on function public.apres_creation_signalement() from public, anon, authenticated;
revoke execute on function public.apres_verification() from public, anon, authenticated;
revoke execute on function public.est_admin() from public, anon;
revoke execute on function public.est_agent() from public, anon;
revoke execute on function public.est_autorite() from public, anon;
revoke execute on function public.commune_agent() from public, anon;
revoke execute on function public.est_actif() from public, anon;
revoke execute on function public.utiliser_code_acces(text) from public, anon;
revoke execute on function public.marquer_connexion() from public, anon;
revoke execute on function public.admin_lister_utilisateurs() from public, anon;
revoke execute on function public.admin_supprimer_utilisateur(uuid) from public, anon;
revoke execute on function public.admin_generer_code(text, timestamptz) from public, anon;
revoke execute on function public.admin_revoquer_code(uuid) from public, anon;
revoke execute on function public.admin_reinitialiser_points(uuid) from public, anon;
revoke execute on function public.admin_purger_signalements(integer) from public, anon;
grant execute on function public.est_admin(), public.est_agent(), public.est_autorite(), public.commune_agent(), public.est_actif(),
    public.utiliser_code_acces(text), public.marquer_connexion(), public.admin_lister_utilisateurs(),
    public.admin_supprimer_utilisateur(uuid), public.admin_generer_code(text, timestamptz), public.admin_revoquer_code(uuid),
    public.admin_reinitialiser_points(uuid), public.admin_purger_signalements(integer) to authenticated;

-- ---------------------------------------------------------------------
-- Securite au niveau des lignes
-- ---------------------------------------------------------------------

alter table public.config_site enable row level security;
alter table public.codes_acces enable row level security;
alter table public.logs_admin enable row level security;

drop policy "Lire son profil" on public.profils;
drop policy "Modifier son profil" on public.profils;
create policy "Lire son profil" on public.profils
    for select to authenticated using (
        (select auth.uid()) = id
        or public.est_admin()
        or (public.est_agent() and commune = public.commune_agent())
    );
create policy "Modifier son profil" on public.profils
    for update to authenticated using ((select auth.uid()) = id or public.est_admin());

drop policy "Creer un signalement a son nom" on public.signalements;
create policy "Creer un signalement a son nom" on public.signalements
    for insert to authenticated with check ((select auth.uid()) = user_id and public.est_actif());
drop policy "Modifier son signalement ou en tant qu'autorite" on public.signalements;
create policy "Modifier son signalement ou en tant qu'autorite" on public.signalements
    for update to authenticated using (
        (select auth.uid()) = user_id
        or public.est_admin()
        or (public.est_agent() and commune = public.commune_agent())
    );
create policy "Administrateurs suppriment les signalements" on public.signalements
    for delete to authenticated using (public.est_admin());

drop policy "Verifier le signalement d'un autre" on public.verifications;
create policy "Verifier le signalement d'un autre" on public.verifications
    for insert to authenticated with check (
        (select auth.uid()) = user_id
        and public.est_actif()
        and not exists (select 1 from public.signalements s where s.id = signalement_id and s.user_id = (select auth.uid()))
        and exists (select 1 from public.signalements s where s.id = signalement_id and s.statut in ('en_attente', 'verifie'))
    );

drop policy "Autorites creent les zones" on public.zones_risque;
drop policy "Autorites modifient les zones" on public.zones_risque;
drop policy "Autorites suppriment les zones" on public.zones_risque;
create policy "Administrateurs creent les zones" on public.zones_risque
    for insert to authenticated with check (public.est_admin());
create policy "Administrateurs modifient les zones" on public.zones_risque
    for update to authenticated using (public.est_admin()) with check (public.est_admin());
create policy "Administrateurs suppriment les zones" on public.zones_risque
    for delete to authenticated using (public.est_admin());

-- Reglages publics (maintenance, inscriptions, points) : lisibles par tous, modifiables par un administrateur
create policy "Configuration lisible" on public.config_site for select using (true);
create policy "Administrateurs modifient la configuration" on public.config_site
    for update to authenticated using (public.est_admin()) with check (public.est_admin());
create policy "Administrateurs ajoutent la configuration" on public.config_site
    for insert to authenticated with check (public.est_admin());

create policy "Administrateurs lisent les codes" on public.codes_acces
    for select to authenticated using (public.est_admin());

create policy "Administrateurs lisent le journal" on public.logs_admin
    for select to authenticated using (public.est_admin());

alter publication supabase_realtime add table public.logs_admin;
