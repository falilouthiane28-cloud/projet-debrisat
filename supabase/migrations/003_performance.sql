-- =====================================================================
-- Debrisat : recommandations du conseiller de performance Supabase
-- =====================================================================

-- (select auth.uid()) est evalue une fois par requete au lieu d'une fois par ligne
drop policy "Lire son profil" on public.profils;
drop policy "Modifier son profil" on public.profils;
create policy "Lire son profil" on public.profils
    for select to authenticated using ((select auth.uid()) = id or public.est_autorite());
create policy "Modifier son profil" on public.profils
    for update to authenticated using ((select auth.uid()) = id or public.est_admin());

drop policy "Creer un signalement a son nom" on public.signalements;
drop policy "Modifier son signalement ou en tant qu'autorite" on public.signalements;
create policy "Creer un signalement a son nom" on public.signalements
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Modifier son signalement ou en tant qu'autorite" on public.signalements
    for update to authenticated using ((select auth.uid()) = user_id or public.est_autorite());

drop policy "Verifier le signalement d'un autre" on public.verifications;
create policy "Verifier le signalement d'un autre" on public.verifications
    for insert to authenticated with check (
        (select auth.uid()) = user_id
        and not exists (select 1 from public.signalements s where s.id = signalement_id and s.user_id = (select auth.uid()))
        and exists (select 1 from public.signalements s where s.id = signalement_id and s.statut in ('en_attente', 'verifie'))
    );

drop policy "Lire son historique de points" on public.points_historique;
create policy "Lire son historique de points" on public.points_historique
    for select using ((select auth.uid()) = user_id);

-- La lecture est deja couverte par "Zones visibles" : les autorites n'ont besoin que de l'ecriture
drop policy "Autorites gerent les zones" on public.zones_risque;
create policy "Autorites creent les zones" on public.zones_risque
    for insert to authenticated with check (public.est_autorite());
create policy "Autorites modifient les zones" on public.zones_risque
    for update to authenticated using (public.est_autorite()) with check (public.est_autorite());
create policy "Autorites suppriment les zones" on public.zones_risque
    for delete to authenticated using (public.est_autorite());

create index idx_alertes_cree_par on public.alertes (cree_par);
create index idx_alertes_zone on public.alertes (zone_id);
create index idx_points_signalement on public.points_historique (signalement_id);
create index idx_signalements_assigne on public.signalements (assigne_a);
create index idx_verifications_user on public.verifications (user_id);
