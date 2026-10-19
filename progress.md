# Progress — Debrisat

Suivi de l'avancement du projet. Mis a jour a chaque etape importante.

**Derniere mise a jour** : 2026-10-19

---

## Checklist generale

### Infrastructure
- [x] Structure de fichiers complete
- [x] Schema SQL avec PostGIS, RLS, indexes
- [x] Seed data (badges, zones a risque)
- [x] Service Worker + manifest PWA
- [ ] Configuration Supabase (cles API)
- [ ] Deploiement du schema en production
- [ ] Bucket Storage "photos" cree
- [x] Icones PWA (192x192, 512x512)

### Landing page (`index.html`)
- [x] Hero avec stats dramatiques
- [x] Section "Comment ca marche" (3 etapes)
- [x] Compteur live signalements (Realtime)
- [x] Carte preview zones a risque
- [x] CTA vers app et dashboard
- [x] Footer
- [x] Dark mode
- [x] Responsive mobile

### App citoyen (`app.html`)
- [x] Carte Leaflet plein ecran centree sur Dakar
- [x] Marqueurs colores par severite
- [x] Popups avec photo, type, statut, actions
- [x] MarkerCluster pour zoom arriere
- [x] Heatmap toggle (leaflet.heat)
- [x] Zones a risque overlay (polygones)
- [x] Localisation utilisateur
- [x] Sidebar filtres (type, statut, severite, commune)
- [x] Liste signalements recents
- [x] Creation signalement 5 etapes (photo, type, severite, localisation, description)
- [x] Upload photo Supabase Storage
- [x] Gamification (points, badges, classement)
- [x] Panneau profil avec badges et leaderboard
- [x] Realtime (nouveaux signalements en direct)
- [x] Notification si signalement proche (<1km)
- [x] Verification communautaire (confirmer/infirmer)
- [x] Auth (connexion/inscription)

### Dashboard autorites (`dashboard.html`)
- [x] Sidebar navigation
- [x] Stats overview (5 cartes)
- [x] Graphique evolution 30 jours (line)
- [x] Graphique par type (donut)
- [x] Graphique par commune (bar)
- [x] Tableau signalements avec tri, filtre, recherche
- [x] Changement de statut depuis le tableau
- [x] Pagination
- [x] Export CSV
- [x] Carte admin avec marqueurs
- [x] Systeme d'alertes (creation + historique)
- [x] Realtime dashboard

### Edge Functions
- [x] `webhook-whatsapp` — bot WhatsApp Twilio
- [x] `analyser-image` — analyse IA Claude Vision
- [x] `calculer-risque` — score de risque par zone
- [x] `envoyer-alerte` — dispatch SMS/WhatsApp

### PWA / Offline
- [x] Service Worker (cache app shell + tuiles)
- [x] File d'attente offline (IndexedDB)
- [x] Sync automatique au retour en ligne
- [x] Prompt d'installation
- [x] Manifest avec theme color

### Design « Obsidian Glass »
- [x] Design system (tokens, verre, sombre par defaut + clair)
- [x] Zero emoji, Bootstrap Icons partout
- [x] Page `auth.html` (connexion / inscription / mot de passe oublie)
- [x] Page `profil.html` (niveau, badges, historique, parametres)
- [x] Mode demonstration sans Supabase
- [x] Accessibilite : lien d'evitement, focus visible, piege de focus des modales, aria-label, mouvement reduit
- [x] Responsive verifie a 375 / 768 / 1024 / 1440 px

### Non commence
- [ ] Traduction Wolof complete (base partielle dans `js/i18n.js`)
- [ ] Integration Sentinel-2 WMS reelle
- [ ] Route optimization pour equipes de nettoyage
- [ ] Editeur de zones a risque (draw polygons)
- [ ] Tests automatises
- [ ] CI/CD
- [x] Logo definitif (`img/logo.png`)

---

## Historique

| Date | Action | Commit |
|------|--------|--------|
| 2026-10-18 | Initialisation complete (29 fichiers, 4000 lignes) | `b4fc3b6` |
| 2026-10-19 | Refonte complete « Obsidian Glass » (5 pages, 8 CSS, 21 JS) | — |
