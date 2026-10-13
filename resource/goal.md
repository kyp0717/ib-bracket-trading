# Goal: bracket trading app

## Purpose

Build a working bracket-order web app against IB Gateway in the
simplest and fastest possible way.

## Language and library

TypeScript on Node.js. One language for server and GUI.

- IB client: `@stoqey/ib`, the maintained port of the official IB
  Java API. Bracket orders are its native feature
  (parent plus children with `parentId` and `ocaGroup`)
- Runtime: `tsx` for no-build execution. Save the file, restart, done
- HTTP: stdlib `node:http` or a single tiny dep. No framework
- No build step, no bundler, no transpile pipeline, no monorepo

## What it does

- Connect to IB Gateway, paper port 4001 by default. TWS paper is
  7497. See Testing ports below
- Show connection status and next valid order ID
- Chart with three timeframes: 10 seconds, 1 minute, 1 day.
- Build 10s and 1m chart using ib request historical bar with 10s and 1m parameter.
  1d loads daily historical bars
- Draggable horizontal lines on the chart for entry, stop, and
  target. Drag sets the level, release pushes it to the server.
  Colors match tradehub-go: entry and target yellow, stop red dashed
- Activate button places a native 3-order IB bracket from the chart
  levels. Parent limit or market, stop-loss child, take-profit child,
  children in an OCA group. Order entry always passes a confirm modal
- Deactivate cancels the real resting orders at the gateway
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
- Two SSE pipes: `/events` carries execution traffic (conn, bracket,
  audit), `/market` carries data traffic (hist, bar, tape, depth).
  The fan-out to browsers is deferred with setImmediate so an IB
  order callback returns before serialization. Order-path tasks stay
  short and synchronous-free

## IB facts that shape the build

- Historical bars come at 10s, 1m second granularity only.
- 1m can also come from a keep-up-to-date historical request that
  streams bar updates
- Daily bars come from a plain historical request
- Tick-by-tick last trades power the tape. One tick-by-tick
  subscription per symbol. The event fires (reqId, tickType, time as
  string, price, size): skip tickType and Number() the time
- Market depth allows at most 3 simultaneous requests. Cancel on
  symbol switch
- Error codes 2104, 2106, 2158 are info messages, not failures
- A cancel acked by the API arrives as status ApiCancelled, not
  Cancelled. Treat it as a terminal cancel everywhere
- History backfill sizes: 10s loads "14400 S" of "10 secs" bars,
  1m loads "2 D" of "1 min" bars, 1d loads "6 M" of "1 day" bars
- Client IDs: tradehub-go claims the lowest free ID from a /tmp
  registry. This app must use a high fixed ID such as 90 so both
  apps can run side by side. Two connections with the same client
  ID kick each other

## Testing ports

Both endpoints are paper accounts. Fills, rejects, and cancels cost
nothing. Go crazy.

- 4001: IB Gateway paper. The app default, `npx tsx server.ts`
- 7497: TWS paper. Run `npx tsx server.ts --ibport 7497`
- Full suite on either port:
  `bash test/e2e/bracket/run-bracket-test.sh 4001` or `... 7497`

## Bracket Safety 

Mechanical safety only. 

- One live bracket for the whole app, whatever the symbol. Activating
  while a bracket is working is a no-op, never a second bracket
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
  callbacks before allowing new activations
- Prevent entering short position. Structural: the parent is always
  a BUY, the children always SELL the same quantity

## Speed rules

- `npm install && npx tsx server.ts` must run the app. Nothing else
- Every iteration is: edit, restart, click activate. Target under 10
  seconds round trip
- New dependencies need one sentence of justification in the commit
  message. Prefer stdlib
- The GUI is ugly by default. Function first, a plain dark page is
  enough


## Done criteria

- `npx tsx server.ts` connects to paper 4001 and serves the page
- Activate places a native 3-order bracket visible in TWS or Gateway
- Deactivate cancels it at the gateway
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
- The e2e suite passes on both paper ports, 4001 and 7497
