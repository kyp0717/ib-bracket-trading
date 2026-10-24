# Phase 3: core restructure

Back to [overview](overview.md).

## Goal

Move the broker-neutral code into `core/` and the IB engine into `brokers/ib/`, so
the two provider homes exist before Alpaca arrives. Behavior stays identical.

## Changes

- `src/core/` gets `wire.ts`, `emit.ts`, `log.ts`, `s3.ts`, `server.ts`, and
  `page.html`, plus the pure bracket safety rules extracted from today's
  `bracket.ts`.
- `src/brokers/ib/` gets the IB order mechanics, market-data requests, and the
  reconcile logic. Its entry implements `Broker`.
- The pure rules and the IB adapter meet through the event/intent vocabulary: the
  rules emit `place`, `cancel`, `modify`; the adapter translates those to IB
  orders and translates IB events back to `leg filled` or `leg cancelled`.
- The scanner is already gone; it lives in its own repo, `scanner-ts`,
  and is out of scope for this phase. See
  resource/plans/scanner-migration.md.

## Data structures

- `Broker` interface (from phase 1) plus the neutral event and intent types the
  rules table and adapters exchange. `Bracket`, `Leg`, and `BracketSnapshot` stay
  the shared snapshot shape.

## Verification

- Static: `tsc --noEmit` over `core/` and `brokers/`.
- Runtime: launch, doctor, drive `bracket-rail` and an activation/deactivate
  cycle against IB paper. The book ends flat.
