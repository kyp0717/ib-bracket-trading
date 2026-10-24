# Phase 2: wire contract prune

Back to [overview](overview.md).

## Goal

Reduce `wire.ts` to what the surface actually renders, and generalize the
connection fields so the contract is provider-neutral.

## Changes

- `ConnState` drops `host`, `ibPort`, `clientId`, and `nextValidId` from the
  shared contract. Add `provider` (`"ib" | "alpaca"`) and `accountMode`
  (`"paper" | "live"`), plus a provider-neutral `label` string the pill renders.
- `Bracket` drops `ocaGroup`. Keep `symbol`, `qty`, `entry`, `stop`, `target`,
  `state`, `entryLocked`, `orderType`, and the three legs with `status`, `filled`,
  `avgPrice`. These are exactly the fields `page.html` reads.
- `DepthBook` stays; it already fits both a one-level stock book and a crypto
  ladder.

## Data structures

- `ConnState` and `Bracket` pruned to the presentation contract. Provider-internal
  fields move into each broker's own types.

## Verification

- Static: `tsc --noEmit` fails on the removed fields, then passes after the IB
  implementation and `page.html` stop reading them.
- Runtime: launch, doctor, drive `header-ticker-form`. The pill still reads
  correctly for IB, now sourced from `provider` and `accountMode`.
