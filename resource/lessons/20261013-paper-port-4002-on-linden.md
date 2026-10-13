# Paper port 4002 on linden

## What happened
I said port 4002 was a live port. It is not. It is the IB Gateway paper
port on linden, and the full suite is safe to run against it with
destructive scenarios.

## Why it was surprising
The repo docs said IB Gateway paper is 4001. For this IB account the
paper port is 4002 (individual paper accounts use 4002, advisor-style
accounts use 4001). Two machines, two account setups.

## What prevents a repeat
AGENTS.md machine facts now records: linden IB Gateway paper is 4002,
run the suite as `bash test/run-all.sh 4002`. The doctor step still
gates every run before a single scenario starts.
