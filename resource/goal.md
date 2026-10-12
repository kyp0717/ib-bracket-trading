# Goal: bracket-only trading app, zero abstraction

Date: 2026-10-11. Status: experiment spec, not yet built.

## Purpose

Build a working bracket-order web app against IB Gateway in the
simplest possible way, then compare it against tradehub-go. tradehub-go
is layered, abstraction-driven, and built for change. This experiment
deliberately throws all of that away and optimizes for one thing only.
Speed from empty directory to a placed, protected bracket trade.

The comparison is the point. Measure time to first working bracket,
file count, total lines, and iteration speed against the equivalent
path in tradehub-go.

## Language and library

TypeScript on Node.js. One language for server and GUI.

- IB client: `@stoqey/ib`, the maintained port of the official IB
  Java API. Bracket orders are its native feature
  (parent plus children with `parentId` and `ocaGroup`)
- Runtime: `tsx` for no-build execution. Save the file, restart, done
- HTTP: stdlib `node:http` or a single tiny dep. No framework
- No build step, no bundler, no transpile pipeline, no monorepo
- Rust rejected: slow compile loop, immature IB crates
- Go rejected: same language as tradehub-go, the comparison would
  confound language with architecture

## Anti-goals

Everything tradehub-go does for future-proofing is out.

- No layers, no `internal/` tree, no dependency direction rules
- No domain package, no broker adapters, no second broker, ever
- No message bus, no topics, no typed messages, no drop policy
- No interfaces defined anywhere except where a test needs one
- No config files, no YAML, no registry, no strategy engine
- No rules, no algo engine, no backtest path
- No scanner, no screener, no watchlists, no symbols beyond the one
  typed into the page
- No indicators beyond MACD
- No comments-as-documentation burden, no 500-line file limit.
  Fit the app in a handful of files
- No tests beyond the one or two that prove the bracket state logic.
  This app is verified by placing orders on paper

If a change needs new plumbing, the design is wrong. Flatten it.

## Shape

One process. One IB connection. One page.

```
bracket-web/
├── package.json
├── server.ts          # http server, routes, static page, SSE
├── ib.ts              # IB connection, callbacks, order placement
├── bracket.ts         # per-symbol bracket state, entry lock, cancel
├── chart.ts           # bar aggregation, history backfill, tape, depth
├── page.html          # the whole GUI, inline JS and CSS
└── log.ts             # append-only audit log
```

Every file imports freely in any direction. Shared state is module
level. There is no wrong direction because there is no direction.

The web page and the order logic live in the same process and share
the same state by direct function call. No bus between them.

## What it does

One page, five panels: chart, tape, depth, order status, controls.

- Connect to IB Gateway, paper port 4002 by default
- Show connection status and next valid order ID
- Chart with three timeframes: 10 seconds, 1 minute, 1 day.
  TradingView lightweight-charts, same library as tradehub-go
- 10s and 1m aggregate IB 5-second realtime bars into buckets.
  1d loads daily historical bars
- Draggable horizontal lines on the chart for entry, stop, and
  target. Drag sets the level, release pushes it to the server.
  Colors match tradehub-go: entry neutral, stop red, target green
- Arm button places a native 3-order IB bracket from the chart
  levels. Parent limit or market, stop-loss child, take-profit child,
  children in an OCA group
- Disarm cancels the real resting orders at the gateway
- Level edits while working cancel and replace the whole bracket.
  After any fill, entry locks and only stop and target move,
  modified in place on the same order IDs
- Tape: tick-by-tick last trades, newest first, price colored
  against the previous trade
- Depth: level 2 bid and ask grid from market depth. Never more
  than 3 simultaneous depth requests, cancel what you open
- MACD panel under the price chart, computed from the visible bars
- Order status panel with one row per leg: parent, stop, target.
  Each row shows state, filled quantity, average fill price. The
  entry row shows a lock once any parent fill arrived
- All live updates push over one SSE stream
- No safety-by-analysis. The only place-time gates are mechanical:
  one live bracket per symbol, and arms refused until reconnect
  reconcile has finished. No quantity caps, notional caps, port
  checks, or enabled flags
- Manual action only. No automation, no strategies, no scanner

## IB facts that shape the build

- Realtime bars come at 5 second granularity only. 10s and 1m
  charts are built by bucketing them
- 1m can also come from a keep-up-to-date historical request that
  streams bar updates
- Daily bars come from a plain historical request
- Tick-by-tick last trades power the tape. One tick-by-tick
  subscription per symbol
- Market depth allows at most 3 simultaneous requests. Cancel on
  symbol switch
- Error codes 2104, 2106, 2158 are info messages, not failures
- History backfill sizes: 10s loads "14400 S" of "10 secs" bars,
  1m loads "2 D" of "1 min" bars, 1d loads "6 M" of "1 day" bars
- Client IDs: tradehub-go claims the lowest free ID from a /tmp
  registry. This app must use a high fixed ID such as 90 so both
  apps can run side by side. Two connections with the same client
  ID kick each other

## Safety, kept

Mechanical safety only. No risk analysis, no gates on quantity,
notional, or port. If it is not a mechanical invariant, it is out.

- One live bracket per symbol. Arming while a bracket is working is
  a no-op, never a second bracket
- Never block inside an IB callback. Hand the event to the state
  code and return
- Every place, cancel, modify, reject, and fill lands in an
  append-only audit log with timestamp, symbol, and reason
- Order entry in the GUI requires an explicit confirm step, a modal
  or a typed confirm, not a single click
- Cancellations always pass, cancel is the escape hatch and must
  never be blocked
- After a partial parent fill, the bracket must never be replaced
  whole. Only the stop and target children move, by same-order-ID
  modify
- If the connection drops, resting orders at IB keep protecting the
  position. Reconnect and reconcile from openOrder and position
  callbacks before allowing new arms

## Speed rules

- `npm install && npx tsx server.ts` must run the app. Nothing else
- Every iteration is: edit, restart, click arm. Target under 10
  seconds round trip
- New dependencies need one sentence of justification in the commit
  message. Prefer stdlib
- When two designs compete, pick the one with fewer files and fewer
  concepts, then move on
- The GUI is ugly by default. Function first, a plain dark page is
  enough

## Build order

1. `ib.ts`: connect to 4002, log nextValidId and error codes,
   treat 2104 and friends as info
2. `server.ts`: one route serving `page.html`, one `/events` SSE
   stream, one `/status` JSON route
3. `bracket.ts`: one machine per symbol, arm, disarm, entry lock,
   modify children in place
4. `chart.ts`: 5s bar bucket to 10s and 1m, daily history backfill,
  tick-by-tick tape, market depth
5. `page.html`: chart with draggable levels, tape, depth grid, MACD
  panel, leg status rows, form with confirm step
6. Audit log and SSE push for order status and fills
7. Reconnect and reconcile pass

## Done criteria

- `npx tsx server.ts` connects to paper 4002 and serves the page
- Arm places a native 3-order bracket visible in TWS or Gateway
- Disarm cancels it at the gateway
- Entry locks after fill, stop and target modify in place after
- Every order action appears in the audit log
- Order entry requires explicit confirmation in the GUI
- Chart shows 10s, 1m, and 1d bars for the active symbol
- Entry, stop, and target lines render on the chart and drag updates
  the levels on release
- Tape shows tick-by-tick trades and depth shows the live book
- MACD renders under the price chart
- Each bracket leg shows state, filled quantity, and fill price
- The whole app is under roughly 2000 lines and 9 files

## Comparison record

When done, record against tradehub-go.

- Wall-clock time from empty directory to first paper bracket placed
- File count and total lines against the equivalent tradehub-go path
  (ibgw plus execution plus bracket plus webserver bracket page)
- Number of concepts a new reader must learn before placing a trade
- Iteration round trip time for one GUI change
- Where the flat design hurt first. That pain is the finding
