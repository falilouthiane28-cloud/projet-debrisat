import { MODE_DEMO, TYPES_OBSTRUCTION, STATUTS, STATUTS_ACTIFS, SEVERITES, COMMUNES, ROLES, TYPES_ALERTE, CANAUX_ALERTE, PRIORITES } from './config.js';
import {
    $, $$, echapper, formatRelatif, formatDate, formatNombre, debounce, initiales, idCourt,
    htmlSeverite, htmlStatut, htmlVignette, lieuSignalement, telechargerFichier, lireStockage, ecrireStockage
} from './utils.js';
import { initTheme, themeEffectif, preferenceTheme, definirTheme } from './theme.js';
import { initPwa } from './pwa.js';
import { initRetourTactile, compterJusqua } from './animations.js';
import { Routeur } from './router.js';
import { initAuth, estConnecte, estAutorite, profilCourant, deconnexion } from './auth.js';
import { listerSignalements, listerZones, listerAlertes, creerAlerte, changerStatut, listerAgents } from './donnees.js';
import { creerCarte, CoucheSignalements, creerCoucheZones, couleurRisque } from './map.js';
import { suivreSignalements } from './realtime.js';
import { succes, erreur, toast, annoncer } from './notifications.js';

initTheme();
initPwa();
initRetourTactile();

const JOUR = 86400000;
const etat = {
    signalements: [],
    zones: [],
    alertes: [],
    agents: [],
    jours: lireStockage('debrisat-periode', 30),
    table: { page: 1, parPage: 10, tri: 'created_at', asc: false, recherche: '', statut: '', commune: '', selection: new Set() }
};
let carteAdmin = null;
let coucheAdmin = null;
let coucheZonesAdmin = null;
const graphiques = {};

// ============ Navigation laterale ============
const barre = $('#barreLaterale');
const voile = $('#voileBarre');
function basculerBarre(ouvrir) {
    barre.classList.toggle('ouverte', ouvrir);
    voile.classList.toggle('visible', ouvrir);
    $('#btnMenu').setAttribute('aria-expanded', String(ouvrir));
    if (ouvrir) barre.querySelector('.sidebar-item')?.focus();
}
$('#btnMenu').addEventListener('click', () => basculerBarre(!barre.classList.contains('ouverte')));
voile.addEventListener('click', () => basculerBarre(false));
barre.addEventListener('click', e => { if (e.target.closest('.sidebar-item')) basculerBarre(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && barre.classList.contains('ouverte')) { basculerBarre(false); $('#btnMenu').focus(); } });

// Sur grand ecran, la barre se replie en colonne d'icones ; le choix est memorise
const CLE_REPLI = 'debrisat-barre-repliee';
function replierBarre(replie) {
    document.body.classList.toggle('tableau-replie', replie);
    const bouton = $('#btnReplier');
    bouton.setAttribute('aria-expanded', String(!replie));
    bouton.setAttribute('aria-label', replie ? 'Déplier la navigation' : 'Replier la navigation');
    ecrireStockage(CLE_REPLI, replie);
}
replierBarre(lireStockage(CLE_REPLI, false) === true);
$('#btnReplier').addEventListener('click', () => replierBarre(!document.body.classList.contains('tableau-replie')));
// La carte Leaflet doit recalculer sa taille quand la largeur du contenu change
$('.principal-tableau').addEventListener('transitionend', e => {
    if (e.propertyName === 'margin-left') window.dispatchEvent(new Event('resize'));
});

// ============ Sections et onglets ============
const TITRES = {
    'vue-ensemble': "Vue d'ensemble", signalements: 'Signalements', carte: 'Carte',
    alertes: 'Alertes', zones: 'Zones à risque', statistiques: 'Statistiques', parametres: 'Paramètres'
};
const ONGLET_PAR_ROUTE = { 'vue-ensemble': 'carte', signalements: 'signalements', carte: 'carte', alertes: 'alertes' };

function afficherSection(id) {
    $$('[data-section]').forEach(s => { s.hidden = s.id !== id; });
}

function choisirOnglet(nom) {
    const panneaux = { carte: '#panneauCarte', signalements: '#panneauTableau', alertes: '#panneauAlertes' };
    for (const bouton of $$('[data-onglet]')) {
        const actif = bouton.dataset.onglet === nom;
        bouton.setAttribute('aria-selected', String(actif));
        bouton.tabIndex = actif ? 0 : -1;
    }
    for (const [cle, sel] of Object.entries(panneaux)) $(sel).hidden = cle !== nom;
    $('#btnExport').hidden = nom === 'alertes';
    if (nom === 'carte') initCarteAdmin();
    if (nom === 'signalements') rendreTable();
    if (nom === 'alertes') rendreAlertes();
}

const vueOnglet = route => ({
    entrer() {
        afficherSection('section-vue');
        choisirOnglet(ONGLET_PAR_ROUTE[route]);
    }
});

const routeur = new Routeur({
    'vue-ensemble': vueOnglet('vue-ensemble'),
    signalements: vueOnglet('signalements'),
    carte: vueOnglet('carte'),
    alertes: vueOnglet('alertes'),
    zones: { entrer() { afficherSection('section-zones'); rendreZones(); } },
    statistiques: { entrer() { afficherSection('section-statistiques'); rendreStatistiques(); } },
    parametres: { entrer() { afficherSection('section-parametres'); rendreParametres(); } }
}, {
    defaut: 'vue-ensemble',
    surChangement: nom => {
        $('#filCourant').textContent = TITRES[nom];
        document.title = `${TITRES[nom]} · Espace autorités · Debrisat`;
        window.scrollTo({ top: 0 });
    }
});

$$('[data-onglet]').forEach(b => b.addEventListener('click', () => routeur.aller(b.dataset.onglet === 'carte' && routeur.courante === 'vue-ensemble' ? 'vue-ensemble' : b.dataset.onglet)));
$('.bloc-onglets [role="tablist"]').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const boutons = $$('[data-onglet]');
    const i = boutons.indexOf(document.activeElement);
    if (i < 0) return;
    const suivant = boutons[(i + (e.key === 'ArrowRight' ? 1 : -1) + boutons.length) % boutons.length];
    suivant.focus();
    suivant.click();
});

// ============ Periode ============
function majPeriode() {
    $$('#choixPeriode [data-jours]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.jours) === etat.jours)));
    const libelle = `${etat.jours} derniers jours`;
    $('#sousTitreVue').textContent = libelle;
    $('#sousTitreStats').textContent = libelle;
}
$('#choixPeriode').addEventListener('click', e => {
    const b = e.target.closest('[data-jours]');
    if (!b) return;
    etat.jours = Number(b.dataset.jours);
    ecrireStockage('debrisat-periode', etat.jours);
    majPeriode();
    rendreVue();
    if (routeur.courante === 'statistiques') rendreStatistiques();
    annoncer(`Statistiques sur les ${etat.jours} derniers jours`);
});

function dansPeriode(liste, decalage = 0, champ = 'created_at') {
    const fin = Date.now() - decalage * etat.jours * JOUR;
    const debut = fin - etat.jours * JOUR;
    return liste.filter(s => {
        const t = s[champ] ? new Date(s[champ]).getTime() : NaN;
        return t >= debut && t < fin;
    });
}

// ============ Cartes de statistiques ============
// sens : 1 si une hausse est une bonne nouvelle, -1 si c'est une mauvaise, 0 si neutre
function poserTendance(id, actuel, precedent, sens) {
    const el = $(`#${id}`);
    el.title = `Par rapport aux ${etat.jours} jours précédents`;
    if (!precedent) {
        el.className = 'tendance neutre';
        el.textContent = actuel ? 'nouveau' : '—';
        return;
    }
    const variation = Math.round(((actuel - precedent) / precedent) * 100);
    const hausse = variation > 0;
    const classe = variation === 0 || sens === 0 ? 'neutre' : (hausse === (sens > 0) ? 'hausse' : 'baisse');
    const icone = variation === 0 ? 'bi-dash' : hausse ? 'bi-arrow-up' : 'bi-arrow-down';
    el.className = `tendance ${classe}`;
    el.innerHTML = `<i class="bi ${icone}" aria-hidden="true"></i>${Math.abs(variation)} %<span class="sr-only"> par rapport à la période précédente</span>`;
}

function rendreStats() {
    const actuel = dansPeriode(etat.signalements);
    const precedent = dansPeriode(etat.signalements, 1);
    const compte = (liste, statut) => liste.filter(s => s.statut === statut).length;
    const resolusActuel = dansPeriode(etat.signalements, 0, 'resolu_at').length;
    const resolusPrec = dansPeriode(etat.signalements, 1, 'resolu_at').length;

    // « En attente » et « En cours » sont des stocks a l'instant present : une tendance par periode de creation
    // serait trompeuse (les anciens signalements ont eu le temps d'etre traites).
    const attente = etat.signalements.filter(s => s.statut === 'en_attente');
    const enCours = etat.signalements.filter(s => s.statut === 'en_cours');
    compterJusqua($('#statTotal'), actuel.length, { duree: 900 });
    compterJusqua($('#statAttente'), attente.length, { duree: 900 });
    compterJusqua($('#statCours'), enCours.length, { duree: 900 });
    compterJusqua($('#statResolus'), resolusActuel, { duree: 900 });
    poserTendance('tendTotal', actuel.length, precedent.length, 0);
    poserTendance('tendResolus', resolusActuel, resolusPrec, 1);
    const critiques = attente.filter(s => s.severite >= 4).length;
    const tendAttente = $('#tendAttente');
    tendAttente.className = `tendance ${critiques ? 'baisse' : 'neutre'}`;
    tendAttente.title = 'Signalements en attente de sévérité 4 ou 5';
    tendAttente.innerHTML = `<i class="bi bi-exclamation-octagon" aria-hidden="true"></i>${critiques} grave${critiques > 1 ? 's' : ''}`;
    const assignes = enCours.filter(s => s.assigne_a).length;
    const tendCours = $('#tendCours');
    tendCours.className = 'tendance neutre';
    tendCours.title = 'Signalements en cours confiés à un agent';
    tendCours.innerHTML = `<i class="bi bi-people" aria-hidden="true"></i>${assignes} assigné${assignes > 1 ? 's' : ''}`;
    const traites = actuel.filter(s => s.statut !== 'rejete');
    const taux = traites.length ? Math.round((compte(traites, 'resolu') / traites.length) * 100) : 0;
    $('#tauxResolution').textContent = `taux ${taux} %`;

    const enAttente = etat.signalements.filter(s => s.statut === 'en_attente').length;
    $('#compteurAttente').textContent = enAttente || '';
    $('#compteurAttente').setAttribute('aria-label', `${enAttente} en attente`);
}

// ============ Graphiques ============
function couleursTheme() {
    const css = getComputedStyle(document.documentElement);
    const v = nom => css.getPropertyValue(nom).trim();
    const clair = themeEffectif() === 'clair';
    return {
        texte: v('--color-secondary-text'),
        titre: v('--color-heading'),
        vif: v('--color-bright'),
        grille: clair ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
        fondInfobulle: clair ? 'rgba(255,255,255,0.96)' : 'rgba(22,22,22,0.94)',
        bordure: clair ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)',
        succes: v('--accent-success'),
        gris: clair ? ['#0A0A0A', '#3D3D3D', '#6B6B6B', '#9A9A9A', '#C4C4C4'] : ['#FAFAFA', '#C7C7C7', '#9A9A9A', '#6E6E6E', '#4A4A4A']
    };
}

function configurerChart() {
    const c = couleursTheme();
    Chart.defaults.color = c.texte;
    Chart.defaults.borderColor = c.grille;
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.animation.duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
    Object.assign(Chart.defaults.plugins.tooltip, {
        backgroundColor: c.fondInfobulle,
        titleColor: c.titre,
        bodyColor: c.texte,
        borderColor: c.bordure,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 12,
        boxPadding: 6,
        usePointStyle: true,
        titleFont: { weight: '600' }
    });
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 14;
    return c;
}

function graphique(id, config) {
    graphiques[id]?.destroy();
    const canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined') return null;
    graphiques[id] = new Chart(canvas, config);
    return graphiques[id];
}

const axesSobres = c => ({
    x: { grid: { display: false }, border: { display: false }, ticks: { color: c.texte, maxRotation: 0, autoSkipPadding: 16 } },
    y: { grid: { display: false }, border: { display: false }, ticks: { color: c.texte, precision: 0 }, beginAtZero: true }
});

function rendreGraphiquesVue() {
    const c = configurerChart();
    const jours = etat.jours;
    const debut = new Date(Date.now() - (jours - 1) * JOUR);
    debut.setHours(0, 0, 0, 0);
    const libelles = [];
    const valeurs = [];
    const index = new Map();
    for (let i = 0; i < jours; i++) {
        const d = new Date(debut.getTime() + i * JOUR);
        const cle = d.toLocaleDateString('fr-CA');
        index.set(cle, i);
        libelles.push(d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
        valeurs.push(0);
    }
    for (const s of etat.signalements) {
        const i = index.get(new Date(s.created_at).toLocaleDateString('fr-CA'));
        if (i !== undefined) valeurs[i]++;
    }
    const total = valeurs.reduce((a, b) => a + b, 0);
    $('#legendeLigne').textContent = `${total} sur la période · moyenne ${(total / jours).toFixed(1).replace('.', ',')} par jour`;

    graphique('graphiqueJours', {
        type: 'line',
        data: {
            labels: libelles,
            datasets: [{
                label: 'Signalements',
                data: valeurs,
                borderColor: c.vif,
                borderWidth: 2,
                tension: 0.35,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: c.vif,
                fill: true,
                backgroundColor: ctx => {
                    const { chart } = ctx;
                    if (!chart.chartArea) return 'transparent';
                    const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
                    g.addColorStop(0, themeEffectif() === 'clair' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)');
                    g.addColorStop(1, 'rgba(127,127,127,0)');
                    return g;
                }
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: axesSobres(c)
        }
    });

    const parType = new Map();
    for (const s of dansPeriode(etat.signalements)) parType.set(s.type_obstruction, (parType.get(s.type_obstruction) || 0) + 1);
    const tries = [...parType.entries()].sort((a, b) => b[1] - a[1]);
    const palette = [...c.gris, SEVERITES[4].couleur, SEVERITES[3].couleur, SEVERITES[1].couleur, '#5E9FFF'];
    graphique('graphiqueTypes', {
        type: 'doughnut',
        data: {
            labels: tries.map(([t]) => TYPES_OBSTRUCTION[t]?.libelle || t),
            datasets: [{ data: tries.map(([, n]) => n), backgroundColor: palette, borderWidth: 0, hoverOffset: 6, spacing: 2, borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '68%',
            plugins: { legend: { position: matchMedia('(min-width: 1024px)').matches ? 'right' : 'bottom' } }
        }
    });
}

function rendreStatistiques() {
    const c = configurerChart();
    const periode = dansPeriode(etat.signalements);
    const parCommune = new Map();
    for (const s of periode) if (s.commune) parCommune.set(s.commune, (parCommune.get(s.commune) || 0) + 1);
    const communes = [...parCommune.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const barres = (labels, data, couleurs, suffixe = '') => ({
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: couleurs, borderRadius: 6, borderSkipped: false, maxBarThickness: 22 }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${String(ctx.raw).replace('.', ',')}${suffixe}` } } },
            scales: { x: { ...axesSobres(c).x, beginAtZero: true, ticks: { color: c.texte, precision: 0 } }, y: { ...axesSobres(c).y, ticks: { color: c.texte } } }
        }
    });
    graphique('graphiqueCommunes', barres(communes.map(([n]) => n), communes.map(([, v]) => v), c.vif, ' signalements'));

    const delais = new Map();
    for (const s of dansPeriode(etat.signalements, 0, 'resolu_at')) {
        if (!s.commune) continue;
        const jours = (new Date(s.resolu_at) - new Date(s.created_at)) / JOUR;
        const d = delais.get(s.commune) || { total: 0, n: 0 };
        d.total += jours; d.n++;
        delais.set(s.commune, d);
    }
    const moyennes = [...delais.entries()].map(([n, d]) => [n, +(d.total / d.n).toFixed(1)]).sort((a, b) => b[1] - a[1]).slice(0, 10);
    graphique('graphiqueDelais', barres(moyennes.map(([n]) => n), moyennes.map(([, v]) => v), c.succes, ' jours'));

    const parSeverite = [1, 2, 3, 4, 5].map(n => periode.filter(s => s.severite === n).length);
    const configSev = barres([1, 2, 3, 4, 5].map(n => `${n} · ${SEVERITES[n].libelle}`), parSeverite, [1, 2, 3, 4, 5].map(n => SEVERITES[n].couleur), ' signalements');
    configSev.options.indexAxis = 'x';
    configSev.options.scales = axesSobres(c);
    graphique('graphiqueSeverites', configSev);

    const sources = { webapp: 'Application', whatsapp: 'WhatsApp', satellite: 'Satellite' };
    graphique('graphiqueSources', {
        type: 'doughnut',
        data: {
            labels: Object.values(sources),
            datasets: [{ data: Object.keys(sources).map(k => periode.filter(s => s.source === k).length), backgroundColor: [c.gris[0], '#30D158', '#5E9FFF'], borderWidth: 0, spacing: 2, borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom' } } }
    });
}

document.addEventListener('theme-change', () => {
    if (routeur.courante === 'statistiques') rendreStatistiques();
    else rendreGraphiquesVue();
});

// ============ Tableau ============
function lignesFiltrees() {
    const t = etat.table;
    const q = t.recherche.toLowerCase();
    const ordre = Object.keys(STATUTS);
    return etat.signalements
        .filter(s => (!t.statut || s.statut === t.statut) && (!t.commune || s.commune === t.commune))
        .filter(s => !q || [s.adresse, s.commune, s.quartier, s.description, TYPES_OBSTRUCTION[s.type_obstruction]?.libelle, idCourt(s.id)]
            .some(v => (v || '').toLowerCase().includes(q)))
        .sort((a, b) => {
            let r;
            if (t.tri === 'statut') r = ordre.indexOf(a.statut) - ordre.indexOf(b.statut);
            else if (t.tri === 'severite') r = a.severite - b.severite;
            else r = String(a[t.tri] || '').localeCompare(String(b[t.tri] || ''), 'fr');
            return t.asc ? r : -r;
        });
}

function rendreTable() {
    const t = etat.table;
    const lignes = lignesFiltrees();
    const pages = Math.max(1, Math.ceil(lignes.length / t.parPage));
    t.page = Math.min(t.page, pages);
    const debut = (t.page - 1) * t.parPage;
    const page = lignes.slice(debut, debut + t.parPage);
    const optionsStatut = s => Object.entries(STATUTS).map(([cle, v]) => `<option value="${cle}"${cle === s.statut ? ' selected' : ''}>${v.libelle}</option>`).join('');
    const optionsAgents = s => `<option value="">Non assigné</option>${etat.agents.map(a => `<option value="${a.id}"${a.id === s.assigne_a ? ' selected' : ''}>${echapper(a.nom_complet)}</option>`).join('')}`;

    $('#corpsTable').innerHTML = page.length ? page.map(s => {
        const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
        const coche = t.selection.has(s.id);
        return `<tr class="${coche ? 'selectionnee' : ''}" data-id="${s.id}">
            <td class="col-collante"><label class="checkbox"><input type="checkbox" data-selection="${s.id}"${coche ? ' checked' : ''}><span class="sr-only">Sélectionner ${echapper(idCourt(s.id))}</span></label></td>
            <td class="id-court">${echapper(idCourt(s.id))}</td>
            <td>${s.photo_url ? `<img class="photo-thumb" src="${echapper(s.photo_url)}" alt="" loading="lazy">` : htmlVignette(s, 'photo-thumb')}</td>
            <td><span class="cellule-type"><i class="bi ${type.icone}" aria-hidden="true"></i>${echapper(type.libelle)}</span></td>
            <td>${htmlSeverite(s.severite)}</td>
            <td>${echapper(s.commune || '—')}<span class="texte-xs texte-muet" style="display:block">${echapper(s.quartier || '')}</span></td>
            <td><time datetime="${s.created_at}" title="${echapper(formatDate(s.created_at, true))}">${echapper(formatRelatif(s.created_at))}</time></td>
            <td>${htmlStatut(s.statut)}</td>
            <td><div class="rangee" style="gap:6px">
                <label class="sr-only" for="st-${s.id}">Statut de ${echapper(idCourt(s.id))}</label>
                <select class="select compact" id="st-${s.id}" data-changer-statut="${s.id}">${optionsStatut(s)}</select>
                <label class="sr-only" for="ag-${s.id}">Agent assigné</label>
                <select class="select compact" id="ag-${s.id}" data-assigner="${s.id}">${optionsAgents(s)}</select>
                <button type="button" class="btn-icon nu" data-localiser="${s.id}" aria-label="Voir ${echapper(idCourt(s.id))} sur la carte"><i class="bi bi-geo-alt" aria-hidden="true"></i></button>
            </div></td>
        </tr>`;
    }).join('') : `<tr><td colspan="9"><div class="etat-vide"><i class="bi bi-search" aria-hidden="true"></i><p>Aucun signalement ne correspond à cette recherche.</p></div></td></tr>`;

    $('#infoPagination').textContent = lignes.length
        ? `Page ${t.page} sur ${pages} · ${debut + 1}–${Math.min(debut + t.parPage, lignes.length)} sur ${lignes.length}`
        : '0 résultat';
    $('#btnPagePrec').disabled = t.page <= 1;
    $('#btnPageSuiv').disabled = t.page >= pages;

    const ids = page.map(s => s.id);
    const tout = $('#toutSelectionner');
    tout.checked = ids.length > 0 && ids.every(id => t.selection.has(id));
    tout.indeterminate = !tout.checked && ids.some(id => t.selection.has(id));
    majActionsGroupees();

    for (const th of $$('th[data-tri]')) {
        const actif = th.dataset.tri === t.tri;
        if (actif) th.setAttribute('aria-sort', t.asc ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
        th.querySelector('.bi').className = `bi ${actif ? (t.asc ? 'bi-sort-up' : 'bi-sort-down') : 'bi-arrow-down-up'}`;
    }
}

function majActionsGroupees() {
    const n = etat.table.selection.size;
    $('#actionsGroupees').hidden = n === 0;
    $('#nbSelection').textContent = n;
    $('#btnAppliquerGroupe').disabled = !$('#statutGroupe').value;
}

function initTable() {
    const optionsStatut = Object.entries(STATUTS).map(([cle, v]) => `<option value="${cle}">${v.libelle}</option>`).join('');
    $('#filtreStatutTable').insertAdjacentHTML('beforeend', optionsStatut);
    $('#statutGroupe').insertAdjacentHTML('beforeend', optionsStatut);
    $('#filtreCommuneTable').insertAdjacentHTML('beforeend', COMMUNES.map(c => `<option value="${echapper(c)}">${echapper(c)}</option>`).join(''));
    const t = etat.table;

    $('#rechercheTable').addEventListener('input', debounce(e => { t.recherche = e.target.value.trim(); t.page = 1; rendreTable(); }, 200));
    $('#filtreStatutTable').addEventListener('change', e => { t.statut = e.target.value; t.page = 1; rendreTable(); });
    $('#filtreCommuneTable').addEventListener('change', e => { t.commune = e.target.value; t.page = 1; rendreTable(); });
    $('#btnPagePrec').addEventListener('click', () => { t.page--; rendreTable(); });
    $('#btnPageSuiv').addEventListener('click', () => { t.page++; rendreTable(); });

    $('thead').addEventListener('click', e => {
        const th = e.target.closest('th[data-tri]');
        if (!th || !e.target.closest('button')) return;
        if (t.tri === th.dataset.tri) t.asc = !t.asc;
        else { t.tri = th.dataset.tri; t.asc = th.dataset.tri !== 'created_at' && th.dataset.tri !== 'severite'; }
        rendreTable();
    });

    $('#toutSelectionner').addEventListener('change', e => {
        const debut = (t.page - 1) * t.parPage;
        for (const s of lignesFiltrees().slice(debut, debut + t.parPage)) e.target.checked ? t.selection.add(s.id) : t.selection.delete(s.id);
        rendreTable();
    });

    $('#corpsTable').addEventListener('change', async e => {
        const sel = e.target.closest('[data-selection]');
        if (sel) {
            sel.checked ? t.selection.add(sel.dataset.selection) : t.selection.delete(sel.dataset.selection);
            sel.closest('tr').classList.toggle('selectionnee', sel.checked);
            const tout = $('#toutSelectionner');
            const cases = $$('[data-selection]');
            tout.checked = cases.every(c => c.checked);
            tout.indeterminate = !tout.checked && cases.some(c => c.checked);
            majActionsGroupees();
            return;
        }
        const statut = e.target.closest('[data-changer-statut]');
        if (statut) return appliquerStatut([statut.dataset.changerStatut], statut.value);
        const agent = e.target.closest('[data-assigner]');
        if (agent) {
            try {
                const s = etat.signalements.find(x => x.id === agent.dataset.assigner);
                const [maj] = await changerStatut(agent.dataset.assigner, agent.value && s.statut !== 'resolu' ? 'en_cours' : s.statut, { assigneA: agent.value || null });
                integrer(maj);
                succes(agent.value ? 'Signalement assigné' : 'Assignation retirée', agent.value ? `${agent.selectedOptions[0].textContent} le prend en charge.` : '');
            } catch (err) { erreur("L'assignation a échoué", err.message); rendreTable(); }
        }
    });

    $('#corpsTable').addEventListener('click', e => {
        const bouton = e.target.closest('[data-localiser]');
        if (!bouton) return;
        routeur.aller('carte');
        setTimeout(() => coucheAdmin?.ouvrir(bouton.dataset.localiser), 250);
    });

    $('#statutGroupe').addEventListener('change', majActionsGroupees);
    $('#btnAnnulerSelection').addEventListener('click', () => { t.selection.clear(); rendreTable(); });
    $('#btnAppliquerGroupe').addEventListener('click', async () => {
        await appliquerStatut([...t.selection], $('#statutGroupe').value);
        t.selection.clear();
        $('#statutGroupe').value = '';
        rendreTable();
    });
}

async function appliquerStatut(ids, statut) {
    if (!ids.length || !statut) return;
    try {
        const majs = await changerStatut(ids, statut);
        majs.forEach(integrer);
        succes(ids.length > 1 ? `${ids.length} signalements mis à jour` : 'Statut mis à jour', `Nouveau statut : ${STATUTS[statut].libelle}`);
    } catch (err) {
        erreur('La mise à jour a échoué', err.message);
        rendreTable();
    }
}

// Protection contre l'injection de formules dans Excel : une cellule ne commence jamais par = + - @
function celluleCsv(valeur) {
    let v = String(valeur ?? '');
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return `"${v.replace(/"/g, '""')}"`;
}

function exporterCsv(liste, nom) {
    const entetes = ['ID', 'Date', 'Type', 'Sévérité', 'Statut', 'Priorité', 'Commune', 'Quartier', 'Adresse', 'Latitude', 'Longitude', 'Confirmations', 'Infirmations', 'Source', 'Résolu le', 'Description'];
    const lignes = liste.map(s => [
        s.id, formatDate(s.created_at, true), TYPES_OBSTRUCTION[s.type_obstruction]?.libelle || s.type_obstruction, s.severite,
        STATUTS[s.statut]?.libelle || s.statut, PRIORITES[s.priorite] || s.priorite, s.commune, s.quartier, s.adresse,
        s.lat, s.lng, s.nombre_confirmations, s.nombre_infirmations, s.source, s.resolu_at ? formatDate(s.resolu_at, true) : '', s.description
    ].map(celluleCsv).join(';'));
    // BOM UTF-8 et point-virgule : ouverture correcte dans Excel en francais
    telechargerFichier(nom, '﻿' + [entetes.map(celluleCsv).join(';'), ...lignes].join('\r\n'), 'text/csv;charset=utf-8');
    succes('Export prêt', `${liste.length} signalement${liste.length > 1 ? 's' : ''} exporté${liste.length > 1 ? 's' : ''}.`);
}

const dateFichier = () => new Date().toLocaleDateString('fr-CA');
$('#btnExport').addEventListener('click', () => exporterCsv(lignesFiltrees(), `debrisat-signalements-${dateFichier()}.csv`));
$('#btnExportComplet').addEventListener('click', () => exporterCsv(etat.signalements, `debrisat-export-complet-${dateFichier()}.csv`));

// ============ Carte d'administration ============
function initCarteAdmin() {
    if (carteAdmin) {
        setTimeout(() => carteAdmin.invalidateSize(), 50);
        return;
    }
    carteAdmin = creerCarte($('#carteAdmin'));
    L.control.zoom({ position: 'topright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(carteAdmin);
    coucheAdmin = new CoucheSignalements(carteAdmin, { optionsPopup: { admin: true } });
    coucheAdmin.definir(etat.signalements);
    coucheZonesAdmin = creerCoucheZones(etat.zones).addTo(carteAdmin);
    const actifs = etat.signalements.filter(s => STATUTS_ACTIFS.includes(s.statut));
    if (actifs.length) carteAdmin.fitBounds(L.latLngBounds(actifs.map(s => [s.lat, s.lng])), { padding: [32, 32], animate: false });
    carteAdmin.getContainer().addEventListener('change', e => {
        const select = e.target.closest('[data-action="statut"]');
        if (select) appliquerStatut([select.dataset.id], select.value);
    });
    setTimeout(() => carteAdmin.invalidateSize(), 50);
}

// ============ Zones ============
function rendreZones() {
    const zones = etat.zones.slice().sort((a, b) => b.score_risque - a.score_risque);
    $('#grilleZones').innerHTML = zones.length ? zones.map(z => {
        const score = Math.round(z.score_risque);
        const niveau = score >= 85 ? ['Critique', 'badge-danger'] : score >= 70 ? ['Élevé', 'badge-warning'] : ['Modéré', 'badge-neutral'];
        return `<article class="card card-zone glass-card" style="border-left:3px solid ${couleurRisque(score)}">
            <div class="rangee-entre">
                <div><h2 style="font-size:var(--text-lg)">${echapper(z.nom)}</h2><p class="texte-sm texte-secondaire"><i class="bi bi-building" aria-hidden="true"></i> ${echapper(z.commune || '')}</p></div>
                <span class="badge ${niveau[1]}">${niveau[0]}</span>
            </div>
            <div class="rangee" style="align-items:baseline;gap:6px"><span class="chiffre score">${score}</span><span class="texte-muet">/ 100</span></div>
            <div class="jauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}" aria-label="Score de risque de ${echapper(z.nom)}" style="--ratio:${score / 100}"><span></span></div>
            <dl class="liste-def">
                <dt><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>Signalements actifs</dt><dd class="mono">${z.nombre_signalements_actifs}</dd>
                <dt><i class="bi bi-clock" aria-hidden="true"></i>Dernier calcul</dt><dd>${echapper(formatRelatif(z.dernier_calcul))}</dd>
            </dl>
            <div><p class="label" style="margin-bottom:6px">Inondations passées</p>
                <div class="historique">${(z.historique_inondations || []).length
                    ? z.historique_inondations.map(h => `<span class="badge badge-neutral">${h.annee} · ${echapper(h.degats)}</span>`).join('')
                    : '<span class="texte-sm texte-muet">Aucune inondation majeure enregistrée</span>'}</div></div>
            <button type="button" class="btn btn-sm btn-secondary" data-zone="${z.id}"><i class="bi bi-map" aria-hidden="true"></i>Voir sur la carte</button>
        </article>`;
    }).join('') : '<div class="etat-vide card"><i class="bi bi-shield-exclamation" aria-hidden="true"></i><p>Aucune zone à risque définie.</p></div>';
}

$('#grilleZones').addEventListener('click', e => {
    const b = e.target.closest('[data-zone]');
    if (!b) return;
    const zone = etat.zones.find(z => z.id === b.dataset.zone);
    routeur.aller('carte');
    setTimeout(() => {
        if (zone?.coordonnees?.length) carteAdmin?.flyToBounds(L.latLngBounds(zone.coordonnees), { padding: [40, 40], duration: 0.8 });
    }, 200);
});

// ============ Alertes ============
function initAlertes() {
    $('#champTypeAlerte').innerHTML = Object.entries(TYPES_ALERTE).map(([cle, t]) => `<option value="${cle}">${t.libelle}</option>`).join('');
    $('#champCanalAlerte').innerHTML = Object.entries(CANAUX_ALERTE).map(([cle, nom]) => `<option value="${cle}">${nom}</option>`).join('');
    $('#champMessageAlerte').addEventListener('input', e => { $('#compteurMessage').textContent = e.target.value.length; });

    $('#formAlerte').addEventListener('submit', async e => {
        e.preventDefault();
        const titre = $('#champTitreAlerte').value.trim();
        const message = $('#champMessageAlerte').value.trim();
        const erreurs = { Titre: titre.length < 4 ? 'Donnez un titre clair (4 caractères minimum).' : '', Message: message.length < 10 ? 'Le message doit contenir des consignes (10 caractères minimum).' : '' };
        for (const [champ, msg] of Object.entries(erreurs)) {
            $(`#champ${champ}Alerte`).setAttribute('aria-invalid', String(!!msg));
            $(`#erreur${champ}Alerte`).innerHTML = msg ? `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${msg}` : '';
        }
        if (erreurs.Titre || erreurs.Message) { $(erreurs.Titre ? '#champTitreAlerte' : '#champMessageAlerte').focus(); return; }

        const canal = $('#champCanalAlerte').value;
        const bouton = $('#btnEnvoyerAlerte');
        bouton.classList.add('btn-chargement');
        try {
            const { destinataires } = await creerAlerte({ titre, message, type_alerte: $('#champTypeAlerte').value, canal, zone_id: $('#champZoneAlerte').value });
            succes('Alerte publiée', canal === 'webapp'
                ? "Elle s'affiche maintenant dans l'application citoyenne."
                : MODE_DEMO ? 'Mode démo : aucun SMS ni message WhatsApp n\'a été envoyé.' : `${destinataires} message${destinataires > 1 ? 's' : ''} envoyé${destinataires > 1 ? 's' : ''}.`);
            $('#formAlerte').reset();
            $('#compteurMessage').textContent = '0';
            etat.alertes = await listerAlertes(20);
            rendreAlertes();
        } catch (err) {
            erreur("L'alerte n'a pas été envoyée", err.message);
        } finally {
            bouton.classList.remove('btn-chargement');
        }
    });
}

function rendreAlertes() {
    $('#champZoneAlerte').innerHTML = '<option value="">Toute la région</option>' + etat.zones.map(z => `<option value="${z.id}">${echapper(z.nom)}</option>`).join('');
    $('#listeAlertesAdmin').innerHTML = etat.alertes.length ? etat.alertes.map(a => {
        const t = TYPES_ALERTE[a.type_alerte] || TYPES_ALERTE.info;
        const zone = etat.zones.find(z => z.id === a.zone_id);
        return `<article class="alerte-item alerte-${a.type_alerte}">
            <div class="flex-1">
                <div class="rangee-entre"><h3>${echapper(a.titre)}</h3><span class="badge ${t.classe}"><i class="bi ${t.icone}" aria-hidden="true"></i>${t.libelle}</span></div>
                <p>${echapper(a.message)}</p>
                <p class="quand"><i class="bi bi-clock" aria-hidden="true"></i>${echapper(formatRelatif(a.created_at))} · ${echapper(CANAUX_ALERTE[a.canal] || a.canal)} · ${echapper(zone?.nom || 'Toute la région')}</p>
            </div>
        </article>`;
    }).join('') : '<div class="etat-vide"><i class="bi bi-bell" aria-hidden="true"></i><p>Aucune alerte envoyée.</p></div>';
}

// ============ Parametres ============
function rendreParametres() {
    const p = preferenceTheme();
    $$('#choixThemeTableau [data-theme-choix]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoix === p)));
    $('#descSource').textContent = MODE_DEMO
        ? 'Mode démo : données fictives générées localement. Renseignez SUPABASE_URL et SUPABASE_ANON_KEY dans js/config.js pour passer en production.'
        : 'Supabase (temps réel activé)';
    const profil = profilCourant();
    $('#descSession').textContent = profil ? `${profil.nom_complet} · ${ROLES[profil.role] || profil.role}` : '';
}
$('#choixThemeTableau').addEventListener('click', e => {
    const b = e.target.closest('[data-theme-choix]');
    if (!b) return;
    definirTheme(b.dataset.themeChoix);
    rendreParametres();
});
$('#btnDeconnexionTableau').addEventListener('click', async () => {
    await deconnexion();
    location.href = 'index.html';
});

// ============ Donnees ============
const rendreVue = () => {
    rendreStats();
    rendreGraphiquesVue();
};
const rendreApresChangement = debounce(() => {
    rendreStats();
    if (!$('#panneauTableau').hidden) rendreTable();
    if (routeur.courante === 'statistiques') rendreStatistiques();
    else rendreGraphiquesVue();
}, 300);

function integrer(s) {
    if (!s) return;
    const i = etat.signalements.findIndex(x => x.id === s.id);
    if (i >= 0) etat.signalements[i] = { ...etat.signalements[i], ...s };
    else etat.signalements.unshift(s);
    coucheAdmin?.mettreAJour(s);
    rendreApresChangement();
}

function afficherAcces() {
    const profil = profilCourant();
    if (!estConnecte()) return false;
    $('#nomAgent').textContent = profil?.nom_complet || '—';
    $('#roleAgent').textContent = ROLES[profil?.role] || '';
    $('#avatarAgent').textContent = initiales(profil?.nom_complet || '');
    return estAutorite();
}

async function demarrer() {
    $('#chipDemo').hidden = !MODE_DEMO;
    majPeriode();
    await initAuth();
    if (!afficherAcces()) {
        $('#accesRefuse').hidden = false;
        $('#choixPeriode').hidden = true;
        if (estConnecte()) {
            $('#messageAcces').textContent = "Votre compte citoyen n'a pas accès à cet espace. Un administrateur peut vous attribuer le rôle d'agent municipal ou d'autorité.";
            $('#lienConnexionAcces').hidden = true;
        }
        return;
    }
    initTable();
    initAlertes();
    try {
        const [signalements, zones, alertes, agents] = await Promise.all([listerSignalements(), listerZones(), listerAlertes(20), listerAgents()]);
        Object.assign(etat, { signalements, zones, alertes, agents });
    } catch (err) {
        erreur('Chargement impossible', err.message);
    }
    routeur.demarrer();
    rendreVue();

    suivreSignalements({
        surNouveau: s => {
            const nouveau = !etat.signalements.some(x => x.id === s.id);
            integrer(s);
            if (nouveau) {
                const type = TYPES_OBSTRUCTION[s.type_obstruction] || TYPES_OBSTRUCTION.autre;
                toast({ type: s.severite >= 4 ? 'warning' : 'info', icone: type.icone, titre: `Nouveau signalement · ${s.commune || 'Dakar'}`, message: `${type.libelle}, sévérité ${s.severite}/5`, duree: 5000 });
            }
        },
        surMiseAJour: integrer
    });
}

demarrer();
