/* Game engine — the "card sum market" game.
 * Each round n cards are dealt face down from a 52-card deck (no replacement) and a
 * market is quoted on their sum. Fair value = n x mean of the cards still in the deck
 * (the dealt cards are a random sample of it). You buy above / sell below / pass,
 * pick a size, the cards flash, then you state your own P&L from memory. */
const Game = (function () {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  function rnd() { return Math.random(); }
  function randn() { // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function cardValue(rank, aceHigh) { return rank === 1 ? (aceHigh ? 14 : 1) : rank; }
  function cardLabel(c) { return (RANK_LABEL[c.rank] || String(c.rank)) + c.suit; }

  function makeDeck() {
    const d = [];
    for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) d.push({ rank, suit, red: suit === SUITS[1] || suit === SUITS[2] });
    return shuffle(d);
  }
  function deckStats(deck, aceHigh) {
    const n = deck.length;
    if (!n) return { n: 0, sum: 0, mean: 0, sd: 0 };
    let sum = 0, sq = 0;
    for (const c of deck) { const v = cardValue(c.rank, aceHigh); sum += v; sq += v * v; }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    return { n, sum, mean, sd };
  }

  function newGame(settings) {
    const s = Object.assign({}, settings);
    const maxRounds = Math.floor(52 / s.cards);
    s.rounds = Math.max(1, Math.min(s.rounds, maxRounds));
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      settings: s,
      deck: makeDeck(),
      aceHigh: !!s.aceHigh,
      aceSwitchRound: s.aceSwitch ? Math.max(2, Math.ceil(s.rounds / 2)) : 0,
      round: 0,
      bankroll: s.bankroll,
      log: [],
      current: null,
      over: false,
    };
  }

  /* Deal the next round: draw cards, compute the (pre-draw) fair value and a quote. */
  function deal(st) {
    const s = st.settings;
    st.round += 1;
    let ruleChanged = false;
    if (st.aceSwitchRound && st.round === st.aceSwitchRound) { st.aceHigh = !st.aceHigh; ruleChanged = true; }
    const pre = deckStats(st.deck, st.aceHigh);               // everything you can know before the draw
    const cards = st.deck.splice(0, s.cards).map(c => Object.assign({}, c, { value: cardValue(c.rank, st.aceHigh), label: cardLabel(c) }));
    const fair = s.cards * pre.mean;
    const sumSd = Math.sqrt(s.cards) * pre.sd;
    const spread = s.spreadMin + Math.floor(rnd() * (s.spreadMax - s.spreadMin + 1));
    const offset = randn() * s.mispriceSd;
    const bid = Math.round(fair + offset - spread / 2);
    const ask = bid + spread;
    let correct = 'pass', edge = 0;
    if (fair > ask) { correct = 'buy'; edge = fair - ask; }
    else if (fair < bid) { correct = 'sell'; edge = bid - fair; }
    const sum = cards.reduce((a, c) => a + c.value, 0);
    st.current = {
      round: st.round, ruleChanged, aceHigh: st.aceHigh,
      cards, sum, fair, sumSd, preDeck: pre, bid, ask, spread,
      correct, edge,
      suggestedSize: edge > 0 ? Math.max(1, Math.min(s.maxSize, Math.ceil(edge / Math.max(sumSd, 1) * s.maxSize))) : 0,
      fairEst: null, action: null, size: 0, decisionMs: null, timedOut: false,
      truePnl: 0, expPnl: 0, enteredPnl: null, pnlCorrect: null, actionCorrect: null,
    };
    return st.current;
  }

  function act(st, action, size, fairEst, decisionMs, timedOut) {
    const c = st.current;
    c.action = action; c.size = action === 'pass' ? 0 : size;
    c.fairEst = fairEst; c.decisionMs = decisionMs; c.timedOut = !!timedOut;
    if (action === 'buy') { c.truePnl = (c.sum - c.ask) * c.size; c.expPnl = (c.fair - c.ask) * c.size; }
    else if (action === 'sell') { c.truePnl = (c.bid - c.sum) * c.size; c.expPnl = (c.bid - c.fair) * c.size; }
    else { c.truePnl = 0; c.expPnl = 0; }
    c.actionCorrect = action === c.correct;
    return c;
  }

  function submitPnl(st, entered) {
    const c = st.current;
    c.enteredPnl = entered;
    c.pnlCorrect = Number.isFinite(entered) && Math.round(entered) === c.truePnl;
    st.bankroll += c.truePnl;
    const post = deckStats(st.deck, st.aceHigh);
    c.postDeck = post;
    c.fairNext = st.settings.cards * post.mean;
    st.log.push(c);
    if (st.bankroll <= 0 || st.round >= st.settings.rounds || st.deck.length < st.settings.cards) st.over = true;
    return c;
  }

  function pearson(xs, ys) {
    const n = xs.length; if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }

  function summary(st) {
    const L = st.log, n = L.length;
    const baseline = st.settings.cards * (st.settings.aceHigh ? 8 : 7);
    const trades = L.filter(r => r.action !== 'pass');
    const withEdge = L.filter(r => r.edge > 0);
    const goodTrades = withEdge.filter(r => r.action === r.correct);
    const fairRows = L.filter(r => Number.isFinite(r.fairEst));
    const half = Math.floor(n / 2);
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return {
      id: st.id, ts: st.ts, settings: st.settings, rounds: n, bust: st.bankroll <= 0,
      bankrollEnd: st.bankroll, pnl: st.bankroll - st.settings.bankroll,
      expPnl: L.reduce((a, r) => a + r.expPnl, 0),
      edgeAvailable: withEdge.reduce((a, r) => a + r.edge * st.settings.maxSize, 0),
      decisionAcc: n ? L.filter(r => r.actionCorrect).length / n : 0,
      pnlAcc: n ? L.filter(r => r.pnlCorrect).length / n : 0,
      avgMs: mean(L.filter(r => r.decisionMs != null).map(r => r.decisionMs)),
      timeouts: L.filter(r => r.timedOut).length,
      fairAbsErr: mean(fairRows.map(r => Math.abs(r.fairEst - r.fair))),
      fairAbsErrLate: mean(fairRows.slice(half).map(r => Math.abs(r.fairEst - r.fair))),
      driftMax: L.length ? Math.max.apply(null, L.map(r => Math.abs(r.fair - baseline))) : 0,
      sizeEdgeCorr: pearson(goodTrades.map(r => r.edge), goodTrades.map(r => r.size)),
      tradesTaken: trades.length,
      log: L.map(r => ({
        round: r.round, cards: r.cards.map(c => c.label), sum: r.sum, fair: +r.fair.toFixed(2),
        bid: r.bid, ask: r.ask, correct: r.correct, edge: +r.edge.toFixed(2), action: r.action, size: r.size,
        fairEst: r.fairEst, decisionMs: r.decisionMs, timedOut: r.timedOut, truePnl: r.truePnl, expPnl: +r.expPnl.toFixed(2),
        enteredPnl: r.enteredPnl, pnlCorrect: r.pnlCorrect, actionCorrect: r.actionCorrect, aceHigh: r.aceHigh,
        ruleChanged: r.ruleChanged, suggestedSize: r.suggestedSize,
      })),
    };
  }

  return { newGame, deal, act, submitPnl, summary, deckStats, cardValue };
})();
