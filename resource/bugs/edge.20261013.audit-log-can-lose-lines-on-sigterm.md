# The audit log can lose lines on SIGTERM

## What happened
After the runner restarted the app between phases, audit.log had no
reconcile line for the new process and no rebuild lines, which made the
timeline look impossible: the doctor reported reconciled, yet the only
proof the reconcile ran was missing.

## Why it was surprising
audit() in log.ts appended with async appendFile and an empty callback.
The write sat in a queue. pkill sends SIGTERM, Node exits on the spot,
and any queued write that had not reached the kernel yet was dropped.
Most lines survived because the queue drains in milliseconds, so the
loss only showed when the process died inside that window. An
append-only log that can silently drop lines is worse than no log for
postmortems, because you reconstruct a story from evidence that has
holes and the holes look like behavior.

## Status
Fixed the same day. log.ts now uses appendFileSync, so the line lands
before audit() returns. The fix survived a full suite run with restarts
and all expected lines present. If audit() ever becomes hot enough that
a sync write matters, the alternative is a write queue drained on an
interval with an explicit flush on SIGTERM, not a return to fire and
forget async appends.
