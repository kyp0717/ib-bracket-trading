# How validation works in this repo

Date: 2026-10-12. Status: working notes, read before adding tests.

## The two layers

Every behavior is tested at the lowest layer that can see it.

- **API layer** (`*.mjs` next to the runner, e.g. `bracket-api.mjs`).
  Plain HTTP calls against our own server (`POST /api/bracket/activate`
  and friends), plus SSE streams watched for live state (conn and
  bracket on `/events`, data on `/market`), plus `audit.log` greps to
  prove the gateway really acked. No browser. All order-state and
  gateway behavior lives here.
- **Browser layer** (`*.spec.mjs`, e.g. `bracket.spec.mjs`). Playwright
  drives a real browser. Only for things a human can see: modals, button
  clicks, drag feedback, DOM rendering. If curl can prove it, it does
  not belong here.

The chain under test is always: test script -> server.ts -> IB
Gateway/TWS. The tests never talk to IB directly.

## Anatomy of one check

Every assertion follows one shape:

```js
await waitFor('entry fill', 60000, () => br() && br().entryLocked);
pass('entry filled, entryLocked set');
```

or, in the browser layer:

```js
await page.waitForFunction(
  () => document.getElementById('ch-col').textContent.includes('LOCKED'),
  null, { timeout: 15000 },
);
pass('entry row renders LOCKED after fill');
```

Rules that keep the suite trustworthy:

- One assertion = one `pass(name)` / `fail(name, what-you-saw)` line.
  The name must say what broke, so a red line points at the regression
  without opening the code.
- Always wait for a condition (`waitFor`, `waitForFunction`). Never
  `sleep` and hope. Every wait has a timeout that fails the test.
- Never `console.log` and eyeball. If it is worth watching once, it is
  worth a PASS/FAIL line.

## The moving parts

- `run-*-test.sh` is the director. It kills stray app processes, starts
  `npx tsx server.ts --ibport <port>`, greps the log for the
  `connected to` handshake line, runs each suite layer, kills the app,
  prints a summary, exits nonzero on any failure. The bracket runner
  restarts the app mid-run on purpose: one scenario covers "app died and
  came back, did reconcile rebuild state".
- `sse.mjs` is a 25-line EventSource replacement. Node has no global
  EventSource on this machine. Reuse it from every new suite.
- The plan doc under `test/validation/` (recipe) is written before or
  alongside the code (dish). One line per scenario, name, what it
  expects, known gaps. Date it.

## Adding a check to an existing area

1. Write the scenario line in the area's validation doc.
2. Add the pass/fail block to the area's `.mjs` file. API behaviors go
   in the api file, DOM behaviors in the spec file.
3. Run just that file while iterating (app must be live):

   `node test/e2e/bracket/bracket-api.mjs`

4. Run the area runner, then the full suite, before committing:

   `bash test/e2e/bracket/run-bracket-test.sh 7497`

## Adding a brand new area (example: market depth)

1. Create `test/e2e/<area>/` with three files:
   `run-<area>-test.sh`, `<area>-api.mjs`, `<area>.spec.mjs`. Copy the
   bracket files as templates.
2. `<area>-api.mjs`: copy the boilerplate (imports incl. `./sse.mjs`,
   pass/fail, waitFor, api helper). Extend the SSE `onmessage` to
   capture the message types your area cares about. Each scenario: poke
   the app, wait for state, assert, pass/fail.
3. `<area>.spec.mjs`: copy the playwright boilerplate. Load `/`, wait
   for the DOM you need, compare rendered output against the SSE state.
4. Runner: same skeleton as the bracket runner. Keep the restart phase
   only if a scenario needs it.
5. Add `test/e2e/run-all.sh` (or extend it) calling each area runner,
   sharing the port argument, exiting nonzero on any failure.
6. Add `test/validation/<area>-validation.md` with the scenario mapping.

## Environment facts that will bite you

- Both paper ports are safe for destructive scenarios. 4001 is IB
  Gateway paper, 7497 is TWS paper. Run the full suite as
  `bash test/e2e/bracket/run-bracket-test.sh 4001` or `... 7497`.
- TWS reports API cancels as status `ApiCancelled`, not `Cancelled`.
- `tickByTickAllLast` fires `(reqId, tickType, time as string, price,
  size)`. Skip tickType, Number() the time.
- TWS replays open orders on connect before nextValidId. Reconcile must
  start on the `connected` event, not on nextValidId.
- TWS sometimes sits on an order batch for tens of seconds (2109
  warning). Timeouts on fill scenarios should be 60s, not 30s.
- Orders placed by clientId 90 can only be cancelled by clientId 90.
  A cleanup probe needs the same clientId as the app.
- `pkill -f "tsx server.ts"` matches your own shell command line if the
  string appears in it. Use the bracket trick `tsx serve[r].ts` for
  ad-hoc kills, or let the runner scripts do it.
