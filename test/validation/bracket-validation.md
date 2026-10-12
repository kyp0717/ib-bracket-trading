# Bracket safety validation

Date: 2026-10-11. Status: confirmed against live code.

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
