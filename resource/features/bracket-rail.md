# Bracket rail

The leftmost right-side column: the bracket level rows. ENTRY, EXIT,
STOP with live prices, draggable.

## Sub-features

- `ch-col`: the column. Its rows mirror the chart level lines.
- `.tc-hnd` rows: one per level, label plus price, built at boot in
  LEVELS order (entry, target as EXIT, stop as STOP).
- `ch-arm`: the column head button. Reads DISABLE when flat, ENABLE
  when a bracket is live; opens the confirm modal (see
  confirm-modal).
- `.tc-locked` class: entry row and tag lock after a fill; dragging
  then is refused with `entry locked after fill`.

## How to reach it

Open `/`. Rows appear once a price arrives: levels default to entry at
last price with a symbol-aware distance (0.05 under 50, 0.10 under
100, 1% at 100 and above).

## How to drive it

- Unit drag on a row: pointer-drag a `.tc-hnd` row; all three levels
  move together by the same delta.
- Price drag on the chart tag: drag `.tc-level-tag` for one level only.
- Lock: with a filled entry, attempt a drag on the entry row; assert
  the `tc-locked` class and the feedback text.
- Activation: click `ch-arm`, confirm in the modal; rows then reflect
  server levels, not local defaults.

## What usually lies

- Rows show local default levels until a bracket activates; the numbers
  are plausible but not on the server yet.
- While a cancel is in flight the arm button is disabled; clicking it
  during that window is a no-op, not a rejection.
- Move-during-cancel is refused outright (AGENTS.md); the window is
  milliseconds and untested by design.
