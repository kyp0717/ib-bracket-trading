# Go-live pending tasks, next session

Date: 2026-10-14, for 2026-10-15. Status: not ready for live trading.
Owner of this file: whoever picks up the next task. Update the status
line as items land, and move finished items to Done with the date. The
2026-10-13 list and its items are closed; this is the last stretch.

## Remaining work, in order of danger

1. **Quote-chasing guardian is designed but not built.** When a target
   is touched and unfilled, re-price the limit toward the bid in steps
   until it fills. When a stop-limit triggers and does not fill, cancel
   the resting children and run the marketable-limit exit (the flatten
   machinery, repricing at the bid) until flat. The stop stays a
   broker-held stop-limit regardless; the guardian improves fills, it
   is never the primary protection. The stop-touch path can only be
   proven against a live touch during regular hours; the target-chase
   path is testable the same session. Status: open.
2. **Re-run the wire proofs the exit redesign invalidated.** The
   order-at-server scenarios now assert the stop-limit shape, and
   bracket 10 (flatten with a 2 cent offset) needs a live fill. Both
   are coded and type-clean but have not run against paper since the
   STP to STP LMT change. First action when the 4002 gateway is up:
   `bash test/bracket/run-bracket-test.sh 4002` and
   `bash test/order-at-server/run-order-at-server-test.sh 4002`.
   Status: open, blocked on the paper gateway.
3. **One clean full pass in regular hours.** Every area, including
   web-interface and scanner, in a single `bash test/run-all.sh 4002`
   between 09:30 and 15:45 ET, flat and clean at the end. This is the
   run the go-live decision has been waiting for since 2026-10-13.
   Status: open, scheduled for the 2026-10-15 regular session.

## Also true tomorrow, unchanged

- The stop-limit tradeoff is a chosen one: in a fast crash the limit
  stop can go unfilled where a market stop would have sold through the
  book. Price floor over guaranteed exit, by design. Size positions
  knowing that.
- Brackets are enter-after-09:30 and flat-by-15:45 ET until the
  stop-triggered-outside-RTH question is answered live. The Delete and
  Shift+Delete hatch works any time there is a position.
- Real-money candidates come from the scanner's 2..60 dollar band for
  the sub-10k account. KO stays in the universe flagged as above-band,
  test use only.

## Done

(nothing yet)
