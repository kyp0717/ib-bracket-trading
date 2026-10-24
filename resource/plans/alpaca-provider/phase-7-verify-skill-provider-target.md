# Phase 7: verify skill provider target

Back to [overview](overview.md).

## Goal

Let the verify skill name a provider so the same launch, doctor, drive, evidence,
and cleanup loop runs against either app.

## Changes

- `launch.sh` gains a provider argument that picks the entry and the credentials
  or port. IB keeps the hostname-to-paper-port map; Alpaca reads paper keys.
- `doctor.sh` keeps its gate but reads the provider-neutral conn fields.
- `drive.mjs` and the feature map gain a provider-specific test-data note: crypto
  `BTC/USD` for 24/7 visual drives, a liquid stock for RTH order drives.

## Data structures

- A `provider` value threading launch, doctor, and drive, never a second code path.

## Verification

- Static: `tsc --noEmit`.
- Runtime: run the full loop once for `ib` and once for `alpaca`. Both produce
  screenshots and state snapshots in the skill's evidence directory, and both end
  flat.
