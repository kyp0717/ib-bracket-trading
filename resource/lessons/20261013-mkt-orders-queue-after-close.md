# MKT orders after the close are queued but the API still says ok

## What happened
The full suite crossed the 16:00 ET regular close. Every flatten after
that moment returned `{"ok":true}` and the scenario moved on, but the
gateway never executed the order. It answered with error 399: the order
will not be placed until the next session open. Positions silently
survived into later scenarios.

## Why it was surprising
The app's contract is that flatten means flat. The gateway sees it
differently once the regular session is closed: a MKT order is accepted
and held for the next open. From the app's side the placeOrder call
succeeds, no error arrives as a rejection, and the audit only shows the
2109 processing warning. The first signal is the 399 warning, which the
error handler logs and forgets.

## What it broke
The reconnect scenario rebuilds the bracket from the gateway replay. A
leftover position makes the rebuild lock the entry and report state
`partial` instead of `working`, so the scenario times out. Two queued
MKT flattens were also still live at the gateway; if they had fired the
next morning they would have oversold the position.

## What prevents a repeat
Run the full suite only during the regular session and aim to finish by
15:45 ET. After any run that touched the close, probe the gateway with a
second client id (see that lesson) and cancel queued orders by hand.
A structural fix would watch for the 399 warning on flatten and report
the flatten as not executed; that is not implemented yet.
