document.addEventListener('DOMContentLoaded', async () => {
  
  // 1. Vérifier la connexion
  const { data: userData } = await window.supabaseClient.auth.getUser();
  if (!userData.user) {
    window.location.href = 'login.html';
    return;
  }

  const container = document.getElementById('admin-container');

  // 2. Charger les demandes
  async function loadRequests() {
    // On récupère les demandes en attente, avec l'email de l'utilisateur
    const { data, error } = await window.supabaseClient
      .from('payment_requests')
      .select(`
        id,
        amount,
        transaction_reference,
        status,
        created_at,
        user_id
      `)
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = `<p style="color:#ff6b6b;">❌ Erreur : ${error.message}</p>`;
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = `<p style="color:var(--text-secondary); text-align:center;">Aucune demande de paiement pour le moment.</p>`;
      return;
    }

    // 3. Afficher les demandes
    container.innerHTML = data.map(req => {
      const date = new Date(req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      
      let statusColor = 'var(--text-secondary)';
      let statusText = 'Inconnu';
      let actionButtons = '';

      if (req.status === 'pending') {
        statusColor = '#F59E0B'; // Orange
        statusText = 'En attente';
        actionButtons = `
          <div style="display:flex; gap:8px; margin-top:16px;">
            <button onclick="handleAction('${req.id}', 'approved')" class="btn" style="background:#10B981; color:white; padding:10px; font-size:13px; flex:1; box-shadow:none;">Approuver</button>
            <button onclick="handleAction('${req.id}', 'rejected')" class="btn" style="background:#EF4444; color:white; padding:10px; font-size:13px; flex:1; box-shadow:none;">Refuser</button>
          </div>
        `;
      } else if (req.status === 'approved') {
        statusColor = '#10B981'; // Vert
        statusText = 'Approuvé';
      } else if (req.status === 'rejected') {
        statusColor = '#EF4444'; // Rouge
        statusText = 'Refusé';
      }

      return `
        <div class="card" style="margin-bottom:0; padding:20px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <p style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Réf: ${req.transaction_reference}</p>
              <h3 style="font-size:20px; font-weight:800; margin-top:4px;">${req.amount} FCFA</h3>
            </div>
            <span style="background:${statusColor}20; color:${statusColor}; font-size:12px; font-weight:800; padding:6px 12px; border-radius:8px;">
              ${statusText}
            </span>
          </div>
          <p style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">Demandé le ${date}</p>
          <p style="font-size:12px; color:var(--text-secondary); word-break:break-all;">User ID: ${req.user_id}</p>
          ${actionButtons}
        </div>
      `;
    }).join('');
  }

  // 4. Fonction pour approuver/refuser (attachée au window pour être appelée par les boutons HTML)
  window.handleAction = async function(requestId, newStatus) {
    if (!confirm(`Voulez-vous vraiment ${newStatus === 'approved' ? 'approuver' : 'refuser'} cette demande ?`)) return;

    // Mise à jour du statut de la demande
    const { error: updateError } = await window.supabaseClient
      .from('payment_requests')
      .update({ status: newStatus, reviewed_at: new Date().toISOString() })
      .eq('id', requestId);

    if (updateError) {
      alert('Erreur lors de la mise à jour : ' + updateError.message);
      return;
    }

    alert(`✅ Demande ${newStatus === 'approved' ? 'approuvée' : 'refusée'} avec succès !`);
    
    // Recharger la liste pour voir le changement
    await loadRequests();
  };

  // Lancer le chargement
  await loadRequests();
});
