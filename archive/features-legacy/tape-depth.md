# Tape and depth

The two rightmost columns: time and sales, and the depth grid.

## Sub-features

- `ch-tape` (`T&S` header): scrolling tape rows, price colored against
  the previous trade.
- `ch-depth` (`DEPTH` header): six-column grid, MM / SIZE / BID / ASK /
  SIZE / MM, with a colored tier per row from the app's tiering.

## How to reach it

Open `/` on a symbol with live quotes. Tape rows stream over `/market`;
depth rebuilds on each book update.

## How to drive it

- Tape: after `guiPage('SPY')`, assert rows appear with a monotonically
  recent ET time column (the `ticks/` area owns the wire proof).
- Depth: assert the header row and at least one populated bid and ask
  row with prices bracketing the tape last.
- Grid refresh: the `depth/` area scenarios assert repopulation after a
  symbol switch; drive the same path here before touching layout.

## What usually lies

- Both columns render only what `/market` delivers; a quiet symbol or a
  dropped gateway shows empty columns that look like a rendering bug.
  Check the pill before blaming the grid.
- Tape times arrive as strings and render in ET; cross-day sessions can
  show apparently out-of-order rows around midnight ET.
- The depth tiers are app-side coloring, not exchange data; asserting
  exact tier colors couples the test to the tier table.
