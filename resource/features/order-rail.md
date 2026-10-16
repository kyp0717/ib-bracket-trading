# Order rail

The narrow column right of the bracket rail: one status cell per leg.

## Sub-features

- `ch-orders`: the column with an `ORDER` header.
- `.tc-ord` cells: one per level in LEVELS order (entry, target, stop).
  Classes carry the state: `working`, `filled`, `armed`, `rejected`,
  and plain for idle.

## How to reach it

Open `/`. Cells sit idle until a bracket arms or activates.

## How to drive it

- Flat state: assert three `.tc-ord` cells exist and none carries a
  state class.
- After activation: assert the entry cell reads submitted and the
  children are working; states stream over `/events` as IB reports
  them.

## What usually lies

- TWS reports API cancels as `ApiCancelled`, not `Cancelled`; the
  mapping treats it as terminal, but any raw-status assertion sees the
  TWS name.
- IB replays OCA children before their parent on reconnect; a freshly
  reconciled bracket can briefly show children with no parent row.
- Status text arrives over the exec SSE pipe, which is exactly one
  pipe behind heavy market traffic; give state assertions the full 60s
  fill timeout, not 30s (lesson on the 2109 hold).
