-- Les declencheurs de journal sont security definer : current_user y est le proprietaire,
-- donc appel_client() repondait toujours faux et rien n'etait journalise.
-- On se fie au role porte par le JWT de la requete, que la delegation de droits ne change pas.
create or replace function public.requete_utilisateur()
returns boolean
language sql stable set search_path = ''
as $$
    select coalesce(auth.role(), '') = 'authenticated';
$$;
revoke execute on function public.requete_utilisateur() from public, anon;

create or replace function public.journaliser_profil()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if not public.requete_utilisateur() or not public.est_admin() then return null; end if;
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

create or replace function public.journaliser_signalement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if not public.requete_utilisateur() or not public.est_autorite() then return null; end if;
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

create or replace function public.journaliser_divers()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
    v_ligne jsonb;
begin
    if not public.requete_utilisateur() then return null; end if;
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
