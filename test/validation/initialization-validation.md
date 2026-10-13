# App initialization validation

Date: 2026-10-13. Status: implemented, covered by `test/initialization/`.

Startup lifecycle of the whole app, before any feature area matters.
Runner: `run-initialization-test.sh [port]`. Runs first inside
`test/run-all.sh`, before the bracket and depth areas.

## Scenario to code mapping

- **Reconcile gate**: an activation sent immediately after connect is
  refused until the app reports reconciled, or accepted only if the
  reconcile already finished (with cleanup of the accepted order). The
  order prices are deliberately absurd so nothing can fill.
  Test: `test/initialization/api/01-reconcile-ib-acct.ts`

## Not covered here, by design

- **What reconcile finds**: the rebuild of a resting bracket after a
  restart is bracket state machine territory, not the gate. Covered by
  `test/bracket/reconnect/01-rebuild.ts`
- **Connectivity health**: port, HTTP, and connected checks live in the
  doctor step, `test/health-check/health-check.ts`
