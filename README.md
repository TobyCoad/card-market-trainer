# Card Market Trainer

The interview "card sum" market-making game as an installable mobile PWA, for on-the-go
practice before trader rounds at options market makers (reported at IMC and Optiver).
No backend — every round is logged to `localStorage` and analysed on the device.

## The game

Each round, N cards (default 3) are dealt face down from one 52-card deck and a market is
quoted on their sum, e.g. **24 at 28**. You decide: **buy** if your fair value is above the
offer, **sell** if it's below the bid, **pass** if fair sits inside the spread. Then you pick a
size. The cards flash face up for a couple of seconds, flip back, and you must enter your own
P&L from memory. You start with €1000. Cards do not return to the deck, so fair value drifts:
fair = N × (sum of cards still in the deck) ÷ (cards still in the deck).

Settings: ace = 1 or 14 (and an optional mid-game rule switch — a reported interviewer twist),
cards per round, rounds, flash duration, quote spread and mispricing size, max size, decision
timer, an optional "state your fair value before the quote" prompt, and training-wheels deck
stats after each round.

## Analytics

Every round stores the cards, true fair, quote, correct action, your action/size/time, your
P&L entry and the truth. The Stats tab computes: decision accuracy by edge size and by deck
drift (anchoring detection), fair-value estimate error early vs late in the deck, P&L
calculation accuracy by size / direction / winning-vs-losing trade, sizing discipline
(size–edge correlation and expected P&L captured), ace-rule breakdowns, per-game trends,
JSON export/import and reset.

## Install on iPhone

Open the GitHub Pages URL in Safari → Share → **Add to Home Screen**. Works offline after the
first load. In-app update banner appears when a new version is deployed (bump `APP_VERSION`
in `js/app.js`, `v` in `version.json`, and `CACHE` in `sw.js` together).

## Development

Static files, no build. `python -m http.server 8372 --directory .` and open the URL.
