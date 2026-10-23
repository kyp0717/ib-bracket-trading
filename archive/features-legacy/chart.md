# Chart

The price chart, left pane. Candlesticks plus volume, two panes with a
3:1 stretch, VWAP and EMA9 overlays.

## Sub-features

- `ch-second`: chart container. The lightweight-charts instance mounts
  here.
- `ch-wm`: large low-opacity ticker watermark centered in the chart,
  always the watched symbol.
- `ch-tf`: timeframe buttons `10s`, `1m`, `1d` at the top left inside
  the chart, default 10s.
- `ch-ind-tag` with `ch-ind-vwap`, `ch-ind-ema9`: indicator values at
  the top, shifted right of the buttons.
- `.tc-level` lines with `.tc-level-tag` labels: draggable entry,
  exit, stop price lines overlaid on the chart.

## How to reach it

Open `/`; the chart loads bars for the watched symbol and streams
updates over `/market`.

## How to drive it

- Timeframe: `page.click('#ch-tf .tc-size-btn[data-tf="1m"]')`, assert
  the active class and that indicator values repopulate.
- Watermark: assert `#ch-wm` text equals the `#ch-input` value and its
  box sits inside the chart rect.
- Levels: drag a `.tc-level-tag` with pointer events; assert the rail
  row (see bracket-rail) moves with it.
- Alignment contract: chart top edge equals the bracket and order rail
  top edges within 2px (`09-header-layout.ts`).

## What usually lies

- The forming candle on 10s and 1m is built tick by tick from
  `reqTickByTickAllLast` prints, not from IB's keepUpToDate bar pushes;
  its close always equals the last tape price. KeepUpToDate only owns
  the daily bars and the quiet-symbol fallback before the first tick.
- The 10s bars only exist while the app aggregates; on a fresh symbol
  the chart can be empty for a stretch with the `Loading SYM` overlay
  up. Wait for bars, not for the overlay to disappear.
- `syncSide` copies the chart pane height into the side columns once a
  second; measuring rail alignment before the first sync run can show
  a false mismatch.
- The watermark is pointer-events none; it never eats drags.
- Indicator values (`ch-ind-vwap`, `ch-ind-ema9`) render only on the
  1m timeframe; on 10s and 1d the tag hides and the values are empty
  (lesson: edge.20261016.indicators-render-only-on-one-minute).
