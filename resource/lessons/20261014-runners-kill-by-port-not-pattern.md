# pkill patterns miss the process tsx actually spawns

Date: 2026-10-14. Source: runners failing with EADDRINUSE after the
S3 move added a SIGTERM audit flush.

## What happened

`tsx server.ts` does not stay that process. npx execs node with tsx
loaded as a preflight/loader, so the running process cmdline is
`node --require .../tsx/dist/preflight.cjs --import .../tsx/dist/loader.mjs server.ts --ibport 4002`.
The literal string `tsx server.ts` never appears in it, so every
`pkill -f "tsx server.ts"` in the runners was a no-op. It went
unnoticed because instances were usually dead by other means. It
surfaced when a manually started, still-running app survived the
runner's kill step and the runner's fresh app died on EADDRINUSE.

The new log.ts SIGTERM flush made it worse: the handler runs a
synchronous `aws s3 cp` before exit, so even a correctly signalled
process holds port 8080 for up to seconds.

## Rules that fall out

- Kill by port, not by name: after pkill, wait until
  `ss -tln` no longer shows the web port before starting the app.
  The area runners do exactly this.
- If a pkill pattern must be used, bracket the dot (`server[.]ts`) so
  it cannot match the invoking shell, and confirm the pattern actually
  matches the spawned cmdline (see `ps`), not the command you typed.
- Shutdown handlers must be bounded (timeout on any child they spawn)
  because a runner, systemd unit, or the operator will not wait long.
