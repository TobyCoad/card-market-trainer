# Card Bet Trainer

The higher/lower betting game as an installable mobile PWA, for trader interview prep.
No backend — every hand is logged to `localStorage` and analysed on the device.


## Two game modes

The switch at the top of the home screen moves between them, and the installed app reopens in whichever you used last.

- **Higher / Lower** - the Kelly betting game described below.
- **Card-sum market** (`market/`) - the other reported IMC game: each round three cards are dealt face down and a market is quoted on their sum ("24 at 28"). Buy if your fair is above the offer, sell if it is below the bid, pass inside the spread, then pick a size. The cards flash face up for a couple of seconds and hide, and you type your own P&L from memory. EUR 1000 start, no replacement, so fair drifts as the deck depletes: `fair = 21 + 3D/N` with `D = 7n - S`. Options: ace 1 or 14 with a mid-game rule switch, cards per round, rounds, flash time, spread and mispricing, max size, decision timer, "state your fair first", and training-wheels deck stats. During play the bankroll and running P&L are hidden by default, so you carry the total yourself: a **notes box** stays open for the whole game (count, fair, running total - the last number in it is read as your running P&L and checked at every trade, within 10%), and at the end you state your total P&L before the results appear. **Interview mode** is one tap: bankroll hidden, notes on, no feedback until the end, 2s of cards, 15s a decision, subtle mispricing, the ace rule switching mid-game. It keeps its own history, Stats and Ready tabs (localStorage keys `cmt.*`, separate from the betting game's `cbt.*`).

Both modes share one service worker, one manifest and one version number: bump `APP_VERSION` in **both** `js/app.js` and `market/js/app.js`, `v` in `version.json`, and `CACHE` in `sw.js` together.

## The game

Cards are turned one at a time from a 13-card deck (optionally a full 52). Before each new
card you bet a fraction of your bankroll on whether it will be **higher** or **lower** than the
card showing. You start with €1000 and play 12 bets. Every card already turned stays visible,
so the probability is not a guess — it is a count.

**The rule:** if the card showing is `c`, and of the `n` unseen cards `h` are higher and `l`
are lower, bet **|h − l| / n** of your bankroll on the majority side. That is Kelly: for an
even-money bet the growth-optimal stake is `f = 2p − 1`, and here `p = max(h,l)/n`.

Two properties worth knowing: the stake reaches 100% only when `h` or `l` is zero — i.e. only
when the win is certain — so **full Kelly here can never bust you**; and you get on average
`2(H₁₃ − 1) ≈ 4.4` certain-win rounds per hand, which are free doublings.

## What it trains

By default the **bankroll is hidden during play** and you must state your final number from
memory at the end — that is the part an interviewer actually asks for. The app then grades:

- final P&L accuracy, accepted within a band you set (10% by default — you are meant to
  be rounding as you go, not carrying cents)
- the **running P&L scratchpad**: a box on the game screen for your own total, checked
  against the real bankroll at every bet, so the results screen names the exact round
  where you first came off
- picking the right side, broken out by how big the edge was
- stake versus the Kelly fraction, separately on big and small edges
- taking the certain wins in full, and passing at zero edge
- growth given up per hand, in doublings, versus optimal sizing
- decision speed under an optional clock

Settings cover the 52-card deck (with ties as a push or a loss), hiding the cards already
turned, being asked your probability before you size, and a training-wheels mode that shows
the counts and the Kelly stake.

**Interview mode** is one tap on the home screen and sets the lot: bankroll hidden, hints off,
and three clocks — 10 seconds a decision, 5 minutes for the hand, 15 seconds to state your
final P&L, accepted within 10%. Run out of hand clock and you are stopped mid-deck and asked for your number
anyway. All three run off a wall-clock deadline, so a backgrounded tab does not pause them.

The **Ready?** tab benchmarks recent hands against a prep standard: stating P&L correctly,
near-perfect side selection and taking every certain win are the three core criteria.

## Install on iPhone

Open the GitHub Pages URL in Safari → Share → **Add to Home Screen**. Works offline after the
first load. When a new version is deployed an update banner appears (bump `APP_VERSION` in
`js/app.js`, `v` in `version.json`, and `CACHE` in `sw.js` together).

## Development

Static files, no build. `python -m http.server 8372 --directory .` and open the URL.
