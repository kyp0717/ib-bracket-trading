# resource/bugs

Bugs in this codebase, separated from `resource/lessons/`.

## The split rule

- A bug is something this codebase did wrong. It goes here.
- A lesson is something the outside world does: an IB or Alpaca behavior,
  a machine or harness fact, an environment surprise. It stays in
  `resource/lessons/`.

## Naming

- `edge.<YYYYMMDD>.<title>.md` — a bug the happy path missed.
- `regression.<YYYYMMDD>.<title>.md` — a bug that came back after being
  fixed.

## Shape

Each file carries the same sections as a lesson: what happened, why it
happened, the fix, and the rule that falls out of it.
