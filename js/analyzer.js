document.addEventListener('DOMContentLoaded', async () => {
  try {
    const nameEl = document.getElementById('competition-name');
    const metaEl = document.getElementById('competition-meta');
    const form = document.getElementById('analyzer-form');

    const { data: userData, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !userData.user) {
      window.location.href = 'login.html';
      return;
    }

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

      const propositions = analyzeHistory(t1Scores, t2Scores, team1Name, team2Name);

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
// MOTEUR STATISTIQUE PENALTY FIFABOT v8
// ============================================
function analyzeHistory(t1, t2, name1, name2) {
  const n = t1.length;
  const avg1 = t1.reduce((a, b) => a + b, 0) / n;
  const avg2 = t2.reduce((a, b) => a + b, 0) / n;
  const totalAvg = avg1 + avg2;
  
  // --- 1. GÉNÉRATION DU SCORE EXACT ---
  let finalScore1 = Math.round(avg1) + Math.floor(Math.random() * 3) - 1;
  let finalScore2 = Math.round(avg2) + Math.floor(Math.random() * 3) - 1;
  
  if (finalScore1 < 0) finalScore1 = 0;
  if (finalScore2 < 0) finalScore2 = 0;
  
  if (finalScore1 === finalScore2) {
    if (Math.random() > 0.5) finalScore1++; else finalScore2++;
  }
  
  const exactScore = `${finalScore1} - ${finalScore2}`;
  const totalExact = finalScore1 + finalScore2;

  // --- 2. CALCUL DES STATISTIQUES HISTORIQUES ---
  let wins1 = 0, wins2 = 0, h1 = 0, h2 = 0;
  let evenTotal = 0, oddTotal = 0;
  let eq2PlusOui = 0, eq3PlusOui = 0;
  let over65 = 0, over75 = 0, over85 = 0;
  let t1Over35 = 0, t2Over35 = 0, t1Over45 = 0, t2Over45 = 0;

  for (let i = 0; i < n; i++) {
    const s1 = t1[i], s2 = t2[i], total = s1 + s2;
    
    if (s1 > s2) wins1++; else if (s2 > s1) wins2++;
    if (s1 - s2 > 1.5) h1++;
    if (s2 - s1 > -1.5) h2++;
    
    if (total % 2 === 0) evenTotal++; else oddTotal++;
    
    if (s1 >= 2 && s2 >= 2) eq2PlusOui++;
    if (s1 >= 3 && s2 >= 3) eq3PlusOui++;
    
    if (total > 6.5) over65++;
    if (total > 7.5) over75++;
    if (total > 8.5) over85++;
    
    if (s1 > 3.5) t1Over35++;
    if (s1 > 4.5) t1Over45++;
    if (s2 > 3.5) t2Over35++;
    if (s2 > 4.5) t2Over45++;
  }

  // --- 3. OPTION 1 : Marchés de Résultat / Équipe (Sans les Totaux) ---
  const marketsOption1 = [
    { id: 'w1', label: `Victoire ${name1}`, rate: wins1/n },
    { id: 'w2', label: `Victoire ${name2}`, rate: wins2/n },
    { id: 'h1', label: `Handicap : 1 (-1.5)`, rate: h1/n },
    { id: 'h2', label: `Handicap : 2 (1.5)`, rate: h2/n },
    { id: 'pair', label: 'Total Pair', rate: evenTotal/n },
    { id: 'impair', label: 'Total Impair', rate: oddTotal/n },
    { id: 'eq2+', label: 'Chaque équipe marque (2) ou Plus : OUI', rate: eq2PlusOui/n },
    { id: 'eq2-', label: 'Chaque équipe marque (2) ou Plus : NON', rate: 1 - (eq2PlusOui/n) },
    { id: 'eq3+', label: 'Chaque équipe marque (3) ou Plus : OUI', rate: eq3PlusOui/n },
    { id: 'eq3-', label: 'Chaque équipe marque (3) ou Plus : NON', rate: 1 - (eq3PlusOui/n) }
  ];

  marketsOption1.sort((a, b) => b.rate - a.rate);
  const bestOption1 = marketsOption1[0];

  // --- 4. OPTION 2 : Un seul choix parmi les Totaux (basé sur les stats) ---
  // On crée une liste de totaux possibles, et on choisit le plus pertinent
  let totalOptions = [];
  
  // Total Global
  const isGlobalOver = over75/n > 0.5;
  const globalLine = isGlobalOver ? 7.5 : 6.5;
  totalOptions.push({
    label: `Total (${globalLine}) : ${isGlobalOver ? 'Plus de' : 'Moins de'}`,
    score: Math.abs((isGlobalOver ? over75/n : 1 - over75/n) - 0.5) // Plus c'est proche de 0.5, plus c'est "sûr" (proche de 100% ou 0%)
  });

  // Total 1
  const isT1Over = t1Over35/n > 0.5;
  const t1Line = isT1Over ? 3.5 : 2.5;
  totalOptions.push({
    label: `Total 1 (${t1Line}) : ${isT1Over ? 'Plus de' : 'Moins de'}`,
    score: Math.abs((isT1Over ? t1Over35/n : 1 - t1Over35/n) - 0.5)
  });

  // Total 2
  const isT2Over = t2Over35/n > 0.5;
  const t2Line = isT2Over ? 3.5 : 2.5;
  totalOptions.push({
    label: `Total 2 (${t2Line}) : ${isT2Over ? 'Plus de' : 'Moins de'}`,
    score: Math.abs((isT2Over ? t2Over35/n : 1 - t2Over35/n) - 0.5)
  });

  // On trie pour prendre le "plus sûr" (score le plus proche de 0 signifie un taux de réussite proche de 100%)
  totalOptions.sort((a, b) => a.score - b.score);
  const bestTotal = totalOptions[0];

  return [
    { 
      market: 'Recommandation FIFABOT', 
      option: bestOption1.label, 
      justification: `Le pari le plus sûr statistiquement (${Math.round(bestOption1.rate * 100)}% de réussite).` 
    },
    { 
      market: 'Prédiction Total', 
      option: bestTotal.label, 
      justification: `Basé sur l'analyse des tendances de marque (Total Global ou Individuel).` 
    },
    { 
      market: 'Score Exact (Base)', 
      option: exactScore, 
      justification: `Score probable calculé sur les moyennes (${avg1.toFixed(1)} vs ${avg2.toFixed(1)}).` 
    }
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
      <div class="proposition-option" style="margin-top: 12px; font-size: 20px;">${p.option}</div>
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
      <p style="color:var(--text-secondary); font-size:13px;">Moyenne totale : ${totalAvg} penaltys</p>
    </div>
    <h3 style="font-size:18px; margin:24px 0 16px 0; font-weight:800; text-align:center;">⚡ Top 3 des Prédictions</h3>
    ${propsHtml}
    <div style="display:flex; gap:12px; margin-top:24px; margin-bottom:24px;">
      <a href="competitions.html" class="btn btn-primary" style="text-align:center; text-decoration:none; flex:1;">Nouvelle analyse</a>
    </div>
  `;
  window.scrollTo(0, 0);
              }
