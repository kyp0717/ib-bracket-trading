# A same-symbol switch still deactivates the live bracket

## What happened
Observed in the audit log during a suite run: the gui page loads and
posts /api/symbol with the symbol that is already active, and the app
deactivates the live bracket anyway. The audit line reads
`deactivate | SPY: symbol switch to SPY`.

## Why it matters
Reloading the page kills a working bracket without the user asking for
that. For a rebuilt bracket after a restart this is especially sharp:
the reconnect work can be undone by someone simply opening the page.

## Status
Not changed. The cross-symbol deactivation is intended and covered by
the cross-symbol scenario, but the same-symbol case looks like an
accident of the endpoint shape. Decide deliberately whether same-symbol
should be a no-op, then encode it in a scenario either way.
