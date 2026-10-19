// Authentification Debrisat (Supabase Auth, ou session simulee en mode demo)
window.debrisat.auth = {
    utilisateur: null,
    profil: null,

    async init() {
        const D = window.debrisat;
        if (D.modeDemo) {
            const etat = D.donnees.demo.etat();
            if (!etat.deconnecte) {
                this.profil = D.donnees.demo.profil();
                this.utilisateur = { id: this.profil.id, email: this.profil.email };
            }
            this.majUI();
            return;
        }
        try {
            const { data: { session } } = await D.supabase.auth.getSession();
            if (session) {
                this.utilisateur = session.user;
                await this.chargerProfil();
            }
        } catch (e) {
            D.notifications.erreur(new Error('Session impossible à restaurer. Reconnectez-vous.'));
        }
        D.supabase.auth.onAuthStateChange(async (_evenement, session) => {
            this.utilisateur = session?.user || null;
            if (this.utilisateur) await this.chargerProfil();
            else this.profil = null;
            this.majUI();
        });
        this.majUI();
    },

    async chargerProfil() {
        const D = window.debrisat;
        if (D.modeDemo) {
            this.profil = D.donnees.demo.profil();
            return this.profil;
        }
        if (!this.utilisateur) return null;
        const { data } = await D.supabase.from('profils').select('*').eq('id', this.utilisateur.id).single();
        this.profil = data;
        return data;
    },

    async inscription({ nom, email, motDePasse, commune, telephone }) {
        const D = window.debrisat;
        if (D.modeDemo) {
            const etat = D.donnees.demo.etat();
            etat.profil = { ...(etat.profil || {}), nom_complet: nom, email, commune, telephone, points_total: 0, nombre_signalements: 0, nombre_verifications: 0, badges: [] };
            etat.deconnecte = false;
            D.donnees.demo.sauver(etat);
            await this.init();
            return;
        }
        const { data, error } = await D.supabase.auth.signUp({ email, password: motDePasse });
        if (error) throw new Error(this.traduireErreur(error));
        if (data.user) {
            const { error: errProfil } = await D.supabase.from('profils').insert({
                id: data.user.id, nom_complet: nom, commune, telephone
            });
            if (errProfil) throw new Error('Compte créé, mais le profil n\'a pas pu être enregistré : ' + errProfil.message);
        }
    },

    async connexion(email, motDePasse) {
        const D = window.debrisat;
        if (D.modeDemo) {
            const etat = D.donnees.demo.etat();
            etat.deconnecte = false;
            if (email) etat.profil = { ...(etat.profil || {}), email };
            D.donnees.demo.sauver(etat);
            await this.init();
            return;
        }
        const { error } = await D.supabase.auth.signInWithPassword({ email, password: motDePasse });
        if (error) throw new Error(this.traduireErreur(error));
    },

    async motDePasseOublie(email) {
        const D = window.debrisat;
        if (D.modeDemo) return;
        const { error } = await D.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: new URL('auth.html', location.href).href
        });
        if (error) throw new Error(this.traduireErreur(error));
    },

    async deconnexion() {
        const D = window.debrisat;
        if (D.modeDemo) {
            const etat = D.donnees.demo.etat();
            etat.deconnecte = true;
            D.donnees.demo.sauver(etat);
        } else {
            await D.supabase.auth.signOut();
        }
        this.utilisateur = null;
        this.profil = null;
        this.majUI();
    },

    estConnecte() {
        return !!this.utilisateur;
    },

    estAutorite() {
        if (window.debrisat.modeDemo) return true;
        return !!this.profil && ['agent_municipal', 'autorite', 'admin'].includes(this.profil.role);
    },

    // Redirige vers la page de connexion en conservant la destination
    exigerConnexion(retour = location.pathname.split('/').pop() + location.hash) {
        if (this.estConnecte()) return true;
        location.href = `auth.html?retour=${encodeURIComponent(retour)}`;
        return false;
    },

    traduireErreur(error) {
        const message = error?.message || '';
        if (/invalid login credentials/i.test(message)) return 'Adresse e-mail ou mot de passe incorrect.';
        if (/already registered/i.test(message)) return 'Un compte existe déjà avec cette adresse e-mail.';
        if (/password should be at least/i.test(message)) return 'Le mot de passe doit contenir au moins 6 caractères.';
        if (/email not confirmed/i.test(message)) return 'Confirmez votre adresse e-mail avant de vous connecter.';
        if (/rate limit/i.test(message)) return 'Trop de tentatives. Patientez quelques minutes.';
        return message || 'Erreur d\'authentification.';
    },

    majUI() {
        const connecte = this.estConnecte();
        document.querySelectorAll('[data-auth="connecte"]').forEach(el => { el.hidden = !connecte; });
        document.querySelectorAll('[data-auth="deconnecte"]').forEach(el => { el.hidden = connecte; });
        document.querySelectorAll('[data-auth="autorite"]').forEach(el => { el.hidden = !this.estAutorite(); });
        document.querySelectorAll('[data-si-demo]').forEach(el => { el.hidden = !window.debrisat.modeDemo; });
        const p = this.profil;
        document.querySelectorAll('[data-profil]').forEach(el => {
            const champ = el.dataset.profil;
            if (!p) {
                el.textContent = champ === 'initiale' ? '?' : '—';
                return;
            }
            if (champ === 'initiale') el.textContent = (p.nom_complet || '?').trim().split(/\s+/).map(m => m[0]).slice(0, 2).join('').toUpperCase();
            else if (typeof p[champ] === 'number') el.textContent = window.debrisat.utils.formatNombre(p[champ]);
            else el.textContent = p[champ] || '—';
        });
        window.dispatchEvent(new CustomEvent('debrisat:auth', { detail: { connecte } }));
    }
};

// Page de connexion / inscription
window.debrisat.pageAuth = {
    init() {
        const D = window.debrisat;
        const u = D.utils;
        const parametres = new URLSearchParams(location.search);
        const retour = parametres.get('retour') || 'app.html';
        const onglets = u.$$('[role="tab"]');
        const formulaire = u.$('#formAuth');

        const communes = u.$('#champCommune');
        D.COMMUNES.forEach(c => communes.insertAdjacentHTML('beforeend', `<option value="${u.echapper(c)}">${u.echapper(c)}</option>`));

        const choisirMode = (mode) => {
            formulaire.dataset.mode = mode;
            onglets.forEach(o => {
                const actif = o.dataset.mode === mode;
                o.setAttribute('aria-selected', String(actif));
                o.tabIndex = actif ? 0 : -1;
            });
            u.$$('[data-mode-champ="inscription"]').forEach(el => {
                el.hidden = mode !== 'inscription';
                el.querySelectorAll('input, select').forEach(i => { i.required = mode === 'inscription' && i.dataset.obligatoire === 'oui'; });
            });
            u.$('#titreAuth').textContent = mode === 'inscription' ? 'Créer un compte' : 'Bon retour parmi nous';
            u.$('#sousTitreAuth').textContent = mode === 'inscription'
                ? 'Rejoignez les citoyens qui protègent leur quartier.'
                : 'Connectez-vous pour signaler et gagner des points.';
            u.$('#btnSoumettreAuth span').textContent = mode === 'inscription' ? 'Créer mon compte' : 'Se connecter';
            u.$('#champMotDePasse').autocomplete = mode === 'inscription' ? 'new-password' : 'current-password';
            u.$('#lienOublie').hidden = mode === 'inscription';
            this.effacerErreurs();
        };

        onglets.forEach(o => o.addEventListener('click', () => choisirMode(o.dataset.mode)));
        u.$('.onglets').addEventListener('keydown', (e) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            const suivant = onglets.find(o => o.getAttribute('aria-selected') !== 'true');
            suivant.focus();
            choisirMode(suivant.dataset.mode);
        });

        u.$('#btnVoirMdp').addEventListener('click', (e) => {
            const champ = u.$('#champMotDePasse');
            const visible = champ.type === 'text';
            champ.type = visible ? 'password' : 'text';
            e.currentTarget.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
            e.currentTarget.setAttribute('aria-pressed', String(!visible));
            e.currentTarget.querySelector('.bi').className = `bi ${visible ? 'bi-eye' : 'bi-eye-slash'}`;
        });

        u.$('#lienOublie').addEventListener('click', async () => {
            const email = u.$('#champEmail').value.trim();
            if (!email) {
                this.erreur('champEmail', 'Saisissez votre adresse e-mail pour recevoir le lien.');
                return;
            }
            try {
                await D.auth.motDePasseOublie(email);
                u.toast('Si un compte existe, un lien de réinitialisation vient d\'être envoyé.', 'success');
            } catch (err) {
                D.notifications.erreur(err);
            }
        });

        formulaire.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.valider(formulaire)) return;
            const bouton = u.$('#btnSoumettreAuth');
            const mode = formulaire.dataset.mode;
            u.boutonChargement(bouton, true, mode === 'inscription' ? 'Création…' : 'Connexion…');
            try {
                const email = u.$('#champEmail').value.trim();
                const motDePasse = u.$('#champMotDePasse').value;
                if (mode === 'inscription') {
                    await D.auth.inscription({
                        nom: u.$('#champNom').value.trim(),
                        email,
                        motDePasse,
                        commune: u.$('#champCommune').value,
                        telephone: u.$('#champTelephone').value.trim()
                    });
                    u.toast(D.modeDemo ? 'Compte de démonstration créé.' : 'Compte créé. Vérifiez votre boîte mail pour l\'activer.', 'success');
                } else {
                    await D.auth.connexion(email, motDePasse);
                    u.toast('Connexion réussie.', 'success');
                }
                setTimeout(() => { location.href = retour; }, 600);
            } catch (err) {
                D.notifications.erreur(err);
                u.boutonChargement(bouton, false);
            }
        });

        u.$('#btnDemo')?.addEventListener('click', async () => {
            await D.auth.connexion();
            location.href = retour;
        });

        choisirMode(parametres.get('mode') === 'inscription' ? 'inscription' : 'connexion');
    },

    valider(formulaire) {
        this.effacerErreurs();
        let valide = true;
        const email = formulaire.querySelector('#champEmail');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
            this.erreur('champEmail', 'Adresse e-mail invalide.');
            valide = false;
        }
        const mdp = formulaire.querySelector('#champMotDePasse');
        if (mdp.value.length < 6) {
            this.erreur('champMotDePasse', 'Au moins 6 caractères.');
            valide = false;
        }
        if (formulaire.dataset.mode === 'inscription') {
            const nom = formulaire.querySelector('#champNom');
            if (nom.value.trim().length < 2) {
                this.erreur('champNom', 'Indiquez votre nom complet.');
                valide = false;
            }
            const tel = formulaire.querySelector('#champTelephone');
            if (tel.value.trim() && !/^\+?[\d\s]{9,15}$/.test(tel.value.trim())) {
                this.erreur('champTelephone', 'Format attendu : +221 77 123 45 67');
                valide = false;
            }
        }
        if (!valide) formulaire.querySelector('[aria-invalid="true"]')?.focus();
        return valide;
    },

    erreur(idChamp, message) {
        const champ = document.getElementById(idChamp);
        const zone = document.getElementById(`erreur-${idChamp}`);
        champ?.setAttribute('aria-invalid', 'true');
        if (zone) {
            zone.innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i>${window.debrisat.utils.echapper(message)}`;
            zone.hidden = false;
        }
    },

    effacerErreurs() {
        document.querySelectorAll('#formAuth [aria-invalid]').forEach(c => c.removeAttribute('aria-invalid'));
        document.querySelectorAll('#formAuth .form-error').forEach(z => { z.hidden = true; });
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!document.body.classList.contains('page-auth')) return;
    await window.debrisat.auth.init();
    window.debrisat.pageAuth.init();
});
