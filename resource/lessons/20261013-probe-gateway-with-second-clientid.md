# Probe the gateway with a second client id

## What happened
To find out what was actually sitting at the gateway (open orders,
positions) without disturbing the running app, I connected a throwaway
IBApi client with a different client id and called reqOpenOrders and
reqPositions. It answered in seconds and showed the leftover +100 SPY
the suite had abandoned.

## Why it was surprising
The app owns the only API connection (client id 90) and exposes no HTTP
endpoint that lists positions or open orders, so from the outside you
cannot see account state through the app. The IB Gateway itself accepts
multiple simultaneous client ids, so a side connection is free.

## How to use it
Write a small tsx script (run with npx tsx from the repo so
@stoqey/ib resolves) that connects with client id 91 or 92, requests
open orders and positions, prints the non-empty ones, and disconnects.
Use it before a run to confirm flat, and after a red run to find what
the suite left behind.
