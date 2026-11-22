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

    // 2. VÉRIFICATION PREMIUM (Sécurité)
    const { data: payments } = await window.supabaseClient
      .from('payment_requests')
      .select('status')
      .eq('user_id', userData.user.id)
      .eq('status', 'approved');

    if (!payments || payments.length === 0) {
      window.location.href = 'pricing.html';
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const competitionId = urlParams.get('competition');
    if (!competitionId) return;

    const { data: competition } = await window.supabaseClient
      .from('competitions')
      .select('id, name, mode, format, games (name, version)')
      .eq('id', competitionId)
      .single();

    if (!competition) return;

    const game = competition.games || {};
    nameEl.innerHTML = `${competition.name} <span style="color: var(--accent);">.</span>`;
    metaEl.textContent = `${game.name || ''} ${game.version || ''} • ${competition.mode}`;
    
    form.style.display = 'block';

    // --- FORMULAIRE DE SAISIE DES SCORES ---
    function generateScoreFields(count) {
      for (const teamNum of [1, 2]) {
        const container = document.getElementById(`team${teamNum}-scores`);
        if (!container) continue;
        container.innerHTML = '';
        for (let i = 1; i <= count; i++) {
          container.innerHTML += `
            <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:16px;">
              <span style="color:var(--text-secondary); font-size:11px; font-weight:700; margin-bottom:6px;">Séance ${i}</span>
              <div style="display:flex; align-items:center; justify-content:center; gap:8px; background:var(--bg-main); padding:6px; border-radius:24px; width:100%;">
                <button type="button" onclick="updateScore(this, -1)" style="width:30px; height:30px; border-radius:50%; background:var(--bg-card); border:none; box-shadow: 2px 2px 4px var(--shadow-dark), -1px -1px 3px var(--shadow-light); font-size:16px; font-weight:800; color:var(--primary); cursor:pointer; display:flex; align-items:center; justify-content:center;">−</button>
                <input type="number" readonly value="0" data-team="${teamNum}" data-match="${i}" class="score-input" style="width:24px; background:transparent; border:none; color:var(--text-main); font-size:18px; font-weight:800; text-align:center; outline:none; padding:0;">
                <button type="button" onclick="updateScore(this, 1)" style="width:30px; height:30px; border-radius:50%; background:var(--bg-card); border:none; box-shadow: 2px 2px 4px var(--shadow-dark), -1px -1px 3px var(--shadow-light); font-size:16px; font-weight:800; color:var(--primary); cursor:pointer; display:flex; align-items:center; justify-content:center;">+</button>
              </div>
            </div>
          `;
        }
      }
    }

    generateScoreFields(4);
    document.querySelectorAll('input[name="match_count"]').forEach(radio => {
      radio.addEventListener('change', (e) => generateScoreFields(parseInt(e.target.value)));
    });

    // --- SOUMISSION & MOTEUR ---
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const team1Name = document.getElementById('team1-name').value.trim();
      const team2Name = document.getElementById('team2-name').value.trim();
      const matchCount = parseInt(document.querySelector('input[name="match_count"]:checked').value);
      
      const t1Scores = [];
      const t2Scores = [];

      for (let i = 1; i <= matchCount; i++) {
        t1Scores.push(parseInt(document.querySelector(`.score-input[data-team="1"][data-match="${i}"]`).value));
        t2Scores.push(parseInt(document.querySelector(`.score-input[data-team="2"][data-match="${i}"]`).value));
      }

      // --- CALCUL DES PROPOSITIONS (TA LOGIQUE) ---
      const propositions = analyzeHistory(t1Scores, t2Scores, team1Name, team2Name);

      // Sauvegarde Supabase
      try {
        await window.supabaseClient.from('analyses').insert([{
          user_id: userData.user.id,
          competition_id: competition.id,
          team_1_name: team1Name,
          team_2_name: team2Name,
          match_count: matchCount,
          historical_scores: { team1: t1Scores, team2: t2Scores },
          statistical_results: { averages: t1Scores.map((v,i)=>v+t2Scores[i]) },
          generated_predictions: propositions
        }]);
      } catch (err) { console.error(err); }

      showResults(competition, team1Name, team2Name, t1Scores, t2Scores, propositions);
    });

  } catch (err) { console.error(err); }
});

window.updateScore = function(btn, change) {
  const input = btn.parentElement.querySelector('input');
  let val = parseInt(input.value) || 0;
  val += change;
  if (val < 0) val = 0;
  if (val > 20) val = 20;
  input.value = val;
};

// ============================================
// MOTEUR STATISTIQUE FIFABOT
// ============================================
function analyzeHistory(t1, t2, name1, name2) {
  const n = t1.length;
  
  // Calcul des moyennes et totaux
  const avg1 = t1.reduce((a, b) => a + b, 0) / n;
  const avg2 = t2.reduce((a, b) => a + b, 0) / n;
  const totalAvg = avg1 + avg2;
  
  // Comptages pour les marchés
  let bttsCount = 0;
  let over65Count = 0, under65Count = 0;
  let over75Count = 0, under75Count = 0;
  let over85Count = 0, under85Count = 0;
  let t1Over35 = 0, t2Over35 = 0;
  let t1Over45 = 0, t2Over45 = 0;
  let scoresCount = {};

  for (let i = 0; i < n; i++) {
    const s1 = t1[i], s2 = t2[i], total = s1 + s2;
    
    if (s1 > 0 && s2 > 0) bttsCount++;
    
    if (total > 6.5) over65Count++; else under65Count++;
    if (total > 7.5) over75Count++; else under75Count++;
    if (total > 8.5) over85Count++; else under85Count++;
    
    if (s1 > 3.5) t1Over35++;
    if (s1 > 4.5) t1Over45++;
    if (s2 > 3.5) t2Over35++;
    if (s2 > 4.5) t2Over45++;
    
    const scoreStr = `${s1}-${s2}`;
    scoresCount[scoreStr] = (scoresCount[scoreStr] || 0) + 1;
  }

  // 1. Choix de la Recommandation (Option 1)
  // On cherche l'option qui a le plus fort taux de réussite historique
  let bestOption = { name: '', success: 0, desc: '' };
  
  // Test des marchés basés sur les moyennes
  if (bttsCount / n >= 0.6) bestOption = { name: 'Les deux équipes marquent : OUI', success: bttsCount/n, desc: `Historique de ${bttsCount}/${n} matchs avec buts des 2 côtés.` };
  else if (totalAvg > 7.5) bestOption = { name: 'Total (7.5) : Plus de', success: over75Count/n, desc: `Moyenne de buts très élevée (${totalAvg.toFixed(1)}).` };
  else if (totalAvg < 6.5) bestOption = { name: 'Total (6.5) : Moins de', success: under65Count/n, desc: `Moyenne de buts basse (${totalAvg.toFixed(1)}).` };
  else if (avg1 > 4.5) bestOption = { name: `Total ${name1} (4.5) : Plus de`, success: t1Over45/n, desc: `${name1} marque énormément (Moy: ${avg1.toFixed(1)}).` };
  else if (avg2 > 4.5) bestOption = { name: `Total ${name2} (4.5) : Plus de`, success: t2Over45/n, desc: `${name2} marque énormément (Moy: ${avg2.toFixed(1)}).` };
  else bestOption = { name: 'Total (6.5) : Moins de', success: under65Count/n, desc: 'Matchs généralement fermés.' };

  // 2. Choix de l'Option 2 (Alternative)
  let altOption = { name: '', desc: '' };
  if (avg1 - avg2 > 1.5) altOption = { name: `Handicap : 1 (-1.5)`, desc: `${name1} domine largement les débats.` };
  else if (avg2 - avg1 > 1.5) altOption = { name: `Handicap : 2 (+1.5)`, desc: `${name2} est solide, un handicap est jouable.` };
  else if (totalAvg > 7.5) altOption = { name: 'Total (8.5) : Plus de', desc: `Possibilité de match à très haut score.` };
  else altOption = { name: 'Chaque équipe marque (2) ou Plus : Non', desc: 'Les équipes ne dépassent pas souvent les 2 buts.' };

  // 3. Choix du Score Exact
  // On prend le score qui est revenu le plus souvent
  let bestScore = '3-1';
  let maxCount = 0;
  for (const [score, count] of Object.entries(scoresCount)) {
    if (count > maxCount) { maxCount = count; bestScore = score; }
  }

  return [
    { market: 'Recommandation FIFABOT', option: bestOption.name, justification: bestOption.desc },
    { market: 'Option Alternative', option: altOption.name, justification: altOption.desc },
    { market: 'Score Exact', option: bestScore.replace('-', ' - '), justification: `Ce score est apparu ${maxCount} fois sur les ${n} matchs.` }
  ];
}

function showResults(competition, name1, name2, t1, t2, propositions) {
  const results = document.getElementById('results');
  document.getElementById('analyzer-form').style.display = 'none';
  results.style.display = 'block';

  const totalAvg = (t1.reduce((a,b)=>a+b,0)/t1.length + t2.reduce((a,b)=>a+b,0)/t2.length).toFixed(1);

  const propsHtml = propositions.map((p, i) => `
    <div class="proposition-card" style="border-left: 6px solid ${i === 0 ? 'var(--primary)' : i === 1 ? 'var(--success)' : 'var(--accent)'};">
      <div class="proposition-header">
        <span class="proposition-number" style="background: ${i === 0 ? 'var(--primary)' : i === 1 ? 'var(--success)' : 'var(--accent)'};">${p.market}</span>
      </div>
      <div class="proposition-option" style="margin-top: 12px; font-size: 22px;">${p.option}</div>
      <div class="proposition-justification">${p.justification}</div>
    </div>
  `).join('');

  results.innerHTML = `
    <div class="card" style="margin-bottom:16px; text-align:center;">
      <h2 style="font-size:24px; font-weight:800; margin-bottom:4px;">
        <span style="color:var(--primary);">${name1}</span> 
        <span style="color:var(--text-secondary); font-size:16px; font-weight:600;">vs</span> 
        <span style="color:var(--accent);">${name2}</span>
      </h2>
      <p style="color:var(--text-secondary); font-size:13px;">Moyenne totale : ${totalAvg} buts</p>
    </div>
    <h3 style="font-size:18px; margin:24px 0 16px 0; font-weight:800; text-align:center;">⚡ Top 3 des Prédictions</h3>
    ${propsHtml}
    <div style="display:flex; gap:12px; margin-top:24px; margin-bottom:24px;">
      <a href="competitions.html" class="btn btn-primary" style="text-align:center; text-decoration:none; flex:1;">Nouvelle analyse</a>
    </div>
  `;
  window.scrollTo(0, 0);
    }
