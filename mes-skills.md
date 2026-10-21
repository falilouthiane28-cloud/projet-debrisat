# Mes skills Claude

Inventaire au 21 octobre 2026, relevé depuis la session Claude Code (skills synchronisés depuis le compte claude.ai, plugins activés et skills intégrés).

## 1. Skills personnels (synchronisés depuis mon compte)

Appel : `/anthropic-skills:<nom>` ou automatiquement selon la demande.

| Skill | Rôle |
|---|---|
| `dakar-house` | Conventions et architecture du projet Dakar-House (location immobilière à Dakar) : stack imposée, structure, marque, procédures d'édition. |
| `10k-websites` | Construire et déployer un site cinématique piloté par le défilement (vidéo en héros) pour n'importe quelle activité ; installation de Higgsfield, Hostinger, ffmpeg, Node.js. |
| `scroll-world` | Page d'accueil immersive « vol à travers un monde » au défilement (diorama isométrique), scènes et clips générés avec Higgsfield. |
| `video-to-website` | Transformer une vidéo en site animé au défilement (GSAP, rendu image par image sur canvas). |
| `bloom-bridge-google-flow` | Convertir un brief motion design Bloom Bridge en prompt Google Flow (Gemini / Veo) seconde par seconde. |
| `video-reference-vers-prompt-flow` | Analyser une vidéo de référence plan par plan et produire un prompt vidéo Google Flow prêt à coller. |
| `ui-ux-pro-max` | Base de connaissances UI/UX : 84 styles, 192 palettes, 74 paires de polices, guides UX, préréglages GSAP, 22 stacks. |
| `frontend-design` | Direction artistique et typographie pour des interfaces distinctives, loin des gabarits par défaut. |
| `deep-research` | Recherche multi-sources et rapport de synthèse narratif. |
| `docs` | Documents éditables et partageables (rapport, CV, lettre, guide…), exportables en Word, PDF, Markdown, Google Docs. |
| `docx` | Créer, lire et modifier des fichiers Word (.docx / .dotx). |
| `pdf` | Tout sur les PDF : extraction, fusion, découpe, formulaires, filigranes, OCR. |
| `pptx` | Créer, lire et modifier des présentations PowerPoint (.pptx / .potx). |
| `xlsx` | Créer, lire, nettoyer et modifier des tableurs (.xlsx, .csv, .tsv). |
| `google-workspace` | Créer ou modifier des Google Docs, Sheets et Slides dans Drive. |
| `skill-creator` | Créer, modifier, évaluer et optimiser des skills. |
| `import-memory` | Importer la mémoire exportée d'un autre assistant IA. |
| `morning` | Brief du matin en page HTML, ou tâche récurrente en semaine. |
| `computer-use` | Contrôler les applications de l'ordinateur (captures, clics, saisie) via l'app de bureau Claude. |
| `chrome-browser` | Utiliser l'extension Claude in Chrome dans le vrai navigateur. |
| `built-in-browser` | Utiliser le navigateur intégré à l'app de bureau Claude. |

## 2. Plugins activés

### productivity
| Skill | Rôle |
|---|---|
| `productivity:start` | Initialiser le système de productivité et ouvrir le tableau de bord. |
| `productivity:task-management` | Gestion des tâches dans un fichier `TASKS.md`. |
| `productivity:memory-management` | Mémoire à deux niveaux (CLAUDE.md + dossier `memory/`) : sigles, surnoms, jargon interne. |
| `productivity:update` | Synchroniser les tâches et rafraîchir la mémoire depuis les outils (Asana, Linear, Slack, Notion…). |

### motion-design-pro
| Skill / agent | Rôle |
|---|---|
| `motion-design-pro:motion-design` | Motion design web de qualité cinéma : GSAP, Motion.dev, Three.js, Lottie, sections héros animées. |
| `motion-design-pro:asset-researcher` (agent) | Recherche d'images, icônes, polices, sons, animations Lottie et modèles 3D gratuits. |

## 3. Skills intégrés à Claude Code

| Skill | Rôle |
|---|---|
| `init` | Générer un `CLAUDE.md` pour un projet. |
| `code-review` | Revue du diff ou d'une PR (bugs, simplifications), avec `--comment` ou `--fix`. |
| `security-review` | Revue de sécurité des changements de la branche. |
| `simplify` | Nettoyer le code modifié (réutilisation, simplification, efficacité). |
| `run` | Lancer l'application pour vérifier un changement. |
| `loop` | Exécuter une commande ou un prompt à intervalle régulier. |
| `session-start-hook` | Créer un hook de démarrage pour les sessions cloud. |
| `update-config` | Configurer `settings.json` (permissions, hooks, variables). |
| `fewer-permission-prompts` | Ajouter une liste d'autorisations pour réduire les demandes de permission. |
| `keybindings-help` | Personnaliser les raccourcis clavier. |
| `plugin-authoring` | Créer un mod (panneau, barre d'état, commande, hook). |
| `claude-api` | Référence de l'API Claude et du SDK Anthropic. |
| `dataviz` | Méthode pour graphiques et tableaux de bord cohérents et accessibles. |
| `artifact-design` | Règles de conception des Artifacts. |
| `artifact-diagramming` | Diagrammes SVG lisibles dans les Artifacts. |
| `artifact-capabilities` | Capacités d'exécution des Artifacts (données, état partagé, fichiers…). |
