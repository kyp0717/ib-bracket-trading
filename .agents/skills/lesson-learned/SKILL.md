---
name: lesson-learned
description: Use after any run, build, or debugging session in this repo that surfaced a surprise, a red scenario, a broker or library behavior that cost time to learn, or an edge case. Captures the knowledge as a lesson file under resource/lessons/ so the next agent inherits it. A red scenario without a lesson is not finished work.
---

# Lesson learned

This project's durability comes from `resource/lessons/`: every wall the
system hit, written down so the next agent does not climb it again. The
rule lives in AGENTS.md. This skill is how a lesson gets written.

## When to write one

Any of these, before the related work is committed:

- A scenario went red, for any reason, even if a retry later passed.
- A run or manual test surfaced surprising behavior that cost
  investigation time, even if nothing failed in the end.
- A library, broker, or platform behavior had to be discovered by
  experiment (signatures, event order, state names).
- An edge case was found: a path the happy path missed, a timing
  window, a partial state, a shutdown race.

Do not wait for a failure to be "confirmed". Write the lesson when the
knowledge lands, while the evidence is in front of you.

## Classify it

- `domain.`: knowledge about the world the system lives in. Someone new
  to the project would hit the same wall. Examples from this repo: IBKR
  replays OCA children as `PreSubmitted`, TWS cancels arrive as
  `ApiCancelled`, the market-data library has no `historicalDataEnd`
  event, node 24 has no global `EventSource`.
- `edge.`: a case the happy path missed, usually found by a failure or
  near-failure. Examples: MKT orders queue for the next open after
  16:00 ET while still reporting ok, SIGTERM dropped audit lines before
  the S3 flush existed, `pkill -f "tsx server.ts"` never matches the
  process tsx actually spawns.

When unsure, ask: would a careful newcomer predict this? No, and it is
about the outside world, then domain. It is a path inside our own
system that broke or nearly broke, then edge.

## Where and what to name it

- Directory: `resource/lessons/`. Create it if missing.
- Name: `domain.<YYYYMMDD>.<kebab-case-title>.md` or
  `edge.<YYYYMMDD>.<kebab-case-title>.md`. Datestamp is the local date
  the lesson was learned, not written.
- Files from before this convention keep their `YYYYMMDD-` names. No
  backward sweep; rename only when a file is touched for other reasons.

## Anatomy, in this order

Follow the shape the existing lessons use. A reviewer must be able to
act on the file without the transcript.

1. **Title**: one sentence, the observation itself. "MKT orders are
   limit-only outside regular hours", not "Lesson about orders".
2. **Date and source**: one line. When, and what surfaced it: the
   scenario name, the run, the error code, the manual test.
3. **What happened**: the story with concrete evidence. Numbers, order
   ids, timestamps, exact error text, timings. Not "it was slow" but
   "TWS held the batch for 47 seconds and emitted 2109".
4. **Why it happened**: the mechanism, traced to root cause. The
   library signature, the broker rule, the race, the stale assumption.
5. **The fix**: what changed, with file names. If no code changed
   (knowledge only), say so and say what now relies on it.
6. **Rules that fall out**: durable, checkable rules a future agent can
   apply without reading the story. These are the payoff; write them as
   imperatives. If a rule can be encoded as a type, a check, or a test
   instead of text, encode it there and say so.

## Classes worth scanning for in this project

When a session ends, ask whether anything new was learned in each:

- **Broker order lifecycle**: state names, replay order, who can see
  which clientId's orders, OCA behavior, modify-in-place semantics.
- **Session and time rules**: RTH vs premarket vs afterhours, queued
  orders, what venues accept outside 09:30 to 16:00 ET.
- **Library signatures**: positional vs object args, event names that
  do not exist, error-event shapes, sync vs async traps.
- **Harness and process traps**: how processes are actually spawned,
  kill-by-pattern vs kill-by-port, shutdown handlers that must be
  bounded, ports and clientIds that differ per machine.
- **Shared environment**: credentials shared across repos, config that
  must not leak between projects, graceful degradation paths.
- **Test-tree mechanics**: what the runner globs, what a bare reexport
  breaks, evidence naming.

## Boundary

A lesson is knowledge earned from an event. A standing design contract
that no scenario can express goes into AGENTS.md, not into a lesson
file. When a lesson's rule becomes permanent policy, promote it to
AGENTS.md and leave the lesson as the record of how it was learned.

Commit the lesson in the same commit as the fix or the discovery. A
lesson that lives on only one machine does not exist for the other one.
