# Chart

The price chart in the left pane: candlesticks plus volume on two panes
with a 3:1 stretch, timeframe buttons at the top left, VWAP and EMA9
overlays on the 1m timeframe, and a large low-opacity ticker watermark
centered in the chart.

## Sub-features

- `price-pane` (`#ch-second`) hosts the lightweight-charts candle and
  volume series and the watermark (`#ch-wm`).
- `macd-pane` (`#ch-macd`) hosts the MACD line, signal, and histogram.
- `timeframe-buttons` (`#ch-tf` with `[data-tf]`) switch 10s, 1m, 1d;
  default 10s.
- `indicator-tag` (`#ch-ind-tag`, `#ch-ind-vwap`, `#ch-ind-ema9`) shows
  VWAP and EMA9 values, only on the 1m timeframe.
- `watermark` (`#ch-wm`) shows the watched symbol, always.
- `pinned-axis`: the price axis is pinned after the first bars arrive,
  so candles and level lines hold their scale while ticks flow and the
  chart pans. The axis refits only on a timeframe switch, a symbol
  switch, or when price exits the pinned range.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/`. The chart loads bars for the watched
  symbol and streams updates over `/market`.

## Driving it with verify-bracket-web

Preconditions:

- IB reconciled (`connected:true, reconciled:true`) so bars, tape, and
  depth actually arrive. Without it the chart stays empty and only the
  watermark is provable.
- A liquid symbol with live quotes (SPY) as the watched symbol.

- **Watermark.** Assert `#ch-wm` text equals the `#ch-input` value.
  Run `node .pi/skills/verify-bracket-web/bin/drive.mjs render` for the
  presence check, or read `#ch-wm` directly after a switch.
- **Timeframe switch.** Choose 1m. Run
  `page.click('#ch-tf .tc-size-btn[data-tf="1m"]')` and assert the
  button gains the `active` class and `#ch-ind-tag` becomes visible with
  non-empty `#ch-ind-vwap` and `#ch-ind-ema9` once at least 9 bars
  exist.
- **Bars arrive.** Data proof: `curl -s http://127.0.0.1:8080/api/quote`
  returns a price greater than 0 for the watched symbol, or the `/market`
  SSE pipe emits a `hist` message with non-empty `bars`. Visual proof: a
  candle series renders (screenshot shows the pane populated, not the
  `Loading SYM` overlay).
- **Proof.** Screenshot the populated chart at
  `evidence/chart/chart-populated.png`, plus the `/api/quote` response
  and a `hist` SSE payload in the run output.

## Gotchas

- On a fresh symbol the chart can be empty behind the `Loading SYM`
  overlay while bars build. Wait for bars or the `hist` SSE message, not
  for the overlay to disappear.
- Indicator values render only on 1m; on 10s and 1d the tag hides and
  the values are empty. Assert the tag, not the values, on 10s/1d.
- The watermark is `pointer-events: none`; it never eats drags.
- The forming 10s and 1m candles are built from tick-by-tick prints, so
  the current candle close equals the last tape price.
- The pinned axis is client-side state; a manual zoom on the price axis
  is not tracked, so a boundary refit can override a user zoom. Assert
  level positions with the drive, not by hand-zooming first.
