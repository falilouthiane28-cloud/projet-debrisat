-- =====================================================================
-- Debrisat : durcissement apres le conseiller de securite Supabase
-- =====================================================================

-- Les fonctions de declencheur ne doivent pas etre appelables via /rest/v1/rpc.
-- Un declencheur s'execute sans que l'appelant ait le droit EXECUTE.
revoke execute on function public.creer_profil_utilisateur() from public, anon, authenticated;
revoke execute on function public.apres_creation_signalement() from public, anon, authenticated;
revoke execute on function public.apres_changement_statut() from public, anon, authenticated;
revoke execute on function public.apres_verification() from public, anon, authenticated;

-- est_autorite / est_admin servent aux politiques RLS : les utilisateurs connectes en ont besoin,
-- les visiteurs anonymes non.
revoke execute on function public.est_autorite() from public, anon;
revoke execute on function public.est_admin() from public, anon;
grant execute on function public.est_autorite() to authenticated;
grant execute on function public.est_admin() to authenticated;

-- Les profils ne concernent que les utilisateurs connectes (le classement passe par classement_public)
drop policy "Lire son profil" on public.profils;
drop policy "Modifier son profil" on public.profils;
create policy "Lire son profil" on public.profils
    for select to authenticated using (auth.uid() = id or public.est_autorite());
create policy "Modifier son profil" on public.profils
    for update to authenticated using (auth.uid() = id or public.est_admin());
