// ============================================
// Gestion de l'authentification — FIFABOT
// ============================================

document.addEventListener('DOMContentLoaded', () => {

  // ----- Formulaire d'inscription -----
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const fullName = document.getElementById('full_name').value;
      const messageEl = document.getElementById('message');

      messageEl.textContent = 'Création du compte...';
      messageEl.className = 'message info';

      const { data, error } = await window.supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { full_name: fullName }
        }
      });

      if (error) {
        messageEl.textContent = '❌ Erreur : ' + error.message;
        messageEl.className = 'message error';
        return;
      }

      messageEl.textContent = '✅ Compte créé ! Redirection...';
      messageEl.className = 'message success';

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);
    });
  }

  // ----- Formulaire de connexion -----
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const messageEl = document.getElementById('message');

      messageEl.textContent = 'Connexion...';
      messageEl.className = 'message info';

      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        messageEl.textContent = '❌ ' + error.message;
        messageEl.className = 'message error';
        return;
      }

      messageEl.textContent = '✅ Connexion réussie ! Redirection...';
      messageEl.className = 'message success';

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    });
  }

  // ----- Bouton de déconnexion -----
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.supabaseClient.auth.signOut();
      window.location.href = 'index.html';
    });
  }

});
