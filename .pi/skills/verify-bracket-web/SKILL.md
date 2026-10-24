---
name: verify-bracket-web
description: Drive the bracket-web trading app (Node/TypeScript web UI that places one bracket order against IB Gateway paper) and prove user-facing behavior with Playwright screenshots plus /status, /api/quote, /api/audit, and SSE evidence. Use to verify a feature or a regression on woodlawn or linden when the IB Gateway paper session is running.
---

# Verify bracket-web

bracket-web is a single-page trading UI served from
`src/apps/<provider>-main.ts` on `http://127.0.0.1:8080`. A user switches
a ticker, reads a price chart with tape and depth, arms one bracket
(entry/exit/stop), confirms it in a modal, and flattens with the Delete
key. The app runs one broker per process: `ib` talks to IB Gateway or TWS
over `--ibport`, and `alpaca` talks to Alpaca paper over the API keys.
Every drive below is scoped to the paper side of whichever provider the
run names.

Two machines share this repo. The app default (`--ibport 4001`) is IB
Gateway LIVE on every machine. Always pass the paper port explicitly.

| host     | paper ibPort | live ibPort |
|----------|--------------|-------------|
| woodlawn | 4002         | 4001        |
| linden   | 4002         | 4001        |

## Launch

Prerequisites, checked before anything drives:

- For `ib`: `hostname` known and in the table above, and IB Gateway
  paper running and logged in on the paper port. Login is per-machine
  state with manual recreate steps; the app serves the page without it,
  but no market data or orders arrive.
- For `alpaca`: `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY` set for the
  paper account (launch.sh refuses otherwise).
- `npm install` done once; `npx tsc --noEmit` passes (the static gate).

Launch the app:

```bash
cd /home/phage/work/ib-bracket-trading   # repo root on the current machine
bash .pi/skills/verify-bracket-web/bin/launch.sh          # ib (default)
bash .pi/skills/verify-bracket-web/bin/launch.sh alpaca   # alpaca
```

What launch.sh does: takes the provider as its first argument (default
`ib`), maps `hostname` to the paper port for `ib` and requires the two
Alpaca key vars for `alpaca`, refuses if port 8080 is already owned (do
not double-drive the shared paper account), starts the matching
`src/apps/<provider>-main.ts` entry under a new process group, and
records the group pid, ports, provider, and host in
`.pi/skills/verify-bracket-web/.run/`.

Readiness is the log line:

```
web ui on http://localhost:8080
```

in `.pi/skills/verify-bracket-web/.run/app.log`. The app keeps serving
the page even while IB is disconnected; "ready" means the web server is
up, not that IB is reconciled.

Teardown after any run, failed or not: `bash .pi/skills/verify-bracket-web/bin/cleanup.sh`.

## Doctor

One read-only check that decides whether this instance is worth
driving:

```bash
bash .pi/skills/verify-bracket-web/bin/doctor.sh
```

It reports four facts without mutating anything: the app process group
is alive, `/status` answers, the IB paper port is accepting connections,
and `/status` reports `connected` and `reconciled`.

Gate rules:

- `connected:true, reconciled:true` in `/status`: all mapped features
  are drivable, including order paths.
- `connected:false` or `reconciled:false`: only the two IB-independent
  features are drivable, `render` and `header-ticker-form`. Everything
  else is unreachable; report it with the attempted command and the
  unmet precondition, never claim it as verified.

Run the doctor again whenever anything looks off. A stale app (started
by another session, or left over) fails the "kill -0 the recorded pid"
check and the port-ownership check, which is correct: never drive an
instance this run did not start.

## Drive

Harness: Playwright through the repo's `playwright-core` devDependency,
chromium from `~/.cache/ms-playwright/chromium-1243`. Stable handles are
element ids, never coordinates or tab order.

Proof standard from AGENTS.md: every behavior needs two proofs. First
the data proof (a value that crosses the wire via `/status`,
`/api/quote`, `/api/audit`, or an SSE message), then the visual proof
(the same value rendered in the page). The skill's driver captures the
visual side; pair it with the matching curl/SSE check from the feature
file.

Smoke drive (IB-independent, works with IB down):

```bash
node .pi/skills/verify-bracket-web/bin/drive.mjs render
node .pi/skills/verify-bracket-web/bin/drive.mjs header-ticker-form
```

Each prints `PASS`/`FAIL` lines, writes screenshots and a `.state.json`
snapshot to `.pi/skills/verify-bracket-web/evidence/<feature>/`, and
exits nonzero on any failure.

Full drive (order and data paths): follow the recipe in
`.pi/skills/verify-bracket-web/features/<feature>.md`. Each recipe names
the user path, the exact Playwright or curl step, and the observable
end state. Start from a flat book, end flat (deactivate before the next
feature), and keep at most one bracket live at a time.

## Evidence

Capture the user action and the resulting state, not only the final
screen. For every driven feature save:

- a screenshot before the action and after it, in
  `.pi/skills/verify-bracket-web/evidence/<feature>/<what>.png`;
- a `.state.json` snapshot of the rendered values that changed;
- the matching data proof (a `/status`, `/api/quote`, or `/api/audit`
  response, or an SSE message) quoted in the run output.

Evidence lands in `.pi/skills/verify-bracket-web/evidence/`, which is
gitignored and survives cleanup. The legacy suite wrote evidence to S3
under `evidence/<host>/...` in `amzn-s3-trading-audit` with a local
fallback; that convention belongs to the archived runners, not to this
skill.

Verify side effects alongside what is visible: an activation must show
an `activate` line in `/api/audit` and the order rail status cell, not
just the arm button flipping. A flatten must show the position returning
to 0 in `/status`, not just the feedback line.

## Cleanup

```bash
bash .pi/skills/verify-bracket-web/bin/cleanup.sh
```

It kills the process group recorded in `.run/pid` (SIGKILL; the app's
SIGTERM handler flushes the audit but does not exit), waits until port
8080 is free, and leaves the evidence in place. It never kills by name
and never removes proof artifacts. Run it after every drive, including
failed iterations, so broken attempts do not strand processes or the
port.

Confirm after cleanup that the evidence still exists at the named
location. A cleanup that eats the proof is a failed run.

## Helpers

All scripts are executable and live in `.pi/skills/verify-bracket-web/bin/`:

- `launch.sh` - start the app on the machine's paper port; records
  `.run/pid`, `.run/paper-port`, `.run/web-port`, `.run/host`.
- `doctor.sh` - read-only health verdict (process, http, IB port,
  reconciled gate).
- `drive.mjs <render|header-ticker-form>` - Playwright smoke drive with
  screenshots and state snapshots.
- `cleanup.sh` - kill what launch started, wait for the port, keep
  evidence.

The maintained feature map lives in
`.pi/skills/verify-bracket-web/features/`. Read the index before
driving, then the matching feature file as the recipe.

## Legacy suite

The pre-poteto scenario suite lives under `archive/` and is out of scope
for normal verification. Do not search or read it, or any file inside
it, unless a task or the operator explicitly asks. It is excluded from
the static gate and is not the active path.
