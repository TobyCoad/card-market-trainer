/* Readiness benchmark for the higher/lower betting game.
 * Thresholds are this app's prep standard, not IMC's rubric. */
const Ready = (function () {
  const GAMES_WINDOW = 8, MIN_GAMES = 5;
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
  const num = (x, d) => (x == null || Number.isNaN(x)) ? '–' : (+x).toFixed(d == null ? 2 : d);

  function evaluate() {
    const all = Store.loadGames();
    const games = all.slice(-GAMES_WINDOW);
    const rows = games.flatMap(g => g.log.map(r => Object.assign({ gs: g.settings }, r)));
    const bets = rows.filter(r => r.side !== 'pass');
    const cert = rows.filter(r => r.wasCertain);
    const zero = rows.filter(r => r.kSide === null);
    const bigEdge = bets.filter(r => r.kFrac >= 0.5);
    const timed = rows.filter(r => r.decisionMs != null && r.gs.timerSec > 0);
    const hidden = games.filter(g => g.settings.hideBankroll);
    const noWheels = games.filter(g => !g.settings.showKelly);
    const handClocked = games.filter(g => g.settings.handSec > 0);
    const pnlClocked = games.filter(g => g.settings.pnlSec > 0 && g.pnlMs != null);
    const interview = games.filter(g => g.settings.hideBankroll && !g.settings.showKelly &&
                                        g.settings.timerSec > 0 && g.settings.handSec > 0 && g.settings.pnlSec > 0);

    const C = [];
    const add = (key, name, why, val, text, pass, w) => C.push({ key, name, why, val, text, pass, weight: w });

    const pnlAcc = mean(hidden.map(g => g.pnlCorrect ? 1 : 0));
    add('pnl', 'Final P&L stated correctly', 'The number the interviewer actually asks for, with the bankroll hidden. Target 80%+ of hands.',
        pnlAcc, pct(pnlAcc) + ' of ' + hidden.length + ' hidden hands', hidden.length >= 4 ? pnlAcc >= 0.8 : null, 3);

    const side = mean(rows.map(r => r.sideCorrect ? 1 : 0));
    add('side', 'Right side of the bet', 'Betting the majority side, which is pure counting. Target 98%+ — this should be near perfect.',
        side, pct(side), rows.length >= 24 ? side >= 0.98 : null, 3);

    const certCap = mean(cert.map(r => r.capturedCertain ? 1 : 0));
    add('certain', 'Certain wins taken in full', 'When one side is impossible the stake is 100% and the win is free. Target 95%+.',
        certCap, pct(certCap) + ' of ' + cert.length, cert.length >= 8 ? certCap >= 0.95 : null, 3);

    const zeroOK = mean(zero.map(r => r.frac === 0 ? 1 : 0));
    add('pass', 'Passing at zero edge', 'With equal counts either side there is no edge and the right stake is nothing. Target 90%+.',
        zeroOK, pct(zeroOK) + ' of ' + zero.length, zero.length >= 4 ? zeroOK >= 0.9 : null, 2);

    const sizeErr = mean(bets.map(r => r.fracError));
    add('sizing', 'Stake close to Kelly', 'Average gap between your stake and |h-l|/n. Target within 8 percentage points.',
        sizeErr, pct(sizeErr) + ' avg gap', bets.length >= 20 ? sizeErr <= 0.08 : null, 2);

    const bigErr = mean(bigEdge.map(r => r.fracError));
    add('bigsizing', 'Stake close to Kelly on big edges', 'Where the money is. Target within 10 points when Kelly says 50%+.',
        bigErr, pct(bigErr) + ' avg gap over ' + bigEdge.length, bigEdge.length >= 8 ? bigErr <= 0.10 : null, 2);

    const give = mean(games.map(g => g.growthGiveUp));
    add('growth', 'Growth given up', 'Doublings sacrificed per hand versus optimal sizing. Target under 0.5.',
        give, num(give) + ' doublings/hand', games.length >= 4 ? give <= 0.5 : null, 2);

    const spd = mean(timed.map(r => r.decisionMs));
    add('speed', 'Speed under a clock', 'Average decision time in timed hands. Target under 12 seconds.',
        spd, timed.length ? num(spd / 1000, 1) + 's' : 'no timed hands', timed.length >= 20 ? spd <= 12000 : null, 2);

    const to = rows.filter(r => r.timedOut).length;
    add('timeouts', 'No timeouts', 'A timeout is a frozen candidate. Target zero.', to, to + ' timeouts',
        timed.length >= 20 ? to === 0 : null, 1);

    const noted = games.filter(g => g.notedRounds > 0);
    const noteAcc = mean(noted.map(g => g.notesAccurate));
    add('running', 'Running total kept accurately', 'Checkpoints you wrote down that were inside the accepted band. Target 95%+ — an error early poisons every round after it.',
        noteAcc, noted.length ? pct(noteAcc) + ' of checkpoints over ' + noted.length + ' hands' : 'scratchpad off',
        noted.length >= 4 ? noteAcc >= 0.95 : null, 3);

    const pnlSpeed = mean(pnlClocked.map(g => g.pnlMs));
    add('pnlspeed', 'P&L stated fast', 'You should have the running total already, not be reconstructing it. Target under 8 seconds.',
        pnlSpeed, pnlClocked.length ? num(pnlSpeed / 1000, 1) + 's over ' + pnlClocked.length + ' hands' : 'no clocked answers',
        pnlClocked.length >= 4 ? pnlSpeed <= 8000 : null, 2);

    const finished = mean(handClocked.map(g => g.clockExpired ? 0 : 1));
    add('handclock', 'Finished inside the hand clock', 'Getting cut off mid-deck means you are deliberating too long per card. Target 90%+.',
        finished, handClocked.length ? pct(finished) + ' of ' + handClocked.length + ' clocked hands' : 'no clocked hands',
        handClocked.length >= 4 ? finished >= 0.9 : null, 2);

    add('realism', 'Practised under interview conditions', 'Bankroll hidden, no Kelly hint, all three clocks running. Target at least 4 of your recent hands.',
        interview.length, interview.length + '/' + games.length + ' hands',
        games.length >= 4 ? interview.length >= 4 : null, 1);

    const scored = C.filter(c => c.pass !== null);
    const wTot = scored.reduce((a, c) => a + c.weight, 0);
    const wPass = scored.filter(c => c.pass).reduce((a, c) => a + c.weight, 0);
    const coverage = C.reduce((a, c) => a + c.weight, 0);
    const score = wTot ? wPass / wTot : 0;
    const enough = all.length >= MIN_GAMES;
    const coreFail = C.some(c => ['pnl', 'side', 'certain'].includes(c.key) && c.pass === false);
    let verdict, cls;
    if (!enough) { verdict = 'Not enough hands yet'; cls = 'no'; }
    else if (score >= 0.85 && !coreFail && wTot >= coverage * 0.7) { verdict = 'Interview-ready'; cls = 'ok'; }
    else if (score >= 0.65 && !coreFail) { verdict = 'Nearly there'; cls = 'near'; }
    else { verdict = 'Not yet'; cls = 'no'; }
    return { criteria: C, score, verdict, cls, gamesSeen: all.length, enoughData: enough,
             coverageFrac: coverage ? wTot / coverage : 0 };
  }

  function render() {
    const R = evaluate();
    const fails = R.criteria.filter(c => c.pass === false).sort((a, b) => b.weight - a.weight);
    const unknown = R.criteria.filter(c => c.pass === null);
    let advice;
    if (!R.enoughData) advice = 'Play ' + (5 - R.gamesSeen) + ' more hands to unlock the benchmark.';
    else if (fails.length) advice = 'Biggest gap: ' + fails[0].name + ' — ' + fails[0].why;
    else if (unknown.length) advice = 'Not yet measured: ' + unknown[0].name + ' — ' + unknown[0].why;
    else advice = 'Every measured axis is above threshold. Keep one hand a day with the bankroll hidden and the timer on.';
    document.getElementById('ready-body').innerHTML =
      '<div class="verdict ' + R.cls + '"><div class="big">' + R.verdict + '</div>' +
        '<div class="gauge"><span style="width:' + Math.round(R.score * 100) + '%"></span></div>' +
        '<p>' + Math.round(R.score * 100) + '% of weighted criteria passed · last ' + Math.min(8, R.gamesSeen) + ' hands' +
        (R.coverageFrac < 0.7 && R.enoughData ? ' · only ' + Math.round(R.coverageFrac * 100) + '% of criteria measurable yet' : '') + '</p>' +
        '<p>' + advice + '</p></div>' +
      '<section class="card"><h3>Criteria</h3>' +
        R.criteria.map(c => '<div class="crit"><span class="mark ' + (c.pass === null ? 'na' : c.pass ? 'ok' : 'no') + '">' +
          (c.pass === null ? '·' : c.pass ? '✓' : '✗') + '</span>' +
          '<div><div class="name">' + c.name + '</div><div class="why">' + c.why + '</div></div>' +
          '<div class="val">' + c.text + '<small>' + (c.pass === null ? 'more data' : 'weight ' + c.weight) + '</small></div></div>').join('') +
      '</section>' +
      '<section class="card"><h3>How to read this</h3><p class="hint">"Interview-ready" needs 85%+ of weighted criteria, none of the three core ones failing ' +
        '(stating your P&amp;L, picking the right side, taking the certain wins), and at least 70% of criteria measurable — which means hands played in ' +
        '<b>Interview mode</b>: bankroll hidden, Kelly hint off, all three clocks on. Thresholds are this app\'s prep standard, not IMC\'s rubric.</p></section>';
  }
  return { evaluate, render };
})();
