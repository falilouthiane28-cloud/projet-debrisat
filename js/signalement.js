import { TYPES_OBSTRUCTION, SEVERITES, DAKAR_CENTRE, POINTS } from './config.js';
import { $, echapper, compresserImage, obtenirPosition, geocodageInverse, debounce } from './utils.js';
import { creerSignalement, listerBadges } from './donnees.js';
import { utilisateurCourant, profilCourant, rafraichirProfil } from './auth.js';
import { creerCarte } from './map.js';
import { lancerAnalyse } from './ia-analysis.js';
import { celebrerPoints, nouveauxBadges, annoncerBadges } from './gamification.js';
import { erreur, annoncer, avertissement } from './notifications.js';
import { mettreEnAttente } from './pwa.js';

const ETAPES = [
    { cle: 'photo', titre: 'Photo' },
    { cle: 'type', titre: "Type d'obstruction" },
    { cle: 'severite', titre: 'Sévérité' },
    { cle: 'lieu', titre: 'Localisation' }
];

export class AssistantSignalement {
    constructor(feuille, { surCree } = {}) {
        this.feuille = feuille;
        this.el = feuille.el;
        this.surCree = surCree;
        this.corps = $('#corpsAssistant', this.el);
        this.pied = $('#piedAssistant', this.el);
        this.btnPrecedent = $('#btnPrecedent', this.el);
        this.btnSuivant = $('#btnSuivant', this.el);
        this.titre = $('#titreSignalement', this.el);
        this.libelleEtape = $('#etapeLibelle', this.el);
        this.progression = $('#progressionAssistant', this.el);
        this.btnPrecedent.addEventListener('click', () => this.aller(this.index - 1, true));
        this.btnSuivant.addEventListener('click', () => this.suivant());
        this.reinitialiser();
    }

    reinitialiser() {
        if (this.apercuUrl) URL.revokeObjectURL(this.apercuUrl);
        this.miniCarte?.remove();
        this.miniCarte = null;
        this.apercuUrl = null;
        this.index = 0;
        this.envoi = false;
        this.donnees = {
            photo: null, type_obstruction: null, severite: 3,
            lat: null, lng: null, adresse: '', commune: '', quartier: '', description: ''
        };
    }

    ouvrir() {
        this.reinitialiser();
        this.pied.hidden = false;
        this.aller(0);
        this.feuille.ouvrir();
    }

    valide(index = this.index) {
        const d = this.donnees;
        return [!!d.photo, !!d.type_obstruction, d.severite >= 1, d.lat != null][index];
    }

    aller(index, retour = false) {
        if (index < 0 || index >= ETAPES.length) return;
        this.index = index;
        const etape = ETAPES[index];
        this.titre.textContent = etape.titre;
        this.libelleEtape.textContent = `Étape ${index + 1} sur ${ETAPES.length}`;
        this.progression.innerHTML = ETAPES.map((_, i) => `<span class="pas${i < index ? ' fait' : ''}${i === index ? ' actif' : ''}"></span>`).join('');
        this.btnPrecedent.style.visibility = index === 0 ? 'hidden' : 'visible';
        const derniere = index === ETAPES.length - 1;
        this.btnSuivant.innerHTML = derniere
            ? '<i class="bi bi-send" aria-hidden="true"></i>Envoyer le signalement'
            : 'Suivant<i class="bi bi-arrow-right" aria-hidden="true"></i>';
        this.btnSuivant.style.flex = derniere ? '1' : '';
        // Sur la derniere etape, « Precedent » se reduit a une icone pour laisser la place a l'envoi
        this.btnPrecedent.innerHTML = derniere
            ? '<i class="bi bi-arrow-left" aria-hidden="true"></i>'
            : '<i class="bi bi-arrow-left" aria-hidden="true"></i>Précédent';
        this.btnPrecedent.classList.toggle('btn-icon', derniere);
        if (derniere) this.btnPrecedent.setAttribute('aria-label', 'Étape précédente');
        else this.btnPrecedent.removeAttribute('aria-label');
        this[`rendre_${etape.cle}`](retour);
        this.majBouton();
        annoncer(`Étape ${index + 1} sur ${ETAPES.length} : ${etape.titre}`);
    }

    majBouton() {
        this.btnSuivant.disabled = !this.valide() || this.envoi;
    }

    suivant() {
        if (!this.valide()) return;
        if (this.index < ETAPES.length - 1) this.aller(this.index + 1);
        else this.envoyer();
    }

    conteneurEtape(html, retour) {
        this.corps.innerHTML = `<div class="etape-assistant${retour ? ' retour' : ''}">${html}</div>`;
        this.corps.scrollTop = 0;
        return this.corps.firstElementChild;
    }

    // ============ Etape 1 : photo ============
    rendre_photo(retour) {
        const avecPhoto = !!this.apercuUrl;
        const el = this.conteneurEtape(`
            <p class="consigne">Photographiez l'obstruction en entier, avec le canal ou le caniveau visible.</p>
            <div class="zone-photo${avecPhoto ? ' avec-photo' : ''}" id="zonePhoto">
                ${avecPhoto
                    ? `<img src="${this.apercuUrl}" alt="Aperçu de la photo choisie">
                       <label class="btn btn-sm btn-secondary remplacer" for="champPhotoGalerie"><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Remplacer</label>`
                    : `<label class="bouton-camera" for="champPhotoCamera" aria-label="Prendre une photo"><i class="bi bi-camera" aria-hidden="true"></i></label>
                       <div><p class="texte-sm" style="color:var(--color-heading);font-weight:600">Prendre une photo</p>
                       <p class="texte-xs texte-muet">JPEG ou PNG · réduite automatiquement avant l'envoi</p></div>
                       <label class="btn btn-sm btn-ghost" for="champPhotoGalerie"><i class="bi bi-cloud-upload" aria-hidden="true"></i>Choisir dans la galerie</label>`}
            </div>
            <input type="file" id="champPhotoCamera" class="sr-only" accept="image/*" capture="environment" tabindex="-1">
            <input type="file" id="champPhotoGalerie" class="sr-only" accept="image/*" tabindex="-1">
            <p class="form-error" id="erreurPhoto" role="alert"></p>`, retour);

        const traiter = async fichier => {
            const zoneErreur = $('#erreurPhoto', el);
            zoneErreur.textContent = '';
            if (!fichier) return;
            if (!fichier.type.startsWith('image/')) {
                zoneErreur.innerHTML = '<i class="bi bi-exclamation-circle" aria-hidden="true"></i>Ce fichier n\'est pas une image.';
                return;
            }
            if (fichier.size > 15 * 1024 * 1024) {
                zoneErreur.innerHTML = '<i class="bi bi-exclamation-circle" aria-hidden="true"></i>Image trop lourde (15 Mo maximum).';
                return;
            }
            const compressee = await compresserImage(fichier);
            if (this.apercuUrl) URL.revokeObjectURL(this.apercuUrl);
            this.donnees.photo = compressee;
            this.apercuUrl = URL.createObjectURL(compressee);
            this.rendre_photo();
            this.majBouton();
            annoncer('Photo ajoutée.');
        };
        for (const id of ['#champPhotoCamera', '#champPhotoGalerie']) {
            $(id, el).addEventListener('change', e => traiter(e.target.files[0]));
        }
        const zone = $('#zonePhoto', el);
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('survol'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('survol'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('survol');
            traiter(e.dataTransfer.files[0]);
        });
        // Les libelles servent de boutons : activables au clavier
        for (const label of el.querySelectorAll('label[for^="champPhoto"]')) {
            label.tabIndex = 0;
            label.setAttribute('role', 'button');
            label.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); label.click(); }
            });
        }
    }

    // ============ Etape 2 : type ============
    rendre_type(retour) {
        const el = this.conteneurEtape(`
            <p class="consigne" id="consigneType">Qu'est-ce qui bloque l'écoulement de l'eau ?</p>
            <div class="grille-types" role="radiogroup" aria-labelledby="consigneType">
                ${Object.entries(TYPES_OBSTRUCTION).map(([cle, t]) => `
                    <button type="button" class="option-type" role="radio" data-type="${cle}"
                        aria-checked="${this.donnees.type_obstruction === cle}" tabindex="-1">
                        <i class="bi ${t.icone}" aria-hidden="true"></i>
                        <span class="nom-type">${echapper(t.libelle)}</span>
                        <span class="coche" aria-hidden="true"><i class="bi bi-check-lg"></i></span>
                    </button>`).join('')}
            </div>`, retour);
        const options = [...el.querySelectorAll('.option-type')];
        const actif = options.find(o => o.getAttribute('aria-checked') === 'true') || options[0];
        actif.tabIndex = 0;
        const choisir = option => {
            this.donnees.type_obstruction = option.dataset.type;
            options.forEach(o => {
                const ok = o === option;
                o.setAttribute('aria-checked', String(ok));
                o.tabIndex = ok ? 0 : -1;
            });
            this.majBouton();
        };
        el.addEventListener('click', e => {
            const option = e.target.closest('.option-type');
            if (option) choisir(option);
        });
        el.addEventListener('keydown', e => {
            const i = options.indexOf(document.activeElement);
            if (i < 0) return;
            const colonnes = getComputedStyle(el.querySelector('.grille-types')).gridTemplateColumns.split(' ').length;
            const deplacements = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: colonnes, ArrowUp: -colonnes };
            if (deplacements[e.key] !== undefined) {
                e.preventDefault();
                const suivant = options[(i + deplacements[e.key] + options.length) % options.length];
                suivant.focus();
                choisir(suivant);
            }
        });
    }

    // ============ Etape 3 : severite ============
    rendre_severite(retour) {
        const el = this.conteneurEtape(`
            <p class="consigne" id="consigneSeverite">À quel point l'écoulement est-il bloqué ?</p>
            <div class="apercu-severite" id="apercuSeverite" aria-live="polite">
                <span class="niveau" id="niveauSeverite"></span>
                <div><p class="nom-niveau" id="nomSeverite"></p><p class="explication" id="explicationSeverite"></p></div>
            </div>
            <div>
                <input type="range" class="slider" id="curseurSeverite" min="1" max="5" step="1"
                    value="${this.donnees.severite}" aria-labelledby="consigneSeverite">
                <div class="severite-etiquettes" aria-hidden="true">
                    ${Object.values(SEVERITES).map(s => `<span>${s.libelle}</span>`).join('')}
                </div>
            </div>`, retour);
        const curseur = $('#curseurSeverite', el);
        const maj = () => {
            const n = Number(curseur.value);
            const sev = SEVERITES[n];
            this.donnees.severite = n;
            curseur.style.setProperty('--valeur', n);
            curseur.style.setProperty('--couleur', sev.couleur);
            curseur.setAttribute('aria-valuetext', `${n} sur 5, ${sev.libelle}`);
            const apercu = $('#apercuSeverite', el);
            apercu.style.setProperty('--couleur', sev.couleur);
            $('#niveauSeverite', el).textContent = n;
            $('#nomSeverite', el).textContent = sev.libelle;
            $('#explicationSeverite', el).textContent = sev.explication;
            this.majBouton();
        };
        curseur.addEventListener('input', maj);
        maj();
    }

    // ============ Etape 4 : localisation ============
    rendre_lieu(retour) {
        const d = this.donnees;
        const el = this.conteneurEtape(`
            <p class="consigne">Déplacez la carte pour placer le repère exactement sur l'obstruction.</p>
            <div class="mini-carte" id="miniCarte">
                <div id="miniCarteLeaflet" style="position:absolute;inset:0" aria-label="Carte de localisation du signalement"></div>
                <i class="bi bi-geo-alt-fill viseur" aria-hidden="true"></i>
            </div>
            <div class="rangee-entre">
                <p class="adresse-detectee" id="adresseDetectee" aria-live="polite"><i class="bi bi-geo-alt" aria-hidden="true"></i><span>Recherche de votre position…</span></p>
                <button type="button" class="btn-icon" id="btnMaPosition" aria-label="Utiliser ma position actuelle"><i class="bi bi-crosshair" aria-hidden="true"></i></button>
            </div>
            <div class="form-group">
                <label class="form-label" for="champDescription">Précisions <span class="texte-muet" style="text-transform:none;letter-spacing:0">(facultatif)</span></label>
                <textarea class="textarea" id="champDescription" maxlength="500" rows="3" aria-describedby="aideDescription"
                    placeholder="Exemple : canal bouché devant l'école, l'eau remonte dans la rue">${echapper(d.description)}</textarea>
                <p class="form-helper" id="aideDescription"><span id="compteurDescription">${d.description.length}</span> / 500 caractères</p>
            </div>`, retour);

        $('#champDescription', el).addEventListener('input', e => {
            d.description = e.target.value;
            $('#compteurDescription', el).textContent = e.target.value.length;
        });

        const depart = d.lat != null ? [d.lat, d.lng] : DAKAR_CENTRE;
        this.miniCarte?.remove();
        const carte = creerCarte($('#miniCarteLeaflet', el), { centre: depart, zoom: d.lat != null ? 17 : 13 });
        this.miniCarte = carte;
        const zone = $('#miniCarte', el);
        const adresse = $('#adresseDetectee span', el);

        const geocoder = debounce(async (lat, lng) => {
            const geo = await geocodageInverse(lat, lng);
            if (this.donnees.lat !== lat) return;
            Object.assign(this.donnees, geo);
            adresse.textContent = geo.adresse || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }, 900);
        const definir = () => {
            const c = carte.getCenter();
            d.lat = +c.lat.toFixed(6);
            d.lng = +c.lng.toFixed(6);
            adresse.textContent = 'Recherche de l\'adresse…';
            geocoder(d.lat, d.lng);
            this.majBouton();
        };
        carte.on('movestart', () => zone.classList.add('deplacement'));
        carte.on('moveend', () => { zone.classList.remove('deplacement'); definir(); });

        const localiser = async () => {
            const bouton = $('#btnMaPosition', el);
            bouton.classList.add('btn-chargement');
            try {
                const pos = await obtenirPosition();
                carte.setView([pos.lat, pos.lng], 18);
            } catch (err) {
                adresse.textContent = 'Position non détectée : placez le repère à la main.';
                avertissement('Position indisponible', err.message);
                if (d.lat == null) definir();
            } finally {
                bouton.classList.remove('btn-chargement');
            }
        };
        $('#btnMaPosition', el).addEventListener('click', localiser);
        // La feuille vient d'apparaitre : Leaflet doit remesurer son conteneur
        setTimeout(() => carte.invalidateSize(), 60);
        if (d.lat == null) localiser();
        else definir();
    }

    // ============ Envoi ============
    async envoyer() {
        const utilisateur = utilisateurCourant();
        if (!utilisateur || this.envoi) return;
        this.envoi = true;
        this.btnSuivant.classList.add('btn-chargement');
        this.majBouton();
        const donnees = { ...this.donnees };
        try {
            if (!navigator.onLine) {
                await mettreEnAttente(donnees, utilisateur.id);
                this.afficherReussite({ horsLigne: true });
                return;
            }
            const profilAvant = profilCourant();
            const s = await creerSignalement(donnees, utilisateur.id);
            celebrerPoints(POINTS.signalement);
            this.afficherReussite({ signalement: s });
            this.surCree?.(s);
            lancerAnalyse(s).then(maj => { if (maj) this.surCree?.(maj, { miseAJour: true }); });
            const [profilApres, badges] = await Promise.all([rafraichirProfil(), listerBadges()]);
            annoncerBadges(nouveauxBadges(profilAvant, profilApres, badges));
        } catch (err) {
            erreur("Le signalement n'a pas été envoyé", err.message || 'Réessayez dans un instant.');
        } finally {
            this.envoi = false;
            this.btnSuivant.classList.remove('btn-chargement');
            this.majBouton();
        }
    }

    afficherReussite({ signalement, horsLigne = false }) {
        this.titre.textContent = horsLigne ? 'Enregistré hors ligne' : 'Merci pour votre signalement';
        this.libelleEtape.textContent = 'Terminé';
        this.progression.innerHTML = ETAPES.map(() => '<span class="pas fait"></span>').join('');
        this.pied.hidden = true;
        this.miniCarte?.remove();
        this.miniCarte = null;
        this.corps.innerHTML = `
            <div class="reussite">
                <svg class="coche-reussite" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="34"/><path d="M22 37l10 10 18-20"/></svg>
                <h3>${horsLigne ? 'Signalement mis en attente' : 'Signalement envoyé'}</h3>
                <p>${horsLigne
                    ? "Vous êtes hors ligne. Il sera envoyé automatiquement dès le retour de la connexion."
                    : `Vous gagnez <strong>${POINTS.signalement} points</strong>. La communauté et notre analyse automatique vont maintenant le vérifier.`}</p>
                <div class="pile-sm" style="width:100%;max-width:320px">
                    ${signalement ? `<button type="button" class="btn btn-plein btn-block" data-voir="${signalement.id}"><i class="bi bi-map" aria-hidden="true"></i>Voir sur la carte</button>` : ''}
                    <button type="button" class="btn btn-secondary btn-block" data-nouveau><i class="bi bi-plus-lg" aria-hidden="true"></i>Nouveau signalement</button>
                </div>
            </div>`;
        annoncer(horsLigne ? 'Signalement enregistré hors ligne.' : `Signalement envoyé. Vous gagnez ${POINTS.signalement} points.`);
        this.corps.querySelector('[data-nouveau]').addEventListener('click', () => this.ouvrir());
        this.corps.querySelector('[data-voir]')?.addEventListener('click', e => {
            this.feuille.fermer();
            this.el.dispatchEvent(new CustomEvent('voir-signalement', { bubbles: true, detail: { id: e.currentTarget.dataset.voir } }));
        });
        this.corps.querySelector('button')?.focus();
    }
}

// Envoi differe d'un signalement mis en file d'attente hors ligne
export async function envoyerDepuisFile(donnees, userId) {
    const s = await creerSignalement(donnees, userId);
    lancerAnalyse(s);
    return s;
}
