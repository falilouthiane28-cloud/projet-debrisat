// Utilitaires Debrisat

window.debrisat.utils = {
    // Geolocalisation
    async obtenirPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalisation non supportee'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                err => reject(err),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    },

    // Geocodage inverse via Nominatim
    async reverseGeocode(lat, lng) {
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`
            );
            const data = await res.json();
            return {
                adresse: data.display_name || '',
                quartier: data.address?.suburb || data.address?.neighbourhood || '',
                commune: data.address?.city_district || data.address?.town || data.address?.city || ''
            };
        } catch (e) {
            return { adresse: '', quartier: '', commune: '' };
        }
    },

    // Formatage date relative
    formatDate(dateStr) {
        const date = new Date(dateStr);
        const maintenant = new Date();
        const diff = maintenant - date;
        const minutes = Math.floor(diff / 60000);
        const heures = Math.floor(diff / 3600000);
        const jours = Math.floor(diff / 86400000);

        if (minutes < 1) return 'A l\'instant';
        if (minutes < 60) return `Il y a ${minutes} min`;
        if (heures < 24) return `Il y a ${heures}h`;
        if (jours < 7) return `Il y a ${jours}j`;
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    // Formater date complete
    formatDateComplete(dateStr) {
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    },

    // Toast notification
    toast(message, type = 'info', duree = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }, duree);
    },

    // Animation points gagnes
    animerPoints(points, x, y) {
        const el = document.createElement('div');
        el.className = 'points-popup';
        el.textContent = `+${points} pts`;
        el.style.left = (x || window.innerWidth / 2) + 'px';
        el.style.top = (y || window.innerHeight / 2) + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    },

    // Couleur par severite
    couleurSeverite(severite) {
        const couleurs = { 1: '#4CAF50', 2: '#8BC34A', 3: '#FFC107', 4: '#FF6B35', 5: '#E53935' };
        return couleurs[severite] || '#6B7280';
    },

    // Icone marqueur custom
    creerIconeMarqueur(severite) {
        const couleur = this.couleurSeverite(severite);
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="background:${couleur};width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -16]
        });
    },

    // Upload photo vers Supabase Storage
    async uploaderPhoto(fichier) {
        const nomFichier = `signalements/${Date.now()}_${fichier.name}`;
        const { data, error } = await window.debrisat.supabase.storage
            .from('photos')
            .upload(nomFichier, fichier);
        if (error) throw error;
        const { data: { publicUrl } } = window.debrisat.supabase.storage
            .from('photos')
            .getPublicUrl(nomFichier);
        return publicUrl;
    },

    // Debounce
    debounce(fn, delai = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delai);
        };
    },

    // Distance entre deux points (km)
    distance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
};
