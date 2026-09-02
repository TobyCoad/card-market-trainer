/* Persistence — settings + game history in localStorage. No backend. */
const Store = (function () {
  const KEY_SETTINGS = 'cbt.settings.v1';
  const KEY_GAMES = 'cbt.games.v1';

  const DEFAULTS = {
    bankroll: 1000,
    fullDeck: false,        // 13 distinct cards; true = 52 cards, ties possible
    tieRule: 'push',        // only matters with the full deck
    hideBankroll: true,     // the point: carry your own P&L
    hideSeen: false,        // hide the cards already turned (memory mode)
    showKelly: false,       // training wheels: show the counts and the Kelly stake
    askProb: false,         // ask for your probability before you size
    timerSec: 0,            // decision clock, 0 = off
    pnlTolerance: 0.02,     // final P&L accepted within this fraction (0 = exact)
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
    if (!j || !Array.isArray(j.games)) throw new Error('Not a Card Bet export');
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
