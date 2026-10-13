# Market depth validation

Date: 2026-10-12. Status: implemented, covered by `test/depth/`.

Data layer: `test/depth/api/`. Rendering layer: `test/depth/web/`. Runner:
`run-depth-test.sh [port]`. Both layers run inside `test/run-all.sh`.

## Scenario to code mapping

- **Book arrives after symbol load**: load SPY, wait for bids and asks
  on the SSE `depth` message. Test: `test/depth/api/01-book-arrives.mjs`
- **Book shape**: best bid below best ask, bids best-first descending,
  asks best-first ascending, sizes positive. Scenario 2-3
- **Refresh on symbol switch**: SPY best bid captured, switch to QQQ,
  the next book change must be more than $1 away (the server stops
  sending SPY updates after the switch, so any change is QQQ).
  Scenario 4. Known limit: two symbols closer than $1 apart could
  false-negative the magnitude check
- **Messages keep flowing**: at least one depth message in a 20s window
  on a liquid symbol. Scenario 5. Known limit: a dead-quiet market can
  starve this
- **Header layout**: MM SIZE BID ASK SIZE MM rendered in order.
  Test: `test/depth/web/`
- **Row structure**: one row per level, six cells each, bid left ask
  right. Test: `test/depth/web/`
- **Values match payload**: every rendered bid price appears in the SSE
  book snapshot. Test: `test/depth/web/`
- **Tier colors**: price cells carry an explicit color. Test:
  `depth.spec.mjs`
- **MM cells exist**: two MM cells per row. They are structurally
  present and empty because this feed aggregates per price level. A
  future L2 feed with market maker ids must fill them without changing
  this check. Test: `test/depth/web/`
- **Grid refresh on switch**: DOM rows change after switching symbol.
  Test: `test/depth/web/`

## Not covered here, by design

- **Max 3 simultaneous depth requests**: the app holds exactly one
  depth request and cancels it on symbol switch, verified by code
  inspection in `chart.ts`. Exercising the 3-request ceiling needs
  three concurrent symbols, which this single-symbol app never opens
- **Per-market-maker L2 rows**: needs a feed that carries MM names;
  covered structurally by the MM cell check above
