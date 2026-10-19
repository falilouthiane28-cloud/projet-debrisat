// Dashboard autorites Debrisat
window.debrisat.dashboard = {
    page: 1,
    parPage: 20,
    tri: 'created_at',
    triAsc: false,
    recherche: '',
    filtreStatut: '',

    async init() {
        await window.debrisat.auth.init();
        if (!window.debrisat.auth.estAutorite()) {
            window.debrisat.utils.toast('Acces reserve aux autorites', 'error');
        }
        this.chargerStats();
        this.chargerSignalements();
        this.chargerGraphiques();
        this.initCarteAdmin();
        this.initRealtime();
    },

    async chargerStats() {
        try {
            const { count: total } = await window.debrisat.supabase
                .from('signalements').select('*', { count: 'exact', head: true });
            const { count: enAttente } = await window.debrisat.supabase
                .from('signalements').select('*', { count: 'exact', head: true })
                .eq('statut', 'en_attente');
            const { count: enCours } = await window.debrisat.supabase
                .from('signalements').select('*', { count: 'exact', head: true })
                .eq('statut', 'en_cours');
            const { count: resolus } = await window.debrisat.supabase
                .from('signalements').select('*', { count: 'exact', head: true })
                .eq('statut', 'resolu');

            document.getElementById('statTotal').textContent = total || 0;
            document.getElementById('statEnAttente').textContent = enAttente || 0;
            document.getElementById('statEnCours').textContent = enCours || 0;
            document.getElementById('statResolus').textContent = resolus || 0;

            const taux = total > 0 ? Math.round((resolus / total) * 100) : 0;
            document.getElementById('statTaux').textContent = taux + '%';
        } catch(e) {}
    },

    async chargerSignalements() {
        try {
            let query = window.debrisat.supabase
                .from('signalements')
                .select('*, profils!signalements_user_id_fkey(nom_complet)', { count: 'exact' })
                .order(this.tri, { ascending: this.triAsc })
                .range((this.page - 1) * this.parPage, this.page * this.parPage - 1);

            if (this.filtreStatut) query = query.eq('statut', this.filtreStatut);
            if (this.recherche) query = query.or(`adresse.ilike.%${this.recherche}%,commune.ilike.%${this.recherche}%,description.ilike.%${this.recherche}%`);

            const { data, count } = await query;
            this.afficherTableau(data || [], count || 0);
        } catch(e) {}
    },

    afficherTableau(signalements, total) {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;

        tbody.innerHTML = signalements.map(s => {
            const type = window.debrisat.TYPES_OBSTRUCTION[s.type_obstruction] || {};
            const statut = window.debrisat.STATUTS[s.statut] || {};
            return `
                <tr>
                    <td>${s.photo_url ? `<img src="${s.photo_url}" class="table-img" alt="" loading="lazy">` : '-'}</td>
                    <td>${type.icone || ''} ${type.label || s.type_obstruction}</td>
                    <td>${s.commune || '-'}</td>
                    <td>
                        <div class="severity-bar">
                            ${[1,2,3,4,5].map(i => `<div class="severity-dot ${i <= s.severite ? `active-${s.severite}` : ''}"></div>`).join('')}
                        </div>
                    </td>
                    <td><span class="badge ${statut.classe}">${statut.label}</span></td>
                    <td>${s.nombre_confirmations || 0}</td>
                    <td>${window.debrisat.utils.formatDate(s.created_at)}</td>
                    <td>${s.profils?.nom_complet || '-'}</td>
                    <td>
                        <select class="form-select" style="font-size:0.75rem;padding:4px 8px;width:auto"
                                onchange="changerStatut('${s.id}', this.value)">
                            ${Object.entries(window.debrisat.STATUTS).map(([k, v]) =>
                                `<option value="${k}" ${k === s.statut ? 'selected' : ''}>${v.label}</option>`
                            ).join('')}
                        </select>
                    </td>
                </tr>
            `;
        }).join('');

        const totalPages = Math.ceil(total / this.parPage);
        document.getElementById('paginationInfo').textContent =
            `${(this.page - 1) * this.parPage + 1}-${Math.min(this.page * this.parPage, total)} sur ${total}`;
        document.getElementById('btnPagePrec').disabled = this.page <= 1;
        document.getElementById('btnPageSuiv').disabled = this.page >= totalPages;
    },

    async chargerGraphiques() {
        try {
            const { data: signalements } = await window.debrisat.supabase
                .from('signalements')
                .select('type_obstruction, commune, statut, created_at, severite');

            if (!signalements) return;

            // Par type (donut)
            const parType = {};
            signalements.forEach(s => {
                const label = window.debrisat.TYPES_OBSTRUCTION[s.type_obstruction]?.label || s.type_obstruction;
                parType[label] = (parType[label] || 0) + 1;
            });
            new Chart(document.getElementById('chartType'), {
                type: 'doughnut',
                data: {
                    labels: Object.keys(parType),
                    datasets: [{ data: Object.values(parType),
                        backgroundColor: ['#1B4D3E','#2196F3','#FF6B35','#4CAF50','#E53935','#FFC107','#9C27B0','#00BCD4','#795548']
                    }]
                },
                options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
            });

            // Par commune (bar)
            const parCommune = {};
            signalements.forEach(s => {
                if (s.commune) parCommune[s.commune] = (parCommune[s.commune] || 0) + 1;
            });
            const communesTri = Object.entries(parCommune).sort((a, b) => b[1] - a[1]).slice(0, 10);
            new Chart(document.getElementById('chartCommune'), {
                type: 'bar',
                data: {
                    labels: communesTri.map(c => c[0]),
                    datasets: [{ label: 'Signalements', data: communesTri.map(c => c[1]),
                        backgroundColor: '#1B4D3E' }]
                },
                options: { responsive: true, plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } } }
            });

            // Evolution (line) — 30 derniers jours
            const jours = {};
            const maintenant = new Date();
            for (let i = 29; i >= 0; i--) {
                const d = new Date(maintenant);
                d.setDate(d.getDate() - i);
                jours[d.toISOString().split('T')[0]] = 0;
            }
            signalements.forEach(s => {
                const jour = s.created_at.split('T')[0];
                if (jours[jour] !== undefined) jours[jour]++;
            });
            new Chart(document.getElementById('chartEvolution'), {
                type: 'line',
                data: {
                    labels: Object.keys(jours).map(d => {
                        const [, m, j] = d.split('-');
                        return `${j}/${m}`;
                    }),
                    datasets: [{ label: 'Signalements/jour', data: Object.values(jours),
                        borderColor: '#2196F3', backgroundColor: 'rgba(33,150,243,0.1)',
                        fill: true, tension: 0.3 }]
                },
                options: { responsive: true, plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } } }
            });

        } catch(e) { console.error('Erreur graphiques:', e); }
    },

    initCarteAdmin() {
        const mapEl = document.getElementById('dashMap');
        if (!mapEl) return;
        this.carte = L.map('dashMap').setView([14.6928, -17.4467], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(this.carte);

        this.chargerMarqueursAdmin();
    },

    async chargerMarqueursAdmin() {
        try {
            const { data } = await window.debrisat.supabase
                .from('signalements')
                .select('*')
                .neq('statut', 'rejete');
            if (!data) return;
            data.forEach(s => {
                let lat, lng;
                if (typeof s.localisation === 'string') {
                    const m = s.localisation.match(/POINT\(([^ ]+) ([^)]+)\)/);
                    if (m) { lng = parseFloat(m[1]); lat = parseFloat(m[2]); }
                } else if (s.localisation?.coordinates) {
                    [lng, lat] = s.localisation.coordinates;
                }
                if (!lat || !lng) return;

                const couleur = window.debrisat.utils.couleurSeverite(s.severite);
                L.circleMarker([lat, lng], {
                    radius: 8, fillColor: couleur, fillOpacity: 0.8,
                    color: '#fff', weight: 2
                }).addTo(this.carte).bindPopup(
                    `<b>${window.debrisat.TYPES_OBSTRUCTION[s.type_obstruction]?.label || s.type_obstruction}</b><br>
                     Severite: ${s.severite}/5<br>Statut: ${s.statut}`
                );
            });
        } catch(e) {}
    },

    initRealtime() {
        window.debrisat.supabase
            .channel('dashboard-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'signalements' }, () => {
                this.chargerStats();
                this.chargerSignalements();
            })
            .subscribe();
    },

    pagePrecedente() { if (this.page > 1) { this.page--; this.chargerSignalements(); } },
    pageSuivante() { this.page++; this.chargerSignalements(); },

    rechercher(terme) {
        this.recherche = terme;
        this.page = 1;
        this.chargerSignalements();
    },

    filtrerParStatut(statut) {
        this.filtreStatut = statut;
        this.page = 1;
        this.chargerSignalements();
    },

    async exporterCSV() {
        try {
            const { data } = await window.debrisat.supabase
                .from('signalements')
                .select('*')
                .order('created_at', { ascending: false });

            if (!data) return;

            const entetes = ['ID', 'Type', 'Commune', 'Severite', 'Statut', 'Date', 'Adresse', 'Description'];
            const lignes = data.map(s => [
                s.id, s.type_obstruction, s.commune || '', s.severite,
                s.statut, s.created_at, s.adresse || '', (s.description || '').replace(/"/g, '""')
            ]);

            let csv = entetes.join(',') + '\n';
            lignes.forEach(l => { csv += l.map(v => `"${v}"`).join(',') + '\n'; });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `debrisat-export-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            window.debrisat.utils.toast('Export CSV telecharge', 'success');
        } catch(e) {
            window.debrisat.utils.toast('Erreur export: ' + e.message, 'error');
        }
    }
};

async function changerStatut(id, statut) {
    try {
        const updates = { statut, updated_at: new Date().toISOString() };
        if (statut === 'resolu') updates.resolu_at = new Date().toISOString();

        await window.debrisat.supabase
            .from('signalements')
            .update(updates)
            .eq('id', id);

        if (statut === 'resolu') {
            const { data: sig } = await window.debrisat.supabase
                .from('signalements')
                .select('user_id')
                .eq('id', id)
                .single();
            if (sig) {
                await window.debrisat.gamification.ajouterPoints(
                    window.debrisat.POINTS.signalement_resolu, 'signalement_resolu', id
                );
            }
        }

        window.debrisat.utils.toast('Statut mis a jour', 'success');
    } catch(e) {
        window.debrisat.utils.toast('Erreur: ' + e.message, 'error');
    }
}
