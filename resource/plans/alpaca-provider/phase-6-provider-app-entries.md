# Phase 6: provider app entries

Back to [overview](overview.md).

## Goal

Give each provider its own spawn entry so one process runs exactly one broker.

## Changes

- `apps/ib-main.ts` constructs the IB adapter and starts the core with it.
- `apps/alpaca-main.ts` constructs the Alpaca adapter and starts the core with it.
- Remove the old `ibmod.connect()` at the bottom of `server.ts`; startup is owned
  by each entry.
- The two entries share `core/` and `page.html` but never import each other's
  broker package.

## Data structures

- A `start(broker)` function in `core/server.ts` that owns listen and fan-out.

## Verification

- Static: `tsc --noEmit`.
- Runtime: launch each entry in turn. `apps/ib-main.ts --ibport 4002` and
  `apps/alpaca-main.ts --alpaca-paper ...` both doctor green and render the same
  page. Confirm the process loads only its own broker SDK.
