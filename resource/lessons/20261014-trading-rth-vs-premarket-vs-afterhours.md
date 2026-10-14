# RTH vs premarket vs afterhours, observed on paper

Date: 2026-10-14. Source: full suite run against IB Gateway paper
(linden, port 4002) starting 08:15 ET, plus the cleanup that the run
forced. Everything below was seen live, not assumed.

## Sessions

- RTH (regular hours): 09:30 to 16:00 ET. Everything works the way the
  suite was originally written for.
- Premarket: 04:00 to 09:30 ET. Afterhours: 16:00 to 20:00 ET. The two
  behave the same for this app, so "outside RTH" means both.

## What changes outside RTH

**Order acceptance.** Venues accept limit orders only. MKT orders are
queued for the next open or rejected (see the earlier lesson on
market orders outside regular hours). The app's flatten now sends a
marketable limit at the best bid, which is accepted any time of day.
Bracket parents must be LMT outside RTH; a MKT parent will not fill.

**Liquidity and tape cadence.** SPY printed 34 to 59 trades per 10
second window premarket, in bursts, versus the RTH assumption of well
over 100. The tape is still true tick-by-tick (inter-arrival gaps under
250 ms appear inside bursts, which snapshots cannot produce), so the
feed type is verifiable premarket, but any test that counts raw prints
against an RTH floor will flake. The cadence scenario now proves
sub-250ms inter-arrivals instead of a print count.

**Marketable limits are not guaranteed.** A limit sell at the
aggregated best bid sat unfilled for over 60 seconds premarket. With
few participants, pricing at the bid only fills when someone actively
crosses it, and the aggregated book merges venue rows that a SMART
routed order cannot all reach. Flatten must be willing to reprice: the
app cancels the resting flatten and replaces it on the cancel ack, and
the scenario loops until the broker reports flat. Do not treat "order
accepted" as "position closed" outside RTH; only the broker position
tells the truth.

**Fills still lock the entry.** A LMT parent two cents above the last
print filled immediately premarket and entryLocked behaved exactly as
in RTH. Slippage at qty 1 was negligible (filled 775.48 with last near
775.50).

**Depth is alive.** The aggregated book populates, refreshes on symbol
switch, and carries a venue per level premarket. The chart panels are
fully usable outside RTH.

**Restart orphans are the big premarket hazard.** reqOpenOrders
replays open orders only. A filled parent drops off the replay while
its stop and target children are still resting, so after a restart the
children arrive with no parent, never attach, and would rest untracked
forever. If the position was already flattened, a later stop trigger
opens a short on a flat account, which breaks the long-only rule. The
app now sweeps both orphan children and naked parents at the end of
reconcile and audits each cancel as reconcile-orphan-cancel. Two
brackets' worth of these were cancelled live during the 2026-10-14
cleanup.

**Stop protection outside RTH is unverified.** A resting STP child
that triggers attempts to become a MKT order, and venues accept limits
only outside RTH. What IB does with a stock stop triggered at 08:45
(held, queued, or rejected) has not been tested. Until it is, treat a
bracket held overnight or premarket as unprotected and size
accordingly. This is an open go-live question, not a answered one.

## Test implications

- Run the suite premarket to catch state-machine bugs; it is safe now
  that flatten is limit-based and scenarios wait on broker position.
- Expect the cadence scenario to pass on burst structure, not volume.
- Never end a premarket session with a position or resting orders; the
  orphan sweep only runs on app (re)start, so a crashed app leaves
  whatever was resting until something reconnects.
