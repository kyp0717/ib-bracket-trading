# S3 from a shared env file: pick your own bucket, degrade gracefully

Date: 2026-10-14. Source: moving audits and evidence to
`amzn-s3-trading-audit` using credentials from `ls-trader/.env`.

## What bit us

- `ls-trader/.env` exports `TRADER_S3_BUCKET=trading-metrics`, a
  different project's bucket. Reading `TRADER_S3_BUCKET` here would
  have silently written this project's audit trail into someone else's
  bucket. `s3.ts` reads `BRACKET_S3_BUCKET` (default
  `amzn-s3-trading-audit`) and never `TRADER_S3_BUCKET`; only the
  access key and secret are shared, mapped onto `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` for the `aws s3 cp` child process, because
  the CLI does not read `TRADER_S3_*` names.
- A durable-write shutdown handler can hold the listen port. The
  SIGTERM audit flush shells out synchronously; a runner that kills
  and one second later starts a new app races it. `uploadSync` now has
  a 5s timeout and the runners wait for the port to be free instead of
  sleeping a fixed second.
- Tests that read source files by path (the AST guards) break on any
  directory move and fail as a raw stack trace, which the runner
  reports as a bare area FAIL with no failing check named. After any
  restructure, run the static gate plus every AST scenario before
  committing, and treat a crashed scenario as a red light, not noise.

## Rules that fall out

- Shared credential files share secrets, never configuration. Bucket,
  region, and prefix are per-project; only keys travel.
- Every upload path degrades to local with a console note
  (`UPLOAD_SKIPPED`, `EVIDENCE local ...`) so missing credentials
  reduce observability, never lose evidence.
- Runners kill by port availability, not by process-name patterns.
