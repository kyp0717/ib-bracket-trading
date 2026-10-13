# Agent Instructions: ib-bracket-trading

Bracket-order trading web app against IB Gateway / TWS, in TypeScript
on Node.js. One language for server and GUI, no build step. Design
contract: `resource/goal.md`. Validation recipe:
`resource/how-validation-works.md`.

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
knows:

- `server.ts` is the intake. It serves one static page and a handful of
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
  state, `audit.log`, `node_modules`, and any local paper-account
  positions left over from test runs.
- When a machine-specific fact comes up for this project (a port that
  only listens on one host, a different IB port number, a different
  checkout path), record it in this file under "Machine-specific facts"
  below so the other machine knows.

## Machine-specific facts

(none recorded yet — add them here as they come up)

## Testing and validation

- `run-all.sh` starts with the static gate: `npx tsc --noEmit` over the
  app against the wire types in `wire.ts`. A type break fails in
  seconds, gateway closed, and no suite starts. Then each area runner
  runs in turn.
- Paper endpoints only, both safe for destructive scenarios. 4001 is IB
  Gateway paper, 7497 is TWS paper. Full suite:
  `bash test/run-all.sh 7497`
- Each test area lives in its own folder under `test/`: `bracket/`,
  `depth/`, `health-check/`. Shared helpers live at the test root:
  `suite.mjs` (pass/fail, waits, SSE state, evidence paths) and
  `web.mjs` (browser setup and screenshots).
- Scenarios are one file each inside phase folders: `api/` (HTTP + SSE
  data checks), `web/` (Playwright browser checks), `reconnect/`
  (bracket only, runs after the runner restarts the app). File names
  start with a number to fix execution order within a phase. The runner
  loops every scenario file and keeps going after a failure, so one red
  scenario never hides the rest. A scenario exits nonzero on any failed
  check.
- Every runner starts with the doctor step:
  `node test/health-check/health-check.mjs <port>` proves the IB port
  is open, the app answers HTTP, and the app is connected and
  reconciled before any scenario runs. If the doctor fails, nothing
  starts.
- Evidence lives in one folder, `test/evidence/` (gitignored). Every
  artifact is named after the test that produced it, so a filename is
  all you need to trace back. Screenshots:
  `test/<area>/<phase>/<nn>-<story>.mjs` produces
  `<area>-<phase>-<nn>-<story>-<what>.png`, generated automatically
  from the scenario file path. Example:
  `test/bracket/web/03-locked-entry.mjs` on abort writes
  `test/evidence/bracket-web-03-locked-entry-aborted.png`. App logs:
  `<area>-app-<timestamp>.log` from the runner. To diagnose a red
  scenario, read its evidence file first.
- To add a scenario: write the scenario line in the area's validation
  doc under `test/validation/`, copy a sibling scenario into the right
  phase folder with the next number, and follow the pass/fail pattern
  in `resource/how-validation-works.md`.
- Never leave a position or a resting bracket on the paper account when
  a session ends. Flatten and deactivate before stopping.

## Coding guidelines

- **No comments in code.** Never add comments when writing or editing
  code: names and structure carry the explanation, and the docs in
  `resource/` carry the why. A real constraint gets encoded in a type,
  a test, or a check, never a comment. When a change touches code that
  carries comments, strip them in that change and relocate anything
  load-bearing first (goal.md, the validation docs). No backward
  sweep: untouched code keeps its comments, and they are removed
  progressively as edits touch each file.

## Safety

- Long-only by construction. The bracket parent is always a BUY, the
  children always SELL the same quantity. Never add a path that opens a
  short.
- One live bracket for the whole app, whatever the symbol.
- Cancellations always pass. Cancel is the escape hatch and must never
  be blocked.
- Every place, cancel, modify, reject, and fill lands in the
  append-only `audit.log`.
- Wire types live in `wire.ts`. Every payload that crosses an SSE
  stream or an HTTP response is declared there, the app compiles
  against them, and `npx tsc --noEmit` (the first step of
  `test/run-all.sh`) fails the run on any drift. Tests convert to
  TypeScript against these types last; until then they share the
  definitions by convention, not by import.
