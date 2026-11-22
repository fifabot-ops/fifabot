// ============================================
// Chargement de l'historique — FIFABOT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {

  // 1. Vérifier la connexion
  const { data: userData } = await window.supabaseClient.auth.getUser();
  if (!userData.user) {
    window.location.href = 'login.html';
    return;
  }

  const container = document.getElementById('history-container');

  // 2. Charger l'historique depuis Supabase
  const { data, error } = await window.supabaseClient
    .from('analyses')
    .select(`
      id,
      team_1_name,
      team_2_name,
      match_count,
      created_at,
      generated_predictions,
      competitions (name)
    `)
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<p style="color:#ff6b6b;">❌ Erreur de chargement : ' + error.message + '</p>';
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding: 40px 20px;">
        <p style="color: var(--text-secondary); margin-bottom: 16px;">Vous n'avez pas encore généré d'analyse.</p>
        <a href="competitions.html" class="btn btn-primary" style="text-decoration:none; display:inline-block; width:auto; padding: 12px 24px;">Lancer ma première analyse</a>
      </div>
    `;
    return;
  }

  // 3. Afficher la liste
  container.innerHTML = data.map(a => {
    const date = new Date(a.created_at).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const compName = a.competitions ? a.competitions.name : 'Compétition inconnue';
    const bestPrediction = a.generated_predictions && a.generated_predictions.length > 0 
      ? a.generated_predictions[0].option 
      : 'Aucune proposition';

    return `
      <div class="card" style="padding: 20px; cursor: pointer;" onclick="alert('Fonctionnalité de détail à venir !')">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
          <span style="font-size: 12px; font-weight: 700; color: var(--primary); background: rgba(106, 13, 173, 0.1); padding: 4px 8px; border-radius: 6px;">
            ${compName}
          </span>
          <span style="font-size: 12px; color: var(--text-secondary);">${date}</span>
        </div>
        
        <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 8px;">
          ${a.team_1_name} <span style="color: var(--text-secondary); font-weight: 400;">vs</span> ${a.team_2_name}
        </h3>
        
        <div style="display:flex; align-items:center; gap: 8px; margin-top: 12px;">
          <div style="width: 8px; height: 8px; background: var(--accent); border-radius: 50%;"></div>
          <span style="font-size: 13px; color: var(--text-secondary);">Meilleure proposition : <strong style="color: var(--text-main);">${bestPrediction}</strong></span>
        </div>
      </div>
    `;
  }).join('');
});
