// Assistant de creation de signalement en 4 etapes
window.debrisat.signalement = {
    ETAPES: ['Photo', 'Type', 'Sévérité', 'Localisation'],
    etape: 1,
    donnees: null,
    miniCarte: null,
    epingle: null,
    dernierCree: null,

    init() {
        const u = window.debrisat.utils;
        const D = window.debrisat;

        u.$('#grilleTypes').innerHTML = Object.entries(D.TYPES_OBSTRUCTION).map(([cle, t]) => `
            <button type="button" class="option-type" role="radio" aria-checked="false" data-type="${cle}" tabindex="-1">
                <i class="bi ${t.icone}" aria-hidden="true"></i>${t.label}
            </button>`).join('');

        u.$('#grilleTypes').addEventListener('click', (e) => {
            const option = e.target.closest('.option-type');
            if (option) this.choisirType(option.dataset.type);
        });
        u.$('#grilleTypes').addEventListener('keydown', (e) => this.naviguerTypes(e));

        ['#champPhoto', '#champGalerie'].forEach(sel => {
            u.$(sel).addEventListener('change', (e) => this.lirePhoto(e.target.files[0]));
        });

        const zone = u.$('#zonePhoto');
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('survol'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('survol'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('survol');
            this.lirePhoto(e.dataTransfer.files[0]);
        });
        zone.tabIndex = 0;
        zone.setAttribute('role', 'button');
        zone.setAttribute('aria-label', 'Prendre ou choisir une photo');
        zone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                u.$('#champPhoto').click();
            }
        });

        u.$('#champSeverite').addEventListener('input', (e) => this.majSeverite(parseInt(e.target.value, 10)));

        const modale = u.$('#modaleSignalement');
        modale.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'precedent') this.allerA(this.etape - 1);
            if (action === 'suivant') this.suivant();
            if (action === 'retirer-photo') this.retirerPhoto();
            if (action === 'ma-position') this.detecterPosition(true);
            if (action === 'nouveau-signalement') this.reinitialiser();
            if (action === 'voir-mon-signalement') {
                window.debrisat.modale.fermer('modaleSignalement');
                if (this.dernierCree) window.debrisat.app?.ouvrirSurCarte(this.dernierCree.id);
            }
        });
        modale.addEventListener('modale:fermee', () => {
            if (this.etape === 'succes') this.reinitialiser();
        });
    },

    ouvrir() {
        const D = window.debrisat;
        if (!D.auth.exigerConnexion('app.html#signaler')) return;
        if (!this.donnees || this.etape === 'succes') this.reinitialiser();
        D.modale.ouvrir('modaleSignalement');
        if (this.etape === 4) setTimeout(() => this.miniCarte?.invalidateSize(), 350);
    },

    reinitialiser() {
        const u = window.debrisat.utils;
        this.donnees = { photo: null, apercuPhoto: null, type_obstruction: null, severite: 3, lat: null, lng: null, adresse: '', commune: '', quartier: '', description: '' };
        this.dernierCree = null;
        this.retirerPhoto();
        u.$$('.option-type').forEach(o => { o.setAttribute('aria-checked', 'false'); o.tabIndex = -1; });
        u.$('.option-type').tabIndex = 0;
        u.$('#champSeverite').value = 3;
        this.majSeverite(3);
        u.$('#champDescription').value = '';
        u.$('#adresseSelection').textContent = 'Aucune position sélectionnée';
        if (this.epingle) {
            this.miniCarte.removeLayer(this.epingle);
            this.epingle = null;
        }
        this.allerA(1);
    },

    allerA(n) {
        const u = window.debrisat.utils;
        if (n < 1) return;
        this.etape = n;
        u.$$('#modaleSignalement .etape-assistant').forEach(s => { s.hidden = String(s.dataset.etape) !== String(n); });
        u.$$('#modaleSignalement .form-error').forEach(e => { e.hidden = true; });

        const succes = n === 'succes';
        u.$('.progression').hidden = succes;
        u.$('#piedAssistant').hidden = succes;
        u.$('#piedSucces').hidden = !succes;
        u.$('#etapeTexte').textContent = succes ? 'Terminé' : `Étape ${n} sur 4 — ${this.ETAPES[n - 1]}`;
        if (succes) return;

        u.$$('.progression-point').forEach(p => {
            const i = parseInt(p.dataset.point, 10);
            p.classList.toggle('fait', i < n);
            p.classList.toggle('actif', i === n);
        });

        const prec = u.$('#btnPrecedent');
        prec.style.visibility = n > 1 ? 'visible' : 'hidden';
        const suiv = u.$('#btnSuivant');
        const derniere = n === 4;
        u.$('#piedAssistant').classList.toggle('derniere', derniere);
        suiv.className = derniere ? 'btn btn-plein' : 'btn btn-primary';
        suiv.innerHTML = derniere
            ? '<i class="bi bi-send" aria-hidden="true"></i><span>Envoyer le signalement</span>'
            : `<span>${window.debrisat.i18n?.t('action.suivant', 'Suivant') || 'Suivant'}</span><i class="bi bi-arrow-right" aria-hidden="true"></i>`;

        if (n === 4) this.initMiniCarte();
        const titre = u.$(`#titreEtape${n}`);
        if (titre && window.debrisat.modale.pile.length) {
            titre.tabIndex = -1;
            titre.focus({ preventScroll: true });
        }
    },

    afficherErreur(n, message) {
        const zone = document.getElementById(`erreurEtape${n}`);
        if (!zone) return;
        zone.innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${window.debrisat.utils.echapper(message)}`;
        zone.hidden = false;
    },

    valider() {
        const d = this.donnees;
        if (this.etape === 1 && !d.photo) {
            this.afficherErreur(1, 'Ajoutez une photo de l\'obstruction pour continuer.');
            return false;
        }
        if (this.etape === 2 && !d.type_obstruction) {
            this.afficherErreur(2, 'Sélectionnez le type d\'obstruction.');
            return false;
        }
        if (this.etape === 4 && (d.lat == null || d.lng == null)) {
            this.afficherErreur(4, 'Indiquez la position sur la carte ou utilisez « Détecter ».');
            return false;
        }
        return true;
    },

    suivant() {
        if (!this.valider()) return;
        if (this.etape < 4) this.allerA(this.etape + 1);
        else this.soumettre();
    },

    lirePhoto(fichier) {
        const u = window.debrisat.utils;
        if (!fichier) return;
        if (!fichier.type.startsWith('image/')) {
            this.afficherErreur(1, 'Ce fichier n\'est pas une image.');
            return;
        }
        if (fichier.size > 10 * 1024 * 1024) {
            this.afficherErreur(1, 'Image trop volumineuse (10 Mo maximum).');
            return;
        }
        u.$('#erreurEtape1').hidden = true;
        this.donnees.photo = fichier;
        const lecteur = new FileReader();
        lecteur.onload = () => {
            this.donnees.apercuPhoto = lecteur.result;
            const img = u.$('#apercuPhoto');
            img.src = lecteur.result;
            img.hidden = false;
            u.$('#zonePhoto').classList.add('avec-photo');
            u.$('#btnRetirerPhoto').hidden = false;
            const info = u.$('#analyseIa');
            info.innerHTML = '<i class="bi bi-cpu" aria-hidden="true"></i>Photo prête. Elle sera analysée par IA après l\'envoi pour confirmer le type et la gravité.';
            info.hidden = false;
        };
        lecteur.onerror = () => this.afficherErreur(1, 'Lecture de l\'image impossible. Essayez une autre photo.');
        lecteur.readAsDataURL(fichier);
    },

    retirerPhoto() {
        const u = window.debrisat.utils;
        if (this.donnees) {
            this.donnees.photo = null;
            this.donnees.apercuPhoto = null;
        }
        const img = u.$('#apercuPhoto');
        img.removeAttribute('src');
        img.hidden = true;
        u.$('#zonePhoto').classList.remove('avec-photo');
        u.$('#btnRetirerPhoto').hidden = true;
        u.$('#analyseIa').hidden = true;
        u.$('#champPhoto').value = '';
        u.$('#champGalerie').value = '';
    },

    choisirType(type) {
        this.donnees.type_obstruction = type;
        window.debrisat.utils.$$('.option-type').forEach(o => {
            const choisi = o.dataset.type === type;
            o.setAttribute('aria-checked', String(choisi));
            o.tabIndex = choisi ? 0 : -1;
        });
        document.getElementById('erreurEtape2').hidden = true;
    },

    naviguerTypes(e) {
        const options = window.debrisat.utils.$$('.option-type');
        const index = options.indexOf(document.activeElement);
        if (index < 0) return;
        const deplacements = { ArrowRight: 1, ArrowDown: 3, ArrowLeft: -1, ArrowUp: -3 };
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.choisirType(options[index].dataset.type);
            return;
        }
        if (!(e.key in deplacements)) return;
        e.preventDefault();
        const cible = options[(index + deplacements[e.key] + options.length) % options.length];
        cible.focus();
        this.choisirType(cible.dataset.type);
    },

    majSeverite(niveau) {
        const D = window.debrisat;
        const u = D.utils;
        const info = D.SEVERITES[niveau];
        if (this.donnees) this.donnees.severite = niveau;
        const curseur = u.$('#champSeverite');
        curseur.style.setProperty('--progression', `${((niveau - 1) / 4) * 100}%`);
        curseur.style.setProperty('--couleur-piste', `var(--severity-${niveau})`);
        curseur.setAttribute('aria-valuetext', `${niveau} sur 5, ${info.label}`);
        u.$('#apercuSeverite').style.setProperty('--sev', `var(--severity-${niveau})`);
        u.$('#niveauSeverite').textContent = niveau;
        u.$('#labelSeverite').textContent = info.label;
        u.$('#descriptionSeverite').textContent = info.description;
    },

    initMiniCarte() {
        const D = window.debrisat;
        if (!this.miniCarte) {
            const centre = D.app?.carte?.getCenter() || D.DAKAR_CENTRE;
            this.miniCarte = D.carte.creer('miniCarte', { centre: { lat: centre.lat, lng: centre.lng }, zoom: 14 });
            L.control.zoom({ position: 'bottomright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(this.miniCarte);
            this.miniCarte.on('click', (e) => this.placerEpingle(e.latlng.lat, e.latlng.lng));
        }
        setTimeout(() => this.miniCarte.invalidateSize(), 320);
        if (this.donnees.lat == null) this.detecterPosition(false);
    },

    async detecterPosition(explicite) {
        const D = window.debrisat;
        const bouton = document.querySelector('[data-action="ma-position"]');
        if (explicite) D.utils.boutonChargement(bouton, true, 'Recherche…');
        try {
            const pos = await D.utils.obtenirPosition();
            this.placerEpingle(pos.lat, pos.lng);
            this.miniCarte.setView([pos.lat, pos.lng], 17);
        } catch (e) {
            if (explicite) D.notifications.toast(e.message, 'warning');
            else document.getElementById('adresseSelection').textContent = 'Touchez la carte pour placer l\'épingle.';
        } finally {
            if (explicite) D.utils.boutonChargement(bouton, false);
        }
    },

    async placerEpingle(lat, lng) {
        const D = window.debrisat;
        Object.assign(this.donnees, { lat, lng });
        document.getElementById('erreurEtape4').hidden = true;
        if (!this.epingle) {
            this.epingle = L.marker([lat, lng], { icon: D.carte.iconeEpingle(), draggable: true, autoPan: true, keyboard: true, title: 'Position du signalement' }).addTo(this.miniCarte);
            this.epingle.on('dragend', () => {
                const p = this.epingle.getLatLng();
                this.placerEpingle(p.lat, p.lng);
            });
        } else {
            this.epingle.setLatLng([lat, lng]);
        }
        if (!this.miniCarte.getBounds().contains([lat, lng])) this.miniCarte.setView([lat, lng], Math.max(this.miniCarte.getZoom(), 16));
        const zone = document.getElementById('adresseSelection');
        zone.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)} — recherche de l'adresse…`;
        const geo = await D.utils.geocodageInverse(lat, lng);
        if (this.donnees.lat !== lat) return;
        Object.assign(this.donnees, geo);
        if (!geo.commune) this.donnees.commune = this.communeLaPlusProche(lat, lng);
        zone.textContent = geo.adresse
            ? `${geo.adresse}${geo.commune ? ', ' + geo.commune : ''}`
            : `${lat.toFixed(5)}, ${lng.toFixed(5)} — ${this.donnees.commune}`;
    },

    communeLaPlusProche(lat, lng) {
        const D = window.debrisat;
        const signalements = D.app?.gestionnaire?.signalements() || [];
        let meilleur = null;
        let distanceMin = Infinity;
        signalements.forEach(s => {
            const d = D.utils.distance(lat, lng, s.lat, s.lng);
            if (d < distanceMin) {
                distanceMin = d;
                meilleur = s.commune;
            }
        });
        return distanceMin < 3 ? meilleur : 'Dakar';
    },

    async soumettre() {
        const D = window.debrisat;
        const u = D.utils;
        const bouton = u.$('#btnSuivant');
        this.donnees.description = u.$('#champDescription').value.trim();

        if (!navigator.onLine && !D.modeDemo) {
            await D.fileHorsLigne.ajouter({ ...this.donnees });
            D.modale.fermer('modaleSignalement');
            this.reinitialiser();
            return;
        }

        u.boutonChargement(bouton, true, 'Envoi en cours…');
        try {
            const cree = await D.donnees.creerSignalement(this.donnees);
            this.dernierCree = cree;
            await D.gamification.ajouterPoints(D.POINTS.signalement, 'signalement', cree.id);
            D.app?.ajouterSignalement(cree);
            this.allerA('succes');
            u.animerPoints(D.POINTS.signalement);
            D.iaAnalyse.analyserSignalement(cree);
        } catch (e) {
            D.notifications.erreur(e, 'Envoi du signalement');
        } finally {
            u.boutonChargement(bouton, false);
        }
    }
};
