/* Readiness benchmark — are you interview-ready at this game?
 * Evaluates your RECENT play (last 60 rounds / last 5 games) against explicit thresholds on
 * every axis the game grades. Thresholds are a prep standard set for this app, not IMC's rubric. */
const Ready = (function () {
  const ROUNDS_WINDOW = 60, GAMES_WINDOW = 5, MIN_ROUNDS = 30;

  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
  const num = (x, d) => (x == null || Number.isNaN(x)) ? '–' : (+x).toFixed(d == null ? 1 : d);

  function evaluate() {
    const games = Store.loadGames();
    const allRows = games.flatMap(g => g.log.map(r => Object.assign({ gameTs: g.ts, roundsN: g.rounds, baseline: g.settings.cards * (r.aceHigh ? 8 : 7), timer: g.settings.timerSec, misprice: g.settings.mispriceSd, askFair: g.settings.askFair }, r)));
    const rows = allRows.slice(-ROUNDS_WINDOW);
    const recentGames = games.slice(-GAMES_WINDOW);
    const trades = rows.filter(r => r.action !== 'pass');
    const noEdge = rows.filter(r => r.edge === 0);
    const smallEdge = rows.filter(r => r.edge > 0 && r.edge < 1.5);
    const drift = rows.filter(r => Math.abs(r.fair - r.baseline) >= 2);
    const fairRows = rows.filter(r => Number.isFinite(r.fairEst));
    const lateFair = fairRows.filter(r => r.round > r.roundsN / 2);
    const timed = rows.filter(r => r.timer > 0);
    const acc = a => a.length ? a.filter(r => r.actionCorrect).length / a.length : null;
    const corrs = recentGames.map(g => g.sizeEdgeCorr).filter(x => x != null);
    const signOk = trades.length ? trades.filter(r => !Number.isFinite(r.enteredPnl) ? false : Math.sign(Math.round(r.enteredPnl)) === Math.sign(r.truePnl) || r.truePnl === 0).length / trades.length : null;
    const hardGames = recentGames.filter(g => g.settings.mispriceSd <= 2.5 && g.settings.spreadMax <= 5);

    // Each criterion: {key, name, why, value, text, pass (true/false/null=not enough data), weight}
    const C = [];
    const add = (key, name, why, value, text, pass, weight) => C.push({ key, name, why, value, text, pass, weight });

    add('decision', 'Decision accuracy', 'Right side of the quote (or a correct pass). Target 90%+ over the last 60 rounds.',
      acc(rows), pct(acc(rows)), rows.length ? acc(rows) >= 0.9 : null, 3);
    add('noedge', 'Spread discipline', 'When fair sits inside the spread you pass. Trading inside your own fair is negative EV after the spread. Target 90%+.',
      acc(noEdge), pct(acc(noEdge)) + ' of ' + noEdge.length, noEdge.length >= 6 ? acc(noEdge) >= 0.9 : null, 2);
    add('smalledge', 'Small-edge precision', 'Edges under 1.5 points only get caught if your fair is precise — this is the running-count test. Target 75%+.',
      acc(smallEdge), pct(acc(smallEdge)) + ' of ' + smallEdge.length, smallEdge.length >= 6 ? acc(smallEdge) >= 0.75 : null, 2);
    add('drift', 'Drift robustness', 'Accuracy when the remaining deck has pulled fair 2+ points from 21/24. If this lags your overall accuracy you are anchoring. Target 85%+.',
      acc(drift), pct(acc(drift)) + ' of ' + drift.length, drift.length >= 6 ? acc(drift) >= 0.85 : null, 2);
    add('pnl', 'P&L from memory', 'Your stated P&L matches exactly. Target 95%+ of trades.',
      trades.length ? trades.filter(r => r.pnlCorrect).length / trades.length : null,
      pct(trades.length ? trades.filter(r => r.pnlCorrect).length / trades.length : null) + ' of ' + trades.length,
      trades.length >= 10 ? trades.filter(r => r.pnlCorrect).length / trades.length >= 0.95 : null, 3);
    add('sign', 'Never the wrong sign', 'Reporting a loss as a gain is the disqualifying version of a P&L slip. Target 100%.',
      signOk, pct(signOk), trades.length >= 10 ? signOk >= 0.999 : null, 2);
    add('fair', 'Fair-value tracking', 'With "ask my fair" on: average absolute error in the second half of the deck. Target within 1.0 of true fair.',
      mean(lateFair.map(r => Math.abs(r.fairEst - r.fair))), num(mean(lateFair.map(r => Math.abs(r.fairEst - r.fair)))) + ' late-deck',
      lateFair.length >= 8 ? mean(lateFair.map(r => Math.abs(r.fairEst - r.fair))) <= 1.0 : null, 2);
    add('speed', 'Speed under a clock', 'Average decision time in timed games. Target under 12 seconds — the live game gives roughly 10–15.',
      mean(timed.map(r => r.decisionMs)), timed.length ? num(mean(timed.map(r => r.decisionMs)) / 1000) + 's' : 'no timed rounds',
      timed.length >= 15 ? mean(timed.map(r => r.decisionMs)) <= 12000 : null, 2);
    add('timeouts', 'No timeouts', 'A timeout is a frozen candidate. Target 0 in timed rounds.',
      timed.filter(r => r.timedOut).length, String(timed.filter(r => r.timedOut).length) + ' timeouts', timed.length >= 15 ? timed.filter(r => r.timedOut).length === 0 : null, 1);
    add('sizing', 'Size scales with edge', 'Correlation between edge and your size on correct trades, averaged over recent games. Target 0.6+.',
      mean(corrs), num(mean(corrs), 2), corrs.length >= 3 ? mean(corrs) >= 0.6 : null, 2);
    add('bankroll', 'Bankroll survival', 'Positive P&L in at least 4 of the last 5 games and no busts.',
      recentGames.filter(g => g.pnl > 0).length, recentGames.filter(g => g.pnl > 0).length + '/' + recentGames.length + ' positive, ' + recentGames.filter(g => g.bust).length + ' busts',
      recentGames.length >= 5 ? recentGames.filter(g => g.pnl > 0).length >= 4 && !recentGames.some(g => g.bust) : null, 2);
    add('twist', 'Handled the ace switch', 'Decision accuracy in games with the mid-game ace rule change. Target 85%+ in at least 2 such games.',
      acc(allRows.filter(r => games.find(g => g.ts === r.gameTs).settings.aceSwitch)),
      pct(acc(allRows.filter(r => games.find(g => g.ts === r.gameTs).settings.aceSwitch))) + ' in ' + games.filter(g => g.settings.aceSwitch).length + ' games',
      games.filter(g => g.settings.aceSwitch).length >= 2 ? acc(allRows.filter(r => games.find(g => g.ts === r.gameTs).settings.aceSwitch)) >= 0.85 : null, 1);
    add('realism', 'Practised at realistic difficulty', 'Recent games at normal-or-subtler mispricing and a normal-or-tighter spread, and no deck-stats training wheels.',
      hardGames.filter(g => !g.settings.showCount).length, hardGames.filter(g => !g.settings.showCount).length + '/' + recentGames.length + ' games',
      recentGames.length >= 3 ? hardGames.filter(g => !g.settings.showCount).length >= 3 : null, 1);

    const scored = C.filter(c => c.pass !== null);
    const wTot = scored.reduce((a, c) => a + c.weight, 0);
    const wPass = scored.filter(c => c.pass).reduce((a, c) => a + c.weight, 0);
    const score = wTot ? wPass / wTot : 0;
    const coverage = C.reduce((a, c) => a + c.weight, 0);
    const enoughData = allRows.length >= MIN_ROUNDS;
    const coreFail = C.filter(c => ['decision', 'pnl', 'sign'].includes(c.key) && c.pass === false).length > 0;
    let verdict, cls;
    if (!enoughData) { verdict = 'Not enough data yet'; cls = 'no'; }
    else if (score >= 0.85 && !coreFail && wTot >= coverage * 0.7) { verdict = 'Interview-ready'; cls = 'ok'; }
    else if (score >= 0.65 && !coreFail) { verdict = 'Nearly there'; cls = 'near'; }
    else { verdict = 'Not yet'; cls = 'no'; }
    return { criteria: C, score, verdict, cls, roundsSeen: allRows.length, rounds: rows.length, games: games.length, enoughData, coverageFrac: coverage ? wTot / coverage : 0 };
  }

  function render() {
    const el = document.getElementById('ready-body');
    const R = evaluate();
    const fails = R.criteria.filter(c => c.pass === false);
    const unknown = R.criteria.filter(c => c.pass === null);
    const next = fails.length ? fails.sort((a, b) => b.weight - a.weight)[0] : (unknown.length ? unknown[0] : null);
    let advice = '';
    if (!R.enoughData) advice = 'Play ' + (30 - R.roundsSeen) + ' more rounds (about ' + Math.ceil((30 - R.roundsSeen) / 12) + ' games) to unlock the benchmark.';
    else if (next && next.pass === false) advice = 'Biggest gap: ' + next.name + ' — ' + next.why;
    else if (next) advice = 'Not yet measured: ' + next.name + ' — ' + next.why;
    else advice = 'Every measured axis is above threshold. Keep one short session a day to hold it; switch the timer on and the training wheels off if they are not already.';
    el.innerHTML =
      '<div class="verdict ' + R.cls + '"><div class="big">' + R.verdict + '</div>' +
        '<div class="gauge"><span style="width:' + Math.round(R.score * 100) + '%"></span></div>' +
        '<p>' + Math.round(R.score * 100) + '% of weighted criteria passed · benchmarked on your last ' + R.rounds + ' rounds and ' + Math.min(5, R.games) + ' games' + (R.coverageFrac < 0.7 && R.enoughData ? ' · only ' + Math.round(R.coverageFrac * 100) + '% of criteria measurable yet' : '') + '</p>' +
        '<p>' + advice + '</p></div>' +
      '<section class="card"><h3>Criteria</h3>' +
        R.criteria.map(c => '<div class="crit"><span class="mark ' + (c.pass === null ? 'na' : c.pass ? 'ok' : 'no') + '">' + (c.pass === null ? '·' : c.pass ? '✓' : '✗') + '</span>' +
          '<div><div class="name">' + c.name + '</div><div class="why">' + c.why + '</div></div>' +
          '<div class="val">' + c.text + '<small>' + (c.pass === null ? 'more data' : 'weight ' + c.weight) + '</small></div></div>').join('') +
      '</section>' +
      '<section class="card"><h3>How to read this</h3>' +
        '<p class="hint">"Interview-ready" needs 85%+ of weighted criteria passed, none of the three core ones failing (decision accuracy, P&L from memory, never the wrong sign), and at least 70% of criteria measurable — which means you have played some timed games, some with "ask my fair" on, and at least two with the ace switch. The thresholds are this app\'s prep standard, chosen from what candidates report being graded on (right side of the quote, sizing that follows edge, P&L recalled correctly, not freezing, not anchoring as the deck depletes); they are not IMC\'s rubric.</p>' +
      '</section>';
  }
  return { evaluate, render };
})();
