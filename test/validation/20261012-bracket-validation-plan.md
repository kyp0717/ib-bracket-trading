# Plan: bracket validation e2e suite

Date: 2026-10-12. Status: proposed, awaiting approval.

Validates the transition-lock mechanism in `bracket.ts` against paper
gateway paper port (4001 IB Gateway or 7497 TWS), per
`test/validation/bracket-validation.md`. Two layers
like tradehub-go `e2e/bracket/`: an HTTP scenario script and a
Playwright GUI spec, both run by one script.

## Layout

```
test/
├── validation/                # scenario-to-code mapping docs
└── bracket/
    ├── run-bracket-test.sh    # restart app, doctor step, run each phase
    ├── api/                   # HTTP + SSE scenarios, one file each
    ├── web/                   # Playwright scenarios, one file each
    └── reconnect/             # runs after the runner restarts the app
```

## Design decisions

- Playwright imported from the nvm global path, no npm dependency
- The app restart in the runner is `pkill -f "tsx server.ts"` then
  `npx tsx server.ts` with the log at /tmp/bracket-e2e.log. The runner
  waits for the `nextValidId` handshake line before running anything
- State is read through `GET /status` plus the SSE `bracket` snapshot,
  which already carries leg order IDs and the `_pending` symbol list.
  Audit assertions read `audit.log`
- The runner needs a live reference price for fill tests. The app
  gains one route, `GET /api/quote`, returning the last tape trade
  price and time. One route, stdlib only
- FILLED stands in for PARTIAL in e2e. Partial fills cannot be forced
  reliably on paper and the FILLED path exercises the same entry-lock
  code. The PARTIAL distinction stays covered by inspection, not by
  the suite
- Move-during-CANCELING is not tested e2e. This app refuses the move
  instead of queueing it, and the refusal window is milliseconds on
  paper. The design difference is recorded in the validation doc
- Every scenario leaves the book clean: whatever it activates it deactivates,
  and the runner checks audit.log for the cancel acks

## Scenarios

API layer, `bracket-api.mjs`, in order:

1. Reconcile gate: `POST /api/arm` immediately after connect is
   refused until `/status` reports `reconciled: true`
2. Arm single-flight: arm SPY, arm again, second call refused, one
   bracket in the snapshot. The double-order guard
3. Move while working: `POST /api/levels` with new stop and target.
   Snapshot shows new parent and leg order IDs, state still working,
   audit.log carries cancel-acks for the old IDs
4. Deactivate while working: `POST /api/disarm`, snapshot state closed,
   three cancel-acks in audit.log
5. Fill and lock: `GET /api/quote`, entry one tick above last price,
   arm, wait for entryLocked in the snapshot. `POST /api/levels` with
   a new entry is refused with "entry locked after fill". `POST
   /api/levels` with new stop and target succeeds and the snapshot
   shows the same stop and target order IDs. In-place modify
6. Deactivate while filled: children cancelled, audit.log carries the
   acks, position is flat afterwards per the legs snapshot
7. Symbol switch deactivates: arm AAPL, `POST /api/symbol` with SPY,
   audit.log carries `symbol switch to SPY` and AAPL cancel-acks
8. Reconnect reconcile: arm SPY, kill the app, restart through the
   runner path, snapshot shows the bracket rebuilt as working, arms
   reopen after reconcile, deactivate cleans it up
9. Rejected parent: arm with a limit price at an invalid increment,
   arm call accepted then the reject arrives from IB, snapshot ends
   closed with nothing resting, audit.log carries the error

Browser layer, `bracket.spec.mjs`:

1. Arm needs the confirm modal. Click arm, modal appears, click
   cancel, assert no bracket in the snapshot. Then arm through the
   modal and assert state working
2. Entry drag after fill is rejected: drag the entry line on the
   overlay, assert `#note` shows "entry locked" and the server entry
   is unchanged
3. Legs table renders LOCKED on the entry row after a fill

## Phases

1. App changes the suite depends on: `GET /api/quote` (last tape trade,
   needed for fill tests), `pending` added to `/status` (the CANCELING
   lock made visible), and `POST /api/flatten` (market order that
   closes the symbol position). Flatten is not test scaffolding:
   deactivate-while-filled cancels the children and leaves the entry
   position naked, and the GUI had no way to close it
2. `test/bracket/run-bracket-test.sh`
3. `test/bracket/bracket-api.mjs`. Runs scenarios 1-7 and 9 in
   part one, then leaves a resting SPY bracket on the book. The
   runner restarts the app and the script runs again with the
   `reconnect` argument for scenario 8
4. `test/bracket/bracket.spec.mjs`
5. Full run against paper (4001 or 7497), fix what the suite finds, then record
   results back into `test/validation/bracket-validation.md`

## Known risk in the suite

Scenario 9 asserts the validation-doc behavior: a parent rejected by
IB returns the machine to closed with nothing resting. The current
`bracket.ts` does not do that on a reject, so scenario 9 is expected
to fail on the first run. That failure is the suite working as
intended; the fix lands in phase 5

## Done criteria

- Runner exits nonzero on any failed scenario and prints a PASS/FAIL
  line per scenario
- API layer passes against paper (4001 and 7497) with the book left flat
- Playwright layer passes headless with the global chromium
- `bracket-validation.md` updated with what the suite proved and what
  stays inspection-only
