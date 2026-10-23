# Tape and depth

The two rightmost columns: time and sales (`#ch-tape`) and the depth
grid (`#ch-depth`). Tape rows stream over `/market`; the depth grid
rebuilds on each book update with app-side tier coloring.

## Sub-features

- `tape-column` (`#ch-tape`, header `T&S`) scrolling rows, price colored
  against the previous trade (up green, down red, flat muted).
- `depth-column` (`#ch-depth`, header `DEPTH`) six-column grid
  MM / SIZE / BID / ASK / SIZE / MM, one colored tier per row.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/` on a symbol with live quotes. Tape rows
  stream over `/market`; depth rebuilds on each book update.

## Driving it with verify-bracket-web

Preconditions:

- IB reconciled and a liquid symbol watched, so `/market` delivers tape
  and depth.

- **Tape rows appear.** Data proof: the `/market` SSE pipe emits a
  `tape` message, and `curl -s http://127.0.0.1:8080/api/quote` returns
  a price greater than 0. Visual proof: `#ch-tape` shows `.tc-tape` rows
  with a price, a size, and an ET time.
- **Depth grid populates.** Data proof: the `/market` SSE pipe emits a
  `depth` message with non-empty `bids` and `asks`. Visual proof:
  `#ch-depth` shows at least one populated bid row and ask row, with
  prices bracketing the tape last.
- **Grid refresh on symbol switch.** Switch the ticker, then assert the
  depth grid repopulates with rows for the new symbol after the old
  columns clear.
- **Proof.** Screenshot the populated columns at
  `evidence/tape-depth/tape-depth-populated.png`, plus the `tape` and
  `depth` SSE payloads and the `/api/quote` response in the run output.

## Gotchas

- Both columns render only what `/market` delivers. A quiet symbol or a
  dropped gateway shows empty columns that look like a rendering bug;
  check the connection pill before blaming the grid.
- Tape times arrive as strings and render in ET; around midnight ET rows
  can look out of order across a session boundary.
- Depth tiers are app-side coloring, not exchange data. Do not assert
  exact tier colors; they couple the proof to the tier table.
