// Authentification Debrisat
window.debrisat.auth = {
    utilisateur: null,
    profil: null,

    async init() {
        const { data: { session } } = await window.debrisat.supabase.auth.getSession();
        if (session) {
            this.utilisateur = session.user;
            await this.chargerProfil();
        }
        window.debrisat.supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                this.utilisateur = session.user;
                await this.chargerProfil();
            } else {
                this.utilisateur = null;
                this.profil = null;
            }
            this.mettreAJourUI();
        });
        this.mettreAJourUI();
    },

    async chargerProfil() {
        if (!this.utilisateur) return;
        const { data } = await window.debrisat.supabase
            .from('profils')
            .select('*')
            .eq('id', this.utilisateur.id)
            .single();
        this.profil = data;
    },

    async inscription(email, motDePasse, nomComplet, commune, telephone) {
        const { data, error } = await window.debrisat.supabase.auth.signUp({
            email, password: motDePasse
        });
        if (error) throw error;

        if (data.user) {
            const { error: errProfil } = await window.debrisat.supabase
                .from('profils')
                .insert({
                    id: data.user.id,
                    nom_complet: nomComplet,
                    commune: commune,
                    telephone: telephone
                });
            if (errProfil) throw errProfil;
        }
        return data;
    },

    async connexion(email, motDePasse) {
        const { data, error } = await window.debrisat.supabase.auth.signInWithPassword({
            email, password: motDePasse
        });
        if (error) throw error;
        return data;
    },

    async deconnexion() {
        await window.debrisat.supabase.auth.signOut();
        this.utilisateur = null;
        this.profil = null;
        this.mettreAJourUI();
    },

    estConnecte() {
        return !!this.utilisateur;
    },

    estAutorite() {
        return this.profil && ['agent_municipal', 'autorite', 'admin'].includes(this.profil.role);
    },

    mettreAJourUI() {
        document.querySelectorAll('[data-auth="connecte"]').forEach(el => {
            el.style.display = this.estConnecte() ? '' : 'none';
        });
        document.querySelectorAll('[data-auth="deconnecte"]').forEach(el => {
            el.style.display = this.estConnecte() ? 'none' : '';
        });
        document.querySelectorAll('[data-auth="autorite"]').forEach(el => {
            el.style.display = this.estAutorite() ? '' : 'none';
        });
        const nomEl = document.getElementById('userNom');
        if (nomEl && this.profil) {
            nomEl.textContent = this.profil.nom_complet;
        }
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl && this.profil) {
            avatarEl.textContent = this.profil.nom_complet.charAt(0).toUpperCase();
        }
    }
};

// Modal d'authentification
function afficherModalAuth(mode = 'connexion') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    const overlay = modal.closest('.modal-overlay') || modal.parentElement;
    overlay.classList.add('active');

    const titre = modal.querySelector('.modal-header h3');
    const form = document.getElementById('authForm');
    const champsInscription = document.querySelectorAll('[data-mode="inscription"]');

    if (mode === 'connexion') {
        titre.textContent = 'Connexion';
        champsInscription.forEach(el => el.style.display = 'none');
        form.dataset.mode = 'connexion';
    } else {
        titre.textContent = 'Inscription';
        champsInscription.forEach(el => el.style.display = '');
        form.dataset.mode = 'inscription';
    }
}

function fermerModalAuth() {
    const overlay = document.querySelector('#authModal')?.closest('.modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

async function soumettreAuth(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;
    const email = form.querySelector('[name="email"]').value;
    const mdp = form.querySelector('[name="motdepasse"]').value;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Chargement...';

    try {
        if (mode === 'inscription') {
            const nom = form.querySelector('[name="nom"]').value;
            const commune = form.querySelector('[name="commune"]').value;
            const tel = form.querySelector('[name="telephone"]').value;
            await window.debrisat.auth.inscription(email, mdp, nom, commune, tel);
            window.debrisat.utils.toast('Inscription reussie ! Verifiez votre email.', 'success');
        } else {
            await window.debrisat.auth.connexion(email, mdp);
            window.debrisat.utils.toast('Connexion reussie !', 'success');
        }
        fermerModalAuth();
    } catch (err) {
        window.debrisat.utils.toast(err.message || 'Erreur d\'authentification', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = mode === 'inscription' ? 'S\'inscrire' : 'Se connecter';
    }
}
