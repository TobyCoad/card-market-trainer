/* Persistence — settings + game history in localStorage. No backend. */
const Store = (function () {
  const KEY_SETTINGS = 'cmt.settings.v1';
  const KEY_GAMES = 'cmt.games.v1';

  const DEFAULTS = {
    aceHigh: false,          // ace = 1 (false) or 14 (true)
    aceSwitch: false,        // flip the ace rule mid-game (the interviewer's twist)
    cards: 3,                // cards per round
    rounds: 12,              // rounds per game (max floor(52/cards))
    flashMs: 2000,           // how long the cards show face-up
    spreadMin: 3, spreadMax: 5,
    mispriceSd: 2.5,         // sd of quote-mid offset from true fair
    maxSize: 10,
    askFair: true,           // prompt for your fair value before the quote appears
    timerSec: 0,             // decision timer, 0 = off
    showCount: false,        // training aid: show remaining-deck stats after each round
    bankroll: 1000,
  };

  function loadSettings() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s) { localStorage.setItem(KEY_SETTINGS, JSON.stringify(s)); }

  function loadGames() {
    try { return JSON.parse(localStorage.getItem(KEY_GAMES) || '[]'); }
    catch (e) { return []; }
  }
  function saveGame(g) {
    const all = loadGames();
    all.push(g);
    localStorage.setItem(KEY_GAMES, JSON.stringify(all));
  }
  function exportJSON() {
    return JSON.stringify({ settings: loadSettings(), games: loadGames(), exported: Date.now() }, null, 1);
  }
  function importJSON(text) {
    const j = JSON.parse(text);
    if (!j || !Array.isArray(j.games)) throw new Error('Not a Card Market export');
    const existing = loadGames();
    const ids = new Set(existing.map(g => g.id));
    const merged = existing.concat(j.games.filter(g => !ids.has(g.id)));
    merged.sort((a, b) => a.ts - b.ts);
    localStorage.setItem(KEY_GAMES, JSON.stringify(merged));
    if (j.settings) saveSettings(Object.assign({}, DEFAULTS, j.settings));
    return merged.length - existing.length;
  }
  function reset() { localStorage.removeItem(KEY_GAMES); }

  return { DEFAULTS, loadSettings, saveSettings, loadGames, saveGame, exportJSON, importJSON, reset };
})();
