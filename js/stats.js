/* Stats tab — aggregates over saved hands, rendered as plain HTML bars. */
const Stats = (function () {
  function el(id) { return document.getElementById(id); }
  const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
  const ms = x => x == null ? '–' : (x / 1000).toFixed(1) + 's';
  const num = (x, d) => (x == null || Number.isNaN(x)) ? '–' : (+x).toFixed(d == null ? 1 : d);
  const money = n => '€' + Math.round(n).toLocaleString();
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  function bar(label, value, text, cls) {
    const w = Math.max(0, Math.min(100, Math.round((value || 0) * 100)));
    return '<div class="bar-row"><span class="bar-label">' + esc(label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill ' + (cls || '') + '" style="width:' + w + '%"></span></span>' +
      '<span class="bar-val">' + esc(text) + '</span></div>';
  }
  function bucket(rows, keyFn, labels, valFn) {
    const g = {};
    for (const r of rows) { const k = keyFn(r); if (k == null) continue; (g[k] = g[k] || []).push(r); }
    return labels.filter(k => g[k] && g[k].length)
      .map(k => { const v = valFn(g[k]); return bar(k + ' (' + g[k].length + ')', v, pct(v)); }).join('');
  }

  function render(windowDays) {
    let games = Store.loadGames();
    if (windowDays) { const cut = Date.now() - windowDays * 864e5; games = games.filter(g => g.ts >= cut); }
    const body = el('stats-body');
    if (!games.length) { body.innerHTML = '<p class="empty">No hands yet. Play a few and your weak spots show up here.</p>'; return; }
    const rows = games.flatMap(g => g.log.map(r => Object.assign({ gameTs: g.ts }, r)));
    const bets = rows.filter(r => r.side !== 'pass');
    const sideOK = a => a.length ? a.filter(r => r.sideCorrect).length / a.length : null;

    const recent = games.slice(-12);
    const trend = recent.map(g => '<div class="trend-col" title="' + new Date(g.ts).toLocaleDateString() + '">' +
      '<span class="trend-bar dec" style="height:' + Math.round(g.sideAcc * 100) + '%"></span>' +
      '<span class="trend-bar pnl" style="height:' + (g.pnlCorrect ? 100 : 8) + '%"></span></div>').join('');

    const certRows = rows.filter(r => r.wasCertain);
    const zeroEdge = rows.filter(r => r.kSide === null);
    const bigEdge = bets.filter(r => r.kFrac >= 0.5), smallEdge = bets.filter(r => r.kFrac > 0 && r.kFrac < 0.25);

    body.innerHTML =
      '<section class="card"><h3>Headline</h3><div class="kpis">' +
        '<div><b>' + games.length + '</b><span>hands</span></div>' +
        '<div><b>' + pct(mean(games.map(g => g.pnlCorrect ? 1 : 0))) + '</b><span>P&amp;L stated right</span></div>' +
        '<div><b>' + pct(sideOK(rows)) + '</b><span>right side</span></div>' +
        '<div><b>' + pct(mean(rows.map(r => r.fracError))) + '</b><span>avg sizing error</span></div>' +
        '<div><b>' + num(mean(games.map(g => g.growth)), 2) + '</b><span>avg doublings</span></div>' +
        '<div><b>' + money(mean(games.map(g => g.bankrollEnd))) + '</b><span>avg final</span></div>' +
      '</div></section>' +

      '<section class="card"><h3>Last ' + recent.length + ' hands <span class="legend"><i class="dec"></i>right side <i class="pnl"></i>P&amp;L right</span></h3>' +
        '<div class="trend">' + trend + '</div></section>' +

      '<section class="card"><h3>Final P&amp;L accuracy</h3>' +
        bar('stated correctly', mean(games.map(g => g.pnlCorrect ? 1 : 0)), pct(mean(games.map(g => g.pnlCorrect ? 1 : 0)))) +
        bar('typical error', Math.min(1, (mean(games.map(g => g.pnlRelErr)) || 0) * 5), pct(mean(games.map(g => g.pnlRelErr))) + ' off') +
        '<p class="hint">This is the one the interviewer actually asks you for. Track the running total after every card, not at the end.</p></section>' +

      '<section class="card"><h3>Picking the side</h3>' +
        bucket(rows, r => r.kSide === null ? 'zero edge (should pass)' : (r.kFrac >= 0.5 ? 'big edge' : (r.kFrac >= 0.25 ? 'medium edge' : 'small edge')),
               ['zero edge (should pass)', 'small edge', 'medium edge', 'big edge'], sideOK) +
        '<p class="hint">Getting the side wrong on a big edge is the expensive error; failing to pass at zero edge is the cheap but revealing one.</p></section>' +

      '<section class="card"><h3>Sizing discipline</h3>' +
        bar('certain wins taken in full', mean(certRows.map(r => r.capturedCertain ? 1 : 0)) || 0,
            pct(mean(certRows.map(r => r.capturedCertain ? 1 : 0))) + ' of ' + certRows.length) +
        bar('passed at zero edge', mean(zeroEdge.map(r => r.frac === 0 ? 1 : 0)) || 0,
            pct(mean(zeroEdge.map(r => r.frac === 0 ? 1 : 0))) + ' of ' + zeroEdge.length) +
        bar('sizing error, big edges', 1 - Math.min(1, (mean(bigEdge.map(r => r.fracError)) || 0) * 3), pct(mean(bigEdge.map(r => r.fracError)))) +
        bar('sizing error, small edges', 1 - Math.min(1, (mean(smallEdge.map(r => r.fracError)) || 0) * 3), pct(mean(smallEdge.map(r => r.fracError)))) +
        bar('growth given up per hand', Math.max(0, 1 - (mean(games.map(g => g.growthGiveUp)) || 0) / 3),
            num(mean(games.map(g => g.growthGiveUp)), 2) + ' doublings') +
        '<p class="hint">A certain win is a free doubling — missing one costs more than any sizing slip elsewhere.</p></section>' +

      '<section class="card"><h3>Speed</h3>' +
        bar('avg decision', Math.max(0, 1 - (mean(rows.filter(r => r.decisionMs != null).map(r => r.decisionMs)) || 0) / 30000),
            ms(mean(rows.filter(r => r.decisionMs != null).map(r => r.decisionMs)))) +
        '<p class="hint">' + rows.filter(r => r.timedOut).length + ' timeouts across ' + rows.length + ' decisions.</p></section>' +

      '<section class="card"><h3>Recent hands</h3><table class="tbl">' +
        '<tr><th>when</th><th>final</th><th>P&amp;L said</th><th>side</th><th>size err</th><th>doublings</th></tr>' +
        games.slice(-15).reverse().map(g => '<tr><td>' + new Date(g.ts).toLocaleDateString() + '</td>' +
          '<td class="' + (g.pnl >= 0 ? 'pos' : 'neg') + '">' + money(g.bankrollEnd) + '</td>' +
          '<td class="' + (g.pnlCorrect ? 'pos' : 'neg') + '">' + (g.pnlCorrect ? '✓' : '✗') + '</td>' +
          '<td>' + pct(g.sideAcc) + '</td><td>' + pct(g.meanFracErr) + '</td><td>' + num(g.growth, 2) + '</td></tr>').join('') +
      '</table></section>' +

      '<section class="card"><div class="row-btns">' +
        '<button class="btn ghost" id="btn-export">Export JSON</button>' +
        '<button class="btn ghost" id="btn-import">Import</button>' +
        '<button class="btn ghost danger" id="btn-reset">Reset history</button>' +
      '</div><input type="file" id="import-file" accept="application/json" hidden></section>';

    el('btn-export').onclick = () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'card-bet-export.json'; a.click();
    };
    el('btn-import').onclick = () => el('import-file').click();
    el('import-file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { const n = Store.importJSON(t); alert('Imported ' + n + ' new hands'); render(windowDays); }).catch(err => alert(err.message));
    };
    el('btn-reset').onclick = () => { if (confirm('Delete all hand history on this device?')) { Store.reset(); render(windowDays); } };
  }
  return { render };
})();
