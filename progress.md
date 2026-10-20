# Progress — Debrisat

Suivi de l'avancement. Mis à jour à chaque étape importante.

**Dernière mise à jour** : 2026-10-19 (refonte « Obsidian Glass »)

---

## Design system
- [x] Jetons (couleurs, verre, espacements, typographie, rayons, courbes, z-index)
- [x] Sombre par défaut, clair, « Système »
- [x] Bibliothèque de composants (boutons, cartes, formulaires, badges, toasts, feuilles, tableaux, navigation, squelettes)
- [x] Mouvement : apparitions, compteurs, ressort interruptible, glisser pour fermer
- [x] Mouvement réduit, transparence réduite, contraste élevé
- [x] Styles d'impression
- [x] Zéro emoji, Bootstrap Icons partout

## Accueil (`index.html`)
- [x] Hero avec la Terre vue de l'espace, chiffres sourcés, compteur en direct
- [x] Fonctionnement en 3 étapes reliées
- [x] Carte en direct (non interactive) et panneau de verre
- [x] Chiffres clés animés à l'apparition
- [x] Technologies et carte satellite
- [x] Pied de page et mentions légales
- [ ] Liens réseaux sociaux et contact réels (aucune adresse fournie)

## Application citoyenne (`app.html`)
- [x] Carte plein écran, fonds Esri sombre / clair selon le thème
- [x] Marqueurs ronds colorés par sévérité (zone tactile 44 px), regroupements sombres
- [x] Infobulles en verre (confirmer, voir le détail)
- [x] Carte de chaleur, zones à risque, satellite Sentinel-2, ma position, zoom personnalisé
- [x] Filtres : type, sévérité minimale, statut, commune, période
- [x] Liste triable (récents, gravité, proches)
- [x] Classement avec podium
- [x] Détail : photo, analyse IA, confirmer / infirmer, partager (lien direct)
- [x] Alertes des autorités (pastille de nouveauté)
- [x] Recherche locale + lieux (Nominatim)
- [x] Assistant de signalement en 4 étapes, envoi, animation de réussite, +10 points, badges débloqués
- [x] Temps réel et notification des signalements à moins de 1 km
- [x] File d'attente hors ligne

## Tableau de bord (`dashboard.html`)
- [x] Contrôle d'accès par rôle
- [x] 4 indicateurs avec tendances sur 7 / 30 / 90 jours
- [x] Carte d'administration (statut modifiable depuis l'infobulle)
- [x] Tableau : tri, recherche, filtres, pagination, sélection groupée, assignation à un agent
- [x] Graphiques : par jour, par type, par commune, délai de résolution, sévérité, canal
- [x] Zones à risque (score, historique, voir sur la carte)
- [x] Création et historique des alertes
- [x] Export CSV (compatible Excel en français)
- [ ] Éditeur de polygones de zones à risque
- [ ] Optimisation des tournées de curage

## Comptes et profil
- [x] Connexion, inscription, mot de passe oublié, nouveau mot de passe
- [x] Profil : points, rang, prochain badge, badges, historique, édition
- [x] Paramètres : thème, langue, notifications, installation

## Supabase
- [x] Schéma, index spatiaux, colonnes `lat` / `lng` calculées
- [x] RLS durcie, déclencheurs de gamification, protection des colonnes sensibles
- [x] Bucket `photos` et politiques de stockage
- [x] Temps réel sur signalements et alertes
- [x] Fonctions Edge : analyse IA (Claude + Roboflow), WhatsApp, calcul du risque, alertes
- [ ] Projet Supabase créé et clés renseignées dans `js/config.js`
- [ ] Migration exécutée et fonctions déployées (jamais testées en conditions réelles)
- [ ] Secrets Anthropic / Twilio configurés, modèle WhatsApp approuvé pour les alertes

## PWA
- [x] Manifeste (icônes, icône masquable, raccourcis)
- [x] Service worker : coquille hors ligne, bibliothèques et tuiles en cache
- [x] Invitation à installer, bandeau hors ligne

## Reste à faire
- [ ] Faire relire les traductions wolof par un locuteur natif, puis en ajouter
- [ ] Vérifier le chiffre « 137,5 mm, oct. 2026 »
- [ ] Comparateur satellite avant / après
- [ ] Tests automatisés et intégration continue
- [ ] Vraies photos pour les signalements de démo

---

## Historique

| Date | Action | Commit |
|------|--------|--------|
| 2026-10-18 | Initialisation complète (29 fichiers) | `b4fc3b6` (ancien dépôt) |
| 2026-10-18 | Documentation projet | `699d0cf` (ancien dépôt) |
| 2026-10-19 | Projet déplacé dans son propre dépôt GitHub | `b866fd9` |
| 2026-10-19 | Refonte « Obsidian Glass » : design, 5 pages, mode démo, sécurité Supabase | non commité |
| 2026-10-19 | Mise en service Supabase (projet `debrisat`, eu-west-1) : migrations 001 à 004, 4 fonctions Edge, config.js | non commité |

## Mise en service Supabase (2026-10-19)

Vérifié :
- Schéma 001 appliqué sans erreur ; 002 (droits EXECUTE, RLS profils), 003 (performance), 004 (rôles) appliqués.
- Conseiller sécurité : restent `classement_public` en security definer (voulu) et `sessions_whatsapp` sans politique (voulu).
- Déclencheurs testés en SQL en se faisant passer pour un utilisateur : profil créé à l'inscription, +10 au signalement, badge « Premier pas », +3 à la vérification, refus de vérifier son propre signalement, statut / compteurs / rôle non falsifiables.
- Accès anonyme : pas de lecture de `profils`, `points_historique`, `sessions_whatsapp` ; fonctions internes refusées.
- Pages servies en http://localhost:5501 sans erreur console, sans badge « Mode démo », carte alimentée par Supabase.

Rôles : deux seulement, `citoyen` (par défaut) et `autorite`. Passage en autorité côté serveur uniquement :
`update public.profils set role = 'autorite' where id = '<uuid>';`

Écarts restants :
- Non testé dans le navigateur : envoi de photo (photos/<uid>/), temps réel entre deux onglets, tableau de bord autorité (statut, assignation, alerte). Comptes de test dans `.claude/comptes-test.md` (non versionné) ; la connexion doit être faite à la main.
- L'inscription par l'interface exige une adresse e-mail réelle (GoTrue vérifie le domaine) ; le SMTP par défaut de Supabase n'envoie qu'aux membres de l'équipe : configurer un SMTP (Resend, Brevo…) avant l'ouverture au public, ou désactiver la confirmation pendant la recette.
- Secrets à poser par l'équipe : `supabase secrets set ANTHROPIC_API_KEY=… TWILIO_ACCOUNT_SID=… TWILIO_AUTH_TOKEN=… TWILIO_NUMERO_SMS=… TWILIO_NUMERO_WHATSAPP=…`. Sans eux, analyser-image répond 503 et envoyer-alerte 503.
- Fonctions Edge à redéployer pour la nouvelle liste de rôles (`_shared/commun.ts`) ; sans effet pratique, la base n'accepte plus que deux rôles.
- La clé service_role a circulé en clair : la régénérer (Project Settings > API Keys). L'application utilise la clé publiable, non concernée.
- Ne jamais ouvrir les pages en `file://` : les modules ES y sont bloqués, la page reste vide.

## Finitions design et fluidité (2026-10-19)
- Pied de page : logo qui s'étirait sur toute la largeur, corrigé (`.logo-img`).
- Accueil : accord « 1 signalement actif » / « Aucun signalement actif ».
- Mobile : cibles tactiles de 44 px (petits boutons au doigt, recherche, logo de la barre) ; bouton flottant « + » masqué sous 768 px car la barre du bas a déjà « Signaler ».
- Chargement : `preconnect` vers Supabase, cdnjs, jsdelivr et les tuiles Esri sur les 5 pages.
- À poursuivre : passe complète du tableau de bord une fois connecté en autorité (non vérifié faute de session).

## Navigation, Google et comptes (2026-10-19)
- Barre de l'application : pilule de verre flottante (bord lumineux, séparateur après la marque), centrée et limitée à 1040 px dès la tablette ; repli opaque si `prefers-reduced-transparency`.
- Tableau de bord : navigation en tuiles d'icônes, élément actif sombre et brillant ; sur grand écran, bouton de repli en colonne d'icônes (84 px), choix mémorisé.
- Bouton « Continuer avec Google » (auth.html). **À activer par l'équipe** : Supabase > Authentication > Providers > Google (identifiant et secret OAuth Google Cloud), et ajouter `http://localhost:5501/app.html` et l'URL de production dans Redirect URLs. Tant que ce n'est pas fait, le bouton affiche un message clair au lieu de rediriger.
- Comptes de recette : 2 autorités, 2 citoyens (`.claude/comptes-test.md`, non versionné).
- Pied de page : taille du logo verrouillée, cache du service worker passé en v3 pour forcer le rechargement.

## Trois rôles et administration (2026-10-19, en cours)
Fait :
- Migrations 005 (rôles citoyen / agent_municipal / admin, codes d'accès, journal `logs_admin`, `config_site`, fonctions `admin_*`) et 006, appliquées.
- Inscription : type de compte, code d'accès AGT-XXXX-XXXX vérifié en SQL, case des conditions, jauge de robustesse. Redirection par rôle après connexion (`ACCUEIL_ROLE`), comptes désactivés déconnectés.
- `js/guard.js` (rôles + maintenance), espace agent limité à sa commune, `admin.html` + `js/admin.js` (utilisateurs, codes, configuration, journal ; reprend vue, signalements, carte, zones, alertes, analytiques).
- Profil : activation d'un code agent pour un citoyen déjà inscrit (ex. via Google).
- Testé en SQL : agent hors commune sans effet, agent de sa commune change statut et priorité, aucune auto-promotion, journal invisible aux agents, inscription avec code (agent rattaché, code consommé), journal alimenté (migration 007 : les déclencheurs lisent le rôle du JWT).
- Suppression d'un signalement par l'administrateur (tableau, avec confirmation).
Reste :
- Tester admin.html et dashboard.html connectés dans le navigateur (comptes dans `.claude/comptes-test.md`).
- Non fait du prompt : page « Satellite & IA » dédiée, export PDF, dessin de zones sur la carte.
- Committer, pousser, redéployer Vercel.
