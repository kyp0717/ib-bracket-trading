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
knows (app modules live in `src/`):

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

## GUI layout contract

- One header only. The top header is the single control bar (ticker
  form, position/pnl, connection pill). The ticker form holds the input,
  the size dropdown (10/100/500), and the icon submit. There is no
  second header row: a second header stacks a row onto the right-hand
  side only,
  which pushes the bracket and order rails down while the chart top
  stays at the pane top, so chart and rails no longer share a top edge.
- Bracket rail, order rail, and chart must keep aligned top edges at all
  viewport sizes. A layout drive must prove this after any header change.
- The ticker input doubles as the viewed-symbol indicator: it always
  shows the current symbol and submits a new one. The chart carries a
  large low-opacity watermark of the symbol so a glance or a screenshot
  names the ticker.

## SDLC workflow (incremental builds)

All builds are incremental. The full design is never known at the
start, so every change runs the same loop, scoped to the delta in
front of it. Working style comes from the poteto-mode playbooks; the
repo-specific steps live here.

0. **classify** — first decide the mode: a **change** (new behavior)
   or a **defect** (existing behavior violates its contract). Defects
   reproduce on the same surface and root-cause to the mechanism
   before step 1; the root cause becomes a fixed constraint on the
   design. Then name the data shape (a type in `wire.ts`), the proof
   pair, and the owning area.
1. **design** — sketch two or three candidate shapes, judge against
   this file's contracts, pick one, record why the losers lost.
2. **interrogate** — gated, not fixed: only on ties, or when the change
   touches order paths, live account rules, or a wire type.
3. **implement** — plain work, smallest change that fits the pick.
4. **test** — author the proof pair (data proof first, then visual) as
   drives in `.pi/skills/verify-bracket-web/`, and update that skill's
   feature map in the same commit.
5. **validate** — doctor, drive the changed feature, prove with
   pass/fail lines and saved evidence, end flat.

Red at any point writes a lesson under `resource/lessons/` before the
loop continues.

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
  over from verification runs. The audit trail lives in S3 (see
  "Shared S3 store" below); drive evidence stays local to the run.
- When a machine-specific fact comes up for this project (a port that
  only listens on one host, a different IB port number, a different
  checkout path), record it in this file under "Machine-specific facts"
  below so the other machine knows.

## Shared S3 store

The audit trail follows the operator between machines. Bucket
`amzn-s3-trading-audit`, keys prefixed by the short hostname
(`os.hostname()`), never hardcoded:

- Audit trail: `audit/<host>/<YYYY-MM-DD>/chunk-<epoch>-<n>.log`,
  written by `log.ts` in 2 second flushes (sync flush on SIGTERM/SIGINT).
  The app keeps only an in-memory ring of the last 2000 lines, served
  at `GET /api/audit` for verification and debugging.

Recreate steps on each machine: AWS CLI v2 (ls-trader installs it at
`~/.local/bin/aws`), then export `TRADER_S3_ACCESS_KEY` and
`TRADER_S3_SECRET_KEY` (copied from `ls-trader/.env`) plus optionally
`TRADER_S3_REGION` before starting the app. The bucket
name is fixed in `s3.ts` (`BRACKET_S3_BUCKET` overrides it); the
ls-trader `TRADER_S3_BUCKET` variable is intentionally ignored here.

## Machine-specific facts

- woodlawn: IB Gateway **paper** listens on port 4002, same as linden.
  IB Gateway **live** is 4001 on both machines.
- linden: IB Gateway **paper** listens on port 4002 (not 4001). The earlier
  note that 4002 was a live port was wrong; it is paper and safe for
  destructive drives.
- linden: the IB Gateway paper socket drops occasionally mid-run (a few
  times per hour). The app reconnects and reconciles on its own; expect
  extra `reconcile` lines in the audit trail during a run and do not treat
  them as failures by themselves.

## IB endpoints, live vs paper

| Program    | Live        | Paper                        |
|------------|-------------|------------------------------|
| IB Gateway | 4001        | 4002                         |
| TWS        | unconfirmed | 7497 (believed, unconfirmed) |

IB Gateway ports are confirmed on both machines: 4001 is live, 4002 is
paper (confirmed on linden 2026-10-14 and on woodlawn 2026-10-23 with
the paper gateway listening on 4002). TWS ports are still unconfirmed.
The 2026-10-08 remap note claimed 7497 live and 7500 paper; the
operator now reports 7497 as TWS paper (the vendor default). Confirm
each TWS port with a paper login before treating either as safe for
destructive drives.

Two consequences to respect:
- The app defaults to `--ibport 4001`, which is LIVE. Every paper run
  must pass the paper port explicitly, and no verification path may
  ever be pointed at 4001.
- While the app points at a live account it places real orders on
  activation, and the restart reconcile sweep cancels unadopted
  standalone LMT/MKT orders it finds. Keep the app the only order path
  on that account.

## Testing and validation

The active verification path is the poteto-mode skill
`.pi/skills/verify-bracket-web/`. It owns launch (hostname-mapped paper
port, single-instance refusal), doctor (process, HTTP, IB port,
connected+reconciled gate), Playwright drives, the feature map under
its `features/` directory, and local evidence under its `evidence/`
directory that survives cleanup. To verify a change: launch, doctor,
drive the mapped feature, capture evidence, clean up.

- The static gate stays: `tsc --noEmit` over `src/` against the wire
  types in `wire.ts`. Run it before any verification pass; a type break
  fails in seconds, gateway closed.
- Paper endpoints only, both safe for destructive drives: IB Gateway
  paper is 4002 (confirmed on both machines). TWS paper is unconfirmed
  (operator believes 7497). 4001 is IB Gateway LIVE and no verification
  path may ever point at it.
- Drive order paths only while the regular session is open and finish
  by 15:45 ET. Flatten uses a MKT order, and after the 16:00 ET
  close the gateway queues MKT orders for the next open while still
  accepting them. The app reports ok and the position silently
  survives. See
  resource/lessons/20261013-market-orders-are-limit-only-outside-regular-hours.md.
- GUI behavior is proven by driving the real page with Playwright,
  never by reading page source. If a change touches page.html, a web
  drive must cover it.
- Every new behavior needs two proofs, in this order. First the data
  proof: the values that cross the wire (SSE payload or HTTP
  response). Then the visual proof: the same values in the rendered
  page. One proof without the other is not done.
- Every check is one named pass/fail line reached through a wait with
  a timeout. Never sleep and hope, never console.log and eyeball.
- Design decisions no drive can express, carried here so they
  survive renames: FILLED stands in for PARTIAL in e2e because partial
  fills cannot be forced reliably on paper, and the FILLED path
  exercises the same entry-lock code. Move-during-canceling is refused
  rather than queued and stays untested because the refusal window is
  milliseconds.
- Every issue found in a run, especially edge cases, gets a lesson
  file in `resource/lessons/` before the work is committed, per the
  lesson-learned skill: `domain.<YYYYMMDD>.<title>.md` for knowledge
  about the outside world, `edge.<YYYYMMDD>.<title>.md` for a case the
  happy path missed. Design decisions no drive can express go into
  AGENTS.md, not into code comments or lesson files.
- Never leave a position or a resting bracket on the paper account when
  a session ends. Flatten and deactivate before stopping.

## Archive

The `archive/` directory holds the retired pre-poteto scenario suite and
feature inventory. It is reference material only. Do not search or read
it, or any file inside it, during normal work. Consult it only when a
task or the operator explicitly asks.

## Speed rules

- `npm install && npx tsx src/server.ts` must run the app. Nothing else
- Every iteration is edit, restart, click activate. Target under ten
  seconds round trip
- A new dependency needs one sentence of justification in the commit
  message. Prefer the stdlib
- The GUI is ugly by default. Function first; a plain dark page is
  enough

## Environment facts that shape verification

- TWS reports API cancels as status `ApiCancelled`, not `Cancelled`.
  Treat it as a terminal cancel everywhere
- `tickByTickAllLast` fires `(reqId, tickType, time as string, price,
  size)`. Skip tickType, Number() the time
- TWS replays open orders on connect before nextValidId. Reconcile
  starts on the `connected` event, not on nextValidId
- Connection identity in the header pill is split by source: program
  (IBGW/TWS) comes from the port mapping in "IB endpoints, live vs
  paper", and account (PAPER/LIVE) comes from the `managedAccounts`
  account list, where paper accounts start with DU. The broker's DU
  prefix is the only ground truth for paper vs live; never derive
  account type from the port
- The gateway replays children before their parent on reqOpenOrders;
  reconcile must buffer orphans (fixed in bracket.ts, lesson in
  resource/lessons/)
- TWS sometimes sits on an order batch for tens of seconds (2109
  warning). Fill check timeouts are 60s, not 30s
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
  unknown>`. The compiler runs before any verification pass; make it earn its
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
  against them, and `npx tsc --noEmit` fails the run on any drift.

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
