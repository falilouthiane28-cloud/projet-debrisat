-- =====================================================================
-- Debrisat : deux roles seulement, citoyen et autorite.
-- Un compte est cree citoyen ; le passage en autorite se fait cote serveur
-- (SQL ou tableau de bord Supabase), jamais depuis l'application.
-- =====================================================================

update public.profils set role = 'autorite' where role in ('agent_municipal', 'admin');

alter table public.profils drop constraint profils_role_check;
alter table public.profils add constraint profils_role_check check (role in ('citoyen', 'autorite'));

create or replace function public.est_autorite()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (select 1 from public.profils where id = auth.uid() and role = 'autorite');
$$;

-- Plus de super-administrateur cote client : seul le serveur change un role
create or replace function public.proteger_profil()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if public.appel_client() then
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

drop policy "Modifier son profil" on public.profils;
create policy "Modifier son profil" on public.profils
    for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop function public.est_admin();
