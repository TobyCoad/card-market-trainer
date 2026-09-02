/* Engine — the higher/lower betting game.
 * A deck is dealt one card at a time. Before each new card you bet a fraction of your
 * bankroll on whether it will be higher or lower than the card showing. Because you can
 * see every card already turned, the probability is exact: with h higher and l lower among
 * the n unseen, p = max(h,l)/n and the growth-optimal (Kelly) stake is |h-l|/n.
 * Note f = 1 only when h or l is zero, so full Kelly here can never bust you. */
const Game = (function () {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  function rnd() { return Math.random(); }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function label(c) { return (RANK[c.v] || String(c.v)) + c.suit; }

  function makeDeck(full) {
    const d = [];
    if (full) {
      for (const suit of SUITS) for (let v = 1; v <= 13; v++) d.push({ v, suit, red: suit === '♥' || suit === '♦' });
    } else {
      for (let v = 1; v <= 13; v++) d.push({ v, suit: '♠', red: false });
    }
    return shuffle(d);
  }

  function newGame(settings) {
    const s = Object.assign({}, settings);
    const deck = makeDeck(s.fullDeck);
    const n = s.fullDeck ? 52 : 13;
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(), settings: s,
      deck: deck.map(c => Object.assign({}, c, { label: label(c) })),
      pos: 0,                       // index of the card currently showing
      bankroll: s.bankroll,
      start: s.bankroll,
      log: [], current: null, over: false, rounds: n - 1,
      startedAt: performance.now(), clockExpired: false,
    };
  }

  /* The hand clock ran out. The interviewer stops you where you are and asks for your number. */
  function endEarly(st) {
    st.over = true;
    st.clockExpired = true;
    return st;
  }

  /* Counts of unseen cards relative to the card showing. */
  function counts(st) {
    const cur = st.deck[st.pos].v;
    let h = 0, l = 0, t = 0;
    for (let i = st.pos + 1; i < st.deck.length; i++) {
      const v = st.deck[i].v;
      if (v > cur) h++; else if (v < cur) l++; else t++;
    }
    return { h, l, t, n: h + l + t };
  }

  /* Growth-optimal stake and side. Ties either void the bet (push) or count as a loss. */
  function kelly(st) {
    const { h, l, t, n } = counts(st);
    const side = h === l ? null : (h > l ? 'higher' : 'lower');
    let f = 0, p = 0;
    if (side) {
      const win = Math.max(h, l), lose = Math.min(h, l);
      if (t === 0) { f = (win - lose) / n; p = win / n; }
      else if (st.settings.tieRule === 'push') { f = (win - lose) / (win + lose); p = win / (win + lose); }
      else { f = Math.max(0, (win - lose - t) / n); p = win / n; }
    }
    return { h, l, t, n, side, f, p };
  }

  function deal(st) {
    const k = kelly(st);
    st.current = {
      round: st.log.length + 1,
      showing: st.deck[st.pos],
      seen: st.deck.slice(0, st.pos + 1).map(c => c.label),
      k,
      side: null, frac: null, stake: null, decisionMs: null, timedOut: false,
    };
    return st.current;
  }

  /* One rule for "close enough", used for both the final answer and every scratchpad
   * checkpoint. With a tolerance band you are expected to be rounding as you go, so holding
   * the running total to the cent would contradict the final grade. */
  function within(stated, actual, tol) {
    const err = Math.abs(stated - actual);
    if (!tol) return err < 0.5;
    return actual > 0 ? err / actual <= tol : err < 0.5;
  }

  /* Last number written in the scratchpad, ignoring €, commas and any words around it. */
  function parseNote(s) {
    if (s == null) return null;
    const m = String(s).replace(/[€,\s]/g, '').match(/-?\d+(?:\.\d+)?/g);
    return m ? parseFloat(m[m.length - 1]) : null;
  }

  /* side: 'higher' | 'lower' | 'pass'; frac: 0..1 of current bankroll.
   * note is the scratchpad as it read at the moment of the bet, so it should equal the
   * bankroll going *into* this round — the card has not turned yet. */
  function bet(st, side, frac, decisionMs, timedOut, note) {
    const c = st.current;
    c.note = note == null || note === '' ? null : String(note).slice(0, 32);
    c.noteNum = parseNote(note);
    c.side = side;
    c.frac = side === 'pass' ? 0 : frac;
    c.stake = st.bankroll * c.frac;
    c.decisionMs = decisionMs;
    c.timedOut = !!timedOut;
    c.bankrollBefore = st.bankroll;
    c.noteErr = c.noteNum == null ? null : Math.abs(c.noteNum - st.bankroll);
    c.noteOk = c.noteNum == null ? null : within(c.noteNum, st.bankroll, st.settings.pnlTolerance);

    const next = st.deck[st.pos + 1];
    c.next = next;
    const cur = c.showing.v;
    let result;                                   // 'win' | 'lose' | 'push'
    if (side === 'pass') result = 'push';
    else if (next.v === cur) result = st.settings.tieRule === 'push' ? 'push' : 'lose';
    else {
      const higher = next.v > cur;
      result = ((side === 'higher') === higher) ? 'win' : 'lose';
    }
    c.result = result;
    c.pnl = result === 'win' ? c.stake : (result === 'lose' ? -c.stake : 0);
    st.bankroll += c.pnl;
    c.bankrollAfter = st.bankroll;

    /* grading against the growth-optimal play */
    const k = c.k;
    c.sideCorrect = k.side === null ? (side === 'pass') : (side === k.side);
    c.fracError = Math.abs(c.frac - k.f);
    c.wasCertain = k.side !== null && k.f >= 0.999;
    c.capturedCertain = c.wasCertain && c.frac >= 0.95 && side === k.side;
    c.shouldPass = k.side === null;
    c.passedCorrectly = c.shouldPass && c.frac === 0;
    c.expLogLoss = 0;
    if (k.side && c.frac < 1) {
      const q = 1 - k.p;
      const g = f => (f >= 1 ? (k.p >= 1 ? 0 : -Infinity) : k.p * Math.log(1 + f) + q * Math.log(1 - f));
      const mine = side === k.side ? c.frac : -c.frac;
      c.expLogLoss = Math.max(0, g(k.f) - g(mine));   // growth rate given up, in nats
    }

    st.log.push(c);
    st.pos += 1;
    if (st.pos >= st.deck.length - 1 || st.bankroll <= 0.005) st.over = true;
    return c;
  }

  /* stated === null means the clock beat you to it, which grades as no answer at all. */
  function submitFinal(st, stated, pnlMs, timedOut) {
    st.pnlMs = pnlMs == null ? null : Math.round(pnlMs);
    st.pnlTimedOut = !!timedOut;
    st.handMs = Math.round(performance.now() - st.startedAt);
    if (stated == null) {
      st.statedFinal = null;
      st.pnlAbsErr = Math.abs(st.bankroll);
      st.pnlRelErr = 1;
      st.pnlCorrect = false;
      return false;
    }
    st.statedFinal = stated;
    const err = Math.abs(stated - st.bankroll);
    st.pnlAbsErr = err;
    st.pnlRelErr = st.bankroll > 0 ? err / st.bankroll : (err > 0 ? 1 : 0);
    st.pnlCorrect = within(stated, st.bankroll, st.settings.pnlTolerance);
    return st.pnlCorrect;
  }

  function summary(st) {
    const L = st.log, n = L.length;
    const bets = L.filter(r => r.side !== 'pass');
    const certain = L.filter(r => r.wasCertain);
    const passes = L.filter(r => r.shouldPass);
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    /* Where the running total first came off the rails — more useful than the final gap,
     * because everything after it inherits the same error. */
    const noted = L.filter(r => r.noteOk != null);
    const drift = noted.find(r => !r.noteOk);
    return {
      id: st.id, ts: st.ts, settings: st.settings, rounds: n,
      start: st.start, bankrollEnd: st.bankroll, pnl: st.bankroll - st.start,
      growth: st.start > 0 && st.bankroll > 0 ? Math.log2(st.bankroll / st.start) : null,
      statedFinal: st.statedFinal, pnlCorrect: st.pnlCorrect,
      pnlRelErr: st.pnlRelErr, pnlAbsErr: st.pnlAbsErr,
      pnlMs: st.pnlMs, pnlTimedOut: !!st.pnlTimedOut,
      notedRounds: noted.length,
      notesAccurate: noted.length ? noted.filter(r => r.noteOk).length / noted.length : null,
      noteFirstDrift: drift ? drift.round : null,
      noteFirstDriftBy: drift ? drift.noteErr : null,
      handMs: st.handMs, clockExpired: !!st.clockExpired,
      roundsAvailable: st.rounds,
      sideAcc: n ? L.filter(r => r.sideCorrect).length / n : 0,
      meanFracErr: mean(L.filter(r => r.k.side).map(r => r.fracError)),
      certainCount: certain.length,
      certainCaptured: certain.length ? certain.filter(r => r.capturedCertain).length / certain.length : null,
      passCount: passes.length,
      passDiscipline: passes.length ? passes.filter(r => r.passedCorrectly).length / passes.length : null,
      growthGiveUp: L.reduce((a, r) => a + (r.expLogLoss || 0), 0) / Math.LN2,   // doublings sacrificed
      avgMs: mean(L.filter(r => r.decisionMs != null).map(r => r.decisionMs)),
      timeouts: L.filter(r => r.timedOut).length,
      bust: st.bankroll <= 0.005,
      log: L.map(r => ({
        round: r.round, showing: r.showing.label, next: r.next ? r.next.label : null,
        h: r.k.h, l: r.k.l, n: r.k.n, p: +r.k.p.toFixed(4), kSide: r.k.side, kFrac: +r.k.f.toFixed(4),
        side: r.side, frac: +r.frac.toFixed(4), stake: +r.stake.toFixed(2), result: r.result,
        pnl: +r.pnl.toFixed(2), bankrollAfter: +r.bankrollAfter.toFixed(2),
        sideCorrect: r.sideCorrect, fracError: +r.fracError.toFixed(4),
        wasCertain: r.wasCertain, capturedCertain: r.capturedCertain,
        decisionMs: r.decisionMs, timedOut: r.timedOut,
        bankrollBefore: +r.bankrollBefore.toFixed(2),
        note: r.note, noteNum: r.noteNum, noteOk: r.noteOk,
        noteErr: r.noteErr == null ? null : +r.noteErr.toFixed(2),
      })),
    };
  }

  return { newGame, deal, bet, endEarly, submitFinal, summary, counts, kelly, parseNote };
})();
