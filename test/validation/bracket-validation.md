# Bracket safety validation

Date: 2026-10-11. Status: confirmed against live code.

The mapping below is the tradehub-go ancestor of this app, kept with
its Go package and test names as history. The live e2e suite for this
repo is `test/bracket/{api,web,reconnect}/`; notes on it are at the
end of this file.

Every scenario below is implemented in `internal/bracket/manager.go`
and covered by a passing test in `internal/bracket/manager_test.go`.
Packages `internal/bracket` and `internal/execution` tested green on
2026-10-11.

## Scenario to code mapping

- **Deactivate while order resting (WORKING)**: `Disarm` plus
  `startCancelLocked` cancels the real parent at the gateway.
  Test: `TestDisarmWhileWorkingCancelsRealOrder`
- **Deactivate while filled**: `Disarm` in FILLED cancels the live stop
  and target children. Test: `TestDisarmWhileFilledCancelsChildren`
- **Deactivate mid-cancel**: `TestDisarmDuringCancelingCompletesAfterConfirm`
  waits for cancel confirm, then stands down
- **Activate, no position, order sent (WORKING)**: `Arm` places once.
  `TestArmIsSingleFlight` proves a second arm while WORKING is a no-op.
  This is the double-order guard
- **Activate, no position, modify stop or target while unfilled**:
  `SetLevels` in WORKING triggers cancel-and-replace as one serialized
  generation, with CANCELING as a transition lock. Tests:
  `TestMoveWhileWorkingIsCancelReplace`,
  `TestMoveDuringCancelingQueuesLatestLevels`
- **Partial fill, modify stop loss**: `SetLevels` in PARTIAL rejects
  entry changes ("entry locked after fill") and modifies only the
  children in place via `publishModify`, same order IDs. Tests:
  `TestPartialFillLocksEntry`, `TestPartialFillStopTargetModifyInPlace`
- **Fully filled, modify**: same lock rules. Tests:
  `TestFilledBracketLocksEntryAllowsModify`,
  `TestChildFillResolvesBracket` (sibling child fill returns to DRAFT
  via IB OCA)
- **Position appears without a fill callback**: `HandlePosition`
  reconciles, WORKING plus position becomes PARTIAL or FILLED by
  quantity. Tests: `TestPositionAppearsWhileWorkingLocksEntry`,
  `TestPositionReachesQtyBecomesFilled`
- **Position flattens externally**: `resolveExternalFlatLocked` disarms
  to DRAFT, the shorting guard. Tests: `TestPositionZeroWhileFilledDisarms`,
  `TestUnrelatedPositionIgnored`
- **Parent rejected by IB**: returns to DRAFT, nothing left resting.
  Test: `TestRejectedParentReturnsToDraft`
- **Draft moves before arming**: stay local, nothing sent.
  Test: `TestDraftMovesStayLocal`

## How the guards compose

Double-order and shorting prevention comes from three mechanisms
working together:

1. Single-flight arm: arming while WORKING is a no-op
2. CANCELING transition lock: level moves during a cancel queue into
   the next generation, never interleave with it
3. Position reconciliation: the live position feed is a source of
   truth independent of order status callbacks, so an entry fill can
   never be missed

## Live suite notes (TypeScript, 2026-10-13)

The e2e suite maps one file per scenario under `test/bracket/`:
`api/` for HTTP + SSE checks, `web/` for Playwright checks, and
`reconnect/` for the rebuild after an app restart. The startup gate
moved to the initialization area on 2026-10-13; see
initialization-validation.md.

Design decisions carried over from the original plan and still in
force:

- FILLED stands in for PARTIAL in e2e. Partial fills cannot be forced
  reliably on paper, and the FILLED path exercises the same entry-lock
  code. The PARTIAL distinction stays covered by inspection
- Move-during-canceling is not tested e2e. This app refuses the move
  instead of queueing it, and the refusal window is milliseconds on
  paper. The design difference is recorded here by design
- Every scenario leaves the book clean: whatever it activates it
  deactivates, and the cancel acks land in audit.log
