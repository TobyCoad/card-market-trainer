/* Stats tab — aggregates over saved games, rendered as plain HTML bars. */
const Stats = (function () {
  function el(id) { return document.getElementById(id); }
  const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
  const ms = x => x == null ? '–' : (x / 1000).toFixed(1) + 's';
  const num = (x, d) => (x == null || Number.isNaN(x)) ? '–' : (+x).toFixed(d == null ? 1 : d);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  function bar(label, value, text, cls) {
    const w = Math.max(0, Math.min(100, Math.round((value || 0) * 100)));
    return '<div class="bar-row"><span class="bar-label">' + esc(label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill ' + (cls || '') + '" style="width:' + w + '%"></span></span>' +
      '<span class="bar-val">' + esc(text) + '</span></div>';
  }
  function bucketRows(rows, keyFn, labels, valFn) {
    const groups = {};
    for (const r of rows) { const k = keyFn(r); if (k == null) continue; (groups[k] = groups[k] || []).push(r); }
    return labels.filter(k => groups[k] && groups[k].length)
      .map(k => { const g = groups[k]; const v = valFn(g); return bar(k + ' (' + g.length + ')', v, pct(v)); }).join('');
  }

  function render(windowDays) {
    let games = Store.loadGames();
    if (windowDays) { const cut = Date.now() - windowDays * 864e5; games = games.filter(g => g.ts >= cut); }
    const body = el('stats-body');
    if (!games.length) { body.innerHTML = '<p class="empty">No games yet. Play a few and your weak spots show up here.</p>'; return; }
    const rows = games.flatMap(g => g.log.map(r => Object.assign({ gameId: g.id, roundsN: g.rounds, baseline: g.settings.cards * (r.aceHigh ? 8 : 7) }, r)));
    const acc = a => a.length ? a.filter(r => r.actionCorrect).length / a.length : null;
    const pacc = a => a.length ? a.filter(r => r.pnlCorrect).length / a.length : null;
    const trades = rows.filter(r => r.action !== 'pass');

    const recent = games.slice(-12);
    const trend = recent.map(g => '<div class="trend-col" title="' + new Date(g.ts).toLocaleDateString() + '">' +
      '<span class="trend-bar dec" style="height:' + Math.round(g.decisionAcc * 100) + '%"></span>' +
      '<span class="trend-bar pnl" style="height:' + Math.round(g.pnlAcc * 100) + '%"></span></div>').join('');

    const fairRows = rows.filter(r => Number.isFinite(r.fairEst));
    const late = fairRows.filter(r => r.round > r.roundsN / 2), early = fairRows.filter(r => r.round <= r.roundsN / 2);
    const fe = a => mean(a.map(r => Math.abs(r.fairEst - r.fair)));
    const corrs = games.map(g => g.sizeEdgeCorr).filter(x => x != null);
    const expTot = games.reduce((a, g) => a + g.expPnl, 0), availTot = games.reduce((a, g) => a + g.edgeAvailable, 0);

    body.innerHTML =
      '<section class="card"><h3>Headline</h3><div class="kpis">' +
        '<div><b>' + games.length + '</b><span>games</span></div>' +
        '<div><b>' + pct(acc(rows)) + '</b><span>decision accuracy</span></div>' +
        '<div><b>' + pct(pacc(trades)) + '</b><span>P&amp;L calc accuracy</span></div>' +
        '<div><b>' + ms(mean(rows.filter(r => r.decisionMs != null).map(r => r.decisionMs))) + '</b><span>avg decision</span></div>' +
        '<div><b>' + num(mean(games.map(g => g.pnl)), 0) + '</b><span>avg game P&amp;L</span></div>' +
        '<div><b>' + games.filter(g => g.bust).length + '</b><span>busts</span></div>' +
      '</div></section>' +
      '<section class="card"><h3>Last ' + recent.length + ' games <span class="legend"><i class="dec"></i>decision <i class="pnl"></i>P&amp;L calc</span></h3><div class="trend">' + trend + '</div></section>' +
      '<section class="card"><h3>Decision accuracy by edge available</h3>' +
        bucketRows(rows, r => r.edge === 0 ? 'no edge (pass)' : r.edge < 1.5 ? 'edge under 1.5' : r.edge < 3 ? 'edge 1.5 to 3' : 'edge 3+', ['no edge (pass)', 'edge under 1.5', 'edge 1.5 to 3', 'edge 3+'], acc) +
        '<p class="hint">Low on "no edge" = trading inside the spread. Low on small edges = fair-value tracking not precise enough.</p></section>' +
      '<section class="card"><h3>Decision accuracy by deck drift</h3>' +
        bucketRows(rows, r => { const d = Math.abs(r.fair - r.baseline); return d < 1 ? 'fair near baseline' : d < 2.5 ? 'drift 1 to 2.5' : 'drift 2.5+'; }, ['fair near baseline', 'drift 1 to 2.5', 'drift 2.5+'], acc) +
        '<p class="hint">If accuracy falls as drift grows, you are anchoring on 21/24 instead of tracking the remaining deck.</p></section>' +
      '<section class="card"><h3>Fair-value estimate error (when asked)</h3>' +
        (fairRows.length
          ? bar('early rounds', 1 - Math.min(1, (fe(early) || 0) / 4), num(fe(early)) + ' avg abs err') + bar('late rounds', 1 - Math.min(1, (fe(late) || 0) / 4), num(fe(late)) + ' avg abs err')
          : '<p class="hint">Turn on "ask my fair" in settings to measure this.</p>') +
      '</section>' +
      '<section class="card"><h3>P&amp;L calculation accuracy</h3>' +
        bucketRows(trades, r => r.size <= 2 ? 'size 1 to 2' : r.size <= 5 ? 'size 3 to 5' : 'size 6+', ['size 1 to 2', 'size 3 to 5', 'size 6+'], pacc) +
        bucketRows(trades, r => r.action, ['buy', 'sell'], pacc) +
        bucketRows(trades, r => r.truePnl < 0 ? 'losing trades' : 'winning trades', ['winning trades', 'losing trades'], pacc) +
        '<p class="hint">Sign errors on losing trades and slips at bigger sizes are the classic failure modes.</p></section>' +
      '<section class="card"><h3>Sizing discipline</h3>' +
        bar('size tracks edge (corr)', Math.max(0, mean(corrs) || 0), num(mean(corrs), 2)) +
        bar('expected P&L captured / available at max size', availTot > 0 ? Math.max(0, Math.min(1, expTot / availTot)) : 0, num(expTot, 0) + ' / ' + num(availTot, 0)) +
        '<p class="hint">Correlation near 1 = size scales with edge, which is the point of the sizing step.</p></section>' +
      '<section class="card"><h3>Ace rule</h3>' +
        bucketRows(rows, r => r.aceHigh ? 'ace = 14' : 'ace = 1', ['ace = 1', 'ace = 14'], acc) +
        bucketRows(rows, r => r.ruleChanged ? 'round the rule switched' : null, ['round the rule switched'], acc) +
      '</section>' +
      '<section class="card"><h3>Recent games</h3><table class="tbl"><tr><th>when</th><th>rounds</th><th>P&amp;L</th><th>dec</th><th>P&amp;L calc</th><th>avg t</th></tr>' +
        games.slice(-15).reverse().map(g => '<tr><td>' + new Date(g.ts).toLocaleDateString() + '</td><td>' + g.rounds + (g.bust ? ' (bust)' : '') + '</td><td class="' + (g.pnl >= 0 ? 'pos' : 'neg') + '">' + (g.pnl >= 0 ? '+' : '') + g.pnl + '</td><td>' + pct(g.decisionAcc) + '</td><td>' + pct(g.pnlAcc) + '</td><td>' + ms(g.avgMs) + '</td></tr>').join('') +
      '</table></section>' +
      '<section class="card"><div class="row-btns"><button class="btn ghost" id="btn-export">Export JSON</button><button class="btn ghost" id="btn-import">Import</button><button class="btn ghost danger" id="btn-reset">Reset history</button></div><input type="file" id="import-file" accept="application/json" hidden></section>';

    el('btn-export').onclick = () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'card-market-export.json'; a.click();
    };
    el('btn-import').onclick = () => el('import-file').click();
    el('import-file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { const n = Store.importJSON(t); alert('Imported ' + n + ' new games'); render(windowDays); }).catch(err => alert(err.message));
    };
    el('btn-reset').onclick = () => { if (confirm('Delete all game history on this device?')) { Store.reset(); render(windowDays); } };
  }
  return { render };
})();
