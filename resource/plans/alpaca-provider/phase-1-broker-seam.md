# Phase 1: broker seam

Back to [overview](overview.md).

## Goal

Introduce a `Broker` interface that `src/server.ts` depends on instead of calling
`ibmod`, `bracket`, and `chart` directly. IB becomes the first and only
implementation. No behavior change.

## Changes

- Add the `Broker` interface. It is the surface today's `bracket.ts` and `chart.ts`
  already expose: `state`, `connect`, `subscribe`, `unsubscribe`, `quote`,
  `activate`, `deactivate`, `editLevels`, `flatten`, `pending`, `position`,
  `snapshot`.
- `src/server.ts` drops its direct imports of `ibmod`, `bracket`, and `chart` and
  takes a `Broker` instance instead.
- `src/ib.ts` grows a small constructor that assembles the current `ib`, `bracket`,
  and `chart` modules into one object satisfying `Broker`.

## Data structures

- `Broker` interface, the single door between the surface and an engine. The
  neutral event/intent vocabulary is named here but not yet wired.

## Verification

- Static: `tsc --noEmit` passes; `server.ts` no longer imports a broker SDK.
- Runtime: launch, doctor, drive `header-ticker-form` and `bracket-rail` against
  IB paper. Identical results to before the seam.
