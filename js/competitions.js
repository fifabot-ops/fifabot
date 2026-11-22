// ============================================
// Chargement des compétitions — FIFABOT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {

  // Vérifier que l'utilisateur est connecté
  const { data: userData } = await window.supabaseClient.auth.getUser();
  if (!userData.user) {
    window.location.href = 'login.html';
    return;
  }

  const container = document.getElementById('competitions-container');
  let allCompetitions = [];
  let currentFilter = 'all';

  // ----- Charger les compétitions depuis Supabase -----
  async function loadCompetitions() {
    const { data, error } = await window.supabaseClient
      .from('competitions')
      .select(`
        id,
        name,
        mode,
        format,
        description,
        is_active,
        games (
          name,
          version
        )
      `)
      .eq('is_active', true);

    if (error) {
      container.innerHTML = '<p style="color:#ff6b6b;">❌ Erreur de chargement : ' + error.message + '</p>';
      return;
    }

    allCompetitions = data || [];
    render();
  }

  // ----- Afficher les compétitions -----
  function render() {
    let filtered = allCompetitions;

    if (currentFilter !== 'all') {
      filtered = allCompetitions.filter(c => {
        if (!c.games) return false;
        const key = c.games.name + '-' + c.games.version;
        return key === currentFilter;
      });
    }

    if (filtered.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary);">Aucune compétition pour ce filtre.</p>';
      return;
    }

    container.innerHTML = filtered.map(c => {
      const game = c.games || { name: '?', version: '?' };
      return `
        <div class="competition-card">
          <div class="competition-badge">${game.name} ${game.version}</div>
          <h3 class="competition-name">${c.name}</h3>
          <p class="competition-meta">${c.mode} • ${c.format || '—'}</p>
          <p class="competition-desc">${c.description || ''}</p>
          <a href="analyzer.html?competition=${c.id}" class="btn btn-primary" style="margin-top:12px; display:block; text-align:center; text-decoration:none;">Analyser</a>
        </div>
      `;
    }).join('');
  }

  // ----- Boutons de filtre -----
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-game');
      render();
    });
  });

  // Activer "Tous" par défaut
  document.querySelector('.filter-btn[data-game="all"]').classList.add('active');

  // Lancer le chargement
  await loadCompetitions();
});
