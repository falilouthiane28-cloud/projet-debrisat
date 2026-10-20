// Mosaique Sentinel-2 sans nuages (EOX, donnees Copernicus) : gratuite, sans cle d'API.
const URL_S2 = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg';
const ATTRIBUTION_S2 = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> par EOX IT Services GmbH (données Copernicus Sentinel modifiées, 2020)';

export function creerCoucheSatellite() {
    return L.tileLayer(URL_S2, {
        attribution: ATTRIBUTION_S2,
        maxNativeZoom: 15,
        maxZoom: 20,
        opacity: 1,
        crossOrigin: true
    });
}

export class BasculeSatellite {
    constructor(carte) {
        this.carte = carte;
        this.couche = null;
        this.active = false;
    }

    basculer() {
        this.active = !this.active;
        if (this.active) {
            this.couche ||= creerCoucheSatellite();
            this.couche.addTo(this.carte);
            // La mosaique remplace le fond mais reste sous les signalements
            this.couche.bringToBack();
            this.carte.fond?.setOpacity(0);
        } else {
            this.couche?.remove();
            this.carte.fond?.setOpacity(1);
        }
        return this.active;
    }
}

// ============ Demonstration : saison seche / saison des pluies (scenes Sentinel-2 reelles) ============
// Les images et les chiffres sont produits par scripts/analyse_ndwi.py dans assets/satellite/.

const DOSSIER_SAT = 'assets/satellite/';
export const ATTRIBUTION_SCENES = 'Contient des données Copernicus Sentinel-2 modifiées (ESA) via Earth Search · © contributeurs OpenStreetMap';

export async function chargerAnalyse() {
    const [reponseMeta, reponseExpo] = await Promise.all([
        fetch(DOSSIER_SAT + 'metadata.json', { cache: 'no-cache' }),
        fetch(DOSSIER_SAT + 'exposition.json', { cache: 'no-cache' })
    ]);
    if (!reponseMeta.ok) throw new Error("L'analyse satellite n'a pas encore été générée (scripts/analyse_ndwi.py).");
    return { metadata: await reponseMeta.json(), exposition: reponseExpo.ok ? await reponseExpo.json() : null };
}

export const boundsAnalyse = m => [[m.emprise.sud, m.emprise.ouest], [m.emprise.nord, m.emprise.est]];

/**
 * Deux images superposees : la scene « apres » est decoupee a droite d'un curseur deplacable.
 * Le decoupage suit la carte (deplacement, zoom), le curseur se pilote au doigt, a la souris et au clavier.
 */
export class ComparateurAvantApres {
    constructor(carte, { avant, apres, bounds, libelleAvant, libelleApres }) {
        this.carte = carte;
        this.ratio = 0.5;
        this.avant = L.imageOverlay(avant, bounds, { attribution: ATTRIBUTION_SCENES, alt: libelleAvant }).addTo(carte);
        this.apres = L.imageOverlay(apres, bounds, { alt: libelleApres }).addTo(carte);

        this.poignee = document.createElement('div');
        this.poignee.className = 'comparateur-poignee';
        this.poignee.innerHTML = `
            <span class="comparateur-etiquette gauche">${libelleAvant}</span>
            <button type="button" class="comparateur-bouton" role="slider" aria-label="Position de la comparaison"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><i class="bi bi-arrows-expand-vertical" aria-hidden="true"></i></button>
            <span class="comparateur-etiquette droite">${libelleApres}</span>`;
        carte.getContainer().append(this.poignee);
        this.bouton = this.poignee.querySelector('button');

        this.majDecoupe = this.majDecoupe.bind(this);
        carte.on('move zoom zoomend resize viewreset', this.majDecoupe);
        this.apres.on('load', this.majDecoupe);
        this.brancherGeste();
        this.majDecoupe();
    }

    brancherGeste() {
        const deplacer = x => {
            const rect = this.carte.getContainer().getBoundingClientRect();
            this.ratio = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
            this.majDecoupe();
        };
        this.bouton.addEventListener('pointerdown', e => {
            e.preventDefault();
            e.stopPropagation();
            this.bouton.setPointerCapture(e.pointerId);
            this.carte.dragging.disable();
            const suivre = ev => deplacer(ev.clientX);
            const finir = () => {
                this.bouton.removeEventListener('pointermove', suivre);
                this.carte.dragging.enable();
            };
            this.bouton.addEventListener('pointermove', suivre);
            this.bouton.addEventListener('pointerup', finir, { once: true });
            this.bouton.addEventListener('pointercancel', finir, { once: true });
        });
        this.bouton.addEventListener('keydown', e => {
            const pas = e.shiftKey ? 0.1 : 0.02;
            if (e.key === 'ArrowLeft') this.ratio = Math.max(0, this.ratio - pas);
            else if (e.key === 'ArrowRight') this.ratio = Math.min(1, this.ratio + pas);
            else if (e.key === 'Home') this.ratio = 0;
            else if (e.key === 'End') this.ratio = 1;
            else return;
            e.preventDefault();
            this.majDecoupe();
        });
        L.DomEvent.disableClickPropagation(this.poignee);
    }

    majDecoupe() {
        const taille = this.carte.getSize();
        const xEcran = taille.x * this.ratio;
        this.poignee.style.left = `${xEcran}px`;
        this.bouton.setAttribute('aria-valuenow', String(Math.round(this.ratio * 100)));
        const image = this.apres.getElement();
        if (!image) return;
        // Coordonnees du curseur dans le repere de l'image (qui bouge avec le panneau de la carte)
        const coinCalque = this.carte.containerPointToLayerPoint([xEcran, 0]);
        const origine = L.DomUtil.getPosition(image) || L.point(0, 0);
        const coupe = Math.max(0, coinCalque.x - origine.x);
        image.style.clipPath = `inset(0 0 0 ${coupe}px)`;
    }

    retirer() {
        this.carte.off('move zoom zoomend resize viewreset', this.majDecoupe);
        this.avant.remove();
        this.apres.remove();
        this.poignee.remove();
    }
}
