# Agent Instructions: ib-bracket-trading

Bracket-order trading web app against IB Gateway / TWS, in TypeScript
on Node.js. One language for server and GUI, no build step. This file
is the design contract and the validation recipe; the lessons in
resource/lessons/ carry what the runs taught us, and
resource/go-live/ carries the path to real money.

## Audience: the developer is not a frontend engineer

The developer's background is data analytics, not frontend work. Assume
no knowledge of browser internals. When explaining anything about how
this app is built:

- Explain frontend concepts from zero. Do not assume familiarity with
  the DOM, CSS layout, browser events, or rendering libraries. A good
  explanation names what the piece is, what job it does, and why the
  code is shaped the way it is.
- Prefer analogies to data pipelines over UI vocabulary. This developer
  understands data flowing through stages; map UI ideas onto that.
- When a change touches page.html, explain what the user would see
  before and after, not just what the code does.
- Keep explanations in plain words. No frontend jargon without a
  one-line definition next to it.

How the app is put together, in pipeline terms the developer already
knows (app modules live in `src/`, shared test helpers in `test/util/`):

- `src/server.ts` is the intake. It serves one static page and a handful of
  POST endpoints. Each endpoint calls straight into the state modules.
  No framework.
- `bracket.ts` is the order state machine. The only owner of bracket
  state. Everything order-related lands here.
- `chart.ts` is a cache of market data. It holds the latest bars, tape,
  and book in memory and answers snapshot questions.
- `ib.ts` is the wire. It owns the socket to IB Gateway/TWS and
  forwards every IB event to bracket.ts or chart.ts. Callbacks never
  block.
- `page.html` is the whole GUI. One file: the markup (what exists), the
  CSS (how it looks), and the script (what happens on clicks and
  updates). The script connects to `/events` and redraws panels when
  messages arrive, the same way a dashboard refreshes when a query
  result changes. The chart library (lightweight-charts) is loaded from
  a CDN, not installed.
- `emit.ts` is the fan-out. Two SSE pipes push live updates to the
  browser: `/events` for execution traffic (orders, audit), `/market`
  for data traffic (bars, tape, depth). The split keeps heavy data
  messages from queueing behind order events.

## Two-Machine Workflow (woodlawn ↔ linden) — IMPORTANT

Development happens on two machines, **woodlawn** and **linden**. ALL
work must transfer cleanly between them (copied from
`~/work/ls-trader/AGENTS.md`, same rules apply here):

- **Identify the machine FIRST — before any development or analysis.**
  Run `hostname` as the first action of every session. Machine-specific
  facts differ between the two hosts, and acting on the wrong assumption
  breaks things.
- **Commit everything portable to git** — code, scripts, docs, plans.
  Do not leave finished work uncommitted on one machine.
- **Never hardcode machine-specific paths, IPs, hostnames, or users in
  tracked files.** Render them at setup time.
- **Per-machine state stays out of git** and must have documented
  recreate steps. For this repo that means: IB Gateway / TWS login
  state, `node_modules`, and any local paper-account positions left
  over from test runs. Audits and evidence no longer live on either
  machine; they live in S3 (see "Shared S3 store" below).
- When a machine-specific fact comes up for this project (a port that
  only listens on one host, a different IB port number, a different
  checkout path), record it in this file under "Machine-specific facts"
  below so the other machine knows.

## Shared S3 store

Audits and evidence follow the operator between machines. Bucket
`amzn-s3-trading-audit`, keys prefixed by the short hostname
(`os.hostname()`), never hardcoded:

- Audit trail: `audit/<host>/<YYYY-MM-DD>/chunk-<epoch>-<n>.log`,
  written by `log.ts` in 2 second flushes (sync flush on SIGTERM/SIGINT).
  The app keeps only an in-memory ring of the last 2000 lines, served
  at `GET /api/audit` for tests and debugging.
- Evidence: `evidence/<host>/<area>-<phase>-<nn>-<story>-<what>.png`
  for screenshots (same names as before) and
  `evidence/<host>/<area>-app-<timestamp>.log` for runner app logs.
  Missing credentials fall back to `test/evidence/` locally and say so
  in the console, so evidence is never lost.

Recreate steps on each machine: AWS CLI v2 (ls-trader installs it at
`~/.local/bin/aws`), then export `TRADER_S3_ACCESS_KEY` and
`TRADER_S3_SECRET_KEY` (copied from `ls-trader/.env`) plus optionally
`TRADER_S3_REGION` before starting the app or the suite. The bucket
name is fixed in `s3.ts` (`BRACKET_S3_BUCKET` overrides it); the
ls-trader `TRADER_S3_BUCKET` variable is intentionally ignored here.

## Machine-specific facts

- linden: IB Gateway **paper** listens on port 4002 (not 4001). The earlier
  note that 4002 was a live port was wrong; it is paper and safe for
  destructive scenarios. Run the suite here as `bash test/run-all.sh 4002`.
- linden: the IB Gateway paper socket drops occasionally mid-run (a few
  times per hour). The app reconnects and reconciles on its own; expect
  extra `reconcile` lines in the audit trail during a run and do not treat
  them as failures by themselves.

## IB endpoints, live vs paper

| Program    | Live | Paper |
|------------|------|-------|
| IB Gateway | 4001 | 4002  |
| TWS        | 7497 | 7500  |

IB Gateway ports are the vendor defaults, confirmed on linden
2026-10-14: 4001 answered as a real, live account; 4002 is paper. TWS
ports on this setup were remapped on 2026-10-08 (vendor defaults are
7496 live and 7497 paper; here 7497 is live and 7500 is paper, per the
tradehub-go setup notes). An older line in this file called 7497 TWS
paper; that predates the remap. Treat the TWS ports as unconfirmed
until a paper login is tested on each machine.

Two consequences to respect:
- The app defaults to `--ibport 4001`, which is LIVE. Every paper run
  must pass the paper port explicitly, and nothing under `test/` may
  ever be pointed at 4001.
- While the app points at a live account it places real orders on
  activation, and the restart reconcile sweep cancels unadopted
  standalone LMT/MKT orders it finds. Keep the app the only order path
  on that account.

## Testing and validation

- `run-all.sh` starts with the static gate: `tsc --noEmit` over the
  app and every test against the wire types in `wire.ts`. A type break
  fails in seconds, gateway closed, and no suite starts. Then each
  area runner runs in turn.
- Paper endpoints only, both safe for destructive scenarios: IB Gateway
  paper is 4002 and TWS paper is 7500 on this setup (see "IB endpoints,
  live vs paper" above; the TWS paper port is remapped and unconfirmed).
  4001 is IB Gateway LIVE and must never host a test run or a scenario.
  Full suite (regular hours only): `bash test/run-all.sh 4002` on
  linden.
- Run the full suite only while the regular session is open and aim to
  finish by 15:45 ET. Flatten uses a MKT order, and after the 16:00 ET
  close the gateway queues MKT orders for the next open while still
  accepting them. The app reports ok and the position silently
  survives, which turns later scenarios red in confusing ways. See
  resource/lessons/20261013-market-orders-are-limit-only-outside-regular-hours.md.
- Each test area lives in its own folder under `test/`:
  `initialization/`, `bracket/`, `depth/`, `ticks/`, `order-at-server/`,
  `scanner/`, `web-interface/`, `health-check/`. Areas hold their
  scenarios as flat numbered files directly in the folder; no `api/`
  phase folder. Two subfolders remain because the runner treats them
  specially: `bracket/reconnect/` (runs after the runner restarts the
  app) and `bracket/web/` (behavior scenarios that drive the bracket
  state machine through the browser and chain with the flat bracket
  scenarios). Everything that proves presentation, layout, styling, and
  rendering, whatever area feeds it, lives in `web-interface/`.
  Shared helpers live in `test/util/`:
  `suite.ts` (pass/fail, waits, SSE state, typed API helpers, evidence
  paths), `web.ts` (browser setup and screenshots), `sse.ts`
  (EventSource replacement), and `ib-probe.ts` (independent IB client
  for server-side checks). All test code is TypeScript; scenarios
  run through `tsx`, and the static gate type-checks them on every run.
- GUI testing uses Playwright, through the `playwright-core`
  devDependency in `web.ts`. Every GUI behavior (modals, buttons,
  drag feedback, rendered panels) is proven by driving the real page
  in a browser, never by reading page source. Playwright is the only
  way the web layer is verified; if a change touches page.html, a web
  scenario must cover it.
- Every new behavior needs two proofs, in this order. First the data
  proof: an api scenario asserting the values that cross the wire
  (SSE payload or HTTP response). Then the visual proof: a web
  scenario asserting the same values appear in the rendered page.
  One proof without the other is not done: data without the visual
  check can render wrong and pass, and a visual check without the
  data check cannot say whether the app or the rendering lied.
- Scenarios are one numbered file per story, flat inside the area:
  `test/<area>/<nn>-<story>.ts`. One story per file: a scenario proves
  exactly one behavior and the file name says which. Numbers fix
  execution order, because scenarios chain when one leaves live state
  for the next. The runner
  loops every scenario file and keeps going after a failure, so one red
  scenario never hides the rest. A scenario exits nonzero on any failed
  check.
- Design decisions no scenario can express, carried here so they
  survive renames: FILLED stands in for PARTIAL in e2e because partial
  fills cannot be forced reliably on paper, and the FILLED path
  exercises the same entry-lock code. Move-during-canceling is refused
  rather than queued and stays untested because the refusal window is
  milliseconds. Scenarios chain: a scenario that needs a live bracket
  waits for the one the previous scenario left, and the chain ends with
  an explicit deactivate, so the book is always clean between areas.
- Every runner starts with the doctor step:
  `npx tsx test/health-check/health-check.ts <port>` proves the IB
  port is open, the app answers HTTP, and the app is connected and
  reconciled before any scenario runs. If the doctor fails, nothing
  starts.
- Evidence lives in the S3 bucket under `evidence/<host>/` (see
  "Shared S3 store"). Every
  artifact is named after the test that produced it, so a filename is
  all you need to trace back. Screenshots:
  `test/<area>/<path>/<nn>-<story>.ts` produces
  `<area>-<path>-<nn>-<story>-<what>.png`, generated automatically
  from the scenario file path, where `<path>` is empty for flat area
  scenarios. Example:
  `test/web-interface/03-size-defaults-to-one.ts` on abort writes
  `evidence/<host>/web-interface-03-size-defaults-to-one-aborted.png`,
  and `test/bracket/web/03-locked-entry.ts` writes
  `evidence/<host>/bracket-web-03-locked-entry-aborted.png`. App logs:
  `<area>-app-<timestamp>.log` from the runner. To diagnose a red
  scenario, pull its evidence object from S3 first.
- Every issue found in a run, especially edge cases, gets a lesson
  file in `resource/lessons/` before the work is committed: what was
  seen, why it happened, the fix, and the rule that falls out of it. A
  red scenario without a lesson is not finished. Naming and the full
  procedure live in the `lesson-learned` skill (`skills/lesson-learned/`):
  `domain.<YYYYMMDD>.<title>.md` for knowledge about the outside world,
  `edge.<YYYYMMDD>.<title>.md` for a case the happy path missed. Design
  decisions no scenario can express go into AGENTS.md, not into code
  comments or lesson files.
- To add a scenario: copy a sibling scenario with the next number
  (execution order, not history), name the file after what it proves,
  and follow the `build-test` skill (`skills/build-test/`): classify the
  change to pick the proof pair, and write checks as one
  `pass(name)` / `fail(name, what-you-saw)` line whose name says what
  broke, reached through `waitFor` with a timeout. Never sleep and
  hope, never console.log and eyeball.
- Never leave a position or a resting bracket on the paper account when
  a session ends. Flatten and deactivate before stopping.

## Speed rules

- `npm install && npx tsx src/server.ts` must run the app. Nothing else
- Every iteration is edit, restart, click activate. Target under ten
  seconds round trip
- A new dependency needs one sentence of justification in the commit
  message. Prefer the stdlib
- The GUI is ugly by default. Function first; a plain dark page is
  enough

## Environment facts that shape the tests

- TWS reports API cancels as status `ApiCancelled`, not `Cancelled`.
  Treat it as a terminal cancel everywhere
- `tickByTickAllLast` fires `(reqId, tickType, time as string, price,
  size)`. Skip tickType, Number() the time
- TWS replays open orders on connect before nextValidId. Reconcile
  starts on the `connected` event, not on nextValidId
- The gateway replays children before their parent on reqOpenOrders;
  reconcile must buffer orphans (fixed in bracket.ts, lesson in
  resource/lessons/)
- TWS sometimes sits on an order batch for tens of seconds (2109
  warning). Fill scenario timeouts are 60s, not 30s
- Orders placed by clientId 90 can only be seen and cancelled by
  clientId 90. A cleanup probe needs the same id as the app
- `pkill -f "tsx server.ts"` matches your own shell if the string
  appears in it. Kill in its own shell call, or use `server[.]ts`
  (lesson in resource/lessons/)

## Coding guidelines

- **No comments in code.** Never add comments when writing or editing
  code: names and structure carry the explanation, and the docs in
  `resource/` carry the why. A real constraint gets encoded in a type,
  a test, or a check, never a comment. When a change touches code that
  carries comments, strip them in that change and relocate anything
  load-bearing first (AGENTS.md or a lesson in resource/lessons/). No
  backward
  sweep: untouched code keeps its comments, and they are removed
  progressively as edits touch each file.

- **Types are the first test suite.** Every value that crosses a
  boundary (an SSE stream, an HTTP response, a function that hands
  data to another module) gets a named type in `wire.ts` or at the
  function boundary, never `any` and never `Record<string,
  unknown>`. The compiler runs before any suite; make it earn its
  keep. When a shape changes, change the type first and let the
  compiler point at every consumer. This is the Pocock rule: the
  type check is the cheapest red light you have.

## Safety

- Long-only by construction. The bracket parent is always a BUY, the
  children always SELL the same quantity. Never add a path that opens a
  short.
- One live bracket for the whole app, whatever the symbol.
- Cancellations always pass. Cancel is the escape hatch and must never
  be blocked.
- Every place, cancel, modify, reject, and fill lands in the
  append-only S3 audit trail (`audit/<host>/<date>/chunk-*.log`).
- Wire types live in `wire.ts`. Every payload that crosses an SSE
  stream or an HTTP response is declared there, the app compiles
  against them, and `npx tsc --noEmit` (the first step of
  `test/run-all.sh`) fails the run on any drift. Tests convert to
  TypeScript against these types last; until then they share the
  definitions by convention, not by import.

## Acronyms

- IBKR: Interactive Brokers, the broker the app connects to
- IB Gateway: IBKR's headless API server; TWS is the desktop
  workstation, same API through a different program
- TWS: Trader Workstation, IBKR's desktop app; remapped on this setup
  to live 7497 and paper 7500 (see "IB endpoints, live vs paper")
- SSE: Server-Sent Events, the one-way push pipes (/events, /market)
  that stream updates from the app to the browser
- OCA: One-Cancels-All, an IB order group where filling one order
  cancels the others. The stop and target legs share one OCA group
- RTH: Regular Trading Hours, 09:30 to 16:00 ET. Outside RTH the
  venues accept limit orders only
- ET: Eastern Time, the timezone all session rules use
- LMT: limit order, fills at the named price or better
- MKT: market order, fills at whatever the book offers; not accepted
  outside RTH
- STP: stop order, becomes a market order once the stop price trades
