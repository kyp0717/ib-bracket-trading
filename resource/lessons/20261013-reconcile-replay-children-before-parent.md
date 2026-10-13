# The gateway replays children before their parent

## What happened
The reconnect scenario failed after every app restart: the reconcile
finished, the app reported reconciled, and no bracket was ever rebuilt.
The audit showed the reconcile line but never a reconcile-order line.

## Why it was surprising
On reqOpenOrders the gateway does not guarantee parent-before-child. In
every observed replay the children (STP and LMT sells) arrived first and
the parent (LMT buy) arrived last, sometimes with other orders in
between. bracket.ts stored parents in a map and dropped any child whose
parent was not in the map yet. With children first, every child was
dropped, and a lone parent was stored but never turned into a bracket.
The result was an empty rebuild that looked like a gateway with no open
orders.

## What prevents a repeat
bracket.ts now buffers children whose parent has not arrived (reconcileOrphans)
and attaches them when the parent is stored, in whichever order the
gateway sends them. beginReconcile clears both maps so a new reconcile
never sees stale state. Verified by parking a resting bracket, killing
the app, restarting, and watching the reconcile-order lines and the
rebuilt working bracket arrive. The reconnect scenario covers this on
every full suite run.
