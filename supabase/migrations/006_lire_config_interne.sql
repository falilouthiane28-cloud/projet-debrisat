-- La configuration se lit dans la table config_site ; lire_config ne sert qu'aux declencheurs
revoke execute on function public.lire_config(text, jsonb) from public, anon, authenticated;
