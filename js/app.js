/* App shell — screens, settings, the round state machine, keypad, SW updates. */
(function () {
  const el = id => document.getElementById(id);
  const screens = ['home', 'game', 'results', 'stats', 'ready', 'learn'];
  const APP_VERSION = 4;
  window.APP_VERSION = APP_VERSION;
  let settings = Store.loadSettings();
  let st = null, quoteShownAt = 0, timerHandle = null, statWindow = 0;
  let handHandle = null, pnlHandle = null, pnlShownAt = 0;
  let pendingSide = null, probEst = null;
  const clock = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const money = n => '€' + (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmt = n => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString();
  const pct = f => Math.round(f * 100) + '%';

  /* ---------- screens ---------- */
  function showScreen(name) {
    for (const s of screens) el('screen-' + s).classList.toggle('active', s === name);
    el('tabbar').classList.toggle('hidden', name === 'game');
    const tab = ['stats', 'learn', 'ready'].includes(name) ? name : 'home';
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (name === 'stats') Stats.render(statWindow);
    if (name === 'ready') Ready.render();
    if (name === 'home') refreshHome();
    maybeShowUpdateBanner();
    window.scrollTo(0, 0);
  }

  /* ---------- settings ---------- */
  function syncSettingsUI() {
    document.querySelectorAll('.seg[data-key]').forEach(seg => {
      const key = seg.dataset.key;
      const cur = String(settings[key]);
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === cur));
    });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(c => { c.checked = !!settings[c.dataset.key]; });
    el('row-tie').style.display = settings.fullDeck ? '' : 'none';
  }
  function wireSettings() {
    document.querySelectorAll('.seg[data-key]').forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const key = seg.dataset.key, v = b.dataset.val;
        if (v === 'true' || v === 'false') settings[key] = (v === 'true');
        else if (key === 'tieRule') settings[key] = v;
        else settings[key] = +v;
        Store.saveSettings(settings); syncSettingsUI(); refreshHome();
      });
    });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(c => {
      c.addEventListener('change', () => { settings[c.dataset.key] = c.checked; Store.saveSettings(settings); refreshHome(); });
    });
  }
  function refreshHome() {
    const rounds = (settings.fullDeck ? 52 : 13) - 1;
    el('start-desc').textContent = (settings.fullDeck ? '52 cards' : '13 cards') + ' · ' + rounds + ' bets · ' +
      money(settings.bankroll) + (settings.hideBankroll ? ' · bankroll hidden' : '') +
      (settings.timerSec ? ' · ' + settings.timerSec + 's a bet' : '') +
      (settings.handSec ? ' · ' + clock(settings.handSec) + ' hand' : '') +
      (settings.pnlSec ? ' · ' + settings.pnlSec + 's for P&L' : '');
    el('btn-interview').classList.toggle('on', Store.isInterviewMode(settings));
    const R = Ready.evaluate(), badge = el('ready-badge');
    badge.className = 'ready-badge ' + (R.enoughData ? R.cls : '');
    badge.textContent = R.enoughData ? R.verdict + ' · ' + Math.round(R.score * 100) + '%'
                                     : 'readiness: ' + R.gamesSeen + '/5 games';
    const games = Store.loadGames();
    if (!games.length) { el('best-line').textContent = 'No hands yet.'; return; }
    const last = games[games.length - 1];
    const best = Math.max.apply(null, games.map(g => g.bankrollEnd));
    el('best-line').textContent = games.length + ' hands · last: ' + money(last.bankrollEnd) +
      ' (' + Math.round(last.sideAcc * 100) + '% right side, P&L ' + (last.pnlCorrect ? 'right' : 'wrong') + ') · best: ' + money(best);
  }

  /* ---------- keypad ---------- */
  function keypad(container, opts) {
    let buf = '';
    const disp = document.createElement('div');
    disp.className = 'kp-display placeholder'; disp.textContent = opts.placeholder || '';
    const grid = document.createElement('div'); grid.className = 'keypad';
    const keys = ['7', '8', '9', 'OK', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];
    keys.forEach(k => {
      const b = document.createElement('button'); b.textContent = k;
      if (k === 'OK') b.className = 'ok';
      if (k === '⌫' || k === '.') b.classList.add('dim');
      b.addEventListener('click', () => {
        if (k === 'OK') { const v = parseFloat(buf); if (Number.isFinite(v)) opts.onSubmit(v); return; }
        if (k === '⌫') buf = buf.slice(0, -1);
        else if (k === '.') { if (!buf.includes('.')) buf += buf === '' ? '0.' : '.'; }
        else if (buf.replace('.', '').length < 8) buf += k;
        disp.textContent = buf ? (opts.suffix ? buf + opts.suffix : buf) : (opts.placeholder || '');
        disp.classList.toggle('placeholder', !buf);
      });
      grid.appendChild(b);
    });
    container.appendChild(disp); container.appendChild(grid);
    /* value() is what a clock submits on your behalf when it runs out — null if you typed nothing. */
    return { value: () => { const v = parseFloat(buf); return Number.isFinite(v) ? v : null; } };
  }

  /* ---------- rendering ---------- */
  function renderCard(c, faceUp) {
    return '<div class="playing-card' + (faceUp ? ' up' : '') + '"><div class="back"></div>' +
      '<div class="face' + (c.red ? ' red' : '') + '">' + c.label + '</div></div>';
  }
  function renderTop() {
    const rounds = st.deck.length - 1;
    el('g-round').textContent = 'Bet ' + Math.min(st.log.length + 1, rounds) + ' / ' + rounds;
    const b = el('g-bank');
    if (settings.hideBankroll) { b.textContent = '€ ? ? ?'; b.className = 'bank hidden-bank'; }
    else { b.textContent = money(st.bankroll); b.className = 'bank ' + (st.bankroll >= st.start ? 'pos' : 'neg'); }
  }
  function renderSeen() {
    const wrap = el('g-seen');
    if (settings.hideSeen) { wrap.innerHTML = '<span class="seen-hidden">cards turned are hidden</span>'; return; }
    const seen = st.deck.slice(0, st.pos + 1);
    wrap.innerHTML = seen.map(c => '<span class="chip' + (c.red ? ' red' : '') + '">' + c.label + '</span>').join('');
  }
  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    el('g-timer').textContent = ''; el('g-timer').classList.remove('warn');
  }
  function stopHandClock() {
    if (handHandle) { clearInterval(handHandle); handHandle = null; }
    el('g-hand').textContent = ''; el('g-hand').className = 'hand-clock';
  }
  function stopPnlClock() {
    if (pnlHandle) { clearInterval(pnlHandle); pnlHandle = null; }
  }
  function stopAllClocks() { stopTimer(); stopHandClock(); stopPnlClock(); }

  /* All three clocks run off a wall-clock deadline rather than a per-tick counter: a
   * backgrounded tab throttles setInterval, and a clock that quietly pauses when the phone
   * dims is not a clock. Ticking at 250ms just keeps the display honest. */
  function countdown(seconds, paint, onExpire) {
    const deadline = performance.now() + seconds * 1000;
    const left = () => Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    paint(left());
    return setInterval(() => {
      const s = left();
      paint(s);
      if (s <= 0) onExpire();
    }, 250);
  }

  /* The clock for the whole hand. On expiry you are stopped mid-deck and asked for your
   * number anyway, which is the failure mode worth rehearsing. */
  function startHandClock() {
    if (!settings.handSec) return;
    const h = el('g-hand');
    handHandle = countdown(settings.handSec, s => {
      h.textContent = clock(s);
      h.className = 'hand-clock' + (s <= 30 ? ' warn' : (s <= 60 ? ' low' : ''));
    }, () => {
      stopTimer(); stopHandClock();
      if (!st.over) Game.endEarly(st);        // already over = you beat the clock on the last card
      finishHand();
    });
  }

  /* ---------- game flow ---------- */
  function startGame() {
    st = Game.newGame(settings);
    showScreen('game');
    startHandClock();
    nextRound();
  }
  function nextRound() {
    if (st.over) return finishHand();
    const c = Game.deal(st);
    pendingSide = null; probEst = null;
    renderTop(); renderSeen();
    el('g-cards').innerHTML = renderCard(c.showing, true) + '<div class="next-slot">?</div>';
    if (settings.askProb) phaseProb(); else phaseSide();
  }

  function hintLine() {
    if (!settings.showKelly) return '';
    const k = st.current.k;
    return '<p class="hint-inline">' + k.n + ' unseen · ' + k.h + ' higher · ' + k.l + ' lower' +
      (k.t ? ' · ' + k.t + ' equal' : '') + ' → Kelly ' + (k.side ? pct(k.f) + ' on ' + k.side : 'no edge, pass') + '</p>';
  }

  function phaseProb() {
    const p = el('g-panel');
    p.innerHTML = '<p class="prompt">Before you size: what is your probability the next card wins your side?</p>' + hintLine();
    keypad(p, { placeholder: 'probability %', suffix: '%', onSubmit: v => { probEst = v / 100; phaseSide(); } });
  }

  function phaseSide() {
    const p = el('g-panel');
    p.innerHTML = '<p class="prompt">Higher or lower than ' + st.current.showing.label + '?</p>' + hintLine() +
      '<div class="action-row">' +
        '<button class="btn sell" id="a-lower">Lower</button>' +
        '<button class="btn pass" id="a-pass">Pass</button>' +
        '<button class="btn buy" id="a-higher">Higher</button></div>';
    el('a-lower').onclick = () => chooseSide('lower');
    el('a-higher').onclick = () => chooseSide('higher');
    el('a-pass').onclick = () => commit('pass', 0, false);
    quoteShownAt = performance.now();
    if (settings.timerSec) {
      const t = el('g-timer');
      timerHandle = countdown(settings.timerSec,
        s => { t.textContent = s + 's'; t.classList.toggle('warn', s <= 5); },
        () => { stopTimer(); commit(pendingSide || 'pass', 0, true); });
    }
  }

  function chooseSide(side) {
    pendingSide = side;
    const p = el('g-panel');
    const presets = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1];
    p.innerHTML = '<p class="prompt">' + (side === 'higher' ? 'Higher' : 'Lower') + ' — what fraction of your bankroll?</p>' + hintLine() +
      '<div class="size-grid">' + presets.map(f => '<button data-f="' + f + '">' + pct(f) + '</button>').join('') + '</div>' +
      '<button class="btn ghost wide" id="a-custom">custom %</button>' +
      '<button class="btn ghost wide" id="a-back">back</button>';
    p.querySelectorAll('.size-grid button').forEach(b => b.onclick = () => commit(side, +b.dataset.f, false));
    el('a-back').onclick = () => phaseSide();
    el('a-custom').onclick = () => {
      p.innerHTML = '<p class="prompt">' + (side === 'higher' ? 'Higher' : 'Lower') + ' — fraction of bankroll</p>' + hintLine();
      keypad(p, { placeholder: 'percent of bankroll', suffix: '%', onSubmit: v => commit(side, Math.max(0, Math.min(100, v)) / 100, false) });
    };
  }

  function commit(side, frac, timedOut) {
    stopTimer();
    const ms = Math.round(performance.now() - quoteShownAt);
    const c = Game.bet(st, side, frac, ms, timedOut);
    c.probEst = probEst;
    phaseReveal(c);
  }

  function phaseReveal(c) {
    renderSeen();
    el('g-cards').innerHTML = renderCard(c.showing, true) + renderCard(c.next, true);
    const res = c.result === 'win' ? 'WON' : (c.result === 'lose' ? 'LOST' : (c.side === 'pass' ? 'PASSED' : 'PUSH'));
    const cls = c.result === 'win' ? 'good' : (c.result === 'lose' ? 'bad' : '');
    let note = '';
    if (c.side !== 'pass') note = 'You staked ' + pct(c.frac) + (settings.hideBankroll ? '' : ' = ' + money(c.stake)) + ' on ' + c.side + '.';
    else note = 'You passed.';
    let coach = '';
    if (settings.showKelly || !settings.hideBankroll) {
      coach = '<div class="fb-note">Kelly: ' + (c.k.side ? pct(c.k.f) + ' on ' + c.k.side : 'pass, no edge') +
        ' (' + c.k.h + ' higher, ' + c.k.l + ' lower of ' + c.k.n + ')</div>';
    }
    const last = st.over;
    el('g-panel').innerHTML = '<div class="fb"><div class="fb-head ' + cls + '">' + c.next.label + ' — ' + res + '</div>' +
      '<div class="fb-note">' + note + '</div>' + coach + '</div>' +
      '<button class="btn wide" id="a-next">' + (last ? 'Done — state your P&L' : 'Next card') + '</button>';
    el('a-next').onclick = () => { if (last) finishHand(); else nextRound(); };
  }

  /* ---------- end of hand: state your own P&L ---------- */
  function finishHand() {
    stopTimer(); stopHandClock();
    el('g-cards').innerHTML = '';
    renderSeen();
    el('g-round').textContent = st.clockExpired ? 'Time — ' + st.log.length + ' bets in' : 'Hand complete';
    const p = el('g-panel');
    p.innerHTML = (st.clockExpired ? '<p class="prompt urgent">Time is up. You are stopped here.</p>' : '') +
      '<p class="prompt">You started with ' + money(st.start) +
      '. What is your bankroll now? No scrolling back — state it from your own running total.</p>' +
      (settings.pnlSec ? '<div class="pnl-clock" id="pnl-clock"></div>' : '');
    let done = false;
    const submit = (v, timedOut) => {
      if (done) return; done = true;
      stopPnlClock();
      Game.submitFinal(st, v, performance.now() - pnlShownAt, timedOut);
      showResults();
    };
    const kp = keypad(p, { placeholder: 'final bankroll', onSubmit: v => submit(v, false) });
    pnlShownAt = performance.now();
    if (settings.pnlSec) {
      const c = el('pnl-clock');
      pnlHandle = countdown(settings.pnlSec,
        s => { c.textContent = s + 's to answer'; c.classList.toggle('warn', s <= 5); },
        () => submit(kp.value(), true));           // whatever you had typed, or nothing
    }
  }

  function showResults() {
    const sum = Game.summary(st);
    Store.saveGame(sum);
    const b = el('results-body');
    const took = sum.pnlMs == null ? '' : ' · answered in ' + (sum.pnlMs / 1000).toFixed(1) + 's';
    const pnlRow = sum.statedFinal == null
      ? '<div class="verdict no"><div class="big">No answer</div><p>The clock ran out before you gave a number — actual ' +
        money(sum.bankrollEnd) + '. In the room that reads as having lost track.</p></div>'
      : sum.pnlCorrect
      ? '<div class="verdict ok"><div class="big">P&L right</div><p>You said ' + money(sum.statedFinal) + ' — actual ' +
        money(sum.bankrollEnd) + took + (sum.pnlTimedOut ? ' (on the buzzer)' : '') + '</p></div>'
      : '<div class="verdict no"><div class="big">P&L wrong</div><p>You said ' + money(sum.statedFinal) + ' — actual ' + money(sum.bankrollEnd) +
        ' (out by ' + money(sum.pnlAbsErr) + ', ' + Math.round(sum.pnlRelErr * 100) + '%)' + took + '</p></div>';
    const clockRow = sum.clockExpired
      ? '<p class="hint warn-hint">Hand clock ran out with ' + (sum.roundsAvailable - sum.rounds) + ' of ' +
        sum.roundsAvailable + ' bets unplayed. Sizing takes seconds once you trust |h−l|/n — the time goes on second-guessing.</p>'
      : (sum.handMs ? '<p class="hint">Hand took ' + clock(Math.round(sum.handMs / 1000)) +
        (sum.settings.handSec ? ' of ' + clock(sum.settings.handSec) : '') + '.</p>' : '');
    const num = (x, d) => x == null ? '–' : (+x).toFixed(d == null ? 1 : d);
    b.innerHTML = pnlRow +
      '<section class="card"><div class="kpis">' +
      '<div><b class="' + (sum.pnl >= 0 ? 'pos' : 'neg') + '">' + fmt(sum.pnl) + '</b><span>P&L' + (sum.bust ? ' (bust)' : '') + '</span></div>' +
      '<div><b>' + Math.round(sum.sideAcc * 100) + '%</b><span>right side</span></div>' +
      '<div><b>' + num(sum.growth, 2) + '</b><span>doublings</span></div>' +
      '<div><b>' + Math.round((sum.meanFracErr || 0) * 100) + '%</b><span>avg sizing error</span></div>' +
      '<div><b>' + (sum.certainCaptured == null ? '–' : Math.round(sum.certainCaptured * 100) + '%') + '</b><span>certain wins taken (' + sum.certainCount + ')</span></div>' +
      '<div><b>' + num(sum.growthGiveUp, 2) + '</b><span>doublings given up</span></div>' +
      '</div>' +
      (sum.passCount ? '<p class="hint">Zero-edge rounds: ' + sum.passCount + ', passed correctly ' + Math.round(sum.passDiscipline * 100) + '%.</p>' : '') +
      (sum.timeouts ? '<p class="hint warn-hint">' + sum.timeouts + ' decision' + (sum.timeouts > 1 ? 's' : '') +
        ' timed out — a timeout is scored as a pass, and in the room it is a freeze.</p>' : '') +
      clockRow +
      '</section>' +
      '<section class="card"><h3>Round log</h3><div class="tbl-wrap"><table class="tbl">' +
      '<tr><th>#</th><th>card</th><th>h/l</th><th>you</th><th>Kelly</th><th>next</th><th>P&L</th><th>bank</th></tr>' +
      sum.log.map(r => '<tr><td>' + r.round + '</td><td>' + r.showing + '</td><td>' + r.h + '/' + r.l + '</td>' +
        '<td class="' + (r.sideCorrect ? 'pos' : 'neg') + '">' + (r.side === 'pass' ? 'pass' : r.side.slice(0, 2) + ' ' + Math.round(r.frac * 100) + '%') + '</td>' +
        '<td>' + (r.kSide ? r.kSide.slice(0, 2) + ' ' + Math.round(r.kFrac * 100) + '%' : 'pass') + '</td>' +
        '<td>' + r.next + '</td><td class="' + (r.pnl >= 0 ? 'pos' : 'neg') + '">' + fmt(r.pnl) + '</td>' +
        '<td>' + Math.round(r.bankrollAfter) + '</td></tr>').join('') +
      '</table></div></section>';
    showScreen('results');
  }

  /* ---------- updates / SW ---------- */
  let updateReady = false;
  function maybeShowUpdateBanner() { el('update-banner').hidden = !(updateReady && !el('screen-game').classList.contains('active')); }
  async function checkForUpdate() {
    try { const r = await fetch('./version.json', { cache: 'no-store' }); const j = await r.json();
      if (j.v && j.v !== APP_VERSION) { updateReady = true; maybeShowUpdateBanner(); } } catch (e) { }
  }
  function applyUpdate() {
    const banner = el('update-banner'); banner.textContent = 'Updating…';
    let done = false; const finish = () => { if (!done) { done = true; location.reload(); } };
    if (!('serviceWorker' in navigator)) return finish();
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return finish();
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'activated') finish(); }); });
      reg.update().catch(finish); setTimeout(finish, 8000);
    }).catch(finish);
  }

  /* ---------- boot ---------- */
  wireSettings(); syncSettingsUI();
  el('btn-start').onclick = startGame;
  el('btn-again').onclick = startGame;
  el('btn-home').onclick = () => showScreen('home');
  el('btn-quit').onclick = () => { if (confirm('Quit this hand? It will not be saved.')) { stopAllClocks(); showScreen('home'); } };
  el('btn-interview').onclick = () => {
    const on = Store.isInterviewMode(settings);
    Object.keys(Store.INTERVIEW).forEach(k => { settings[k] = on ? Store.DEFAULTS[k] : Store.INTERVIEW[k]; });
    Store.saveSettings(settings); syncSettingsUI(); refreshHome();
  };
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => showScreen(b.dataset.tab));
  el('seg-stat-window').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    statWindow = +b.dataset.w;
    el('seg-stat-window').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    Stats.render(statWindow);
  });
  el('update-banner').addEventListener('click', applyUpdate);
  showScreen('home');
  checkForUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => { });
})();
