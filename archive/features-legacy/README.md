# Feature inventory

Behavior-level inventory of the app's user-facing surface. Agents read
the one file for the area under change before driving anything;
`validate` walks this index for broad regression sweeps. Written and
maintained only by the `track-feature` skill. Behavior level, grounded
in ids, routes, and visible state; short enough to run without reading
source.

## File contract

Every file answers the same four questions:

1. `Sub-features`: what exists, one line each, with the id or route.
2. `How to reach it`: the user path or API call that surfaces it.
3. `How to drive it`: Playwright steps or the exact request.
4. `What usually lies`: gotchas, each pointing at its lesson in
   `resource/lessons/` when one exists.

## Baseline preconditions

- App running and doctored: `npx tsx test/health-check/health-check.ts <port>`.
- Paper port only (4002). Nothing here points at 4001.
- Fill paths run inside 09:30 to 15:45 ET; outside that window treat
  them as unreachable and say so.
- Flat book at start and end of every pass. No resting bracket, no
  position.
- `page.evaluate` callbacks stay flat statements, no nested functions
  (lesson: edge.20261016.page-evaluate-callbacks-stay-flat).
- One bracket at most is live during a pass; deactivate before moving
  to the next feature file.

## Proof rules

- Presentation and layout claims: a web-ui scenario asserting rendered
  values, plus the data proof from the owning area when a wire value
  crosses. One without the other is not done.
- Broker-visible claims: the app's own state plus the clientId-91 probe
  in `test/util/ib-probe.ts`.
- Every check is one `pass`/`fail` line reached through `waitFor`.
  No sleeps, no eyeballing.
- Evidence lands under `evidence/<host>/` in the S3 bucket, named from
  the scenario path. Missing credentials fall back to
  `test/util/evidence/` locally.

## Index and sweep order

Sweep top to bottom for a broad regression pass.

1. [header-ticker-form](header-ticker-form.md): the single header bar:
   ticker input, size dropdown, switch icon, connection pill.
2. [position-pnl](position-pnl.md): POSITION and PNL readouts centered
   in the header.
3. [chart](chart.md): price chart, timeframe buttons, indicator tag,
   ticker watermark, level lines.
4. [bracket-rail](bracket-rail.md): entry, exit, stop rows with drag.
5. [order-rail](order-rail.md): leg status column next to the bracket
   rail.
6. [tape-depth](tape-depth.md): time and sales, depth grid columns.
7. [confirm-modal](confirm-modal.md): the activation confirmation
   dialog.

## Wire surface (grounded by graft)

- `POST /api/symbol` switch watched symbol.
- `POST /api/bracket/activate` place the bracket.
- `POST /api/bracket/deactivate` cancel it.
- `POST /api/bracket/flatten` market-flatten the position.
- `POST /api/bracket/levels` move levels.
- `GET /api/quote` snapshot.
- `GET /api/audit` recent audit ring.
- SSE `/events` execution traffic, `/market` data traffic.
