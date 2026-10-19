// Application citoyenne : orchestration de la carte, des filtres et des vues
window.debrisat.app = {
    carte: null,
    gestionnaire: null,
    chaleur: null,
    satellite: null,
    zones: null,
    tous: [],
    visibles: [],
    tri: 'recent',
    limiteListe: 30,
    recherche: '',
    STATUTS_DEFAUT: ['en_attente', 'verifie', 'en_cours'],

    async init() {
        const D = window.debrisat;
        const u = D.utils;
        await D.auth.init();

        try {
            this.carte = D.carte.creer('carte');
        } catch (e) {
            D.notifications.erreur(new Error('La carte n\'a pas pu être chargée. Vérifiez votre connexion.'));
            return;
        }
        this.gestionnaire = D.carte.gestionnaire(this.carte);
        this.chaleur = D.heatmap.creer(this.carte);
        this.satellite = D.satellite.creer(this.carte);

        this.initFiltres();
        D.signalement.init();
        this.lierEvenements();

        u.$('#listeSignalements').innerHTML = u.htmlSquelettes(5);

        D.router.init({
            vues: ['carte', 'liste', 'classement'],
            defaut: 'carte',
            actions: { signaler: () => D.signalement.ouvrir() },
            surChangement: (vue) => {
                document.body.classList.toggle('vue-ouverte', vue !== 'carte');
                if (vue === 'liste') this.afficherListe();
                if (vue === 'classement') this.chargerClassement();
                if (vue === 'carte') setTimeout(() => this.carte.invalidateSize(), 50);
            }
        });

        await this.chargerSignalements();
        this.chargerZones();
        this.chargerAlertes();

        D.realtime.init({
            surInsertion: (s) => {
                this.ajouterSignalement(s);
                if (!D.realtime.position) D.notifications.toast(`${u.infoType(s.type_obstruction).label} — ${s.adresse}, ${s.commune}`, 'info', 5000, 'Nouveau signalement');
            },
            surMiseAJour: (s) => this.mettreAJourSignalement(s)
        });

        if (!D.modeDemo) D.fileHorsLigne.synchroniser();
    },

    async chargerSignalements() {
        const D = window.debrisat;
        try {
            this.tous = (await D.donnees.listerSignalements()).filter(s => s.statut !== 'rejete');
            this.gestionnaire.definir(this.tous);
            this.chaleur.mettreAJour(this.tous);
            D.utils.$('#listeSignalements').setAttribute('aria-busy', 'false');
            this.appliquerFiltres();
        } catch (e) {
            D.notifications.erreur(e, 'Chargement des signalements');
            D.utils.$('#listeSignalements').innerHTML = '<div class="etat-vide"><i class="bi bi-wifi-off" aria-hidden="true"></i><p>Impossible de charger les signalements.</p><button type="button" class="btn btn-secondary btn-sm" data-action="recharger">Réessayer</button></div>';
        } finally {
            D.utils.$('#listeSignalements').setAttribute('aria-busy', 'false');
        }
    },

    async chargerZones() {
        try {
            const zones = await window.debrisat.donnees.listerZones();
            this.zones = window.debrisat.carte.dessinerZones(this.carte, zones);
        } catch (e) {
            console.warn('Zones à risque indisponibles :', e);
        }
    },

    // --- Filtres ---
    initFiltres() {
        const D = window.debrisat;
        const u = D.utils;
        u.$('#filtreTypes').innerHTML = Object.entries(D.TYPES_OBSTRUCTION).map(([cle, t]) => `
            <label class="checkbox">
                <input type="checkbox" name="type" value="${cle}" checked>
                <i class="bi ${t.icone}" aria-hidden="true"></i>${t.label}
            </label>`).join('');
        const select = u.$('#filtreCommune');
        D.COMMUNES.forEach(c => select.insertAdjacentHTML('beforeend', `<option value="${u.echapper(c)}">${u.echapper(c)}</option>`));
        this.majCurseurFiltre(1);
        u.$('#panneauFiltres').hidden = false;
    },

    majCurseurFiltre(niveau) {
        const D = window.debrisat;
        const curseur = D.utils.$('#filtreSeverite');
        curseur.style.setProperty('--progression', `${((niveau - 1) / 4) * 100}%`);
        curseur.style.setProperty('--couleur-piste', `var(--severity-${niveau})`);
        curseur.setAttribute('aria-valuetext', `${niveau}, ${D.SEVERITES[niveau].label}`);
        D.utils.$('#valeurSeveriteFiltre').textContent = `${niveau} — ${D.SEVERITES[niveau].label} et plus`;
    },

    lireFiltres() {
        const u = window.debrisat.utils;
        return {
            types: u.$$('#filtreTypes input:checked').map(i => i.value),
            severiteMin: parseInt(u.$('#filtreSeverite').value, 10),
            statuts: u.$$('#filtreStatuts .chip[aria-pressed="true"]').map(c => c.dataset.statut),
            commune: u.$('#filtreCommune').value,
            debut: u.$('#filtreDebut').value,
            fin: u.$('#filtreFin').value
        };
    },

    normaliserTexte(t) {
        return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    },

    appliquerFiltres() {
        const D = window.debrisat;
        const u = D.utils;
        const f = this.lireFiltres();
        const nbTypes = Object.keys(D.TYPES_OBSTRUCTION).length;
        const debut = f.debut ? new Date(f.debut + 'T00:00:00').getTime() : null;
        const fin = f.fin ? new Date(f.fin + 'T23:59:59').getTime() : null;
        const terme = this.normaliserTexte(this.recherche);

        this.visibles = this.gestionnaire.filtrer(s => {
            if (!f.types.includes(s.type_obstruction)) return false;
            if ((s.severite || 1) < f.severiteMin) return false;
            if (!f.statuts.includes(s.statut)) return false;
            if (f.commune && s.commune !== f.commune) return false;
            const t = new Date(s.created_at).getTime();
            if (debut && t < debut) return false;
            if (fin && t > fin) return false;
            if (terme) {
                const texte = this.normaliserTexte(`${s.adresse} ${s.commune} ${s.quartier} ${u.infoType(s.type_obstruction).label}`);
                if (!texte.includes(terme)) return false;
            }
            return true;
        });

        let actifs = 0;
        if (f.types.length !== nbTypes) actifs++;
        if (f.severiteMin > 1) actifs++;
        if (f.statuts.slice().sort().join() !== this.STATUTS_DEFAUT.slice().sort().join()) actifs++;
        if (f.commune) actifs++;
        if (f.debut || f.fin) actifs++;
        const compteur = u.$('#compteurFiltres');
        compteur.hidden = actifs === 0;
        compteur.textContent = actifs;
        u.$('#btnFiltres').setAttribute('aria-label', actifs ? `Afficher les filtres, ${actifs} actif${actifs > 1 ? 's' : ''}` : 'Afficher les filtres');

        u.$('#compteResultats').textContent = u.formatNombre(this.visibles.length);
        u.$('#compteListe').textContent = u.formatNombre(this.visibles.length);
        if (D.router.actuelle === 'liste') this.afficherListe();
    },

    reinitialiserFiltres() {
        const u = window.debrisat.utils;
        u.$$('#filtreTypes input').forEach(i => { i.checked = true; });
        u.$('#filtreSeverite').value = 1;
        this.majCurseurFiltre(1);
        u.$$('#filtreStatuts .chip').forEach(c => c.setAttribute('aria-pressed', String(this.STATUTS_DEFAUT.includes(c.dataset.statut))));
        u.$('#filtreCommune').value = '';
        u.$('#filtreDebut').value = '';
        u.$('#filtreFin').value = '';
        this.appliquerFiltres();
    },

    basculerFiltres(ouvrir) {
        const u = window.debrisat.utils;
        const panneau = u.$('#panneauFiltres');
        const etat = typeof ouvrir === 'boolean' ? ouvrir : !panneau.classList.contains('ouvert');
        panneau.classList.toggle('ouvert', etat);
        u.$('#btnFiltres').setAttribute('aria-expanded', String(etat));
        if (etat) setTimeout(() => panneau.querySelector('input, button')?.focus({ preventScroll: true }), 300);
        else u.$('#btnFiltres').focus({ preventScroll: true });
    },

    // --- Liste ---
    afficherListe() {
        const u = window.debrisat.utils;
        const conteneur = u.$('#listeSignalements');
        if (conteneur.getAttribute('aria-busy') === 'true') return;
        const tries = [...this.visibles].sort(this.tri === 'severite'
            ? (a, b) => b.severite - a.severite || new Date(b.created_at) - new Date(a.created_at)
            : (a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (!tries.length) {
            conteneur.innerHTML = `<div class="etat-vide"><i class="bi bi-funnel" aria-hidden="true"></i><p>Aucun signalement ne correspond à vos filtres.</p><button type="button" class="btn btn-secondary btn-sm" data-action="reinitialiser-filtres">Réinitialiser les filtres</button></div>`;
            return;
        }

        conteneur.innerHTML = tries.slice(0, this.limiteListe).map(s => {
            const type = u.infoType(s.type_obstruction);
            return `
                <button type="button" class="card-signalement" data-action="ouvrir-sur-carte" data-id="${u.echapper(s.id)}">
                    ${u.htmlVisuel(s, 'vignette')}
                    <span class="meta">
                        <span class="titre"><i class="bi ${type.icone}" aria-hidden="true"></i>${u.echapper(type.label)}</span>
                        <span class="adresse"><i class="bi bi-geo-alt" aria-hidden="true"></i> ${u.echapper(s.adresse)}, ${u.echapper(s.commune)}</span>
                        <span class="pied">${u.htmlStatut(s.statut)}${u.htmlSeverite(s.severite)}<span>${u.formatDate(s.created_at)}</span></span>
                    </span>
                </button>`;
        }).join('') + (tries.length > this.limiteListe
            ? `<button type="button" class="btn btn-secondary btn-sm plus-resultats" data-action="plus-resultats">Afficher plus (${tries.length - this.limiteListe} restants)</button>`
            : '');
    },

    // --- Classement ---
    async chargerClassement() {
        const D = window.debrisat;
        const u = D.utils;
        const liste = u.$('#listeClassement');
        if (liste.dataset.charge) return;
        liste.innerHTML = Array.from({ length: 6 }, () => '<li aria-hidden="true"><span></span><span class="skeleton skeleton-circle"></span><span class="skeleton skeleton-text" style="--largeur:70%;margin:0"></span><span class="skeleton skeleton-text" style="width:48px;margin:0"></span></li>').join('');
        try {
            const classement = await D.donnees.classement();
            const idMoi = D.auth.profil?.id;
            D.gamification.afficherClassement(liste, classement, idMoi);
            liste.dataset.charge = '1';
            liste.setAttribute('aria-busy', 'false');

            const ma = u.$('#maPosition');
            const profil = D.auth.profil;
            if (profil) {
                const rang = classement.findIndex(p => p.id === idMoi) + 1;
                const niveau = D.gamification.niveau(profil.points_total);
                ma.innerHTML = `
                    <span class="rang-grand">${rang ? '#' + rang : '—'}</span>
                    <div class="flex-1">
                        <p class="texte-sm"><strong>Votre position</strong> · ${u.echapper(niveau.nom)}</p>
                        <div class="jauge mt-4" role="progressbar" aria-valuenow="${niveau.progression}" aria-valuemin="0" aria-valuemax="100" aria-label="Progression vers le niveau suivant"><div class="jauge-remplissage" style="width:${niveau.progression}%"></div></div>
                        <p class="texte-xs texte-muet" style="margin-top:6px">${niveau.suivant ? `${niveau.restant} points avant « ${u.echapper(niveau.suivant)} »` : 'Niveau maximal atteint'}</p>
                    </div>
                    <span class="chiffre">${u.formatNombre(profil.points_total)} pts</span>`;
            } else {
                ma.innerHTML = `<i class="bi bi-person-circle" aria-hidden="true" style="font-size:1.5rem"></i><p class="flex-1 texte-sm">Connectez-vous pour apparaître dans le classement.</p><a class="btn btn-primary btn-sm" href="auth.html?retour=app.html%23classement">Connexion</a>`;
            }
        } catch (e) {
            D.notifications.erreur(e, 'Classement');
            liste.innerHTML = '<li class="etat-vide"><i class="bi bi-wifi-off" aria-hidden="true"></i><p>Classement indisponible.</p></li>';
        }
    },

    // --- Alertes ---
    async chargerAlertes() {
        const D = window.debrisat;
        const u = D.utils;
        try {
            const alertes = await D.donnees.listerAlertes();
            const icones = { critique: 'bi-exclamation-octagon', danger: 'bi-cloud-rain-heavy', attention: 'bi-exclamation-triangle', info: 'bi-info-circle' };
            u.$('#listeAlertes').innerHTML = alertes.length ? alertes.map(a => `
                <li class="alerte-item alerte-${u.echapper(a.type_alerte)}">
                    <span class="alerte-icone"><i class="bi ${icones[a.type_alerte] || icones.info}" aria-hidden="true"></i></span>
                    <div>
                        <h3>${u.echapper(a.titre)}</h3>
                        <p>${u.echapper(a.message)}</p>
                        <time datetime="${u.echapper(a.created_at)}">${u.formatDate(a.created_at)}</time>
                    </div>
                </li>`).join('') : '<li class="etat-vide"><i class="bi bi-bell" aria-hidden="true"></i><p>Aucune alerte en cours.</p></li>';
            const vues = u.lireLocal('debrisat-alertes-vues', 0);
            u.$('#pointAlertes').hidden = alertes.length <= vues;
            u.$('#modaleAlertes').addEventListener('modale:ouverte', () => {
                u.ecrireLocal('debrisat-alertes-vues', alertes.length);
                u.$('#pointAlertes').hidden = true;
            });
        } catch (e) {
            u.$('#listeAlertes').innerHTML = '<li class="etat-vide"><i class="bi bi-wifi-off" aria-hidden="true"></i><p>Alertes indisponibles.</p></li>';
        }
    },

    // --- Signalements ---
    trouver(id) {
        return this.tous.find(s => s.id === id);
    },

    ajouterSignalement(s) {
        this.tous = [s, ...this.tous.filter(x => x.id !== s.id)];
        this.gestionnaire.ajouter(s);
        this.chaleur.mettreAJour(this.tous);
        this.appliquerFiltres();
    },

    mettreAJourSignalement(s) {
        if (s.statut === 'rejete') {
            this.tous = this.tous.filter(x => x.id !== s.id);
            this.gestionnaire.definir(this.tous);
        } else {
            const ancien = this.trouver(s.id);
            this.ajouterSignalement({ ...ancien, ...s, auteur: ancien?.auteur || s.auteur });
        }
        this.appliquerFiltres();
    },

    ouvrirSurCarte(id) {
        window.debrisat.router.aller('carte');
        setTimeout(() => this.gestionnaire.ouvrir(id), 120);
    },

    async confirmer(id, bouton) {
        const D = window.debrisat;
        if (!D.auth.exigerConnexion()) return;
        D.utils.boutonChargement(bouton, true, 'Envoi…');
        try {
            const maj = await D.donnees.confirmerSignalement(id);
            if (maj) {
                const fusion = { ...this.trouver(id), ...maj };
                this.tous = this.tous.map(s => s.id === id ? fusion : s);
                const m = this.gestionnaire.marqueurs.get(id);
                if (m) m.signalement = fusion;
                document.querySelectorAll(`[data-compte-confirmations="${CSS.escape(id)}"]`).forEach(el => {
                    el.textContent = `${fusion.nombre_confirmations} confirmation${fusion.nombre_confirmations > 1 ? 's' : ''}`;
                });
            }
            await D.gamification.ajouterPoints(D.POINTS.verification, 'verification', id);
            D.notifications.toast(`Merci ! +${D.POINTS.verification} points.`, 'success', 4000, 'Confirmation enregistrée');
            D.utils.animerPoints(D.POINTS.verification);
            D.utils.boutonChargement(bouton, false);
            if (bouton) {
                bouton.disabled = true;
                bouton.innerHTML = '<i class="bi bi-check-lg" aria-hidden="true"></i>Confirmé';
            }
        } catch (e) {
            D.utils.boutonChargement(bouton, false);
            D.notifications.toast(e.message, /déjà/.test(e.message) ? 'warning' : 'error');
        }
    },

    afficherDetail(id) {
        const D = window.debrisat;
        const u = D.utils;
        const s = this.trouver(id);
        if (!s) return;
        const type = u.infoType(s.type_obstruction);
        const sev = D.SEVERITES[s.severite];
        const etapes = [
            { label: 'Signalé', fait: true, date: s.created_at },
            { label: 'Vérifié par la communauté', fait: ['verifie', 'en_cours', 'resolu'].includes(s.statut) },
            { label: 'Intervention en cours', fait: ['en_cours', 'resolu'].includes(s.statut) },
            { label: 'Résolu', fait: s.statut === 'resolu', date: s.resolu_at }
        ];
        const sources = { webapp: 'Application', whatsapp: 'WhatsApp', satellite: 'Satellite Sentinel-2' };

        u.$('#contenuDetail').innerHTML = `
            ${u.htmlVisuel(s, 'detail-visuel')}
            <div class="detail-entete">
                <h3><i class="bi ${type.icone}" aria-hidden="true"></i>${u.echapper(type.label)}</h3>
                ${u.htmlStatut(s.statut)}
            </div>
            ${s.description ? `<p class="texte-secondaire">${u.echapper(s.description)}</p>` : ''}
            <dl class="detail-grille">
                <div><dt>Sévérité</dt><dd>${u.htmlSeverite(s.severite)} ${sev.label}</dd></div>
                <div><dt>Confirmations</dt><dd><i class="bi bi-check-circle" aria-hidden="true"></i>${s.nombre_confirmations || 0}</dd></div>
                <div><dt>Adresse</dt><dd>${u.echapper(s.adresse)}</dd></div>
                <div><dt>Commune</dt><dd><i class="bi bi-building" aria-hidden="true"></i>${u.echapper(s.commune)}</dd></div>
                <div><dt>Signalé par</dt><dd>${u.echapper(s.auteur)}</dd></div>
                <div><dt>Source</dt><dd>${sources[s.source] || s.source}</dd></div>
                <div><dt>Date</dt><dd><i class="bi bi-calendar3" aria-hidden="true"></i>${u.formatDateComplete(s.created_at)}</dd></div>
                <div><dt>Référence</dt><dd class="chiffre texte-sm">${u.idCourt(s.id)}</dd></div>
            </dl>
            <h4 class="label">Suivi</h4>
            <ol class="chronologie">
                ${etapes.map(e => `<li class="${e.fait ? 'fait' : ''}">${e.label}${e.date && e.fait ? `<small>${u.formatDateComplete(e.date)}</small>` : ''}</li>`).join('')}
            </ol>`;
        const btn = u.$('#btnConfirmerDetail');
        btn.dataset.id = s.id;
        btn.disabled = ['resolu', 'rejete'].includes(s.statut);
        btn.innerHTML = '<i class="bi bi-check-circle" aria-hidden="true"></i>Confirmer';
        u.$('#btnPartager').dataset.id = s.id;
        D.modale.ouvrir('modaleDetail');
    },

    async partager(id) {
        const D = window.debrisat;
        const s = this.trouver(id);
        if (!s) return;
        const texte = `${D.utils.infoType(s.type_obstruction).label} signalé à ${s.adresse}, ${s.commune} (sévérité ${s.severite}/5) — Debrisat`;
        const url = `${location.origin}${location.pathname}#carte`;
        try {
            if (navigator.share) await navigator.share({ title: 'Signalement Debrisat', text: texte, url });
            else {
                await navigator.clipboard.writeText(`${texte} ${url}`);
                D.notifications.toast('Lien copié dans le presse-papiers.', 'success', 3000);
            }
        } catch (e) {
            if (e.name !== 'AbortError') D.notifications.toast('Partage impossible sur cet appareil.', 'warning');
        }
    },

    async localiser(bouton) {
        const D = window.debrisat;
        D.utils.boutonChargement(bouton, true, '');
        try {
            const pos = await D.utils.obtenirPosition();
            this.carte.flyTo([pos.lat, pos.lng], 16, { duration: 0.8 });
            if (this.marqueurMoi) this.marqueurMoi.setLatLng([pos.lat, pos.lng]);
            else this.marqueurMoi = L.marker([pos.lat, pos.lng], { icon: D.carte.iconeUtilisateur(), keyboard: false, title: 'Votre position' }).addTo(this.carte);
            D.realtime.position = pos;
        } catch (e) {
            D.notifications.toast(e.message, 'warning');
        } finally {
            D.utils.boutonChargement(bouton, false);
        }
    },

    lierEvenements() {
        const D = window.debrisat;
        const u = D.utils;

        document.addEventListener('click', (e) => {
            const cible = e.target.closest('[data-action]');
            if (!cible) return;
            const id = cible.dataset.id;
            switch (cible.dataset.action) {
                case 'signaler': D.signalement.ouvrir(); break;
                case 'zoom-plus': this.carte.zoomIn(); break;
                case 'zoom-moins': this.carte.zoomOut(); break;
                case 'localiser': this.localiser(cible); break;
                case 'chaleur': cible.setAttribute('aria-pressed', String(this.chaleur.basculer())); break;
                case 'satellite': cible.setAttribute('aria-pressed', String(this.satellite.basculer())); break;
                case 'zones': {
                    if (!this.zones) break;
                    const visible = this.carte.hasLayer(this.zones);
                    if (visible) this.carte.removeLayer(this.zones);
                    else this.zones.addTo(this.carte);
                    cible.setAttribute('aria-pressed', String(!visible));
                    break;
                }
                case 'fermer-filtres': this.basculerFiltres(false); break;
                case 'reinitialiser-filtres': this.reinitialiserFiltres(); break;
                case 'confirmer': this.confirmer(id, cible); break;
                case 'voir-detail': this.afficherDetail(id); break;
                case 'ouvrir-sur-carte': this.ouvrirSurCarte(id); break;
                case 'partager': this.partager(id); break;
                case 'plus-resultats':
                    this.limiteListe += 30;
                    this.afficherListe();
                    break;
                case 'recharger': this.chargerSignalements(); break;
            }
        });

        u.$('#btnFiltres').addEventListener('click', () => this.basculerFiltres());
        this.carte.on('click', () => {
            if (window.innerWidth < 768 && u.$('#panneauFiltres').classList.contains('ouvert')) this.basculerFiltres(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && u.$('#panneauFiltres').classList.contains('ouvert') && !D.modale.pile.length) this.basculerFiltres(false);
        });

        u.$('#formFiltres').addEventListener('change', () => this.appliquerFiltres());
        u.$('#filtreSeverite').addEventListener('input', (e) => {
            this.majCurseurFiltre(parseInt(e.target.value, 10));
            this.appliquerFiltres();
        });
        u.$('#filtreStatuts').addEventListener('click', (e) => {
            const puce = e.target.closest('.chip');
            if (!puce) return;
            puce.setAttribute('aria-pressed', String(puce.getAttribute('aria-pressed') !== 'true'));
            this.appliquerFiltres();
        });

        u.$$('[data-tri]').forEach(b => b.addEventListener('click', () => {
            this.tri = b.dataset.tri;
            u.$$('[data-tri]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            this.afficherListe();
        }));

        const champ = u.$('#champRecherche');
        champ.addEventListener('input', u.debounce(() => {
            this.recherche = champ.value.trim();
            this.appliquerFiltres();
        }, 200));
        u.$('#formRecherche').addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.visibles.length) {
                const groupe = L.featureGroup(this.visibles.map(s => L.marker([s.lat, s.lng])));
                this.carte.fitBounds(groupe.getBounds().pad(0.2), { maxZoom: 16 });
            } else {
                D.notifications.toast('Aucun signalement trouvé pour cette recherche.', 'info', 3000);
            }
        });
        u.$('#btnRechercheMobile').addEventListener('click', (e) => {
            const form = u.$('#formRecherche');
            const ouvert = form.classList.toggle('ouverte');
            e.currentTarget.setAttribute('aria-expanded', String(ouvert));
            if (ouvert) champ.focus();
        });
    }
};

document.addEventListener('DOMContentLoaded', () => window.debrisat.app.init());
