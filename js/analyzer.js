document.addEventListener('DOMContentLoaded', async () => {
  try {
    const nameEl = document.getElementById('competition-name');
    const metaEl = document.getElementById('competition-meta');
    const form = document.getElementById('analyzer-form');

    // 1. Vérifier la connexion
    const { data: userData, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !userData.user) {
      window.location.href = 'login.html';
      return;
    }

    // 2. Récupérer l'ID de l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const competitionId = urlParams.get('competition');

    if (!competitionId) {
      nameEl.textContent = 'Erreur : Aucune compétition sélectionnée.';
      metaEl.textContent = 'Veuillez retourner sur la page des compétitions.';
      return;
    }

    // 3. Charger la compétition
    const { data: competition, error: compError } = await window.supabaseClient
      .from('competitions')
      .select('id, name, mode, format, games (name, version)')
      .eq('id', competitionId)
      .single();

    if (compError || !competition) {
      nameEl.textContent = 'Compétition introuvable';
      metaEl.textContent = compError ? compError.message : 'ID invalide';
      return;
    }

    // 4. Afficher les infos
    const game = competition.games || {};
    nameEl.innerHTML = `${competition.name} <span style="color: var(--accent);">.</span>`;
    metaEl.textContent = `${game.name || ''} ${game.version || ''} • ${competition.mode} • ${competition.format || ''}`;
    
    form.style.display = 'block';

    // --- GESTION DYNAMIQUE DU FORMULAIRE (BOUTONS + / -) ---
    function generateScoreFields(count) {
      for (const teamNum of [1, 2]) {
        const container = document.getElementById(`team${teamNum}-scores`);
        if (!container) continue;
        container.innerHTML = '';
        
        for (let i = 1; i <= count; i++) {
          container.innerHTML += `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; background:var(--bg-main); padding:10px 16px; border-radius:16px;">
              <span style="color:var(--text-secondary); font-size:14px; font-weight:700;">Séance ${i}</span>
              
              <div style="display:flex; align-items:center; gap:16px;">
                <!-- Bouton Moins -->
                <button type="button" onclick="updateScore(this, -1)" style="width:36px; height:36px; border-radius:50%; background:var(--bg-card); border:none; box-shadow: 2px 2px 5px var(--shadow-dark), -2px -2px 5px var(--shadow-light); font-size:20px; font-weight:800; color:var(--primary); cursor:pointer; display:flex; align-items:center; justify-content:center;">−</button>
                
                <!-- Affichage du score -->
                <input type="number" readonly value="0"
                  data-team="${teamNum}" data-match="${i}"
                  class="score-input"
                  style="width:40px; background:transparent; border:none; color:var(--text-main); font-size:22px; font-weight:800; text-align:center; outline:none; padding:0; -moz-appearance:textfield;">
                
                <!-- Bouton Plus -->
                <button type="button" onclick="updateScore(this, 1)" style="width:36px; height:36px; border-radius:50%; background:var(--bg-card); border:none; box-shadow: 2px 2px 5px var(--shadow-dark), -2px -2px 5px var(--shadow-light); font-size:20px; font-weight:800; color:var(--primary); cursor:pointer; display:flex; align-items:center; justify-content:center;">+</button>
              </div>
            </div>
          `;
        }
      }
    }

    // Initialiser avec 4 séances par défaut
    generateScoreFields(4);

    // Écouter le changement du bouton radio 4/5 séances
    document.querySelectorAll('input[name="match_count"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        generateScoreFields(parseInt(e.target.value));
      });
    });

    // --- SOUMISSION DU FORMULAIRE ---
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const messageEl = document.getElementById('message');
      const submitBtn = form.querySelector('button[type="submit"]');
      
      const team1Name = document.getElementById('team1-name').value.trim();
      const team2Name = document.getElementById('team2-name').value.trim();

      // Validation
      if (!team1Name || !team2Name) {
        messageEl.textContent = '❌ Veuillez entrer les noms des deux équipes.';
        messageEl.className = 'message error';
        return;
      }

      if (team1Name.toLowerCase() === team2Name.toLowerCase()) {
        messageEl.textContent = '❌ Les deux équipes doivent être différentes.';
        messageEl.className = 'message error';
        return;
      }

      // Récupération des scores
      const matchCount = parseInt(document.querySelector('input[name="match_count"]:checked').value);
      const team1Scores = [];
      const team2Scores = [];

      for (let i = 1; i <= matchCount; i++) {
        const s1 = document.querySelector(`.score-input[data-team="1"][data-match="${i}"]`);
        const s2 = document.querySelector(`.score-input[data-team="2"][data-match="${i}"]`);
        team1Scores.push(parseInt(s1.value));
        team2Scores.push(parseInt(s2.value));
      }

      // Cacher le message d'erreur
      messageEl.className = 'message';
      messageEl.textContent = '';

      // Calculs
      const stats = computeStats(team1Scores, team2Scores);
      const propositions = generatePropositions(stats, team1Name, team2Name);
      
      // --- SAUVEGARDE DANS SUPABASE ---
      submitBtn.textContent = 'Enregistrement...';
      submitBtn.disabled = true;

      try {
        await window.supabaseClient.from('analyses').insert([{
          user_id: userData.user.id,
          competition_id: competition.id,
          team_1_name: team1Name,
          team_2_name: team2Name,
          match_count: matchCount,
          historical_scores: { team1: team1Scores, team2: team2Scores },
          statistical_results: stats,
          generated_predictions: propositions
        }]);
      } catch (dbErr) {
        console.error("Erreur de sauvegarde:", dbErr);
      }

      showResults(competition, team1Name, team2Name, stats, propositions);
    });

  } catch (err) {
    document.getElementById('competition-name').textContent = 'Erreur critique';
    document.getElementById('competition-meta').textContent = err.message;
    console.error(err);
  }
});

// --- FONCTION POUR METTRE A JOUR LE SCORE AVEC LES BOUTONS ---
window.updateScore = function(btn, change) {
  const input = btn.parentElement.querySelector('input');
  let val = parseInt(input.value) || 0;
  val += change;
  if (val < 0) val = 0;
  if (val > 20) val = 20;
  input.value = val;
};

// --- MOTEUR D'ANALYSE ---
function computeStats(t1, t2) {
  const n = t1.length;
  const avg1 = t1.reduce((a, b) => a + b, 0) / n;
  const avg2 = t2.reduce((a, b) => a + b, 0) / n;
  const avgTotal = avg1 + avg2;
  const scores = t1.map((v, i) => ({ t1: v, t2: t2[i], total: v + t2[i] }));
  
  return {
    n, avg1, avg2, avgTotal, scores,
    wins1: scores.filter(s => s.t1 > s.t2).length,
    wins2: scores.filter(s => s.t2 > s.t1).length,
    draws: scores.filter(s => s.t1 === s.t2).length,
    btts: scores.filter(s => s.t1 > 0 && s.t2 > 0).length,
    over35: scores.filter(s => s.total > 3.5).length,
    evenTotal: scores.filter(s => s.total % 2 === 0).length,
    oddTotal: scores.filter(s => s.total % 2 === 1).length
  };
}

function generatePropositions(stats, name1, name2) {
  const n = stats.n;
  const freq = (count) => `${count}/${n} (${Math.round(count / n * 100)}%)`;
  const props = [];

  if (stats.btts >= Math.ceil(n * 0.6)) {
    props.push({ market: 'Les deux équipes marquent', option: 'OUI', frequency: freq(stats.btts), justification: `${stats.btts}/${n} séances avec au moins un tir réussi des deux côtés.`, support: stats.btts / n });
  } else if (stats.btts <= Math.floor(n * 0.4)) {
    props.push({ market: 'Les deux équipes marquent', option: 'NON', frequency: freq(n - stats.btts), justification: `${n - stats.btts}/${n} séances avec au moins une équipe à 0.`, support: (n - stats.btts) / n });
  }

  if (stats.over35 >= Math.ceil(n * 0.6)) {
    props.push({ market: 'Total de penaltys', option: 'Plus de 3.5 buts', frequency: freq(stats.over35), justification: `${stats.over35}/${n} séances à plus de 3.5 penaltys réussis.`, support: stats.over35 / n });
  } else {
    const under45 = n - stats.scores.filter(s => s.total > 4.5).length;
    props.push({ market: 'Total de penaltys', option: 'Moins de 4.5 buts', frequency: freq(under45), justification: `Tendance à moins de 4.5 penaltys réussis.`, support: under45 / n });
  }

  if (stats.wins1 >= Math.ceil(n * 0.6)) {
    props.push({ market: `Victoire ${name1}`, option: '1X2', frequency: freq(stats.wins1), justification: `${name1} remporte ${stats.wins1}/${n} séances.`, support: stats.wins1 / n });
  } else if (stats.wins2 >= Math.ceil(n * 0.6)) {
    props.push({ market: `Victoire ${name2}`, option: '1X2', frequency: freq(stats.wins2), justification: `${name2} remporte ${stats.wins2}/${n} séances.`, support: stats.wins2 / n });
  }

  props.sort((a, b) => b.support - a.support);
  return props.slice(0, 3);
}

function showResults(competition, name1, name2, stats, propositions) {
  const results = document.getElementById('results');
  document.getElementById('analyzer-form').style.display = 'none';
  results.style.display = 'block';

  const matchRows = stats.scores.map((s, i) => `
    <div class="match-row">
      <span class="match-team" style="text-align:right;">${name1}</span>
      <span class="match-score">${s.t1} - ${s.t2}</span>
      <span class="match-team" style="text-align:left;">${name2}</span>
    </div>
  `).join('');

  const propsHtml = propositions.length > 0
    ? propositions.map((p, i) => `
      <div class="proposition-card">
        <div class="proposition-header">
          <span class="proposition-number">PROPOSITION ${i + 1}</span>
          <span class="proposition-frequency">${p.frequency}</span>
        </div>
        <div class="proposition-market">${p.market}</div>
        <div class="proposition-option">${p.option}</div>
        <div class="proposition-justification">${p.justification}</div>
      </div>
    `).join('')
    : '<p style="color:var(--text-secondary); text-align:center;">Pas assez de données pour formuler des propositions.</p>';

  results.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="font-size:22px; margin-bottom:8px; font-weight:800;">Rapport d'analyse</h2>
      <p style="color:var(--primary); font-size:16px; font-weight:800;">${name1} vs ${name2}</p>
      <p style="color:var(--text-secondary); font-size:13px;">${competition.name}</p>
    </div>
    
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; margin-bottom:14px; text-transform:uppercase; font-weight:800; color:var(--text-secondary);">Historique</h3>
      ${matchRows}
    </div>
    
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; margin-bottom:14px; text-transform:uppercase; font-weight:800; color:var(--text-secondary);">Statistiques</h3>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-value">${stats.avg1.toFixed(1)}</div><div class="stat-label">Moy. ${name1}</div></div>
        <div class="stat-box"><div class="stat-value">${stats.avg2.toFixed(1)}</div><div class="stat-label">Moy. ${name2}</div></div>
        <div class="stat-box"><div class="stat-value">${stats.avgTotal.toFixed(1)}</div><div class="stat-label">Total moyen</div></div>
        <div class="stat-box"><div class="stat-value">${stats.btts}/${stats.n}</div><div class="stat-label">BTTS</div></div>
      </div>
    </div>
    
    <h3 style="font-size:18px; margin:24px 0 16px 0; font-weight:800;">⚡ Propositions</h3>
    ${propsHtml}
    
    <p style="color:var(--text-secondary); font-size:12px; margin-top:20px; text-align:center; line-height:1.5;">
      ⚠️ Basé sur les fréquences historiques. Aucun résultat futur n'est garanti.
    </p>
    
    <div style="display:flex; gap:12px; margin-top:20px; margin-bottom:24px;">
      <a href="competitions.html" class="btn btn-primary" style="text-align:center; text-decoration:none; flex:1;">Nouvelle analyse</a>
    </div>
  `;
  window.scrollTo(0, 0);
      }
