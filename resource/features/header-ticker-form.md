# Header and ticker form

The single control bar at the top of the page. One header only: a
second header row would push the rails out of alignment with the chart
(AGENTS.md, GUI layout contract).

## Sub-features

- `ch-input`: ticker input, always shows the watched symbol. Doubles as
  the viewed-symbol indicator; typing a new symbol and submitting
  switches.
- `ch-size`: size dropdown between the input and the switch icon,
  options 10, 100, 500, default 10.
- `ch-switch-btn`: icon submit button (no text label).
- `ch-feedback`: thin feedback line to the right of center, shows
  `switch X sent`, `size N`, and error text.
- `conn-pill` / `conn-dot` / `conn-text`: connection state pill at the
  far right.

## How to reach it

Open `/`. The form is at the top left. The watched symbol persists in
localStorage under `bracket-web-symbol`, so a reload shows the same
ticker.

## How to drive it

- Read: `guiPage(symbol)` then `#ch-input` value, `#ch-size` value.
- Switch ticker: fill `#ch-input`, submit the form. Assert `#ch-input`
  keeps the new symbol and `#ch-wm` (chart watermark) matches.
- Change size: `page.selectOption('#ch-size', '100')`, assert
  `#ch-feedback` reads `size 100`. No server call.
- Cancel path: submit with an empty input does nothing.

## What usually lies

- The input must never be cleared on submit; an empty input after a
  switch is a regression.
- The dropdown id `ch-size` was a button row before; old selectors
  (`#ch-size .tc-size-btn`) match nothing now.
- LocalStorage persistence means a "fresh" Playwright page shows SPY
  but a human's browser shows their last ticker. Tests see SPY unless
  `guiPage(other)` is used.
