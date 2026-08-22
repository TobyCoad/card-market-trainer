/* App shell — screens, settings, the round state machine, keypad, SW updates. */
(function () {
  const el = id => document.getElementById(id);
  const screens = ['home', 'game', 'results', 'stats', 'learn'];
  const APP_VERSION = 1;
  window.APP_VERSION = APP_VERSION;
  let settings = Store.loadSettings();
  let st = null, phase = null, quoteShownAt = 0, timerHandle = null, flashHandle = null;
  let pendingAction = null, fairEst = null, statWindow = 0;
  const fmt = n => (n >= 0 ? '+' : '') + n;
  const SPREADS = { tight: [2, 4], normal: [3, 5], wide: [4, 8] };

  /* ---------- screens ---------- */
  function showScreen(name) {
    for (const s of screens) el('screen-' + s).classList.toggle('active', s === name);
    el('tabbar').classList.toggle('hidden', name === 'game');
    const tab = name === 'stats' ? 'stats' : name === 'learn' ? 'learn' : 'home';
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (name === 'stats') Stats.render(statWindow);
    if (name === 'home') refreshHome();
    maybeShowUpdateBanner();
    window.scrollTo(0, 0);
  }

  /* ---------- settings ---------- */
  function maxRounds() { return Math.floor(52 / settings.cards); }
  function syncSettingsUI() {
    document.querySelectorAll('.seg[data-key]').forEach(seg => {
      const key = seg.dataset.key;
      let cur;
      if (key === 'spreadPreset') cur = Object.keys(SPREADS).find(k => SPREADS[k][0] === settings.spreadMin && SPREADS[k][1] === settings.spreadMax) || 'normal';
      else if (key === 'rounds') cur = settings.rounds >= maxRounds() ? 'max' : String(settings.rounds);
      else cur = String(settings[key]);
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === cur));
    });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(c => { c.checked = !!settings[c.dataset.key]; });
  }
  function wireSettings() {
    document.querySelectorAll('.seg[data-key]').forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const key = seg.dataset.key, v = b.dataset.val;
        if (key === 'spreadPreset') { settings.spreadMin = SPREADS[v][0]; settings.spreadMax = SPREADS[v][1]; }
        else if (key === 'rounds') settings.rounds = v === 'max' ? 99 : +v;
        else if (key === 'aceHigh') settings.aceHigh = v === 'true';
        else settings[key] = +v;
        if (settings.rounds !== 99) settings.rounds = Math.min(settings.rounds, maxRounds());
        Store.saveSettings(settings); syncSettingsUI(); refreshHome();
      });
    });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(c => {
      c.addEventListener('change', () => { settings[c.dataset.key] = c.checked; Store.saveSettings(settings); });
    });
  }
  function refreshHome() {
    const r = settings.rounds >= maxRounds() ? maxRounds() : settings.rounds;
    el('start-desc').textContent = settings.cards + ' cards · ' + r + ' rounds · ace = ' + (settings.aceHigh ? 14 : 1) + ' · €' + settings.bankroll + (settings.timerSec ? ' · ' + settings.timerSec + 's timer' : '');
    const games = Store.loadGames();
    if (!games.length) { el('best-line').textContent = 'No games yet.'; return; }
    const last = games[games.length - 1];
    const best = Math.max.apply(null, games.map(g => g.pnl));
    el('best-line').textContent = games.length + ' games · last: ' + fmt(last.pnl) + ' (' + Math.round(last.decisionAcc * 100) + '% decisions, ' + Math.round(last.pnlAcc * 100) + '% P&L) · best: ' + fmt(best);
  }

  /* ---------- keypad ---------- */
  function keypad(container, opts) {
    let buf = '';
    const disp = document.createElement('div');
    disp.className = 'kp-display placeholder'; disp.textContent = opts.placeholder || '';
    const grid = document.createElement('div'); grid.className = 'keypad';
    const keys = ['7', '8', '9', 'OK', '4', '5', '6', '1', '2', '3', opts.allowNeg ? '−' : (opts.allowDec ? '.' : ''), '0', '⌫'];
    let okBtn = null;
    keys.forEach(k => {
      if (k === '') { const sp = document.createElement('span'); grid.appendChild(sp); return; }
      const b = document.createElement('button'); b.textContent = k;
      if (k === 'OK') { b.className = 'ok'; okBtn = b; }
      if (k === '⌫' || k === '−' || k === '.') b.classList.add('dim');
      b.addEventListener('click', () => {
        if (k === 'OK') { const v = parseFloat(buf.replace('−', '-')); if (Number.isFinite(v)) opts.onSubmit(v); return; }
        if (k === '⌫') buf = buf.slice(0, -1);
        else if (k === '−') buf = buf.startsWith('−') ? buf.slice(1) : '−' + buf;
        else if (k === '.') { if (!buf.includes('.')) buf += buf === '' || buf === '−' ? '0.' : '.'; }
        else if (buf.replace('−', '').length < 6) buf += k;
        disp.textContent = buf || (opts.placeholder || '');
        disp.classList.toggle('placeholder', !buf);
      });
      grid.appendChild(b);
    });
    container.appendChild(disp); container.appendChild(grid);
    if (opts.allowDec) { /* add '.' on the empty slot when negatives are enabled too */ }
    return { focusOk: () => okBtn };
  }

  /* ---------- game flow ---------- */
  function startGame() {
    st = Game.newGame(settings);
    showScreen('game');
    nextRound();
  }
  function renderTop() {
    el('g-round').textContent = 'Round ' + st.round + ' / ' + st.settings.rounds;
    el('g-bank').textContent = '€' + st.bankroll;
    el('g-bank').className = 'bank ' + (st.bankroll >= st.settings.bankroll ? 'pos' : 'neg');
  }
  function renderCards(cards, faceUp, small) {
    const wrap = el('g-cards'); wrap.innerHTML = ''; wrap.className = 'cards' + (small ? ' small' : '');
    cards.forEach(c => {
      const d = document.createElement('div'); d.className = 'playing-card' + (faceUp ? ' up' : '');
      d.innerHTML = '<div class="back"></div><div class="face' + (c.red ? ' red' : '') + '">' + c.label + '<small>= ' + c.value + '</small></div>';
      wrap.appendChild(d);
    });
  }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } el('g-timer').textContent = ''; el('g-timer').classList.remove('warn'); }

  function nextRound() {
    if (st.over) return finishGame();
    const c = Game.deal(st);
    pendingAction = null; fairEst = null;
    renderTop();
    const banner = el('g-banner');
    if (c.ruleChanged) { banner.hidden = false; banner.textContent = 'RULE CHANGE: Ace now counts as ' + (c.aceHigh ? '14' : '1') + ' (was ' + (c.aceHigh ? '1' : '14') + ') — for every card still in the deck.'; }
    else banner.hidden = true;
    renderCards(c.cards, false, false);
    if (st.settings.askFair) phaseFair(); else phaseQuote();
  }

  function phaseFair() {
    phase = 'fair';
    const p = el('g-panel'); p.innerHTML = '<p class="prompt">Before the quote: what is the sum of these ' + st.settings.cards + ' cards worth?</p>';
    keypad(p, { placeholder: 'your fair value', allowDec: true, onSubmit: v => { fairEst = v; phaseQuote(); } });
  }

  function phaseQuote() {
    phase = 'quote';
    const c = st.current, p = el('g-panel');
    p.innerHTML = '<p class="prompt">Market on the sum of ' + st.settings.cards + ' cards</p>' +
      '<div class="quote">' + c.bid + ' at ' + c.ask + '<small>bid · ask</small></div>' +
      '<div class="action-row">' +
        '<button class="btn sell" id="a-sell">Sell @ ' + c.bid + '</button>' +
        '<button class="btn pass" id="a-pass">Pass</button>' +
        '<button class="btn buy" id="a-buy">Buy @ ' + c.ask + '</button></div>';
    el('a-sell').onclick = () => choose('sell');
    el('a-buy').onclick = () => choose('buy');
    el('a-pass').onclick = () => commit('pass', 0, false);
    quoteShownAt = performance.now();
    if (st.settings.timerSec) {
      let left = st.settings.timerSec;
      const t = el('g-timer'); t.textContent = left + 's';
      timerHandle = setInterval(() => {
        left -= 1; t.textContent = left + 's'; t.classList.toggle('warn', left <= 5);
        if (left <= 0) { stopTimer(); commit(pendingAction || 'pass', pendingAction ? 1 : 0, true); }
      }, 1000);
    }
  }

  function choose(action) {
    pendingAction = action; phase = 'size';
    const c = st.current, p = el('g-panel');
    let html = '<p class="prompt">' + (action === 'buy' ? 'Buying at ' + c.ask : 'Selling at ' + c.bid) + ' — how many?</p><div class="size-grid">';
    for (let s = 1; s <= st.settings.maxSize; s++) html += '<button data-s="' + s + '">' + s + '</button>';
    html += '</div><button class="btn ghost wide" id="a-back">back</button>';
    p.innerHTML = html;
    p.querySelectorAll('.size-grid button').forEach(b => b.onclick = () => commit(action, +b.dataset.s, false));
    el('a-back').onclick = () => { pendingAction = null; phaseQuote(); };
  }

  function commit(action, size, timedOut) {
    stopTimer();
    const ms = Math.round(performance.now() - quoteShownAt);
    Game.act(st, action, size, fairEst, ms, timedOut);
    phaseFlash();
  }

  function phaseFlash() {
    phase = 'flash';
    const c = st.current, p = el('g-panel');
    renderCards(c.cards, true, false);
    const what = c.action === 'pass' ? 'You passed.' : (c.action === 'buy' ? 'Bought ' + c.size + ' @ ' + c.ask : 'Sold ' + c.size + ' @ ' + c.bid);
    if (st.settings.flashMs > 0) {
      p.innerHTML = '<p class="prompt">' + what + ' — memorise the cards</p><div class="flash-bar"><span style="animation: shrink ' + st.settings.flashMs + 'ms linear forwards"></span></div>';
      flashHandle = setTimeout(phasePnl, st.settings.flashMs);
    } else {
      p.innerHTML = '<p class="prompt">' + what + '</p><button class="btn wide" id="a-hide">Hide cards &amp; enter P&amp;L</button>';
      el('a-hide').onclick = phasePnl;
    }
  }

  function phasePnl() {
    phase = 'pnl';
    const c = st.current, p = el('g-panel');
    renderCards(c.cards, false, false);
    p.innerHTML = '<p class="prompt">' + (c.action === 'pass' ? 'You passed — what was the sum?' : 'Your P&L this round?') + '</p>';
    keypad(p, { placeholder: c.action === 'pass' ? 'the sum' : 'P&L (can be negative)', allowNeg: c.action !== 'pass', onSubmit: v => {
      if (c.action === 'pass') { c.sumEntered = v; Game.submitPnl(st, 0); c.pnlCorrect = Math.round(v) === c.sum; }
      else Game.submitPnl(st, v);
      phaseFeedback();
    } });
  }

  function phaseFeedback() {
    phase = 'feedback';
    const c = st.current, p = el('g-panel'), s = st.settings;
    renderCards(c.cards, true, true);
    renderTop();
    const actionTxt = { buy: 'buy', sell: 'sell', pass: 'pass' };
    const decisionGood = c.actionCorrect;
    const pnlTxt = c.action === 'pass'
      ? (c.pnlCorrect ? 'Sum ' + c.sum + ' — correct' : 'Sum was ' + c.sum + ', you said ' + c.sumEntered)
      : (c.pnlCorrect ? 'P&L ' + fmt(c.truePnl) + ' — correct' : 'P&L was ' + fmt(c.truePnl) + ', you said ' + fmt(Math.round(c.enteredPnl)));
    let note = '';
    if (c.timedOut) note += 'Timed out. ';
    if (!decisionGood) {
      if (c.correct === 'pass') note += 'Fair ' + c.fair.toFixed(1) + ' sat inside ' + c.bid + '/' + c.ask + ' — no edge, you should have passed. ';
      else if (c.action === 'pass') note += 'There was ' + c.edge.toFixed(1) + ' of edge to ' + c.correct + ' and you passed. ';
      else note += 'Wrong side: fair ' + c.fair.toFixed(1) + ' means ' + c.correct + ', not ' + c.action + '. ';
    } else if (c.action !== 'pass') {
      const d = c.size - c.suggestedSize;
      note += 'Edge ' + c.edge.toFixed(1) + ' (' + (c.edge / Math.max(c.sumSd, 1)).toFixed(2) + ' sd). Edge-scaled size ≈ ' + c.suggestedSize + ', you chose ' + c.size + (Math.abs(d) >= 3 ? (d > 0 ? ' — big for that edge.' : ' — small for that edge.') : ' — fine.') + ' Expected P&L ' + fmt(+c.expPnl.toFixed(1)) + ', realised ' + fmt(c.truePnl) + '. ';
    }
    if (Number.isFinite(c.fairEst)) note += 'Your fair ' + c.fairEst + ' vs true ' + c.fair.toFixed(2) + ' (' + (c.fairEst - c.fair >= 0 ? '+' : '') + (c.fairEst - c.fair).toFixed(1) + '). ';
    let deck = '';
    if (s.showCount) deck = '<div class="fb-note">Deck now: ' + c.postDeck.n + ' cards, sum ' + c.postDeck.sum + ', mean ' + c.postDeck.mean.toFixed(2) + ' → next fair ' + c.fairNext.toFixed(1) + '. Deck sum before this round was ' + c.preDeck.sum + ' over ' + c.preDeck.n + '.</div>';
    p.innerHTML = '<div class="fb"><div class="fb-head ' + (decisionGood && c.pnlCorrect ? 'good' : 'bad') + '">' + (decisionGood ? 'Right call' : 'Wrong call') + ' · ' + (c.pnlCorrect ? 'P&L right' : 'P&L wrong') + '</div>' +
      '<div class="fb-grid"><span class="k">cards</span><b>' + c.cards.map(x => x.label).join(' ') + ' = ' + c.sum + '</b>' +
      '<span class="k">quote</span><b>' + c.bid + ' at ' + c.ask + '</b>' +
      '<span class="k">true fair</span><b>' + c.fair.toFixed(2) + '</b>' +
      '<span class="k">right action</span><b>' + actionTxt[c.correct] + (c.edge ? ' (edge ' + c.edge.toFixed(1) + ')' : '') + '</b>' +
      '<span class="k">you</span><b>' + actionTxt[c.action] + (c.size ? ' × ' + c.size : '') + ' · ' + (c.decisionMs / 1000).toFixed(1) + 's</b>' +
      '<span class="k">result</span><b class="' + (c.pnlCorrect ? 'pos' : 'neg') + '">' + pnlTxt + '</b></div>' +
      (note ? '<div class="fb-note">' + note + '</div>' : '') + deck + '</div>' +
      '<button class="btn wide" id="a-next">' + (st.over ? 'See results' : 'Next round') + '</button>';
    el('a-next').onclick = nextRound;
  }

  function finishGame() {
    const sum = Game.summary(st);
    Store.saveGame(sum);
    const b = el('results-body');
    const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
    const num = (x, d) => x == null ? '–' : (+x).toFixed(d == null ? 1 : d);
    b.innerHTML = '<section class="card"><div class="kpis">' +
      '<div><b class="' + (sum.pnl >= 0 ? 'pos' : 'neg') + '">' + fmt(sum.pnl) + '</b><span>P&L' + (sum.bust ? ' (bust)' : '') + '</span></div>' +
      '<div><b>' + pct(sum.decisionAcc) + '</b><span>decisions right</span></div>' +
      '<div><b>' + pct(sum.pnlAcc) + '</b><span>P&L calcs right</span></div>' +
      '<div><b>' + num(sum.avgMs / 1000) + 's</b><span>avg decision</span></div>' +
      '<div><b>' + num(sum.expPnl, 0) + '</b><span>expected P&L of your trades</span></div>' +
      '<div><b>' + (sum.sizeEdgeCorr == null ? '–' : num(sum.sizeEdgeCorr, 2)) + '</b><span>size–edge corr</span></div>' +
      '</div>' +
      (sum.fairAbsErr != null ? '<p class="hint">Fair-value error: ' + num(sum.fairAbsErr) + ' avg (late rounds ' + num(sum.fairAbsErrLate) + '). Max deck drift from baseline this game: ' + num(sum.driftMax) + '.</p>' : '') +
      (sum.timeouts ? '<p class="hint">' + sum.timeouts + ' timeouts.</p>' : '') +
      '</section><section class="card"><h3>Round log</h3><div class="tbl-wrap"><table class="tbl"><tr><th>#</th><th>cards</th><th>sum</th><th>fair</th><th>quote</th><th>right</th><th>you</th><th>P&L</th><th>calc</th></tr>' +
      sum.log.map(r => '<tr><td>' + r.round + (r.ruleChanged ? '*' : '') + '</td><td>' + r.cards.join(' ') + '</td><td>' + r.sum + '</td><td>' + r.fair.toFixed(1) + '</td><td>' + r.bid + '/' + r.ask + '</td><td>' + r.correct + '</td><td class="' + (r.actionCorrect ? 'pos' : 'neg') + '">' + r.action + (r.size ? '×' + r.size : '') + '</td><td class="' + (r.truePnl >= 0 ? 'pos' : 'neg') + '">' + fmt(r.truePnl) + '</td><td class="' + (r.pnlCorrect ? 'pos' : 'neg') + '">' + (r.pnlCorrect ? '✓' : '✗') + '</td></tr>').join('') +
      '</table></div></section>';
    showScreen('results');
  }

  /* ---------- updates / SW ---------- */
  let updateReady = false;
  function maybeShowUpdateBanner() { el('update-banner').hidden = !(updateReady && !el('screen-game').classList.contains('active')); }
  async function checkForUpdate() {
    try { const r = await fetch('./version.json', { cache: 'no-store' }); const j = await r.json(); if (j.v && j.v !== APP_VERSION) { updateReady = true; maybeShowUpdateBanner(); } } catch (e) { }
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
  el('btn-quit').onclick = () => { if (confirm('Quit this game? It will not be saved.')) { stopTimer(); if (flashHandle) clearTimeout(flashHandle); showScreen('home'); } };
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => showScreen(b.dataset.tab));
  el('seg-stat-window').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    statWindow = +b.dataset.w; el('seg-stat-window').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); Stats.render(statWindow);
  });
  el('update-banner').addEventListener('click', applyUpdate);
  showScreen('home');
  checkForUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => { });
})();
