# The 16:00 ET close: symptoms appear far from their cause

## What happened
A full suite run crossed the regular close. Every flatten after 16:00 ET
returned `{"ok":true}` and the scenario moved on, but the gateway never
executed the orders. It answered with error 399: the order will not be
placed until the next session open. Positions silently survived into
later scenarios, and the run ended red in a place that had nothing to do
with the close.

## Why this one took hours to see
The symptom and the cause lived in different scenarios. The flatten that
quietly failed ran in an api scenario near the close. The failure that
surfaced was the reconnect scenario minutes later, which rebuilt the
bracket as `partial` because a leftover position locked the entry. Every
clue pointed at the restart path: missing audit lines (a separate bug),
a rebuild that produced the wrong state, a suite that had been green
before. The actual cause was a two-character timestamp difference at the
close, two phases earlier.

Two traps made it worse. First, the 399 warning was in the app log the
whole time, sitting next to hundreds of other warnings the error handler
logs and forgets. Nobody reads a warning that looks like the other two
hundred. Second, the app's contract says flatten means flat, and the
gateway breaks that contract after the close without saying so in any
channel the app treats as an error.

## The full cost, for the record
A leftover +2 position, two MKT orders queued overnight that would have
oversold the account at the next open, a reconnect scenario blamed for a
sin it did not commit, and manual gateway surgery to make the account
flat again.

## What prevents a repeat
Run the full suite only while the regular session is open and aim to
finish by 15:45 ET. After any run that touched the close, probe the
gateway with a second client id and cancel queued orders by hand. When a
scenario fails in a place unrelated to its scenario, suspect state that
crossed a scenario boundary, and read the app log warnings from the
whole run, not just the failing phase.

## What works after the close, for after-hours runs
LMT orders fill in the extended session and the app already sets
outsideRth on every order, so most of the suite runs fine past 16:00.
Only MKT orders queue, and that is an exchange rule, not an IB Gateway
setting: there is no checkbox that makes ARCA accept market orders after
the close. The structural fix is flatten() sending a marketable limit at
the current bid instead of MKT, which filled in seconds during cleanup.
That change is not implemented yet; until it is, the regular-hours rule
above stands.
