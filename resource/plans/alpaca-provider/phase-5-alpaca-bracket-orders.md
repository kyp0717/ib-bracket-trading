# Phase 5: Alpaca bracket orders

Back to [overview](overview.md).

## Goal

Implement `Broker.activate`, `deactivate`, `editLevels`, `flatten`, `pending`,
`position`, and `snapshot` for Alpaca paper, using native bracket orders.

## Changes

- The Alpaca adapter translates a `place` intent into one native bracket order
  with `take_profit` and `stop_loss` legs, instead of three orders and an OCA
  group.
- The adapter generates its own `client_order_id` per leg; there is no
  `nextValidId` allocation.
- Reconcile reads `GET /orders` and `GET /positions/{symbol}` rather than the IB
  replay events, then feeds the same `leg` events to the core rules.
- All order paths stay long-only stock brackets. No crypto orders.

## Data structures

- A `BracketOrderIntent` the core emits and the adapter consumes, naming qty,
  entry, stop, target, and type without any broker field.

## Verification

- Static: `tsc --noEmit`.
- Runtime: on Alpaca paper during regular hours, activate a bracket on a liquid
  symbol, confirm legs fill and the arm flips, then flatten and deactivate to end
  flat. Data proof via `/api/audit`, visual proof via a screenshot.
