// Utilitaires Debrisat
window.debrisat.utils = {
    $(selecteur, racine = document) {
        return racine.querySelector(selecteur);
    },

    $$(selecteur, racine = document) {
        return Array.from(racine.querySelectorAll(selecteur));
    },

    echapper(texte) {
        return String(texte ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // --- Geolocalisation ---
    async obtenirPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('La géolocalisation n\'est pas prise en charge par ce navigateur.'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                err => reject(new Error(err.code === 1
                    ? 'Autorisez l\'accès à votre position dans les réglages du navigateur.'
                    : 'Position introuvable. Réessayez à l\'extérieur.')),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
        });
    },

    async geocodageInverse(lat, lng) {
        try {
            const reponse = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr&zoom=17`
            );
            if (!reponse.ok) throw new Error('Nominatim indisponible');
            const data = await reponse.json();
            const a = data.address || {};
            const rue = [a.road, a.neighbourhood || a.suburb].filter(Boolean).join(', ');
            return {
                adresse: rue || data.display_name || '',
                quartier: a.suburb || a.neighbourhood || a.quarter || '',
                commune: a.city_district || a.town || a.village || a.city || ''
            };
        } catch (e) {
            return { adresse: '', quartier: '', commune: '' };
        }
    },

    // PostGIS renvoie la geographie en EWKB hexadecimal via PostgREST et Realtime
    extraireCoordonnees(s) {
        if (typeof s.lat === 'number' && typeof s.lng === 'number') return { lat: s.lat, lng: s.lng };
        const loc = s.localisation;
        if (!loc) return null;
        if (typeof loc === 'object' && Array.isArray(loc.coordinates)) {
            return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        }
        if (typeof loc === 'string') {
            const wkt = loc.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
            if (wkt) return { lat: parseFloat(wkt[2]), lng: parseFloat(wkt[1]) };
            if (/^[0-9a-f]+$/i.test(loc) && loc.length >= 42) return this.lireEwkbPoint(loc);
        }
        return null;
    },

    lireEwkbPoint(hex) {
        const octets = new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
        const vue = new DataView(octets.buffer);
        const petitBoutiste = octets[0] === 1;
        const type = vue.getUint32(1, petitBoutiste);
        const decalage = (type & 0x20000000) ? 9 : 5;
        const lng = vue.getFloat64(decalage, petitBoutiste);
        const lat = vue.getFloat64(decalage + 8, petitBoutiste);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    },

    distance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    // --- Formatage ---
    formatDate(dateStr) {
        const date = new Date(dateStr);
        const diff = Date.now() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const heures = Math.floor(diff / 3600000);
        const jours = Math.floor(diff / 86400000);

        if (minutes < 1) return 'à l\'instant';
        if (minutes < 60) return `il y a ${minutes} min`;
        if (heures < 24) return `il y a ${heures} h`;
        if (jours === 1) return 'hier';
        if (jours < 7) return `il y a ${jours} j`;
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    formatDateComplete(dateStr) {
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    },

    formatDateCourte(dateStr) {
        return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    },

    formatNombre(n) {
        return new Intl.NumberFormat('fr-FR').format(n);
    },

    idCourt(id) {
        return '#' + String(id).replace(/-/g, '').slice(-6).toUpperCase();
    },

    // --- Fragments HTML partages ---
    infoType(type) {
        return window.debrisat.TYPES_OBSTRUCTION[type] || { label: type || 'Inconnu', icone: 'bi-question-circle' };
    },

    infoStatut(statut) {
        return window.debrisat.STATUTS[statut] || { label: statut, classe: 'badge-neutral', icone: 'bi-circle' };
    },

    couleurSeverite(n) {
        return `var(--severity-${Math.min(5, Math.max(1, n || 1))})`;
    },

    htmlSeverite(n) {
        const niveau = Math.min(5, Math.max(1, n || 1));
        const label = window.debrisat.SEVERITES[niveau].label;
        const points = [1, 2, 3, 4, 5].map(i => `<span class="severity-dot${i <= niveau ? ' filled' : ''}"></span>`).join('');
        return `<span class="severity-dots" data-niveau="${niveau}" role="img" aria-label="Sévérité ${niveau} sur 5, ${label}" title="Sévérité ${niveau}/5 — ${label}">${points}</span>`;
    },

    htmlStatut(statut) {
        const info = this.infoStatut(statut);
        return `<span class="badge ${info.classe}"><i class="bi ${info.icone}" aria-hidden="true"></i>${info.label}</span>`;
    },

    htmlVisuel(s, classe = '') {
        const type = this.infoType(s.type_obstruction);
        const style = `--sev:${this.couleurSeverite(s.severite)}`;
        if (s.photo_url) {
            return `<div class="visuel ${classe}" style="${style}"><img src="${this.echapper(s.photo_url)}" alt="Photo : ${this.echapper(type.label)}, ${this.echapper(s.adresse || s.commune || '')}" loading="lazy"></div>`;
        }
        return `<div class="visuel ${classe}" style="${style}" role="img" aria-label="${this.echapper(type.label)}, sans photo"><i class="bi ${type.icone}" aria-hidden="true"></i></div>`;
    },

    htmlSquelettes(nombre = 4) {
        return Array.from({ length: nombre }, () => `
            <div class="card-signalement" aria-hidden="true">
                <div class="skeleton" style="width:72px;height:72px;border-radius:12px"></div>
                <div>
                    <div class="skeleton skeleton-text" style="--largeur:60%"></div>
                    <div class="skeleton skeleton-text" style="--largeur:90%"></div>
                    <div class="skeleton skeleton-text" style="--largeur:40%;margin:0"></div>
                </div>
            </div>`).join('');
    },

    // --- Boutons en chargement ---
    boutonChargement(btn, actif, texteChargement = 'Chargement…') {
        if (!btn) return;
        if (actif) {
            btn.dataset.contenuOrigine = btn.innerHTML;
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.setAttribute('aria-busy', 'true');
            btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${texteChargement}</span>`;
        } else {
            btn.disabled = false;
            btn.classList.remove('btn-loading');
            btn.removeAttribute('aria-busy');
            if (btn.dataset.contenuOrigine) btn.innerHTML = btn.dataset.contenuOrigine;
        }
    },

    // --- Stockage local tolerant ---
    lireLocal(cle, defaut = null) {
        try {
            const valeur = localStorage.getItem(cle);
            return valeur ? JSON.parse(valeur) : defaut;
        } catch (e) {
            return defaut;
        }
    },

    ecrireLocal(cle, valeur) {
        try {
            localStorage.setItem(cle, JSON.stringify(valeur));
        } catch (e) { /* quota ou navigation privee */ }
    },

    async uploaderPhoto(fichier) {
        const extension = (fichier.name.split('.').pop() || 'jpg').toLowerCase();
        const chemin = `signalements/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
        const { error } = await window.debrisat.supabase.storage.from('photos').upload(chemin, fichier, {
            contentType: fichier.type
        });
        if (error) throw new Error('Échec de l\'envoi de la photo : ' + error.message);
        const { data } = window.debrisat.supabase.storage.from('photos').getPublicUrl(chemin);
        return data.publicUrl;
    },

    debounce(fn, delai = 300) {
        let minuteur;
        return (...args) => {
            clearTimeout(minuteur);
            minuteur = setTimeout(() => fn(...args), delai);
        };
    },

    toast(message, type = 'info', duree) {
        window.debrisat.notifications?.toast(message, type, duree);
    },

    animerPoints(points) {
        const el = document.createElement('div');
        el.className = 'points-flottants';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = `<i class="bi bi-star" aria-hidden="true"></i>+${points} points`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1700);
    }
};

// --- Modales : ouverture, piege de focus, Echap ---
window.debrisat.modale = {
    pile: [],

    ouvrir(id, declencheur) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        this.pile.push({ overlay, declencheur: declencheur || document.activeElement });
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            const cible = overlay.querySelector('[autofocus]') || this.focusables(overlay)[0];
            cible?.focus({ preventScroll: true });
        });
        overlay.dispatchEvent(new CustomEvent('modale:ouverte'));
    },

    fermer(id) {
        const index = id
            ? this.pile.findIndex(m => m.overlay.id === id)
            : this.pile.length - 1;
        if (index < 0) return;
        const [{ overlay, declencheur }] = this.pile.splice(index, 1);
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        if (!this.pile.length) document.body.style.overflow = '';
        overlay.dispatchEvent(new CustomEvent('modale:fermee'));
        declencheur?.focus?.({ preventScroll: true });
    },

    focusables(racine) {
        return Array.from(racine.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(el => el.offsetParent !== null);
    }
};

document.addEventListener('click', (e) => {
    const ouvrir = e.target.closest('[data-action="ouvrir-modale"]');
    if (ouvrir) {
        e.preventDefault();
        window.debrisat.modale.ouvrir(ouvrir.dataset.cible, ouvrir);
        return;
    }
    if (e.target.closest('[data-action="fermer-modale"]')) {
        window.debrisat.modale.fermer();
        return;
    }
    if (e.target.matches('.modal-overlay.active')) {
        window.debrisat.modale.fermer(e.target.id);
    }
});

document.addEventListener('keydown', (e) => {
    const pile = window.debrisat.modale.pile;
    if (!pile.length) return;
    const { overlay } = pile[pile.length - 1];
    if (e.key === 'Escape') {
        e.preventDefault();
        window.debrisat.modale.fermer(overlay.id);
        return;
    }
    if (e.key === 'Tab') {
        const elements = window.debrisat.modale.focusables(overlay);
        if (!elements.length) return;
        const premier = elements[0];
        const dernier = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === premier) {
            e.preventDefault();
            dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
            e.preventDefault();
            premier.focus();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.setAttribute('aria-hidden', 'true'));
    if (window.debrisat.NUMERO_WHATSAPP) {
        document.querySelectorAll('[data-lien-whatsapp]').forEach(lien => {
            lien.href = `https://wa.me/${window.debrisat.NUMERO_WHATSAPP}`;
            lien.hidden = false;
        });
    }
});
