import { TYPES_OBSTRUCTION, SEVERITES, DAKAR_CENTRE, POINTS } from './config.js';
import { $, echapper, compresserImage, obtenirPosition, geocodageInverse, debounce, formatRelatif, lireStockage, ecrireStockage } from './utils.js';
import { creerSignalement, listerBadges } from './donnees.js';
import { utilisateurCourant, profilCourant, rafraichirProfil } from './auth.js';
import { creerCarte } from './map.js';
import { lancerAnalyse } from './ia-analysis.js';
import { celebrerPoints, nouveauxBadges, annoncerBadges } from './gamification.js';
import { erreur, annoncer, avertissement } from './notifications.js';
import { mettreEnAttente } from './pwa.js';

const ETAPES = [
    { cle: 'photo', titre: 'Photo', manque: "Ajoutez une photo de l'obstruction pour continuer." },
    { cle: 'type', titre: "Type d'obstruction", manque: "Choisissez le type d'obstruction pour continuer." },
    { cle: 'severite', titre: 'Sévérité', manque: 'Indiquez la sévérité pour continuer.' },
    { cle: 'lieu', titre: 'Localisation', manque: "Placez le repère sur l'obstruction pour continuer." },
    { cle: 'recap', titre: 'Vérifier et envoyer', manque: 'Une information manque : touchez « Modifier » sur la ligne concernée.' }
];
const INDEX_RECAP = ETAPES.length - 1;

// The photo blob is never stored: only the fields a person would have to retype
const CLE_BROUILLON = 'debrisat-brouillon-signalement';
const CHAMPS_BROUILLON = ['type_obstruction', 'severite', 'lat', 'lng', 'adresse', 'commune', 'quartier', 'description'];
const DUREE_BROUILLON = 7 * 24 * 3600 * 1000;

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
        this.btnPrecedent.addEventListener('click', () => {
            if (this.btnPrecedent.hasAttribute('data-fermer')) return;
            this.aller(this.retourRecap ? INDEX_RECAP : this.index - 1, true);
        });
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
        this.termine = false;
        this.enReprise = false;
        this.repris = false;
        this.retourRecap = false;
        this.donnees = {
            photo: null, type_obstruction: null, severite: 3,
            lat: null, lng: null, adresse: '', commune: '', quartier: '', description: ''
        };
    }

    ouvrir() {
        this.reinitialiser();
        const brouillon = this.lireBrouillon();
        if (brouillon) {
            this.rendre_reprise(brouillon);
        } else {
            this.pied.hidden = false;
            this.aller(0);
        }
        this.feuille.ouvrir();
    }

    valide(index = this.index) {
        const d = this.donnees;
        const etapes = [!!d.photo, !!d.type_obstruction, d.severite >= 1 && d.severite <= 5, d.lat != null];
        return index === INDEX_RECAP ? etapes.every(Boolean) : etapes[index];
    }

    aller(index, retour = false) {
        if (index < 0 || index >= ETAPES.length) return;
        this.index = index;
        const etape = ETAPES[index];
        const recap = index === INDEX_RECAP;
        if (recap) this.retourRecap = false;
        this.titre.textContent = etape.titre;
        this.libelleEtape.textContent = `Étape ${index + 1} sur ${ETAPES.length}`;
        this.progression.innerHTML = ETAPES.map((_, i) => `<span class="pas${i < index ? ' fait' : ''}${i === index ? ' actif' : ''}"></span>`).join('');

        // Step 1 offers a way out instead of an invisible "back" button
        const premiere = index === 0 && !this.retourRecap;
        this.btnPrecedent.style.visibility = 'visible';
        this.btnPrecedent.toggleAttribute('data-fermer', premiere);
        this.btnPrecedent.classList.toggle('btn-icon', recap);
        this.btnPrecedent.innerHTML = premiere
            ? 'Annuler'
            : recap
                ? '<i class="bi bi-arrow-left" aria-hidden="true"></i>'
                : this.retourRecap
                    ? '<i class="bi bi-arrow-left" aria-hidden="true"></i>Récapitulatif'
                    : '<i class="bi bi-arrow-left" aria-hidden="true"></i>Précédent';
        if (recap) this.btnPrecedent.setAttribute('aria-label', 'Étape précédente');
        else this.btnPrecedent.removeAttribute('aria-label');

        this.btnSuivant.innerHTML = recap
            ? '<i class="bi bi-send" aria-hidden="true"></i>Envoyer le signalement'
            : this.retourRecap
                ? '<i class="bi bi-check-lg" aria-hidden="true"></i>Valider'
                : 'Suivant<i class="bi bi-arrow-right" aria-hidden="true"></i>';
        this.btnSuivant.style.flex = recap ? '1' : '';

        this[`rendre_${etape.cle}`](retour);
        this.majBouton();
        annoncer(`Étape ${index + 1} sur ${ETAPES.length} : ${etape.titre}`);
    }

    // The button stays focusable when a step is incomplete, so a tap can explain what is missing
    majBouton() {
        const ok = this.valide();
        this.btnSuivant.disabled = this.envoi;
        this.btnSuivant.setAttribute('aria-disabled', String(!ok));
        if (ok) this.afficherManque('');
        this.sauverBrouillon();
    }

    afficherManque(message) {
        const zone = this.corps.querySelector('.erreur-etape');
        if (!zone) return;
        zone.innerHTML = message ? `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${echapper(message)}` : '';
    }

    suivant() {
        if (this.envoi) return;
        if (!this.valide()) {
            this.afficherManque(ETAPES[this.index].manque);
            return;
        }
        if (this.index === INDEX_RECAP) {
            this.envoyer();
            return;
        }
        this.aller(this.retourRecap ? INDEX_RECAP : this.index + 1);
    }

    conteneurEtape(html, retour) {
        this.corps.innerHTML = `<div class="etape-assistant${retour ? ' retour' : ''}">${html}<p class="form-error erreur-etape" role="alert"></p></div>`;
        this.corps.scrollTop = 0;
        return this.corps.firstElementChild;
    }

    // ============ Brouillon ============
    sauverBrouillon() {
        if (this.envoi || this.termine || this.enReprise) return;
        const d = this.donnees;
        if (!d.type_obstruction && d.lat == null && !d.description.trim()) return;
        const brouillon = { userId: utilisateurCourant()?.id || null, maj: Date.now() };
        for (const champ of CHAMPS_BROUILLON) brouillon[champ] = d[champ];
        ecrireStockage(CLE_BROUILLON, brouillon);
    }

    lireBrouillon() {
        const b = lireStockage(CLE_BROUILLON, null);
        if (!b || typeof b !== 'object') return null;
        const perime = !Number.isFinite(b.maj) || Date.now() - b.maj > DUREE_BROUILLON;
        const autreCompte = b.userId && b.userId !== utilisateurCourant()?.id;
        if (perime || autreCompte) {
            this.effacerBrouillon();
            return null;
        }
        // Stored data is re-validated: it can be stale or edited by hand
        const nombre = v => (Number.isFinite(v) ? v : null);
        const texte = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
        const propre = {
            maj: b.maj,
            type_obstruction: TYPES_OBSTRUCTION[b.type_obstruction] ? b.type_obstruction : null,
            severite: Number.isInteger(b.severite) && b.severite >= 1 && b.severite <= 5 ? b.severite : 3,
            lat: nombre(b.lat),
            lng: nombre(b.lng),
            adresse: texte(b.adresse, 300),
            commune: texte(b.commune, 120),
            quartier: texte(b.quartier, 120),
            description: texte(b.description, 500)
        };
        if (propre.lat == null || propre.lng == null) {
            Object.assign(propre, { lat: null, lng: null, adresse: '', commune: '', quartier: '' });
        }
        if (!propre.type_obstruction && propre.lat == null && !propre.description.trim()) return null;
        return propre;
    }

    effacerBrouillon() {
        try { localStorage.removeItem(CLE_BROUILLON); } catch { /* stockage indisponible */ }
    }

    rendre_reprise(b) {
        this.enReprise = true;
        this.titre.textContent = 'Reprendre votre signalement ?';
        this.libelleEtape.textContent = `Brouillon enregistré ${formatRelatif(new Date(b.maj).toISOString())}`;
        this.progression.innerHTML = '';
        this.pied.hidden = true;
        const type = TYPES_OBSTRUCTION[b.type_obstruction];
        const lieu = b.adresse || (b.lat != null ? `${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}` : '');
        const description = b.description.trim();
        const lignes = [
            type && `<li><i class="bi ${type.icone}" aria-hidden="true"></i><span>${echapper(type.libelle)} · sévérité ${b.severite}/5</span></li>`,
            lieu && `<li><i class="bi bi-geo-alt" aria-hidden="true"></i><span>${echapper(lieu)}</span></li>`,
            description && `<li><i class="bi bi-chat-left-text" aria-hidden="true"></i><span>${echapper(description.length > 90 ? description.slice(0, 90) + '…' : description)}</span></li>`
        ].filter(Boolean).join('');
        this.corps.innerHTML = `
            <div class="etape-assistant reprise-brouillon">
                <p class="consigne">Vous aviez commencé un signalement. Reprenez-le là où vous l'aviez laissé : seule la photo est à refaire.</p>
                <ul class="resume-brouillon" role="list">${lignes}</ul>
                <div class="pile-sm">
                    <button type="button" class="btn btn-plein btn-block" data-reprendre><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Reprendre le brouillon</button>
                    <button type="button" class="btn btn-secondary btn-block" data-recommencer><i class="bi bi-plus-lg" aria-hidden="true"></i>Recommencer</button>
                </div>
            </div>`;
        const demarrer = () => {
            this.enReprise = false;
            this.pied.hidden = false;
            this.aller(0);
        };
        this.corps.querySelector('[data-reprendre]').addEventListener('click', () => {
            for (const champ of CHAMPS_BROUILLON) this.donnees[champ] = b[champ];
            this.repris = true;
            demarrer();
            annoncer('Brouillon repris. Ajoutez une photo pour continuer.');
        });
        this.corps.querySelector('[data-recommencer]').addEventListener('click', () => {
            this.effacerBrouillon();
            demarrer();
        });
        annoncer('Un brouillon de signalement est disponible.');
        setTimeout(() => this.corps.querySelector('[data-reprendre]')?.focus(), 50);
    }

    // ============ Etape 1 : photo ============
    rendre_photo(retour) {
        const avecPhoto = !!this.apercuUrl;
        const el = this.conteneurEtape(`
            <p class="consigne">Photographiez l'obstruction en entier, avec le canal ou le caniveau visible.</p>
            ${this.repris && !avecPhoto ? '<p class="note-brouillon"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Brouillon repris : vos autres réponses sont conservées, seule la photo est à refaire.</p>' : ''}
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
            this.sauverBrouillon();
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
            this.sauverBrouillon();
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

    // ============ Etape 5 : recapitulatif ============
    rendre_recap(retour) {
        const d = this.donnees;
        const type = TYPES_OBSTRUCTION[d.type_obstruction];
        const sev = SEVERITES[d.severite];
        const lieu = d.adresse || (d.lat != null ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}` : '');
        const description = d.description.trim();
        const ligne = ({ index, visuel, titre, valeur, manquant }) => `
            <li class="ligne-recap${manquant ? ' manquant' : ''}">
                ${visuel}
                <span class="contenu-recap">
                    <span class="titre-recap">${titre}</span>
                    <span class="valeur-recap">${valeur}</span>
                </span>
                <button type="button" class="btn btn-sm btn-ghost" data-modifier="${index}" aria-label="Modifier : ${titre}">Modifier</button>
            </li>`;
        const icone = nom => `<span class="icone-recap"><i class="bi ${nom}" aria-hidden="true"></i></span>`;
        const el = this.conteneurEtape(`
            <p class="consigne">Relisez votre signalement avant de l'envoyer. Touchez « Modifier » pour corriger une ligne.</p>
            <ul class="liste-recap" role="list">
                ${ligne({
                    index: 0, titre: 'Photo', manquant: !this.apercuUrl,
                    visuel: this.apercuUrl ? `<span class="vignette-recap"><img src="${this.apercuUrl}" alt="Photo jointe au signalement"></span>` : icone('bi-camera'),
                    valeur: this.apercuUrl ? 'Photo jointe' : 'Aucune photo'
                })}
                ${ligne({
                    index: 1, titre: "Type d'obstruction", manquant: !type,
                    visuel: icone(type?.icone || 'bi-question-circle'),
                    valeur: type ? echapper(type.libelle) : 'Non choisi'
                })}
                ${ligne({
                    index: 2, titre: 'Sévérité', manquant: !sev,
                    visuel: `<span class="icone-recap niveau-recap" style="--couleur:${sev?.couleur || 'var(--color-muted)'}">${d.severite}</span>`,
                    valeur: sev ? `${d.severite} sur 5 · ${echapper(sev.libelle)}` : 'Non indiquée'
                })}
                ${ligne({
                    index: 3, titre: 'Lieu', manquant: d.lat == null,
                    visuel: icone('bi-geo-alt'),
                    valeur: lieu ? echapper(lieu) : 'Repère non placé'
                })}
                ${ligne({
                    index: 3, titre: 'Précisions',
                    visuel: icone('bi-chat-left-text'),
                    valeur: description ? echapper(description) : '<span class="texte-muet">Aucune précision</span>'
                })}
            </ul>
            <p class="form-helper"><i class="bi bi-star" aria-hidden="true"></i> Vous gagnerez ${POINTS.signalement} points à l'envoi, puis ${POINTS.signalement_verifie} de plus si la communauté le confirme.</p>`, retour);
        el.addEventListener('click', e => {
            const bouton = e.target.closest('[data-modifier]');
            if (!bouton) return;
            this.retourRecap = true;
            this.aller(Number(bouton.dataset.modifier), true);
        });
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
                this.terminer();
                this.afficherReussite({ horsLigne: true });
                return;
            }
            const profilAvant = profilCourant();
            const s = await creerSignalement(donnees, utilisateur.id);
            this.terminer();
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

    terminer() {
        this.termine = true;
        this.effacerBrouillon();
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
