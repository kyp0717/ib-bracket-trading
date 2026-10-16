# Position and PNL

The POSITION and PNL readouts, centered in the single header bar.

## Sub-features

- `ch-pos`: container, absolutely centered in `.ch-head`.
- `ch-pos-shares`: `POSITION: N` where N is the filled quantity of the
  live bracket, 0 when flat.
- `ch-pos-pl`: `PNL: $X.XX`, mark-to-market against the last tape price,
  $0.00 when flat.

## How to reach it

Open `/` with an app instance connected. Values refresh on bracket
events and on a one-second render tick.

## How to drive it

- Flat state: assert `POSITION: 0` and `PNL: $0.00`.
- Live state: after an activation leaves a partial fill, assert the
  filled count and a computed PNL against the last price from
  `/api/quote`.
- Layout: the `ch-pos` center sits within 20px of the header center
  (`09-header-layout.ts` asserts this).

## What usually lies

- PNL uses the last tape price, not the broker mark; in a fast market
  the number lags the real position PNL.
- The centering is absolute positioning, so any new header child that
  takes flow width shifts the visual center. Re-run 09 after touching
  the header.
