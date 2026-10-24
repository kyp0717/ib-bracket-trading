# Scanner migration to a separate repository

## Decision

Move the scanner out of `ib-bracket-trading` into its own repository,
`scanner-ts`, so the two programs stay cleanly separated.

- The trading app is single-provider and lean. One broker per process,
  never two.
- The scanner is a multi-source aggregator. It is allowed to combine IB
  and Alpaca in one process, and will later add Yahoo or other sources,
  because a complete stock picture needs data from several places.

Those are two different rules, so two different repositories.

## What moved

The four scanner files moved verbatim to `scanner-ts/src/`:

- `cli.ts` — entry, table and JSON output.
- `presets.ts` — presets: a fixed `universe` plus IB scanner codes.
- `scan.ts` — candidate discovery and one-month daily-bar enrichment.
- `rank.ts` — scoring and sorting.

`scanner-ts` gains its own `package.json` (only `@stoqey/ib` at runtime),
`tsconfig.json`, `.gitignore`, and `README.md`. It type-checks and runs
`--list` independently of the trading repo.

## Concurrency guard

The scanner and a trading app are mutually exclusive. They contend for
the same broker connection and market-data lines. The two trading apps
(IB and Alpaca) may run together because they use different brokers.

The guard spans two repositories and is not yet built. It will need a
shared lock or marker both repos check, keyed to the machine or the paper
gateway. Until then, the rule is enforced by the operator: do not run the
scanner while a trading app is live.

## Scanner future shape

The scanner grows into a multi-source aggregator:

```
scanner-ts/src/
  sources/
    ib-scanner.ts      # IB dynamic discovery: most-active, top-gainers
    ib-bars.ts         # IB daily bars
    alpaca-assets.ts   # Alpaca universe via /assets filters
    alpaca-bars.ts     # Alpaca daily bars
    yahoo.ts           # future source
  presets.ts           # a preset names a discovery + an enrichment source
  scan.ts              # orchestrate: discover -> enrich -> hand to rank
  rank.ts              # neutral scoring
  cli.ts               # entry
```

A preset is a recipe: a discovery source plus an enrichment source. That
is what lets future runs mix sources, such as IB `most-active` discovery
with Alpaca bar enrichment. Each source is one small adapter, so adding
a source does not touch the orchestration.

## Follow-ups

- Fix the `--ibport` default, currently 4001 (IB Gateway live), to paper
  4002 or require an explicit port.
- Build the cross-repo mutual-exclusion guard once the scanner gains an
  Alpaca source.
- Keep the scanner out of the trading app's static gate and verify loop.
