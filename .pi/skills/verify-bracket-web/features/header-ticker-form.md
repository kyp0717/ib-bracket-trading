# Header and ticker form

The single control bar at the top of the page. One header only: the
ticker form (input, size dropdown, icon submit), the centered
POSITION/PNL readouts, the feedback line, and the connection pill at the
far right. The ticker input doubles as the viewed-symbol indicator.

## Sub-features

- `ticker-input` (`#ch-input`) always shows the watched symbol; typing a
  new symbol and submitting switches it.
- `size-dropdown` (`#ch-size`) options 10, 100, 500, default 10.
- `switch-submit` (`#ch-switch-btn`) icon submit, no text label.
- `feedback` (`#ch-feedback`) shows `switch X sent`, `size N`, and
  rejection text.
- `conn-pill` (`#conn-pill`, `#conn-dot`, `#conn-text`) shows
  disconnected, reconciling, or host:port at the far right.
- `watermark-follows` the chart watermark (`#ch-wm`) always equals the
  input value after a switch.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/`. The form is top left.
- The watched symbol persists in localStorage under `bracket-web-symbol`;
  a reload shows the last ticker a human chose, SPY on a fresh browser.

## Driving it with verify-bracket-web

Preconditions:

- App launched and doctored. `header-ticker-form` is drivable even when
  IB is not reconciled, because the switch updates local state and posts
  `/api/symbol` without needing market data.

- **Read the bar.** Open the page and read the form. Run
  `node .pi/skills/verify-bracket-web/bin/drive.mjs header-ticker-form`.
  It asserts `#ch-input`, `#ch-size`, `#ch-switch-btn`, `#ch-pos`, and
  `#conn-pill` are present, and that `#ch-wm` matches the input before
  any switch.
- **Change size.** Choose 100 from the dropdown. Run the same driver; it
  runs `page.selectOption('#ch-size', '100')` and asserts `#ch-feedback`
  reads `size 100`. No server call.
- **Switch ticker.** Type a new symbol and submit. Run
  `page.fill('#ch-input', 'AAPL')` then `page.click('#ch-switch-btn')`,
  or use the driver, which waits for `#ch-wm` to read `AAPL`. The input
  keeps `AAPL` and the watermark follows. Data proof: `curl -s -X POST
  http://127.0.0.1:8080/api/symbol -H 'content-type: application/json'
  -d '{"symbol":"AAPL"}'` returns `{"ok":true,"symbol":"AAPL"}`.
- **Empty submit does nothing.** Fill `#ch-input` with an empty string
  and submit; the input value and watermark are unchanged.
- **Proof.** The driver writes `evidence/header-ticker-form/header-before.png`,
  `header-after.png`, and `header-ticker-form.state.json`. The state
  JSON carries the before/after symbol, the size, and the feedback text.

## Gotchas

- The input must never be cleared on submit; an empty input after a
  switch is a regression.
- The size dropdown is `#ch-size` with `selectOption`, not a button row.
  Old selectors (`#ch-size .tc-size-btn`) match nothing.
- Without IB the chart stays empty behind the `Loading AAPL` overlay.
  That is expected for this feature; the switch itself is local plus a
  `/api/symbol` call.
- A "fresh" Playwright page shows SPY (empty localStorage), but a
  human's browser shows their last ticker. Assert against the value you
  set, not a hardcoded default.
