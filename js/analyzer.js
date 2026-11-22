// ============================================
// Page d'analyse — FIFABOT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {

  // Vérifier que l'utilisateur est connecté
  const { data: userData } = await window.supabaseClient.auth.getUser();
  if (!userData.user) {
    window.location.href = 'login.html';
    return;
  }

  // Récupérer l'ID de la compétition depuis l'URL
  const urlParams = new URLSearchParams(window.location.search);
  const competitionId = urlParams.get('competition');

  if (!competitionId) {
    document.getElementById('competition-name').textContent = 'Erreur : aucune compétition sélectionnée';
    return;
  }

  // Charger les infos de la compétition
  const { data: competition, error } = await window.supabaseClient
    .from('competitions')
    .select(`
      id, name, mode, format,
      games (name, version)
    `)
    .eq('id', competitionId)
    .single();

  if (error || !competition) {
    document.getElementById('competition-name').textContent = 'Compétition introuvable';
    return;
  }

  // Afficher les infos
  const game = competition.games || {};
  document.getElementById('competition-name').textContent = competition.name;
  document.getElementById('competition-meta').textContent =
    `${game.name || ''} ${game.version || ''} • ${competition.mode} • ${competition.format || ''}`;

  // Afficher le formulaire
  const form = document.getElementById('analyzer-form');
  form.style.display = 'block';

  // ----- Générer les champs de scores -----
  function generateScoreFields(count) {
    for (const teamNum of [1, 2]) {
      const container = document.getElementById(`team${teamNum}-scores`);
      container.innerHTML = '';

      for (let i = 1; i <= count; i++) {
        container.innerHTML += `
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="color:var(--text-secondary); font-size:13px; min-width:80px;">Match ${i}</span>
            <input type="number" min="0" max="20" required
              data-team="${teamNum}" data-match="${i}"
              class="score-input"
              placeholder="Buts"
              style="width:100px; padding:10px; background:var(--bg-main); border:1px solid var(--border); border-radius:8px; color:var(--text-main); font-size:14px;">
          </div>
        `;
      }
    }
  }

  // Générer 4 matchs par défaut
  generateScoreFields(4);

  // ----- Changer le nombre de matchs -----
  document.querySelectorAll('input[name="match_count"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      generateScoreFields(parseInt(e.target.value));
    });
  });

  // ----- Soumettre le formulaire -----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('message');

    // Récupérer les noms
    const team1Name = document.getElementById('team1-name').value.trim();
    const team2Name = document.getElementById('team2-name').value.trim();

    if (team1Name.toLowerCase() === team2Name.toLowerCase()) {
      messageEl.textContent = '❌ Les deux équipes doivent être différentes.';
      messageEl.className = 'message error';
      return;
    }

    // Récupérer les scores
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

    // Calculer les statistiques
    const stats = computeStats(team1Scores, team2Scores);
    const propositions = generatePropositions(stats, team1Scores, team2Scores, team1Name, team2Name);

    // Afficher les résultats
    showResults(competition, team1Name, team2Name, team1Scores, team2Scores, stats, propositions);

    // Sauvegarder l'analyse dans Supabase (optionnel pour l'instant)
    // On le fera plus tard avec la table "analyses"
  });

  // ----- Moteur d'analyse (simplifié) -----
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

    return {
      n, avg1, avg2, avgTotal,
      wins1, wins2, draws,
      btts, over25, over35, over45, over55,
      cleanSheet1, cleanSheet2,
      evenTotal, oddTotal,
      scores
    };
  }

  function generatePropositions(stats, t1, t2, name1, name2) {
    const n = stats.n;
    const freq = (count) => `${count}/${n} (${Math.round(count / n * 100)}%)`;
    const props = [];

    // Propositions basées sur les fréquences
    if (stats.btts >= Math.ceil(n * 0.6)) {
      props.push({
        market: 'Les deux équipes marquent (BTTS)',
        option: 'OUI',
        frequency: freq(stats.btts),
        count: stats.btts,
        justification: `Dans ${stats.btts} des ${n} matchs historiques, les deux équipes ont marqué.`,
        support: stats.btts / n
      });
    } else if (stats.btts <= Math.floor(n * 0.4)) {
      props.push({
        market: 'Les deux équipes marquent (BTTS)',
        option: 'NON',
        frequency: freq(n - stats.btts),
        count: n - stats.btts,
        justification: `Dans ${n - stats.btts} des ${n} matchs, au moins une équipe n'a pas marqué.`,
        support: (n - stats.btts) / n
      });
    }

    if (stats.over25 >= Math.ceil(n * 0.6)) {
      props.push({
        market: 'Total de buts',
        option: 'Plus de 2.5 buts',
        frequency: freq(stats.over25),
        count: stats.over25,
        justification: `Le total a dépassé 2.5 buts dans ${stats.over25}/${n} matchs.`,
        support: stats.over25 / n
      });
    } else if (stats.over25 <= Math.floor(n * 0.4)) {
      props.push({
        market: 'Total de buts',
        option: 'Moins de 2.5 buts',
        frequency: freq(n - stats.over25),
        count: n - stats.over25,
        justification: `Le total est resté sous 2.5 buts dans ${n - stats.over25}/${n} matchs.`,
        support: (n - stats.over25) / n
      });
    }

    if (stats.wins1 >= Math.ceil(n * 0.6)) {
      props.push({
        market: `Victoire ${name1}`,
        option: '1X2 — Victoire équipe 1',
        frequency: freq(stats.wins1),
        count: stats.wins1,
        justification: `${name1} a gagné ${stats.wins1}/${n} matchs.`,
        support: stats.wins1 / n
      });
    } else if (stats.wins2 >= Math.ceil(n * 0.6)) {
      props.push({
        market: `Victoire ${name2}`,
        option: '1X2 — Victoire équipe 2',
        frequency: freq(stats.wins2),
        count: stats.wins2,
        justification: `${name2} a gagné ${stats.wins2}/${n} matchs.`,
        support: stats.wins2 / n
      });
    }

    if (stats.evenTotal >= Math.ceil(n * 0.6)) {
      props.push({
        market: 'Total pair/impair',
        option: 'Total pair',
        frequency: freq(stats.evenTotal),
        count: stats.evenTotal,
        justification: `${stats.evenTotal}/${n} matchs ont eu un total pair.`,
        support: stats.evenTotal / n
      });
    } else if (stats.oddTotal >= Math.ceil(n * 0.6)) {
      props.push({
        market: 'Total pair/impair',
        option: 'Total impair',
        frequency: freq(stats.oddTotal),
        count: stats.oddTotal,
        justification: `${stats.oddTotal}/${n} matchs ont eu un total impair.`,
        support: stats.oddTotal / n
      });
    }

    // Trier par support décroissant
    props.sort((a, b) => b.support - a.support);

    return props.slice(0, 3);
  }

  // ----- Affichage des résultats -----
  function showResults(competition, name1, name2, t1, t2, stats, propositions) {
    const results = document.getElementById('results');
    const form = document.getElementById('analyzer-form');
    form.style.display = 'none';
    results.style.display = 'block';

    const matchRows = stats.scores.map((s, i) => `
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:14px;">
        <span style="color:var(--text-secondary);">Match ${i + 1}</span>
        <span>${name1} <strong>${s.t1}</strong> - <strong>${s.t2}</strong> ${name2}</span>
      </div>
    `).join('');

    const propsHtml = propositions.length > 0
      ? propositions.map((p, i) => `
        <div class="card" style="max-width:100%; margin-bottom:12px; border-color:var(--electric-blue);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="color:var(--electric-blue); font-size:13px; font-weight:600;">PROPOSITION ${i + 1}</span>
            <span style="color:var(--sky-blue); font-size:13px;">${p.frequency}</span>
          </div>
          <h4 style="font-size:16px; margin-bottom:4px;">${p.market}</h4>
          <p style="color:var(--electric-blue); font-weight:600; margin-bottom:8px;">${p.option}</p>
          <p style="color:var(--text-secondary); font-size:13px;">${p.justification}</p>
        </div>
      `).join('')
      : '<p style="color:var(--text-secondary);">Aucune proposition suffisamment étayée avec ces données.</p>';

    results.innerHTML = `
      <div class="card" style="max-width:100%; margin-bottom:16px;">
        <h2 style="font-size:20px; margin-bottom:12px;">Rapport d'analyse</h2>
        <p style="color:var(--text-secondary); font-size:14px; margin-bottom:4px;">
          ${competition.name} • ${name1} vs ${name2}
        </p>
        <p style="color:var(--text-secondary); font-size:12px;">
          ${new Date().toLocaleString('fr-FR')}
        </p>
      </div>

      <div class="card" style="max-width:100%; margin-bottom:16px;">
        <h3 style="font-size:16px; margin-bottom:12px;">Historique des matchs</h3>
        ${matchRows}
      </div>

      <div class="card" style="max-width:100%; margin-bottom:16px;">
        <h3 style="font-size:16px; margin-bottom:12px;">Statistiques</h3>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:14px;">
          <div>Moyenne ${name1} : <strong>${stats.avg1.toFixed(2)}</strong></div>
          <div>Moyenne ${name2} : <strong>${stats.avg2.toFixed(2)}</strong></div>
          <div>Total moyen : <strong>${stats.avgTotal.toFixed(2)}</strong></div>
          <div>Victoires ${name1} : <strong>${stats.wins1}</strong></div>
          <div>Victoires ${name2} : <strong>${stats.wins2}</strong></div>
          <div>Nuls : <strong>${stats.draws}</strong></div>
        </div>
      </div>

      <h3 style="font-size:18px; margin-bottom:12px;">Propositions</h3>
      ${propsHtml}

      <p style="color:var(--text-secondary); font-size:12px; margin-top:16px; text-align:center;">
        ⚠️ Ces propositions sont basées sur les fréquences historiques observées. Elles ne garantissent aucun résultat futur.
      </p>

      <div style="display:flex; gap:12px; margin-top:20px;">
        <a href="competitions.html" class="btn btn-primary" style="text-align:center; text-decoration:none;">Nouvelle analyse</a>
        <a href="dashboard.html" class="btn" style="text-align:center; text-decoration:none; background:transparent; border:1px solid var(--border); color:var(--text-secondary);">Tableau de bord</a>
      </div>
    `;

    window.scrollTo(0, 0);
  }

});
