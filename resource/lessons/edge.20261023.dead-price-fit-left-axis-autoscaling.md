# A dead fitPriceScale left the price axis autoscaling, so bracket levels slid as price moved

Date: 2026-10-23. Source: operator report, "the bracket is readjusting
as the price on the chart moves", reproduced live on SPY.

## What happened

With SPY streaming, the ENTRY/EXIT/STOP lines and rail rows visibly slid
up and down whenever price action extended the visible range. A probe
(sampled `#ch-col .tc-hnd` row text and `style.top` over 14s of ticks)
showed prices and pixels stable in a quiet tape, but a 200px chart pan
moved the ENTRY row from 488.849px to 476.372px while its price stayed
761.72. Same level, new pixel position.

## Why it happened

lightweight-charts defaults `rightPriceScale.autoScale` to true, so any
change to the visible data window (a pan, or a tick extending the
forming bar's high/low) refits the price axis, and every price-pinned
overlay gets repositioned by `renderLevels`. page.html already contained
the intended fix as dead code: `fitPriceScale()` computes a padded range
from recent bars plus nearby levels, and `needsPriceFit` is set true on
every symbol switch, but no call site ever invoked `fitPriceScale`, so
the axis never got pinned.

## The fix

page.html now wires the fit: `fitPriceScale()` records its range in
`pinnedRange` and calls `setVisibleRange` (which disables autoscale).
It runs once per symbol when the first bars land (`onHist`/`onBar`
guarded by `needsPriceFit`), on every timeframe switch (`setCurrentTf`),
and on a tape tick whose price exits `pinnedRange` (one discrete refit
at a boundary breach, never continuous readjustment). `resetCharts`
clears `pinnedRange` on symbol switch.

Proof: `node .pi/skills/verify-bracket-web/bin/drive.mjs bracket-rail`
asserts identical price and pixel position across a pan and 7s of live
ticks, then asserts rows still render after 1m/1d/10s refits.

## Rules that fall out

- A defined-but-never-called function plus a set-but-never-read flag is
  a red light, not a safety net. Before writing new logic, grep the
  intended mechanism for a call site.
- For chart overlays that represent fixed prices, assert pixel
  stability across pans and ticks, not just value stability. Values can
  be constant while the axis slides them around.
- When a library default (autoscale) owns a behavior you care about,
  pin it explicitly and record the range yourself instead of depending
  on read-back APIs.
