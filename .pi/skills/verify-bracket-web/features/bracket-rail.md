# Bracket rail

The leftmost right-side column (`#ch-col`): three level rows, ENTRY,
EXIT, STOP, each with a live price, and a head button (`#ch-arm`) that
arms or disarms the bracket.

## Sub-features

- `bracket-column` (`#ch-col`) holds the three `.tc-hnd` rows and the
  `#ch-arm` head button.
- `pinned-axis`: the price axis is pinned after the first bars arrive,
  so rows and lines hold their pixel position while ticks flow and the
  chart pans. They move only on a timeframe switch, a symbol switch, or
  when price exits the pinned range.
- `level-rows` (`.tc-hnd`) one per level in order entry, target as EXIT,
  stop as STOP; each shows a label and price.
- `arm-button` (`#ch-arm`) reads DISABLE when flat, ENABLE when a
  bracket is live; opens the confirm modal (see confirm-modal).
- `locked-entry` (`.tc-locked`) locks the entry row and tag after a
  fill; dragging is then refused with `entry locked after fill`.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/`. Rows appear once a price arrives:
  levels default to entry at last price with a symbol-aware distance
  (0.05 under 50, 0.10 under 100, 1% at 100 and above).

## Driving it with verify-bracket-web

Preconditions:

- IB reconciled and a tape price arrived, so the three rows render with
  non-empty prices.

- **Read the rows.** Assert three `.tc-hnd` rows exist and each shows a
  numeric price. Data proof: none until a bracket activates; the rows
  are local defaults at this stage.
- **Rows stay pinned.** Run
  `node .pi/skills/verify-bracket-web/bin/drive.mjs bracket-rail`. It
  reads the ENTRY row, pans the chart 200px, waits through live ticks,
  and asserts the row keeps an identical price and pixel position, then
  cycles 1m/1d/10s and asserts the row still renders after each refit.
- **Price drag on the chart tag.** Drag a `.tc-level-tag`; only that one
  level moves.
- **Lock.** With a filled entry, attempt a drag on the entry row; assert
  the `tc-locked` class on the row and the feedback text
  `entry locked after fill`.
- **Activation source of truth.** After `confirmYes`, the rows reflect
  server levels from `/events`, not local defaults. Data proof:
  `curl -s http://127.0.0.1:8080/api/audit` contains an `activate` line
  for the symbol and quantity.
- **Proof.** Screenshot the armed rail at
  `evidence/bracket-rail/bracket-armed.png` with the three prices
  visible, plus the `/api/audit` activation line.

- **Unit drag.** Pointer-drag one `.tc-hnd` row; all three levels move
  together by the same delta. In Playwright use pointer events
  (`page.mouse.down/move/up` on the row's box), not `dragTo`, because
  the handler uses `setPointerCapture`.

## Gotchas

- Rows show local default levels until a bracket activates; the numbers
  are plausible but not on the server yet.
- While a cancel is in flight the arm button is disabled; clicking it is
  a no-op, not a rejection.
- Move-during-cancel is refused outright and is untested by design
  (the window is milliseconds).
- Deactivate before moving to the next feature, so the book returns to
  flat.
