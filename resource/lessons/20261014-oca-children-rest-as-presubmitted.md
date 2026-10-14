# OCA children rest as PreSubmitted, not Submitted

Date: 2026-10-14. Source: test/order-at-server/api/01 asserting server
order states through an independent clientId 91 session.

## What happened

The scenario asserted the target leg (a LMT child in the bracket's OCA
group) shows `Submitted` on the server. The server reports
`PreSubmitted`. A resting child of a working bracket is held by the
broker in `PreSubmitted` until the parent fills; both the stop and the
target behave this way, so two of the three legs carry it at any time.

`PreSubmitted` is a server-held state. The client-side-only state is
`PendingSubmit`, which lasts only between placeOrder and the first
server ack. Assertions about "sits on the server" must accept
`Submitted` and `PreSubmitted` and reject `PendingSubmit`, or they will
red on correct behavior.

## Rule that falls out

- Server-held statuses: `Submitted`, `PreSubmitted`, and the terminal
  set. `PendingSubmit` means the server has not acked yet; never assert
  an order is at the server while it is the only state seen.
- The independent-client probe (`reqAllOpenOrders` from another
  clientId) is the ground truth for order location; the app's own
  reconcile reads the same path that placed the order and cannot prove
  placement by itself.
