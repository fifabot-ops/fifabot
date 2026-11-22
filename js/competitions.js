// ============================================
// Chargement des compétitions — FIFABOT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {

  // 1. Vérifier que l'utilisateur est connecté
  const { data: userData } = await window.supabaseClient.auth.getUser();
  if (!userData.user) {
    window.location.href = 'login.html';
    return;
  }

  const container = document.getElementById('competitions-container');

  // 2. Vérifier le statut Premium de l'utilisateur
  const { data: payments } = await window.supabaseClient
    .from('payment_requests')
    .select('status')
    .eq('user_id', userData.user.id)
    .eq('status', 'approved');

  const isPremium = payments && payments.length > 0;

  // 3. Charger les compétitions
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
      container.innerHTML = '<p style="color:#ff6b6b; padding: 20px; text-align:center;">❌ Erreur de chargement : ' + error.message + '</p>';
      return;
    }

    const allCompetitions = data || [];
    render(allCompetitions);
  }

  // 4. Afficher les compétitions
  function render(competitions) {
    if (competitions.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align:center; grid-column: 1/-1;">Aucune compétition disponible.</p>';
      return;
    }

    container.innerHTML = competitions.map(c => {
      const game = c.games || { name: '?', version: '?' };
      
      return `
        <div class="competition-card" style="cursor: pointer; position: relative;" onclick="handleCompetitionClick('${c.id}')">
          
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="width: 56px; height: 56px; background: rgba(106, 13, 173, 0.1); border-radius: 18px; display:flex; align-items:center; justify-content:center; margin-bottom: 16px;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="6"></circle>
                <circle cx="12" cy="12" r="2"></circle>
              </svg>
            </div>
            
            <span style="font-size: 12px; font-weight: 700; color: var(--text-secondary); background: var(--bg-main); padding: 6px 12px; border-radius: 8px;">
              ${game.name} ${game.version}
            </span>
          </div>

          <h3 class="competition-name" style="font-size: 22px; margin-bottom: 4px;">${c.name}</h3>
          <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">
            ${c.description || 'Analyse statistique des performances.'}
          </p>
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--bg-main); padding-top: 16px; margin-top: auto;">
            <span style="font-size: 14px; color: ${isPremium ? 'var(--accent)' : 'var(--text-secondary)'}; font-weight: 700; text-transform: uppercase;">
              ${isPremium ? c.mode : '🔒 Premium requis'}
            </span>
            <div style="width: 36px; height: 36px; background: ${isPremium ? 'var(--primary)' : 'var(--text-secondary)'}; border-radius: 50%; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 12px rgba(106, 13, 173, 0.3);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
          </div>

        </div>
      `;
    }).join('');
  }

  // 5. Gérer le clic (Rediriger ou Bloquer)
  window.handleCompetitionClick = function(competitionId) {
    if (isPremium) {
      window.location.href = `analyzer.html?competition=${competitionId}`;
    } else {
      window.location.href = 'pricing.html';
    }
  };

  // Lancer
  await loadCompetitions();
});
