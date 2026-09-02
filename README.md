# Card Bet Trainer

The higher/lower betting game as an installable mobile PWA, for trader interview prep.
No backend — every hand is logged to `localStorage` and analysed on the device.

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

- final P&L accuracy (exact, or within a tolerance you set)
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
final P&L. Run out of hand clock and you are stopped mid-deck and asked for your number
anyway. All three run off a wall-clock deadline, so a backgrounded tab does not pause them.

The **Ready?** tab benchmarks recent hands against a prep standard: stating P&L correctly,
near-perfect side selection and taking every certain win are the three core criteria.

## Install on iPhone

Open the GitHub Pages URL in Safari → Share → **Add to Home Screen**. Works offline after the
first load. When a new version is deployed an update banner appears (bump `APP_VERSION` in
`js/app.js`, `v` in `version.json`, and `CACHE` in `sw.js` together).

## Development

Static files, no build. `python -m http.server 8372 --directory .` and open the URL.
