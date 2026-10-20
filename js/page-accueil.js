import { STATUTS_ACTIFS, MODE_DEMO } from './config.js';
import { $ } from './utils.js';
import { initTheme } from './theme.js';
import { initI18n } from './i18n.js';
import { initPwa } from './pwa.js';
import { initApparitions, compterQuandVisible, compterJusqua, Feuille, initRetourTactile } from './animations.js';
import { listerSignalements, compterCitoyensActifs } from './donnees.js';
import { creerCarte, CoucheSignalements } from './map.js';
import { suivreSignalements } from './realtime.js';

initTheme();
initI18n();
initPwa();
initRetourTactile();
initApparitions();

$('#annee').textContent = new Date().getFullYear();

// Entete : materiau translucide des que le contenu passe dessous
const entete = $('#entete');
const majEntete = () => entete.classList.toggle('defile', window.scrollY > 24);
window.addEventListener('scroll', majEntete, { passive: true });
majEntete();

// Menu mobile, ancre sous son bouton
const menu = $('#menuMobile');
const btnMenu = $('#btnMenu');
const basculerMenu = ouvrir => {
    menu.classList.toggle('ouvert', ouvrir);
    btnMenu.setAttribute('aria-expanded', String(ouvrir));
    btnMenu.innerHTML = `<i class="bi ${ouvrir ? 'bi-x-lg' : 'bi-list'}" aria-hidden="true"></i>`;
    btnMenu.setAttribute('aria-label', ouvrir ? 'Fermer le menu' : 'Ouvrir le menu');
    if (ouvrir) entete.classList.add('defile'); else majEntete();
};
btnMenu.addEventListener('click', () => basculerMenu(!menu.classList.contains('ouvert')));
menu.addEventListener('click', e => { if (e.target.closest('a')) basculerMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('ouvert')) { basculerMenu(false); btnMenu.focus(); } });
document.addEventListener('pointerdown', e => {
    if (menu.classList.contains('ouvert') && !e.target.closest('#menuMobile, #btnMenu')) basculerMenu(false);
});

const mentions = new Feuille($('#feuilleMentions'));
$('#btnMentions').addEventListener('click', () => mentions.ouvrir());

// Carte d'apercu : non interactive, elle donne envie d'ouvrir l'application
const carte = creerCarte($('#carteApercu'), { interactive: false, zoom: 11 });
const couche = new CoucheSignalements(carte, { regroupement: false });
couche.filtrer(s => STATUTS_ACTIFS.includes(s.statut));

function majCompteurs(signalements) {
    const actifs = signalements.filter(s => STATUTS_ACTIFS.includes(s.statut)).length;
    compterJusqua($('#nbActifs'), actifs, { duree: 1200 });
    $('#eyebrowDirect').textContent = actifs === 0
        ? 'Aucun signalement actif en ce moment à Dakar'
        : `${actifs} signalement${actifs > 1 ? 's' : ''} actif${actifs > 1 ? 's' : ''} en ce moment à Dakar`;
}

async function demarrer() {
    try {
        const [signalements, citoyens] = await Promise.all([listerSignalements(), compterCitoyensActifs()]);
        couche.definir(signalements);
        const actifs = signalements.filter(s => STATUTS_ACTIFS.includes(s.statut));
        if (actifs.length) {
            // Le panneau de chiffres recouvre le bas (mobile) ou la gauche (ordinateur) de la carte
            const bureau = matchMedia('(min-width: 768px)').matches;
            carte.fitBounds(L.latLngBounds(actifs.map(s => [s.lat, s.lng])), {
                paddingTopLeft: bureau ? [380, 40] : [24, 32],
                paddingBottomRight: bureau ? [40, 40] : [24, 200],
                animate: false
            });
        }
        majCompteurs(signalements);
        compterQuandVisible($('#chiffreTotal'), signalements.length);
        compterQuandVisible($('#chiffreResolus'), signalements.filter(s => s.statut === 'resolu').length);
        compterQuandVisible($('#chiffreCitoyens'), citoyens);
        compterQuandVisible($('#chiffreCommunes'), new Set(signalements.map(s => s.commune).filter(Boolean)).size);

        const tous = signalements;
        suivreSignalements({
            surNouveau: s => {
                if (tous.some(x => x.id === s.id)) return;
                tous.unshift(s);
                couche.ajouter(s);
                majCompteurs(tous);
                compterJusqua($('#chiffreTotal'), tous.length, { duree: 800 });
            },
            surMiseAJour: s => {
                const i = tous.findIndex(x => x.id === s.id);
                if (i >= 0) tous[i] = { ...tous[i], ...s };
                couche.mettreAJour(s);
                majCompteurs(tous);
            },
            simulation: MODE_DEMO
        });
    } catch {
        for (const id of ['#nbActifs', '#chiffreTotal', '#chiffreResolus', '#chiffreCitoyens', '#chiffreCommunes']) $(id).textContent = '—';
        $('#eyebrowDirect').textContent = 'Signalements citoyens à Dakar';
    }
}

demarrer();

// Chiffre mesure sur les scenes Sentinel-2 (scripts/analyse_ndwi.py), lu dans le fichier produit
fetch('assets/satellite/metadata.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .then(m => {
        if (m) $('#statEauNouvelle').textContent = `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(m.eau_nouvelle_ha)} ha`;
    })
    .catch(() => { /* chiffre facultatif */ });
