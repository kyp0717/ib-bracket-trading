# bracket-web verification map

This directory is the maintained source for verifying the user-facing
behavior of bracket-web. Read this index before driving the app, then
use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `bash .pi/skills/verify-bracket-web/bin/launch.sh`, which
  maps `hostname` to the paper port (4002 on both machines) and
  refuses to start if port 8080 is already owned.
- Run `bash .pi/skills/verify-bracket-web/bin/doctor.sh` and require
  `connected:true, reconciled:true` before driving any order or data
  feature. Without it, only `render` and `header-ticker-form` apply.
- Paper port only. Nothing here may point at 4001 (IB Gateway LIVE).
- Fill paths run only inside 09:30-15:45 ET. Outside that window a MKT
  order queues for the next open and the position silently survives.
- Start and end every pass flat: no resting bracket, no position.
- At most one bracket live at a time; deactivate before the next feature.
- Never drive an app instance this run did not start.

## Driving conventions

- Start every recipe from the flat baseline unless its preconditions say
  otherwise.
- Prefer element ids (`#ch-input`, `#ch-arm`, `#ch-wm`) over CSS
  position or tab order. They are stable handles in `page.html`.
- Treat every command as literal; keep quoted names and flags unchanged.
- Browser actions run through Playwright. The smoke driver is
  `node .pi/skills/verify-bracket-web/bin/drive.mjs <feature>`; fuller
  recipes spell out Playwright steps and pair each with a curl data
  proof.
- Data proofs read `/status`, `/api/quote`, `/api/audit`, or an SSE
  message; they never read the DOM.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final
  screen.
- UI proof includes a screenshot and a `.state.json` snapshot with the
  app identity (title and symbol) visible.
- Data proof includes the exact request and its response body or SSE
  payload.
- Mutation proof includes a read-only second view (for example, an
  `activate` line in `/api/audit` after confirming the modal).
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet
  precondition. Do not report a skipped entry point as verified through
  a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing
the user-visible behavior. It then uses exactly four H2 sections in this
order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-bracket-web` starts with `Preconditions:` and
   uses labeled bullets that pair each user action with an exact command
   and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable
handles, required state, commands, and observable proof.

## Features

- [header-ticker-form](./header-ticker-form.md) covers the single
  control bar: ticker switch, size dropdown, and connection pill.
- [chart](./chart.md) covers the price chart, timeframe buttons, and the
  ticker watermark.
- [bracket-rail](./bracket-rail.md) covers the entry, exit, stop rows
  and their drag behavior.
- [confirm-modal](./confirm-modal.md) covers the dialog that gates
  bracket activation.
- [tape-depth](./tape-depth.md) covers the time-and-sales and depth grid
  columns.
