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
// MOTEUR STATISTIQUE PENALTY FIFABOT v5 (Cohérence totale)
// ============================================
function analyzeHistory(t1, t2, name1, name2) {
  const n = t1.length;
  const avg1 = t1.reduce((a, b) => a + b, 0) / n;
  const avg2 = t2.reduce((a, b) => a + b, 0) / n;
  
  // --- 1. GÉNÉRATION DU SCORE EXACT EN PREMIER ---
  // On crée une liste de scores possibles en fonction des moyennes des équipes
  const baseScore1 = Math.round(avg1);
  const baseScore2 = Math.round(avg2);
  
  // On génère un score autour de ces moyennes (pour éviter le hasard total)
  let finalScore1 = baseScore1 + Math.floor(Math.random() * 3) - 1; // -1, 0 ou +1
  let finalScore2 = baseScore2 + Math.floor(Math.random() * 3) - 1;
  
  // Sécurité : minimum 0 but, et pas de match nul (on donne +1 à une équipe)
  if (finalScore1 < 0) finalScore1 = 0;
  if (finalScore2 < 0) finalScore2 = 0;
  if (finalScore1 === finalScore2) {
    if (Math.random() > 0.5) finalScore1++; else finalScore2++;
  }
  
  const exactScore = `${finalScore1} - ${finalScore2}`;
  const totalExact = finalScore1 + finalScore2;

  // --- 2. CALCUL DES PROBABILITÉS HISTORIQUES ---
  let eq3PlusOui = 0, eq3PlusNon = 0;
  let over65 = 0, under65 = 0, over75 = 0, under75 = 0, over85 = 0, under85 = 0;
  let t1Over35 = 0, t1Under25 = 0, t2Over35 = 0, t2Under25 = 0;

  for (let i = 0; i < n; i++) {
    const s1 = t1[i], s2 = t2[i], total = s1 + s2;
    
    if (s1 >= 3 && s2 >= 3) eq3PlusOui++; else eq3PlusNon++;
    if (total > 6.5) over65++; else under65++;
    if (total > 7.5) over75++; else under75++;
    if (total > 8.5) over85++; else under85++;
    
    if (s1 > 3.5) t1Over35++; else t1Under25++;
    if (s2 > 3.5) t2Over35++; else t2Under25++;
  }

  const markets = [
    { id: 'eq3+', label: 'Chaque équipe marque (3) ou Plus : OUI', rate: eq3PlusOui/n },
    { id: 'eq3-', label: 'Chaque équipe marque (3) ou Plus : NON', rate: eq3PlusNon/n },
    { id: 'o65', label: 'Total (6.5) : Plus de', rate: over65/n },
    { id: 'u65', label: 'Total (6.5) : Moins de', rate: under65/n },
    { id: 'o75', label: 'Total (7.5) : Plus de', rate: over75/n },
    { id: 'u75', label: 'Total (7.5) : Moins de', rate: under75/n },
    { id: 'o85', label: 'Total (8.5) : Plus de', rate: over85/n },
    { id: 'u85', label: 'Total (8.5) : Moins de', rate: under85/n },
    { id: 't1o35', label: `Total 1 (3.5) : Plus de`, rate: t1Over35/n },
    { id: 't1u25', label: `Total 1 (2.5) : Moins de`, rate: t1Under25/n },
    { id: 't2o35', label: `Total 2 (3.5) : Plus de`, rate: t2Over35/n },
    { id: 't2u25', label: `Total 2 (2.5) : Moins de`, rate: t2Under25/n }
  ];

  markets.sort((a, b) => b.rate - a.rate);

  // --- 3. FILTRAGE DES OPTIONS EN FONCTION DU SCORE EXACT ---
  
  // Option 1 : On cherche le meilleur marché qui est VRAI pour ce score exact.
  let bestMarket = null;
  for (const market of markets) {
    let isValidForScore = true;
    
    // On vérifie si le marché est logique par rapport au score généré
    if (market.id === 'eq3+' && (finalScore1 < 3 || finalScore2 < 3)) isValidForScore = false;
    if (market.id === 'eq3-' && (finalScore1 >= 3 && finalScore2 >= 3)) isValidForScore = false;
    if (market.id === 'o65' && totalExact <= 6.5) isValidForScore = false;
    if (market.id === 'u65' && totalExact >= 6.5) isValidForScore = false;
    if (market.id === 'o75' && totalExact <= 7.5) isValidForScore = false;
    if (market.id === 'u75' && totalExact >= 7.5) isValidForScore = false;
    if (market.id === 'o85' && totalExact <= 8.5) isValidForScore = false;
    if (market.id === 'u85' && totalExact >= 8.5) isValidForScore = false;
    if (market.id === 't1o35' && finalScore1 <= 3.5) isValidForScore = false;
    if (market.id === 't1u25' && finalScore1 >= 2.5) isValidForScore = false;
    if (market.id === 't2o35' && finalScore2 <= 3.5) isValidForScore = false;
    if (market.id === 't2u25' && finalScore2 >= 2.5) isValidForScore = false;

    if (isValidForScore) {
      bestMarket = market;
      break; // On a trouvé la meilleure option cohérente
    }
  }
  
  // Sécurité si aucun marché ne correspond (très rare)
  if (!bestMarket) bestMarket = { label: 'Total (6.5) : Moins de', rate: under65/n };

  // Option 2 : Basée sur le total du score exact
  // On retranche 1 pour sécuriser (ex: Total 9 => Moins de 8.5)
  const underLine = totalExact - 0.5;
  const overLine = totalExact + 0.5;
  
  let safeTotal;
  // On choisit en fonction de ce qui est le plus probable historiquement
  if (under65 / n >= 0.5 || totalExact <= 7) {
    safeTotal = { label: `Total (${underLine}) : Moins de`, rate: 0.75 };
  } else {
    safeTotal = { label: `Total (${overLine}) : Plus de`, rate: 0.65 };
  }

  return [
    { 
      market: 'Recommandation FIFABOT', 
      option: bestMarket.label, 
      justification: `Cohérent avec le score exact (${exactScore}) et fort historiquement.` 
    },
    { 
      market: 'Option Sécurisée (Total)', 
      option: safeTotal.label, 
      justification: `Pari plus prudent, calculé par rapport au score exact.` 
    },
    { 
      market: 'Score Exact (Base)', 
      option: exactScore, 
      justification: `Score probable pour cette confrontation (Sans match nul).` 
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
