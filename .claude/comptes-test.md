# Comptes de test Supabase (projet debrisat, bezkifetuusykmmwwiad)

Créés pour la recette. Ne pas réutiliser en production ; à supprimer
(Authentication > Users) une fois les tests terminés. Fichier non versionné.

| Rôle | Nom | E-mail | Mot de passe |
|---|---|---|---|
| autorite | Recette Autorité Un | recette.citoyen1@debrisat-test.dev | Dbt-g1CxSHmzV7NU |
| autorite | Recette Autorité Deux | recette.autorite2@debrisat-test.dev | Dbt-flP9Y0GUPMv5 |
| citoyen | Recette Citoyen Deux | recette.citoyen2@debrisat-test.dev | Dbt-3HgW65p98yyQ |
| citoyen | Recette Citoyen Trois | recette.citoyen3@debrisat-test.dev | Dbt-J1VT2Q2yqPZZ |

Passer un compte en autorité :
`update public.profils set role = 'autorite' where id = '<uuid>';`
