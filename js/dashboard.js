// Tableau de bord des autorites
window.debrisat.dashboard = {
    tous: [],
    zones: [],
    alertes: [],
    periode: 30,
    commune: '',
    onglet: 'carte',
    tableau: { page: 1, parPage: 10, tri: 'created_at', asc: false, recherche: '', statut: '', selection: new Set() },
    graphiques: {},
    carte: null,
    gestionnaire: null,
    ONGLETS: { carte: 'ongletCarte', signalements: 'ongletTableau', alertes: 'ongletAlertes' },
    TITRES: {
        apercu: 'Vue d\'ensemble', signalements: 'Signalements', carte: 'Carte', alertes: 'Alertes',
        zones: 'Zones à risque', statistiques: 'Statistiques', parametres: 'Paramètres'
    },
    ROLES: { citoyen: 'Citoyen', agent_municipal: 'Agent municipal', autorite: 'Autorité', admin: 'Administrateur' },

    async init() {
        const D = window.debrisat;
        const u = D.utils;
        await D.auth.init();

        if (!D.modeDemo && !D.auth.exigerConnexion('dashboard.html')) return;
        u.$('#badgeRole').textContent = D.modeDemo ? 'Démo' : (this.ROLES[D.auth.profil?.role] || 'Agent');
        if (!D.auth.estAutorite()) {
            u.$$('[data-vue]').forEach(s => s.remove());
            u.$('#accesRefuse').hidden = false;
            return;
        }

        this.remplirSelecteurs();
        this.lierEvenements();
        this.appliquerThemeGraphiques();

        D.router.init({
            vues: ['apercu', 'signalements', 'carte', 'alertes', 'zones', 'statistiques', 'parametres'],
            defaut: 'apercu',
            surChangement: (vue) => this.changerVue(vue)
        });

        await this.charger();

        D.realtime.init({
            notifierProximite: false,
            surInsertion: (s) => {
                this.tous = [s, ...this.tous.filter(x => x.id !== s.id)];
                this.rendreTout();
                const type = u.infoType(s.type_obstruction).label;
                const preferences = u.lireLocal('debrisat-preferences', {});
                if (s.severite >= 4 && preferences['notif-critiques'] !== false) {
                    D.notifications.envoyer('Signalement critique', `${type} (sévérité ${s.severite}/5) — ${s.adresse}, ${s.commune}`, 'warning');
                } else {
                    D.notifications.toast(`${type} — ${s.adresse}, ${s.commune}`, 'info', 5000, 'Nouveau signalement');
                }
            },
            surMiseAJour: (s) => {
                this.tous = this.tous.map(x => x.id === s.id ? { ...x, ...s, auteur: x.auteur } : x);
                this.rendreTout();
            }
        });
    },

    async charger() {
        const D = window.debrisat;
        try {
            const [signalements, zones, alertes] = await Promise.all([
                D.donnees.listerSignalements(),
                D.donnees.listerZones(),
                D.donnees.listerAlertes()
            ]);
            this.tous = signalements;
            this.zones = zones;
            this.alertes = alertes;
            const select = D.utils.$('#alerteZone');
            zones.forEach(z => select.insertAdjacentHTML('beforeend', `<option value="${D.utils.echapper(z.id)}">${D.utils.echapper(z.nom)} (${z.score_risque}/100)</option>`));
            this.rendreTout();
            this.rendreAlertes();
        } catch (e) {
            D.notifications.erreur(e, 'Chargement du tableau de bord');
            D.utils.$('#corpsTableau').innerHTML = '<tr class="ligne-vide"><td colspan="9"><div class="etat-vide"><i class="bi bi-wifi-off" aria-hidden="true"></i><p>Données indisponibles. Vérifiez la connexion puis rechargez.</p></div></td></tr>';
        }
    },

    remplirSelecteurs() {
        const D = window.debrisat;
        const u = D.utils;
        const communes = u.$('#filtreCommuneDash');
        D.COMMUNES.forEach(c => communes.insertAdjacentHTML('beforeend', `<option value="${u.echapper(c)}">${u.echapper(c)}</option>`));
        Object.entries(D.STATUTS).forEach(([cle, s]) => {
            u.$('#filtreStatutTableau').insertAdjacentHTML('beforeend', `<option value="${cle}">${s.label}</option>`);
            u.$('#actionGroupee').insertAdjacentHTML('beforeend', `<option value="${cle}">${s.label}</option>`);
        });
        const preferences = u.lireLocal('debrisat-preferences', {});
        u.$$('[data-preference]').forEach(c => {
            if (c.dataset.preference in preferences) c.checked = preferences[c.dataset.preference];
        });
    },

    // --- Navigation ---
    changerVue(vue) {
        const u = window.debrisat.utils;
        u.$('#filAriane').textContent = this.TITRES[vue] || '';
        document.title = `${this.TITRES[vue]} — Espace Autorités — Debrisat`;
        this.basculerSidebar(false);
        if (this.ONGLETS[vue]) this.choisirOnglet(vue);
        else if (vue === 'apercu') this.choisirOnglet(this.onglet);
        if (vue === 'zones') this.rendreZones();
        if (vue === 'statistiques') this.rendreStatistiques();
        if (['apercu', 'signalements', 'carte', 'alertes'].includes(vue)) this.rendreGraphiquesApercu();
        window.scrollTo({ top: 0 });
    },

    choisirOnglet(nom) {
        const u = window.debrisat.utils;
        this.onglet = nom;
        Object.entries(this.ONGLETS).forEach(([cle, id]) => {
            const onglet = document.getElementById(id);
            const actif = cle === nom;
            onglet.setAttribute('aria-selected', String(actif));
            onglet.tabIndex = actif ? 0 : -1;
            document.getElementById(onglet.getAttribute('aria-controls')).hidden = !actif;
        });
        if (nom === 'carte') this.initCarte();
        if (nom === 'signalements') this.rendreTableau();
        u.$('#compteFiltre').textContent = u.formatNombre(this.signalementsPeriode().length);
    },

    basculerSidebar(ouvrir) {
        const u = window.debrisat.utils;
        const sidebar = u.$('#sidebar');
        sidebar.classList.toggle('ouverte', ouvrir);
        u.$('#voileSidebar').classList.toggle('active', ouvrir);
        u.$('.dash-hamburger').setAttribute('aria-expanded', String(ouvrir));
        if (ouvrir) sidebar.querySelector('.sidebar-item')?.focus();
    },

    // --- Filtrage ---
    signalementsPeriode(decalage = 0) {
        const maintenant = Date.now();
        const duree = this.periode * 86400000;
        const fin = maintenant - decalage * duree;
        const debut = fin - duree;
        return this.tous.filter(s => {
            if (this.commune && s.commune !== this.commune) return false;
            if (!this.periode) return true;
            const t = new Date(s.created_at).getTime();
            return t > debut && t <= fin;
        });
    },

    signalementsTableau() {
        const u = window.debrisat.utils;
        const t = this.tableau;
        const terme = t.recherche.toLowerCase();
        const liste = this.signalementsPeriode().filter(s => {
            if (t.statut && s.statut !== t.statut) return false;
            if (!terme) return true;
            return `${s.adresse} ${s.commune} ${u.idCourt(s.id)} ${u.infoType(s.type_obstruction).label} ${s.auteur}`.toLowerCase().includes(terme);
        });
        const ordreStatut = Object.keys(window.debrisat.STATUTS);
        liste.sort((a, b) => {
            let va = a[t.tri];
            let vb = b[t.tri];
            if (t.tri === 'created_at') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
            if (t.tri === 'statut') { va = ordreStatut.indexOf(va); vb = ordreStatut.indexOf(vb); }
            if (t.tri === 'type_obstruction') { va = u.infoType(va).label; vb = u.infoType(vb).label; }
            const comparaison = typeof va === 'string' ? va.localeCompare(vb, 'fr') : va - vb;
            return t.asc ? comparaison : -comparaison;
        });
        return liste;
    },

    // --- Rendu ---
    rendreTout() {
        const u = window.debrisat.utils;
        this.rendreStats();
        if (this.gestionnaire) {
            this.gestionnaire.definir(this.signalementsPeriode().filter(s => s.statut !== 'rejete'));
            this.chaleur.mettreAJour(this.signalementsPeriode());
        }
        if (this.onglet === 'signalements') this.rendreTableau();
        const vue = window.debrisat.router.actuelle;
        if (['apercu', 'signalements', 'carte', 'alertes'].includes(vue)) this.rendreGraphiquesApercu();
        if (vue === 'zones') this.rendreZones();
        if (vue === 'statistiques') this.rendreStatistiques();
        u.$('#compteFiltre').textContent = u.formatNombre(this.signalementsPeriode().length);
        const enAttente = this.tous.filter(s => s.statut === 'en_attente').length;
        const compteur = u.$('#compteurAttente');
        compteur.hidden = !enAttente;
        compteur.textContent = enAttente;
        compteur.setAttribute('aria-label', `${enAttente} en attente`);
    },

    rendreStats() {
        const u = window.debrisat.utils;
        const actuels = this.signalementsPeriode();
        const precedents = this.periode ? this.signalementsPeriode(1) : null;
        const compter = (liste, cle) => cle === 'total' ? liste.length : liste.filter(s => s.statut === cle).length;

        ['total', 'en_attente', 'en_cours', 'resolu'].forEach(cle => {
            const valeur = compter(actuels, cle);
            u.$(`[data-stat="${cle}"]`).textContent = u.formatNombre(valeur);
            const zone = u.$(`[data-tendance="${cle}"]`);
            if (!precedents) {
                zone.innerHTML = '';
                return;
            }
            const avant = compter(precedents, cle);
            const variation = avant ? Math.round(((valeur - avant) / avant) * 100) : (valeur ? 100 : 0);
            const hausse = variation > 0;
            const favorable = cle === 'resolu' ? hausse : !hausse;
            zone.className = `tendance ${variation === 0 ? 'neutre' : favorable ? 'positive' : 'hausse'}`;
            zone.innerHTML = `<i class="bi ${variation === 0 ? 'bi-dash' : hausse ? 'bi-arrow-up' : 'bi-arrow-down'}" aria-hidden="true"></i>${Math.abs(variation)}%`;
            zone.title = `${hausse ? 'Hausse' : variation < 0 ? 'Baisse' : 'Stable'} par rapport à la période précédente (${avant})`;
            zone.setAttribute('aria-label', zone.title);
        });
    },

    initCarte() {
        const D = window.debrisat;
        if (this.carte) {
            setTimeout(() => this.carte.invalidateSize(), 50);
            return;
        }
        this.carte = D.carte.creer('dashCarte', { zoom: 11 });
        L.control.zoom({ position: 'bottomright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(this.carte);
        this.gestionnaire = D.carte.gestionnaire(this.carte, { admin: true });
        this.chaleur = D.heatmap.creer(this.carte);
        this.satellite = D.satellite.creer(this.carte);
        this.coucheZones = D.carte.dessinerZones(this.carte, this.zones).addTo(this.carte);
        this.gestionnaire.definir(this.signalementsPeriode().filter(s => s.statut !== 'rejete'));
        this.chaleur.mettreAJour(this.signalementsPeriode());
        setTimeout(() => this.carte.invalidateSize(), 50);
    },

    rendreTableau() {
        const D = window.debrisat;
        const u = D.utils;
        const t = this.tableau;
        const liste = this.signalementsTableau();
        const pages = Math.max(1, Math.ceil(liste.length / t.parPage));
        t.page = Math.min(t.page, pages);
        const page = liste.slice((t.page - 1) * t.parPage, t.page * t.parPage);
        const corps = u.$('#corpsTableau');
        corps.setAttribute('aria-busy', 'false');

        if (!page.length) {
            corps.innerHTML = '<tr class="ligne-vide"><td colspan="9"><div class="etat-vide"><i class="bi bi-search" aria-hidden="true"></i><p>Aucun signalement ne correspond à ces critères.</p></div></td></tr>';
        } else {
            corps.innerHTML = page.map(s => {
                const type = u.infoType(s.type_obstruction);
                const id = u.echapper(s.id);
                const choisi = t.selection.has(s.id);
                return `
                    <tr class="${choisi ? 'selectionnee' : ''}">
                        <td class="col-fixe"><label class="checkbox"><input type="checkbox" data-selection="${id}" ${choisi ? 'checked' : ''} aria-label="Sélectionner ${u.idCourt(s.id)}"></label></td>
                        <td class="col-fixe col-fixe-2 col-id">${u.idCourt(s.id)}</td>
                        <td>${u.htmlVisuel(s, 'photo-thumb')}</td>
                        <td><span class="rangee gap-2"><i class="bi ${type.icone}" aria-hidden="true"></i>${u.echapper(type.label)}</span></td>
                        <td>${u.htmlSeverite(s.severite)}</td>
                        <td>${u.echapper(s.commune || '—')}</td>
                        <td><time datetime="${u.echapper(s.created_at)}" title="${u.formatDateComplete(s.created_at)}">${u.formatDateCourte(s.created_at)}</time></td>
                        <td>${u.htmlStatut(s.statut)}</td>
                        <td>
                            <div class="actions-ligne">
                                <div class="select-enveloppe">
                                    <label class="sr-only" for="statut-ligne-${id}">Changer le statut de ${u.idCourt(s.id)}</label>
                                    <select class="select" id="statut-ligne-${id}" data-statut-ligne="${id}">
                                        ${Object.entries(D.STATUTS).map(([cle, v]) => `<option value="${cle}"${cle === s.statut ? ' selected' : ''}>${v.label}</option>`).join('')}
                                    </select>
                                </div>
                                <button type="button" class="btn btn-icon" data-action="voir-carte" data-id="${id}" aria-label="Voir ${u.idCourt(s.id)} sur la carte" title="Voir sur la carte"><i class="bi bi-geo-alt" aria-hidden="true"></i></button>
                            </div>
                        </td>
                    </tr>`;
            }).join('');
        }

        u.$('#infoPagination').textContent = `Page ${t.page} sur ${pages}`;
        u.$('[data-action="page-precedente"]').disabled = t.page <= 1;
        u.$('[data-action="page-suivante"]').disabled = t.page >= pages;
        const idsPage = page.map(s => s.id);
        const toutes = u.$('#toutSelectionner');
        toutes.checked = idsPage.length > 0 && idsPage.every(id => t.selection.has(id));
        toutes.indeterminate = !toutes.checked && idsPage.some(id => t.selection.has(id));
        this.majBarreGroupee();

        u.$$('#tableSignalements th[data-tri]').forEach(th => {
            const actif = th.dataset.tri === t.tri;
            th.setAttribute('aria-sort', actif ? (t.asc ? 'ascending' : 'descending') : 'none');
            th.querySelector('.bi').className = `bi ${actif ? (t.asc ? 'bi-sort-up' : 'bi-sort-down') : 'bi-arrow-down-up'}`;
        });
    },

    majBarreGroupee() {
        const u = window.debrisat.utils;
        const n = this.tableau.selection.size;
        u.$('#barreGroupee').hidden = n === 0;
        u.$('#compteSelection').textContent = n;
    },

    rendreAlertes() {
        const u = window.debrisat.utils;
        const zone = u.$('#historiqueAlertes');
        zone.setAttribute('aria-busy', 'false');
        const niveaux = { info: 'Information', attention: 'Attention', danger: 'Danger', critique: 'Critique' };
        const canaux = { webapp: 'Application', sms: 'SMS', whatsapp: 'WhatsApp', tous: 'Tous canaux' };
        const classes = { info: 'badge-info', attention: 'badge-warning', danger: 'badge-warning', critique: 'badge-danger' };
        zone.innerHTML = this.alertes.length ? this.alertes.map((a, i) => {
            const nomZone = this.zones.find(z => z.id === a.zone_id)?.nom || 'Région de Dakar';
            return `
                <li class="${u.echapper(a.type_alerte)}${a.nouvelle ? ' nouvelle' : ''}">
                    <span class="trait" aria-hidden="true"></span>
                    <div>
                        <h3>${u.echapper(a.titre)}</h3>
                        <p>${u.echapper(a.message)}</p>
                        <div class="meta">
                            <span class="badge ${classes[a.type_alerte] || 'badge-neutral'}">${niveaux[a.type_alerte] || a.type_alerte}</span>
                            <span><i class="bi bi-geo-alt" aria-hidden="true"></i> ${u.echapper(nomZone)}</span>
                            <span><i class="bi bi-send" aria-hidden="true"></i> ${canaux[a.canal] || a.canal}</span>
                            <time datetime="${u.echapper(a.created_at)}"><i class="bi bi-clock" aria-hidden="true"></i> ${u.formatDate(a.created_at)}</time>
                        </div>
                    </div>
                </li>`;
        }).join('') : '<li class="etat-vide"><i class="bi bi-bell" aria-hidden="true"></i><p>Aucune alerte diffusée.</p></li>';
        this.alertes.forEach(a => delete a.nouvelle);
    },

    rendreZones() {
        const D = window.debrisat;
        const u = D.utils;
        const actifs = this.tous.filter(s => !['resolu', 'rejete'].includes(s.statut));
        const grille = u.$('#grilleZones');
        grille.setAttribute('aria-busy', 'false');
        grille.innerHTML = [...this.zones].sort((a, b) => b.score_risque - a.score_risque).map(z => {
            const nb = actifs.filter(s => s.commune === z.commune).length;
            const critiques = actifs.filter(s => s.commune === z.commune && s.severite >= 4).length;
            const niveau = z.score_risque >= 85 ? ['Très élevé', 'badge-danger'] : z.score_risque >= 75 ? ['Élevé', 'badge-warning'] : ['Modéré', 'badge-neutral'];
            return `
                <li class="card card-zone" style="--couleur-zone:${D.carte.couleurZone(z.score_risque)}">
                    <div class="zone-entete">
                        <div>
                            <h2>${u.echapper(z.nom)}</h2>
                            <p class="texte-sm texte-secondaire"><i class="bi bi-building" aria-hidden="true"></i> ${u.echapper(z.commune)}</p>
                        </div>
                        <span class="badge ${niveau[1]}">${niveau[0]}</span>
                    </div>
                    <div class="score-zone"><span class="chiffre">${z.score_risque}</span><small>/100</small></div>
                    <div class="jauge" role="progressbar" aria-valuenow="${z.score_risque}" aria-valuemin="0" aria-valuemax="100" aria-label="Score de risque"><div class="jauge-remplissage" style="width:${z.score_risque}%"></div></div>
                    <dl>
                        <div><dt>Signalements actifs</dt><dd class="chiffre">${nb}</dd></div>
                        <div><dt>Sévérité 4 et plus</dt><dd class="chiffre">${critiques}</dd></div>
                        <div style="grid-column:1/-1"><dt>Inondations passées</dt><dd>${u.echapper(z.historique || 'Aucune donnée')}</dd></div>
                    </dl>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="voir-zone" data-commune="${u.echapper(z.commune)}"><i class="bi bi-map" aria-hidden="true"></i>Voir sur la carte</button>
                </li>`;
        }).join('');
    },

    // --- Graphiques (Chart.js) ---
    couleur(variable) {
        return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    },

    appliquerThemeGraphiques() {
        if (typeof Chart === 'undefined') return;
        Chart.defaults.color = this.couleur('--color-secondary-text');
        Chart.defaults.borderColor = this.couleur('--glass-border');
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, sans-serif';
        Chart.defaults.font.size = 12;
        Object.assign(Chart.defaults.plugins.tooltip, {
            backgroundColor: this.couleur('--glass-bg-strong'),
            titleColor: this.couleur('--color-heading'),
            bodyColor: this.couleur('--color-primary-text'),
            borderColor: this.couleur('--glass-border-hover'),
            borderWidth: 1,
            padding: 12,
            cornerRadius: 12,
            boxWidth: 8,
            boxHeight: 8,
            boxPadding: 4,
            usePointStyle: true,
            titleFont: { weight: '600' }
        });
        Chart.defaults.plugins.legend.display = false;
        Chart.defaults.animation.duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
    },

    graphique(id, config) {
        if (typeof Chart === 'undefined') {
            const canvas = document.getElementById(id);
            canvas.parentElement.innerHTML = '<div class="etat-vide"><i class="bi bi-bar-chart-line" aria-hidden="true"></i><p>Graphique indisponible hors-ligne.</p></div>';
            return;
        }
        this.graphiques[id]?.destroy();
        this.graphiques[id] = new Chart(document.getElementById(id), config);
    },

    axesSobres(options = {}) {
        return {
            x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 16 }, ...options.x },
            y: { beginAtZero: true, grid: { color: this.couleur('--glass-border') }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5 }, ...options.y }
        };
    },

    rendreGraphiquesApercu() {
        const D = window.debrisat;
        const u = D.utils;
        if (!document.getElementById('graphiqueEvolution')) return;
        const liste = this.signalementsPeriode();
        const jours = this.periode || 90;

        const parJour = new Map();
        for (let i = jours - 1; i >= 0; i--) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            parJour.set(d.toDateString(), { date: d, n: 0 });
        }
        liste.forEach(s => {
            const cle = new Date(s.created_at).toDateString();
            if (parJour.has(cle)) parJour.get(cle).n++;
        });
        const valeurs = [...parJour.values()];
        const moyenne = valeurs.reduce((a, v) => a + v.n, 0) / valeurs.length;
        u.$('#moyenneJour').textContent = `${moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / jour`;
        u.$('#sousTitreEvolution').textContent = this.periode ? `${this.periode} derniers jours` : '90 derniers jours';

        const lumineux = this.couleur('--color-bright');
        this.graphique('graphiqueEvolution', {
            type: 'line',
            data: {
                labels: valeurs.map(v => v.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })),
                datasets: [{
                    label: 'Signalements',
                    data: valeurs.map(v => v.n),
                    borderColor: lumineux,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: lumineux,
                    pointHoverBorderColor: this.couleur('--color-pure-dark'),
                    pointHoverBorderWidth: 2,
                    tension: 0.35,
                    fill: true,
                    backgroundColor: (ctx) => {
                        const { chart } = ctx;
                        if (!chart.chartArea) return 'transparent';
                        const degrade = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
                        const clair = window.debrisat.theme.actuel() === 'light';
                        degrade.addColorStop(0, clair ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.14)');
                        degrade.addColorStop(1, 'rgba(0,0,0,0)');
                        return degrade;
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: this.axesSobres(),
                plugins: { tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} signalement${c.parsed.y > 1 ? 's' : ''}` } } }
            }
        });

        // Les cinq types principaux, le reste regroupe dans "Autres" (au-dela, une couronne devient illisible)
        const parType = {};
        liste.forEach(s => { parType[s.type_obstruction] = (parType[s.type_obstruction] || 0) + 1; });
        const tries = Object.entries(parType).sort((a, b) => b[1] - a[1]);
        const principaux = tries.slice(0, 5);
        const autres = tries.slice(5).reduce((a, [, n]) => a + n, 0);
        const series = principaux.map(([type, n], i) => ({ label: u.infoType(type).label, n, couleur: this.couleur(`--serie-${i + 1}`) }));
        if (autres) series.push({ label: 'Autres', n: autres, couleur: this.couleur('--serie-autre') });
        const total = series.reduce((a, s) => a + s.n, 0) || 1;

        this.graphique('graphiqueTypes', {
            type: 'doughnut',
            data: {
                labels: series.map(s => s.label),
                datasets: [{ data: series.map(s => s.n), backgroundColor: series.map(s => s.couleur), borderWidth: 0, spacing: 2, borderRadius: 4, hoverOffset: 6 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: { tooltip: { callbacks: { label: (c) => ` ${c.label} : ${c.parsed} (${Math.round(c.parsed / total * 100)} %)` } } }
            }
        });

        u.$('#legendeTypes').innerHTML = series.map(s => `
            <li>
                <span class="pastille-serie" style="background:${s.couleur}" aria-hidden="true"></span>
                <span>${u.echapper(s.label)}</span>
                <span class="valeur">${s.n}</span>
                <span class="part">${Math.round(s.n / total * 100)} %</span>
            </li>`).join('');
    },

    rendreStatistiques() {
        const D = window.debrisat;
        const u = D.utils;
        const liste = this.signalementsPeriode();
        const resolus = liste.filter(s => s.statut === 'resolu' && s.resolu_at);
        const delais = resolus.map(s => (new Date(s.resolu_at) - new Date(s.created_at)) / 86400000).filter(d => d >= 0);
        const delaiMoyen = delais.length ? delais.reduce((a, b) => a + b, 0) / delais.length : 0;
        const pct = (n) => liste.length ? Math.round((n / liste.length) * 100) : 0;

        u.$('#sousTitreStats').textContent = this.periode ? `Sur les ${this.periode} derniers jours${this.commune ? ' — ' + this.commune : ''}` : `Sur toute la période${this.commune ? ' — ' + this.commune : ''}`;
        const tuiles = [
            { icone: 'bi-check-lg', classe: 'resolu', valeur: `${pct(liste.filter(s => s.statut === 'resolu').length)} %`, label: 'Taux de résolution' },
            { icone: 'bi-clock', classe: 'cours', valeur: `${delaiMoyen.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`, label: 'Délai moyen de résolution' },
            { icone: 'bi-whatsapp', classe: '', valeur: `${pct(liste.filter(s => s.source === 'whatsapp').length)} %`, label: 'Reçus via WhatsApp' },
            { icone: 'bi-broadcast', classe: 'attente', valeur: u.formatNombre(liste.filter(s => s.source === 'satellite').length), label: 'Détections satellite' }
        ];
        u.$('#tuilesStats').innerHTML = tuiles.map(t => `
            <li class="card card-stat">
                <span class="stat-icone ${t.classe}"><i class="bi ${t.icone}" aria-hidden="true"></i></span>
                <span class="stat-valeur">${t.valeur}</span>
                <span class="stat-label">${t.label}</span>
            </li>`).join('');

        const parCommune = {};
        liste.forEach(s => { if (s.commune) parCommune[s.commune] = (parCommune[s.commune] || 0) + 1; });
        const communes = Object.entries(parCommune).sort((a, b) => b[1] - a[1]).slice(0, 10);
        this.graphique('graphiqueCommunes', {
            type: 'bar',
            data: {
                labels: communes.map(c => c[0]),
                datasets: [{ label: 'Signalements', data: communes.map(c => c[1]), backgroundColor: this.couleur('--serie-1'), borderRadius: 4, barThickness: 16 }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { beginAtZero: true, grid: { color: this.couleur('--glass-border') }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5 } },
                    y: { grid: { display: false }, border: { display: false } }
                }
            }
        });

        const parSeverite = [1, 2, 3, 4, 5].map(n => liste.filter(s => s.severite === n).length);
        this.graphique('graphiqueSeverite', {
            type: 'bar',
            data: {
                labels: [1, 2, 3, 4, 5].map(n => `${n} — ${D.SEVERITES[n].label}`),
                datasets: [{ label: 'Signalements', data: parSeverite, backgroundColor: [1, 2, 3, 4, 5].map(n => this.couleur(`--severity-${n}`)), borderRadius: 4, maxBarThickness: 48 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: this.axesSobres() }
        });
    },

    // --- Actions ---
    async changerStatut(ids, statut) {
        const D = window.debrisat;
        const liste = Array.isArray(ids) ? ids : [ids];
        try {
            await D.donnees.changerStatut(liste, statut);
            const maintenant = new Date().toISOString();
            this.tous = this.tous.map(s => liste.includes(s.id)
                ? { ...s, statut, updated_at: maintenant, resolu_at: statut === 'resolu' ? maintenant : null }
                : s);
            this.tableau.selection.clear();
            this.rendreTout();
            D.notifications.toast(`${liste.length} signalement${liste.length > 1 ? 's' : ''} passé${liste.length > 1 ? 's' : ''} en « ${D.STATUTS[statut].label} »`, 'success', 3500, 'Statut mis à jour');
        } catch (e) {
            D.notifications.erreur(e, 'Changement de statut');
            this.rendreTableau();
        }
    },

    async envoyerAlerte(e) {
        e.preventDefault();
        const D = window.debrisat;
        const u = D.utils;
        const titre = u.$('#alerteTitre');
        const message = u.$('#alerteMessage');
        let valide = true;
        [[titre, 'Indiquez un titre.', 4], [message, 'Rédigez un message d\'au moins 20 caractères.', 20]].forEach(([champ, texte, min]) => {
            const zone = u.$(`#erreur-${champ.id}`);
            const erreur = champ.value.trim().length < min;
            champ.setAttribute('aria-invalid', String(erreur));
            zone.hidden = !erreur;
            if (erreur) {
                zone.innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${texte}`;
                if (valide) champ.focus();
                valide = false;
            }
        });
        if (!valide) return;

        const bouton = u.$('#btnEnvoyerAlerte');
        u.boutonChargement(bouton, true, 'Diffusion…');
        try {
            const alerte = await D.donnees.creerAlerte({
                titre: titre.value.trim(),
                message: message.value.trim(),
                type_alerte: u.$('#alerteNiveau').value,
                zone_id: u.$('#alerteZone').value || null,
                canal: u.$('input[name="canal"]:checked').value
            });
            this.alertes = [{ ...alerte, nouvelle: true }, ...this.alertes];
            this.rendreAlertes();
            u.$('#formAlerte').reset();
            D.notifications.toast('L\'alerte a été diffusée.', 'success', 4000, 'Alerte envoyée');
        } catch (err) {
            D.notifications.erreur(err, 'Diffusion d\'alerte');
        } finally {
            u.boutonChargement(bouton, false);
        }
    },

    exporterCSV() {
        const D = window.debrisat;
        const u = D.utils;
        const liste = this.signalementsTableau();
        if (!liste.length) {
            D.notifications.toast('Aucune donnée à exporter pour ces filtres.', 'warning');
            return;
        }
        const entetes = ['Référence', 'Type', 'Sévérité', 'Statut', 'Commune', 'Adresse', 'Latitude', 'Longitude', 'Confirmations', 'Source', 'Date', 'Résolu le', 'Description'];
        const cellule = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lignes = liste.map(s => [
            u.idCourt(s.id), u.infoType(s.type_obstruction).label, s.severite, u.infoStatut(s.statut).label,
            s.commune, s.adresse, s.lat?.toFixed(6), s.lng?.toFixed(6), s.nombre_confirmations, s.source,
            new Date(s.created_at).toLocaleString('fr-FR'), s.resolu_at ? new Date(s.resolu_at).toLocaleString('fr-FR') : '', s.description
        ].map(cellule).join(';'));
        // BOM + point-virgule : ouverture directe dans Excel en francais
        const blob = new Blob(['﻿' + [entetes.map(cellule).join(';'), ...lignes].join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(blob);
        lien.download = `debrisat-signalements-${new Date().toISOString().slice(0, 10)}.csv`;
        lien.click();
        setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
        D.notifications.toast(`${liste.length} signalements exportés.`, 'success', 3000, 'Export CSV');
    },

    lierEvenements() {
        const D = window.debrisat;
        const u = D.utils;

        document.addEventListener('click', async (e) => {
            const cible = e.target.closest('[data-action]');
            if (!cible) return;
            switch (cible.dataset.action) {
                case 'ouvrir-sidebar': this.basculerSidebar(true); break;
                case 'fermer-sidebar': this.basculerSidebar(false); u.$('.dash-hamburger').focus(); break;
                case 'exporter': this.exporterCSV(); break;
                case 'page-precedente': this.tableau.page--; this.rendreTableau(); break;
                case 'page-suivante': this.tableau.page++; this.rendreTableau(); break;
                case 'appliquer-groupe': {
                    const statut = u.$('#actionGroupee').value;
                    if (!statut) {
                        D.notifications.toast('Choisissez un statut à appliquer.', 'warning', 3000);
                        break;
                    }
                    await this.changerStatut([...this.tableau.selection], statut);
                    u.$('#actionGroupee').value = '';
                    break;
                }
                case 'voir-carte':
                    D.router.aller('carte');
                    setTimeout(() => this.gestionnaire?.ouvrir(cible.dataset.id), 200);
                    break;
                case 'voir-zone': {
                    this.commune = cible.dataset.commune;
                    u.$('#filtreCommuneDash').value = this.commune;
                    D.router.aller('carte');
                    this.rendreTout();
                    setTimeout(() => {
                        const visibles = this.gestionnaire?.signalements() || [];
                        if (visibles.length) this.carte.fitBounds(L.latLngBounds(visibles.map(s => [s.lat, s.lng])).pad(0.2));
                    }, 200);
                    break;
                }
                case 'chaleur': cible.setAttribute('aria-pressed', String(this.chaleur.basculer())); break;
                case 'satellite': cible.setAttribute('aria-pressed', String(this.satellite.basculer())); break;
                case 'zones-carte': {
                    const visible = this.carte.hasLayer(this.coucheZones);
                    if (visible) this.carte.removeLayer(this.coucheZones);
                    else this.coucheZones.addTo(this.carte);
                    cible.setAttribute('aria-pressed', String(!visible));
                    break;
                }
                case 'deconnexion':
                    await D.auth.deconnexion();
                    location.href = 'auth.html?retour=dashboard.html';
                    break;
                case 'permission-notifications': {
                    const reponse = await D.notifications.demanderPermission();
                    D.notifications.toast(reponse === 'granted' ? 'Notifications autorisées.' : 'Notifications refusées ou non prises en charge.', reponse === 'granted' ? 'success' : 'warning', 3500);
                    break;
                }
                case 'reinitialiser-demo':
                    try { localStorage.removeItem('debrisat-demo-v1'); } catch (err) { /* stockage indisponible */ }
                    location.reload();
                    break;
            }
        });

        u.$('.onglets').addEventListener('click', (e) => {
            const onglet = e.target.closest('[role="tab"]');
            if (onglet) D.router.aller(onglet.dataset.onglet);
        });
        u.$('.onglets').addEventListener('keydown', (e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const onglets = u.$$('.onglets [role="tab"]');
            const i = onglets.indexOf(document.activeElement);
            const cible = e.key === 'Home' ? 0 : e.key === 'End' ? onglets.length - 1
                : (i + (e.key === 'ArrowRight' ? 1 : -1) + onglets.length) % onglets.length;
            onglets[cible].focus();
            D.router.aller(onglets[cible].dataset.onglet);
        });

        u.$('#filtrePeriode').addEventListener('change', (e) => {
            this.periode = parseInt(e.target.value, 10);
            this.tableau.page = 1;
            this.rendreTout();
        });
        u.$('#filtreCommuneDash').addEventListener('change', (e) => {
            this.commune = e.target.value;
            this.tableau.page = 1;
            this.rendreTout();
        });

        u.$('#rechercheTableau').addEventListener('input', u.debounce((e) => {
            this.tableau.recherche = e.target.value.trim();
            this.tableau.page = 1;
            this.rendreTableau();
        }, 200));
        u.$('#filtreStatutTableau').addEventListener('change', (e) => {
            this.tableau.statut = e.target.value;
            this.tableau.page = 1;
            this.rendreTableau();
        });

        u.$$('#tableSignalements th[data-tri] button').forEach(b => b.addEventListener('click', () => {
            const cle = b.closest('th').dataset.tri;
            if (this.tableau.tri === cle) this.tableau.asc = !this.tableau.asc;
            else {
                this.tableau.tri = cle;
                this.tableau.asc = cle !== 'created_at' && cle !== 'severite';
            }
            this.rendreTableau();
        }));

        u.$('#toutSelectionner').addEventListener('change', (e) => {
            const ids = u.$$('[data-selection]').map(c => c.dataset.selection);
            ids.forEach(id => e.target.checked ? this.tableau.selection.add(id) : this.tableau.selection.delete(id));
            this.rendreTableau();
        });

        document.addEventListener('change', (e) => {
            const cible = e.target;
            if (cible.matches('[data-selection]')) {
                if (cible.checked) this.tableau.selection.add(cible.dataset.selection);
                else this.tableau.selection.delete(cible.dataset.selection);
                cible.closest('tr').classList.toggle('selectionnee', cible.checked);
                this.majBarreGroupee();
                const toutes = u.$('#toutSelectionner');
                const cases = u.$$('[data-selection]');
                toutes.checked = cases.every(c => c.checked);
                toutes.indeterminate = !toutes.checked && cases.some(c => c.checked);
            }
            if (cible.matches('[data-statut-ligne]')) this.changerStatut(cible.dataset.statutLigne, cible.value);
            if (cible.matches('[data-action="statut-popup"]')) {
                this.changerStatut(cible.dataset.id, cible.value);
                this.carte?.closePopup();
            }
            if (cible.matches('[data-preference]')) {
                const preferences = u.lireLocal('debrisat-preferences', {});
                preferences[cible.dataset.preference] = cible.checked;
                u.ecrireLocal('debrisat-preferences', preferences);
            }
        });

        u.$('#formAlerte').addEventListener('submit', (e) => this.envoyerAlerte(e));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && u.$('#sidebar').classList.contains('ouverte')) {
                this.basculerSidebar(false);
                u.$('.dash-hamburger').focus();
            }
        });

        window.addEventListener('debrisat:theme', () => {
            this.appliquerThemeGraphiques();
            const vue = D.router.actuelle;
            if (vue === 'statistiques') this.rendreStatistiques();
            else this.rendreGraphiquesApercu();
        });
    }
};

document.addEventListener('DOMContentLoaded', () => window.debrisat.dashboard.init());
