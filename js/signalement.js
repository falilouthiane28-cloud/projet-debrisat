// Creation de signalements Debrisat
window.debrisat.signalement = {
    etapeCourante: 1,
    totalEtapes: 5,
    donnees: {
        photo: null,
        photoUrl: null,
        type_obstruction: null,
        severite: 3,
        lat: null,
        lng: null,
        adresse: '',
        commune: '',
        quartier: '',
        description: ''
    },
    marqueurPosition: null,

    ouvrir() {
        if (!window.debrisat.auth.estConnecte()) {
            afficherModalAuth('connexion');
            window.debrisat.utils.toast('Connectez-vous pour signaler', 'warning');
            return;
        }
        document.getElementById('signalementModal').closest('.modal-overlay').classList.add('active');
        this.reinitialiser();
        this.afficherEtape(1);
    },

    fermer() {
        document.getElementById('signalementModal').closest('.modal-overlay').classList.remove('active');
        if (this.marqueurPosition) {
            window.debrisat.carte.map.removeLayer(this.marqueurPosition);
            this.marqueurPosition = null;
        }
    },

    reinitialiser() {
        this.etapeCourante = 1;
        this.donnees = {
            photo: null, photoUrl: null, type_obstruction: null,
            severite: 3, lat: null, lng: null,
            adresse: '', commune: '', quartier: '', description: ''
        };
        const preview = document.getElementById('photoPreview');
        if (preview) { preview.innerHTML = ''; preview.closest('.photo-upload').classList.remove('has-photo'); }
        document.querySelectorAll('.type-option').forEach(el => el.classList.remove('selected'));
        const slider = document.getElementById('severiteSlider');
        if (slider) slider.value = 3;
        const desc = document.getElementById('descriptionInput');
        if (desc) desc.value = '';
    },

    afficherEtape(n) {
        this.etapeCourante = n;
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        const step = document.querySelector(`.step-content[data-step="${n}"]`);
        if (step) step.classList.add('active');

        document.querySelectorAll('.step-dot').forEach((dot, i) => {
            dot.classList.remove('active', 'done');
            if (i + 1 < n) dot.classList.add('done');
            if (i + 1 === n) dot.classList.add('active');
        });

        const btnPrec = document.getElementById('btnPrecedent');
        const btnSuiv = document.getElementById('btnSuivant');
        if (btnPrec) btnPrec.style.display = n > 1 ? '' : 'none';
        if (btnSuiv) {
            btnSuiv.textContent = n === this.totalEtapes ? 'Envoyer le signalement' : 'Suivant';
            btnSuiv.className = n === this.totalEtapes ? 'btn btn-accent' : 'btn btn-primary';
        }

        if (n === 4) this.initEtapeLocalisation();
    },

    precedent() {
        if (this.etapeCourante > 1) this.afficherEtape(this.etapeCourante - 1);
    },

    suivant() {
        if (!this.validerEtape()) return;
        if (this.etapeCourante < this.totalEtapes) {
            this.afficherEtape(this.etapeCourante + 1);
        } else {
            this.soumettre();
        }
    },

    validerEtape() {
        switch (this.etapeCourante) {
            case 1:
                if (!this.donnees.photo) {
                    window.debrisat.utils.toast('Veuillez prendre ou selectionner une photo', 'warning');
                    return false;
                }
                return true;
            case 2:
                if (!this.donnees.type_obstruction) {
                    window.debrisat.utils.toast('Veuillez selectionner le type d\'obstruction', 'warning');
                    return false;
                }
                return true;
            case 3: return true;
            case 4:
                if (!this.donnees.lat || !this.donnees.lng) {
                    window.debrisat.utils.toast('Veuillez indiquer la localisation', 'warning');
                    return false;
                }
                return true;
            case 5: return true;
            default: return true;
        }
    },

    gererPhoto(input) {
        const fichier = input.files[0];
        if (!fichier) return;
        if (!fichier.type.startsWith('image/')) {
            window.debrisat.utils.toast('Veuillez selectionner une image', 'error');
            return;
        }
        if (fichier.size > 10 * 1024 * 1024) {
            window.debrisat.utils.toast('Image trop volumineuse (max 10 Mo)', 'error');
            return;
        }
        this.donnees.photo = fichier;
        const preview = document.getElementById('photoPreview');
        const container = preview.closest('.photo-upload');
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" alt="Apercu photo">`;
            container.classList.add('has-photo');
        };
        reader.readAsDataURL(fichier);
    },

    selectionnerType(type) {
        this.donnees.type_obstruction = type;
        document.querySelectorAll('.type-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.type === type);
        });
    },

    mettreAJourSeverite(val) {
        this.donnees.severite = parseInt(val);
        const label = document.getElementById('severiteLabel');
        const labels = ['Mineur', 'Faible', 'Moyen', 'Grave', 'Critique'];
        if (label) label.textContent = `${val}/5 — ${labels[val - 1]}`;
    },

    async initEtapeLocalisation() {
        const mapDiv = document.getElementById('miniMap');
        if (!mapDiv) return;
        if (this.miniMap) { this.miniMap.remove(); }

        this.miniMap = L.map('miniMap').setView(
            [window.debrisat.DAKAR_CENTER.lat, window.debrisat.DAKAR_CENTER.lng], 13
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(this.miniMap);

        try {
            const pos = await window.debrisat.utils.obtenirPosition();
            this.definirPosition(pos.lat, pos.lng);
            this.miniMap.setView([pos.lat, pos.lng], 16);
        } catch(e) {}

        this.miniMap.on('click', (e) => {
            this.definirPosition(e.latlng.lat, e.latlng.lng);
        });

        setTimeout(() => this.miniMap.invalidateSize(), 200);
    },

    async definirPosition(lat, lng) {
        this.donnees.lat = lat;
        this.donnees.lng = lng;

        if (this.marqueurMini) this.miniMap.removeLayer(this.marqueurMini);
        this.marqueurMini = L.marker([lat, lng], { draggable: true }).addTo(this.miniMap);
        this.marqueurMini.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            this.definirPosition(pos.lat, pos.lng);
        });

        const geo = await window.debrisat.utils.reverseGeocode(lat, lng);
        this.donnees.adresse = geo.adresse;
        this.donnees.commune = geo.commune;
        this.donnees.quartier = geo.quartier;

        const adresseEl = document.getElementById('adresseTexte');
        if (adresseEl) adresseEl.textContent = geo.adresse || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    },

    async soumettre() {
        const btn = document.getElementById('btnSuivant');
        btn.disabled = true;
        btn.textContent = 'Envoi en cours...';

        try {
            this.donnees.description = document.getElementById('descriptionInput')?.value || '';

            const photoUrl = await window.debrisat.utils.uploaderPhoto(this.donnees.photo);

            const { data, error } = await window.debrisat.supabase
                .from('signalements')
                .insert({
                    user_id: window.debrisat.auth.utilisateur.id,
                    type_obstruction: this.donnees.type_obstruction,
                    description: this.donnees.description,
                    severite: this.donnees.severite,
                    photo_url: photoUrl,
                    localisation: `POINT(${this.donnees.lng} ${this.donnees.lat})`,
                    adresse: this.donnees.adresse,
                    commune: this.donnees.commune,
                    quartier: this.donnees.quartier,
                    source: 'webapp'
                })
                .select()
                .single();

            if (error) throw error;

            await window.debrisat.gamification.ajouterPoints(
                window.debrisat.POINTS.signalement, 'signalement', data.id
            );

            window.debrisat.utils.toast('Signalement envoye avec succes !', 'success');
            window.debrisat.utils.animerPoints(window.debrisat.POINTS.signalement);

            this.fermer();
            window.debrisat.carte.ajouterMarqueur(data);

        } catch(e) {
            window.debrisat.utils.toast('Erreur lors de l\'envoi: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Envoyer le signalement';
        }
    }
};

// Fonctions globales pour les popups
async function confirmerSignalement(id) {
    if (!window.debrisat.auth.estConnecte()) {
        afficherModalAuth('connexion');
        return;
    }
    try {
        const { error } = await window.debrisat.supabase
            .from('verifications')
            .insert({
                signalement_id: id,
                user_id: window.debrisat.auth.utilisateur.id,
                confirme: true
            });
        if (error) {
            if (error.code === '23505') {
                window.debrisat.utils.toast('Vous avez deja verifie ce signalement', 'warning');
            } else throw error;
            return;
        }

        await window.debrisat.supabase.rpc('incrementer_confirmations', { sig_id: id });
        await window.debrisat.gamification.ajouterPoints(
            window.debrisat.POINTS.verification, 'verification', id
        );
        window.debrisat.utils.toast('Confirmation enregistree ! +3 pts', 'success');
        window.debrisat.utils.animerPoints(3);
    } catch(e) {
        window.debrisat.utils.toast('Erreur: ' + e.message, 'error');
    }
}

function voirDetails(id) {
    const m = window.debrisat.carte.marqueurs[id];
    if (m) {
        window.debrisat.carte.map.setView([m.lat, m.lng], 17);
        m.marqueur.openPopup();
    }
}
