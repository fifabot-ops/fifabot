document.addEventListener('DOMContentLoaded', async () => {
  
  // 1. Vérifier la connexion
  const { data: userData } = await window.supabaseClient.auth.getUser();
  if (!userData.user) {
    window.location.href = 'login.html';
    return;
  }

  const form = document.getElementById('payment-form');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ref = document.getElementById('transaction-ref').value.trim();
    const messageEl = document.getElementById('message');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!ref) {
      messageEl.textContent = '❌ Veuillez entrer la référence de transaction.';
      messageEl.className = 'message error';
      return;
    }

    messageEl.textContent = 'Envoi de la demande...';
    messageEl.className = 'message info';
    submitBtn.disabled = true;

    try {
      // On enregistre la demande dans Supabase
      // On suppose que la table s'appelle 'payment_requests' (il faudra la créer si ce n'est pas fait)
      const { error } = await window.supabaseClient.from('payment_requests').insert([{
        user_id: userData.user.id,
        amount: 1500,
        currency: 'FCFA',
        payment_method: 'Mobile Money',
        transaction_reference: ref,
        status: 'pending'
      }]);

      if (error) throw error;

      messageEl.textContent = '✅ Demande envoyée ! Votre compte sera activé sous 24h après vérification.';
      messageEl.className = 'message success';
      form.reset();
    } catch (err) {
      console.error(err);
      messageEl.textContent = '❌ Erreur : ' + err.message;
      messageEl.className = 'message error';
    } finally {
      submitBtn.disabled = false;
    }
  });
});
