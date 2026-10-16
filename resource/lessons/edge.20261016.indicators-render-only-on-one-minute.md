# Indicator readouts render only on the 1m timeframe

Date: 2026-10-16. Surfaced by `test/web-ui/11-forming-data-refreshes-per-tick.ts`
going red on its first run: `stale value "" for 8s`, because `#ch-ind-vwap`
is empty on the default 10s view.

## What happened

The scenario sampled `#ch-ind-vwap` on a freshly loaded page (default
10s timeframe) and found it permanently empty. The chart lines and the
legend tag only render when `tf === '1m'`; on 10s and 1d the code
hides `#ch-ind-tag` and clears both series.

## Why it happened

`renderIndicators` early-returns unless the current timeframe is 1m,
by design: VWAP and EMA9 are computed over 1m bars. A test that wants
to observe rendered indicator values must click the 1m timeframe
button first, the same move `04-indicators-on-one-minute.ts` makes.

## The fix

The scenario now clicks `#ch-tf .tc-size-btn[data-tf="1m"]` before
sampling and asserts the value is non-empty right after switching.
No app code involved.

## Rules that fall out

- Any web-ui scenario reading `#ch-ind-vwap` or `#ch-ind-ema9` starts
  by switching to the 1m timeframe.
- An empty indicator readout on 10s or 1d is expected, not a defect;
  assert the tag is hidden there instead if that is what the story is.
