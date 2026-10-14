# Manual escape hatch: flattening and cancelling from IB's own interface

Date: 2026-10-14. Covers the case where the app is down (crashed, machine
dead, gateway restarted) while a bracket or a position is live on the
account. Everything here is done in TWS or the IB Gateway GUI, not in
this app.

## What the app leaves on the account

A working bracket is up to three orders, all visible in the Orders
panel of the Monitor tab:

- a parent BUY, LMT or MKT, working or filled
- a child SELL STP (the stop), resting
- a child SELL LMT (the target), resting

The two children share an OCA group named `br-<SYMBOL>-<parentId>`.
Filling or cancelling one sibling cancels the other. The app places
orders under client id 90, so its orders show an API origin in the
order description. Cancellations from the GUI always work regardless
of which client placed the order.

## Case 1: entry never filled (no position)

The parent buy may still be working. Cancel all three orders by
right-clicking each in the Orders panel and choosing Cancel. No
position exists, so nothing else to do.

## Case 2: entry filled, position open, app down

This is the dangerous case: the stop and target are the only
protection. Do not sit in it.

1. Open the Monitor tab, Portfolio row for the symbol. Confirm the
   position size.
2. Close the position: right-click the position, choose Close, or
   place a manual SELL limit at the current bid for the full
   quantity. A market order also works during regular hours (09:30 to
   16:00 ET); outside regular hours use a limit at the bid, because
   the venues accept limit orders only.
3. When the closing order fills, the OCA group cancels the stop and
   target automatically. Verify in the Orders panel that both
   children show Cancelled.
4. If the closing order does not fill within a minute, cancel it and
   re-price at the new bid. Repeat until flat.

## Case 3: position flat but orders resting

Happens when a flatten raced the bracket state. Cancel the resting
stop and target by hand in the Orders panel. One cancel is enough if
they still share the OCA group, but verify both disappear.

## After any manual intervention

Do not restart the app into an unknown account state without reading
`audit.log` first. On connect the app reconciles: it replays open
orders, rebuilds the bracket from what it finds, and logs
`reconcile-order` and `reconcile-position` lines. If you already
flattened and cancelled everything by hand, reconcile finds nothing
and the book is clean. If you left anything resting, the app adopts
it, so know what you left before you reconnect.
