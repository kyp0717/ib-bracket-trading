# Alpaca provider: testing

Back to [overview](overview.md).

## Test data

Alpaca has no fake or simulated stock stream. The always-on options are
real data on real sessions.

- **24/5 equities.** Alpaca paper trading now runs overnight for NMS
  securities. Sessions run overnight 8:00 PM-4:00 AM ET, pre-market,
  regular, and after-hours, from Sunday 8:00 PM ET to Friday 8:00 PM ET,
  following the NYSE holiday calendar. Overnight executions and market
  data are facilitated by the BOATS ATS. A liquid NMS stock such as `SPY`
  is the order-path and visual symbol for most of the week.
- **24/7 crypto.** `BTC/USD` covers the weekend gap, Friday 8:00 PM ET to
  Sunday 8:00 PM ET, with trades, quotes, bars, and a real orderbook.
- **No depth for stocks.** Alpaca stock quotes are top-of-book only. The
  depth panel shows one row for stocks and a full ladder for crypto,
  driven by whatever `DepthBook` the adapter sends.
- Confirm on a paper account whether the overnight BOATS session flows
  through the free IEX feed or requires a SIP subscription before relying
  on overnight equities for a visual drive.

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
