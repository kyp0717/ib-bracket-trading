# Phase 4: Alpaca market data

Back to [overview](overview.md).

## Goal

Build the Alpaca market-data adapter behind `Broker.subscribe` / `quote`, reading
both the stock feed and the crypto feed so the visual can be proven 24/7.

## Changes

- Add the Alpaca WebSocket client for stock channels (trades, quotes, bars) and
  crypto channels (trades, quotes, bars, orderbook). REST fills historical bars.
- Forming ten-second and one-minute bars are built client-side from trades, the
  same way the IB engine already builds them. Ten-second history has no Alpaca
  source, so a fresh symbol starts empty.
- Map Alpaca data onto `Bar`, `Trade`, and `DepthBook`. Stocks produce a one-level
  book from the quote; crypto produces the orderbook ladder.
- Crypto is data-only here. No crypto orders.

## Data structures

- `DepthBook` carries either one level or a ladder; the GUI does not know which
  provider sent it.
- An internal `Feed` shape per channel (trade, quote, bar, book) so the stock and
  crypto listeners share one translation path.

## Verification

- Static: `tsc --noEmit`.
- Runtime: launch the Alpaca data path with `BTC/USD` (24/7), doctor, and drive
  `render` and `header-ticker-form`. Screenshot proves candles, tape, and a depth
  ladder populate without waiting for market hours.
