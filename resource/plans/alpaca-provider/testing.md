# Alpaca provider: testing

Back to [overview](overview.md).

## Test data

Alpaca has no fake or simulated stock stream. The always-on path is crypto.

- **24/7 visual.** Alpaca crypto streams trades, quotes, bars, and a real
  orderbook around the clock. `BTC/USD` is the canonical always-live symbol. Use
  it to prove the chart, tape, and depth ladder render without waiting for market
  hours.
- **RTH orders.** Alpaca stock paper uses IEX (real-time during regular hours) or
  SIP by subscription. A liquid stock such as `SPY` is the order-path symbol, and
  order drives run only during regular hours.
- **No depth for stocks.** Alpaca stock quotes are top-of-book only. The depth
  panel shows one row for stocks and a full ladder for crypto, driven by whatever
  `DepthBook` the adapter sends.

## Proof rules

- Data proof before visual proof, always. A wire value first, then the same value
  rendered.
- Every check is one named pass/fail line reached through a wait with a timeout.
- Order drives start and end flat. No resting bracket, no position left behind.
- Evidence lives in the verify skill's evidence directory and survives cleanup.

## Provider split checks

- Confirm `apps/ib-main.ts` never loads the Alpaca SDK and vice versa. A loaded
  dependency check at launch is enough.
- The safety rules live once in `core/`. A rule change must be visible from both
  providers through the same core path, not copied.
