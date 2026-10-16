---
name: build-test
description: Use when adding, changing, or debugging a test in this repo. Chooses the area and proof pair, chains the scenario into the numbered order, and enforces the check pattern, the run discipline, and the evidence rules. The full testing contract lives in AGENTS.md; this skill is the procedure for writing the test itself.
---

# Build test

A test here is one story in one numbered TypeScript file, run through
`tsx`, type-checked with the app against `wire.ts` before any run. The
rules below are how this project's tests are actually built; follow
them and the scenario needs no reviewer's context.

## Step 0. Classify the change, pick the proof pair

Every new behavior needs two proofs, and the pair must be two
observations that fail in different ways. One observation alone can
lie: source without runtime can drift, runtime without source can be
wired wrong, the app and the broker can disagree, data can cross the
wire and render wrong.

- **Behavior that surfaces in the browser**: a data proof in the owning
  area's api scenario (the values that cross the wire, asserted from
  the SSE payload or HTTP response), then a visual proof in
  `web-interface/` or `bracket/web/` asserting the same values appear
  rendered in the page. One without the other is not done.
- **Critical data path or invariant**: a static guard
  (`00-check-<thing>-in-ast.ts`, walking the AST to prove how the code
  is written) paired with a runtime proof (an audit line, an S3
  object, a live subscription). The tape and live-bar guards are the
  model.
- **Broker-visible behavior**: the app's own state paired with the
  independent clientId-91 probe in `test/util/ib-probe.ts`. The app
  and a second client observing the same orders is the proof.
- **Exit and flatten paths**: the audit line paired with an
  independent read of the book or the broker position.

## Step 1. Pick the area and the number

Areas and what owns them:

- `initialization/` first boot, contract, schema.
- `bracket/` order state machine, flat numbered scenarios.
- `bracket/reconnect/` runs only after the runner restarts the app.
- `bracket/web/` behavior scenarios that drive the state machine
  through the browser.
- `depth/`, `ticks/` market data paths, including the static guards.
- `order-at-server/` what a second IB client can see and cancel.
- `scanner/` the candidate scanner.
- `web-interface/` everything about look, layout, and rendered values.
- `health-check/` the doctor; extend it when a new precondition starts
  mattering.

Copy the sibling closest to the story. Number it for execution order,
not history: scenarios chain, a file that needs live state waits on
what the previous file left, and inserting `10` between `09` and `11`
is normal. Name the file `nn-<story>.ts` after the single behavior it
proves.

## Step 2. Write the checks

- Start from `makeSuite('<area> nn <story>')`. Use `live()` for SSE
  state and typed API helpers, or `web.ts` for browser scenarios.
- Every assertion is one `pass(name)` or `fail(name, what-you-saw)`
  line, and `name` says what broke. A reader must know the damage from
  the name alone.
- Reach every check through `waitFor(name, timeout, probe)`. Never
  sleep and hope, never console.log and eyeball. Fill scenarios get
  60 seconds, not 30; TWS holds order batches that long (2109).
- Helpers live only in `test/util/`, typed against `wire.ts`. No
  `any`, no parallel implementations of an API helper.
- Paper ports only. Nothing under `test/` ever points at 4001.

## Step 3. Run it and leave evidence

- `./node_modules/.bin/tsc --noEmit` first; a type break fails before
  any gateway opens.
- Run through the area runner when the story is part of a chain; the
  doctor step proves port, HTTP, and reconcile before anything starts.
  Run a single scenario with `npx tsx` against a known-good app when
  iterating.
- Screenshots name themselves from the scenario file path and upload
  to S3. Snap in the catch block on abort, so a red scenario always
  leaves its evidence.
- A red scenario is not finished until the lesson file exists; that is
  the `lesson-learned` skill.

## Chain hygiene

- If the story leaves live state, say so in the story and make the next
  file consume it. End every chain with an explicit deactivate and a
  flat book; use `flattenUntilFlat` when a position may survive.
- Anything that needs fills runs inside 09:30 to 15:45 ET. After
  15:45, orders queue while reporting ok, and a flat-looking book can
  hide a live position (see the lessons).
- `bracket/reconnect/` scenarios must not assume which app instance
  answers; they run after a restart.

## What not to encode here

Design decisions no scenario can express (FILLED standing in for
PARTIAL, move-during-canceling refused, the stop-limit tradeoff) live
in AGENTS.md. Reference them, do not restate them, and never assert
around them.
