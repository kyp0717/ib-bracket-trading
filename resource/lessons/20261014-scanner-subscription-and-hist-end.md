# Scanner findings: IB scanner needs a data subscription, and
# @stoqey/ib has no historicalDataEnd event

Date: 2026-10-14. Source: building scanner/cli.ts and its test area.

## The IB market scanner is subscription-gated

Every scan code (MOST_ACTIVE, TOP_PERC_GAIN, TOP_TRADE_RATE, and the
rest) failed with "Scanner type with code N is disabled" on this
account. The API market scanner is gated behind a market data
subscription; this account has none for US stocks, so no scanner type
works at all. This is account state, not code: the same CLI will work
the day a US stock data bundle is subscribed.

Workaround shipped: the `universe` preset ranks a built-in list of 49
liquid large caps from one month of daily bars, which needs no
subscription. `runScan` throws a dedicated `ScannerDisabledError` and
the CLI tells the operator to use `--preset universe`.

## historicalDataEnd does not exist in @stoqey/ib

The library has no `EventName.historicalDataEnd`. A historical request
ends with one more `historicalData` row whose time is the string
`"finished..."`. src/ib.ts has always handled it that way; the scanner
registered a listener on a nonexistent event name, which at runtime
silently became `ib.on(undefined, fn)` and never fired. Every symbol
then waited out the full 8 second per-request timeout, which is why the
first scan took two minutes for what should take four seconds.

TypeScript caught it the moment the gate ran; the earlier green came
from a stale run. Lesson within the lesson: after adding a file, run
`tsc --noEmit` before running anything, and trust a fast pass only when
it follows the edit.

## Rules that fall out

- In @stoqey/ib, detect historical end by
  `typeof time === "string" && time.startsWith("finished")` inside the
  historicalData handler. Never invent an end event.
- An event listener that never fires looks exactly like a slow gateway.
  When per-request latency equals the timeout, suspect the listener
  first.
- Subscription-gated IB features fail with a clear 162 error naming the
  feature; catch it and route the operator to the fallback instead of
  timing out.
