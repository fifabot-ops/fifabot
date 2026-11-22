// ============================================
// Page d'analyse — FIFABOT v2 (Premium)
// ============================================

document.addEventListener('DOMContentLoaded', async () => {

  const { data: userData } = await window.supabaseClient.auth.getUser();
  if (!userData.user) {
    window.location.href = 'login.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const competitionId = urlParams.get('competition');
  if (!competitionId) {
    document.getElementById('competition-name').textContent = 'Erreur : aucune compétition sélectionnée';
    return;
  }

  const { data: competition, error } = await window.supabaseClient
    .from('competitions')
    .select('id, name, mode, format, games (name, version)')
    .eq('id', competitionId)
    .single();

  if (error || !competition) {
    document.getElementById('competition-name').textContent = 'Compétition introuvable';
    return;
  }

  const game = competition.games || {};
  document.getElementById('competition-name').textContent = competition.name;
  document.getElementById('competition-meta').textContent =
    `${game.name || ''} ${game.version || ''} • ${competition.mode} • ${competition.format || ''}`;

  const form = document.getElementById('analyzer-form');
  form.style.display = 'block';

  function generateScoreFields(count) {
    for (const teamNum of [1, 2]) {
      const container = document.getElementById(`team${teamNum}-scores`);
      container.innerHTML = '';
      for (let i = 1; i <= count; i++) {
        container.innerHTML += `
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
            <span style="color:var(--text-secondary); font-size:12px; min-width:70px; font-weight:600;">Match ${i}</span>
            <input type="number" min="0" max="20" required
              data-team="${teamNum}" data-match="${i}"
              class="score-input"
              placeholder="0"
              style="width:90px; padding:12px; background:rgba(8,13,24,0.7); border:1px solid var(--border); border-radius:10px; color:var(--text-main); font-size:15px; font-weight:700; text-align:center;">
          </div>
        `;
      }
    }
  }

  generateScoreFields(4);

  document.querySelectorAll('input[name="match_count"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      generateScoreFields(parseInt(e.target.value));
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('message');

    const team1Name = document.getElementById('team1-name').value.trim();
    const team2Name = document.getElementById('team2-name').value.trim();

    if (team1Name.toLowerCase() === team2Name.toLowerCase()) {
      messageEl.textContent = '❌ Les deux équipes doivent être différentes.';
      messageEl.className = 'message error';
      return;
    }

    const matchCount = parseInt(document.querySelector('input[name="match_count"]:checked').value);
    const team1Scores = [];
    const team2Scores = [];

    for (let i = 1; i <= matchCount; i++) {
      const s1 = document.querySelector(`.score-input[data-team="1"][data-match="${i}"]`);
      const s2 = document.querySelector(`.score-input[data-team="2"][data-match="${i}"]`);
      const v1 = parseInt(s1.value);
      const v2 = parseInt(s2.value);
      if (isNaN(v1) || isNaN(v2) || v1 < 0 || v2 < 0) {
        messageEl.textContent = `❌ Scores invalides au match ${i}.`;
        messageEl.className = 'message error';
        return;
      }
      team1Scores.push(v1);
      team2Scores.push(v2);
    }

    const stats = computeStats(team1Scores, team2Scores);
    const propositions = generatePropositions(stats, team1Scores, team2Scores, team1Name, team2Name);
    showResults(competition, team1Name, team2Name, team1Scores, team2Scores, stats, propositions);
  });

  function computeStats(t1, t2) {
    const n = t1.length;
    const avg1 = t1.reduce((a, b) => a + b, 0) / n;
    const avg2 = t2.reduce((a, b) => a + b, 0) / n;
    const avgTotal = avg1 + avg2;
    const scores = t1.map((v, i) => ({ t1: v, t2: t2[i], total: v + t2[i] }));
    const wins1 = scores.filter(s => s.t1 > s.t2).length;
    const wins2 = scores.filter(s => s.t2 > s.t1).length;
    const draws = scores.filter(s => s.t1 === s.t2).length;
    const btts = scores.filter(s => s.t1 > 0 && s.t2 > 0).length;
    const over25 = scores.filter(s => s.total > 2.5).length;
    const over35 = scores.filter(s => s.total > 3.5).length;
    const over45 = scores.filter(s => s.total > 4.5).length;
    const over55 = scores.filter(s => s.total > 5.5).length;
    const cleanSheet1 = scores.filter(s => s.t2 === 0).length;
    const cleanSheet2 = scores.filter(s => s.t1 === 0).length;
    const evenTotal = scores.filter(s => s.total % 2 === 0).length;
    const oddTotal = scores.filter(s => s.total % 2 === 1).length;
    return { n, avg1, avg2, avgTotal, wins1, wins2, draws, btts, over25, over35, over45, over55, cleanSheet1, cleanSheet2, evenTotal, oddTotal, scores };
  }

  function generatePropositions(stats, t1, t2, name1, name2) {
    const n = stats.n;
    const freq = (count) => `${count}/${n} (${Math.round(count / n * 100)}%)`;
    const props = [];

    if (stats.btts >= Math.ceil(n * 0.6)) {
      props.push({ market: 'Les deux équipes marquent (BTTS)', option: 'OUI', frequency: freq(stats.btts), count: stats.btts, justification: `Dans ${stats.btts} des ${n} matchs historiques, les deux équipes ont marqué.`, support: stats.btts / n });
    } else if (stats.btts <= Math.floor(n * 0.4)) {
      props.push({ market: 'Les deux équipes marquent (BTTS)', option: 'NON', frequency: freq(n - stats.btts), count: n - stats.btts, justification: `Dans ${n - stats.btts} des ${n} matchs, au moins une équipe n'a pas marqué.`, support: (n - stats.btts) / n });
    }

    if (stats.over25 >= Math.ceil(n * 0.6)) {
      props.push({ market: 'Total de buts', option: 'Plus de 2.5 buts', frequency: freq(stats.over25), count: stats.over25, justification: `Le total a dépassé 2.5 buts dans ${stats.over25}/${n} matchs.`, support: stats.over25 / n });
    } else if (stats.over25 <= Math.floor(n * 0.4)) {
      props.push({ market: 'Total de buts', option: 'Moins de 2.5 buts', frequency: freq(n - stats.over25), count: n - stats.over25, justification: `Le total est resté sous 2.5 buts dans ${n - stats.over25}/${n} matchs.`, support: (n - stats.over25) / n });
    }

    if (stats.wins1 >= Math.ceil(n * 0.6)) {
      props.push({ market: `Victoire ${name1}`, option: '1X2 — Victoire équipe 1', frequency: freq(stats.wins1), count: stats.wins1, justification: `${name1} a gagné ${stats.wins1}/${n} matchs.`, support: stats.wins1 / n });
    } else if (stats.wins2 >= Math.ceil(n * 0.6)) {
      props.push({ market: `Victoire ${name2}`, option: '1X2 — Victoire équipe 2', frequency: freq(stats.wins2), count: stats.wins2, justification: `${name2} a gagné ${stats.wins2}/${n} matchs.`, support: stats.wins2 / n });
    }

    if (stats.evenTotal >= Math.ceil(n * 0.6)) {
      props.push({ market: 'Total pair/impair', option: 'Total pair', frequency: freq(stats.evenTotal), count: stats.evenTotal, justification: `${stats.evenTotal}/${n} matchs ont eu un total pair.`, support: stats.evenTotal / n });
    } else if (stats.oddTotal >= Math.ceil(n * 0.6)) {
      props.push({ market: 'Total pair/impair', option: 'Total impair', frequency: freq(stats.oddTotal), count: stats.oddTotal, justification: `${stats.oddTotal}/${n} matchs ont eu un total impair.`, support: stats.oddTotal / n });
    }

    props.sort((a, b) => b.support - a.support);
    return props.slice(0, 3);
  }

  function showResults(competition, name1, name2, t1, t2, stats, propositions) {
    const results = document.getElementById('results');
    const form = document.getElementById('analyzer-form');
    form.style.display = 'none';
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
        <div class="proposition-card" style="animation-delay:${i * 0.1}s;">
          <div class="proposition-header">
            <span class="proposition-number">PROPOSITION ${i + 1}</span>
            <span class="proposition-frequency">${p.frequency}</span>
          </div>
          <div class="proposition-market">${p.market}</div>
          <div class="proposition-option">${p.option}</div>
          <div class="proposition-justification">${p.justification}</div>
        </div>
      `).join('')
      : '<div class="card" style="max-width:100%;"><p style="color:var(--text-secondary); text-align:center;">Aucune proposition suffisamment étayée avec ces données.</p></div>';

    results.innerHTML = `
      <div class="card" style="max-width:100%; margin-bottom:16px; animation:fadeInUp 0.4s ease-out;">
        <h2 style="font-size:22px; margin-bottom:8px; letter-spacing:-0.5px;">Rapport d'analyse</h2>
        <p style="color:var(--electric-blue); font-size:15px; margin-bottom:4px; font-weight:700;">
          ${name1} vs ${name2}
        </p>
        <p style="color:var(--text-secondary); font-size:12px;">
          ${competition.name} • ${new Date().toLocaleString('fr-FR')}
        </p>
      </div>

      <div class="card" style="max-width:100%; margin-bottom:16px;">
        <h3 style="font-size:13px; margin-bottom:14px; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary); font-weight:700;">Historique</h3>
        ${matchRows}
      </div>

      <div class="card" style="max-width:100%; margin-bottom:16px;">
        <h3 style="font-size:13px; margin-bottom:14px; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary); font-weight:700;">Statistiques clés</h3>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-value">${stats.avg1.toFixed(1)}</div>
            <div class="stat-label">Moy. ${name1}</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${stats.avg2.toFixed(1)}</div>
            <div class="stat-label">Moy. ${name2}</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${stats.avgTotal.toFixed(1)}</div>
            <div class="stat-label">Total moyen</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${stats.btts}/${stats.n}</div>
            <div class="stat-label">BTTS</div>
          </div>
        </div>
      </div>

      <h3 style="font-size:16px; margin-bottom:14px; margin-top:24px; letter-spacing:-0.3px;">⚡ Propositions FIFABOT</h3>
      ${propsHtml}

      <p style="color:var(--text-secondary); font-size:11px; margin-top:20px; text-align:center; line-height:1.6;">
        ⚠️ Ces propositions sont basées sur les fréquences historiques observées. Les résultats passés ne garantissent pas les résultats futurs.
      </p>

      <div style="display:flex; gap:12px; margin-top:24px; margin-bottom:24px;">
        <a href="competitions.html" class="btn btn-primary" style="text-align:center; text-decoration:none; flex:1;">Nouvelle analyse</a>
        <a href="dashboard.html" class="btn" style="text-align:center; text-decoration:none; flex:1; background:transparent; border:1px solid var(--border); color:var(--text-secondary);">Tableau de bord</a>
      </div>
    `;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

});
