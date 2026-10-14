# historicalDataUpdate is positional in @stoqey/ib, and it was silently broken

Date: 2026-10-14. Source: wiring the live 10s bar to
`reqHistoricalData(SECONDS_TEN, keepUpToDate=true)`.

## What happened

`ib.ts` wired the update handler as if the library emitted a bar
object:

```ts
on(EventName.historicalDataUpdate, (reqId, bar) => { ... })
```

The library actually emits positional fields:
`(reqId, date, open, high, low, close, volume, barCount, WAP)`
(see `decodeMsg_HISTORICAL_DATA_UPDATE` in
`node_modules/@stoqey/ib/dist/core/io/decoder.js`). So `bar` was the
date string, every field read off it was undefined, and the 1m
live-update path had been emitting bars with `time: NaN, close:
undefined` for as long as it existed. Nothing caught it because the
5-second real-time bar feed also bucketed "1m", so the GUI looked
fine. The new 10s scenario asserting a real close price and a 10
second boundary time caught it on the first run.

## Rules that fall out

- Any `on(...)` handler in `ib.ts` must name every positional
  argument it consumes. Never accept a single `bar` payload object
  unless the decoder for that event name demonstrably emits one; check
  `decoder.js` when adding a handler.
- Two independent feeds writing the same bucket hide each other's
  breakage. The 5s bars masked the broken 1m updates. One bucket, one
  owner: the live 10s bar now comes only from the 10s keepUpToDate
  stream, and the 5s `reqRealTimeBars` subscription is gone.

## Why the direct 10s stream is allowed

IB's historical bars documentation states keepUpToDate works for bar
sizes of 5 seconds or greater, so SECONDS_TEN with
keepUpToDate=true is a supported live feed. The forming bar updates
as trades print, priced from the same tick stream as the tape.
