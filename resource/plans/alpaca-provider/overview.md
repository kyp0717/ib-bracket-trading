# Alpaca provider: overview

## Context

The app today is hardwired to Interactive Brokers. `src/ib.ts`, `src/bracket.ts`,
and `src/chart.ts` all import `@stoqey/ib`, and `src/server.ts` calls them
directly. We want Alpaca as a second broker, but the two brokers must never mix
in one process. The goal is two lean provider apps sharing a broker-neutral core,
spawned for exactly one provider.

## Scope

Included:

- A broker-neutral core holding the wire contract, the bracket safety rules, the
  HTTP/SSE intake, and the page.
- Two provider packages, `ib` and `alpaca`, each a complete order and market-data
  engine for its broker.
- Two app entries, one per provider, that wire a broker into the core.
- The verify skill learns a provider target so one loop drives either app.

Excluded:

- The scanner. It moved to its own repo, `scanner-ts`, and is out of the
  trading app's scope entirely. See resource/plans/scanner-migration.md.
- Alpaca crypto order execution. The app remains long-only stock brackets; crypto
  is used for market-data visual testing only, not order placement.
- Account management, credential UI, or a provider switcher inside the running
  app. Provider choice is made at spawn time.

## Constraints

- No build step. TypeScript runs through `tsx` as ESM, same as today.
- No framework. `http` and the current SSE fan-out stay.
- Paper endpoints only for any destructive drive. Never point at a live account.
- Wire types compile first; `tsc --noEmit` over `core/` and both brokers fails the
  run on drift.
- The safety rules stay single-source in the core: long-only, one live bracket,
  cancel always passes, entry locks after fill, move-during-cancel refused.
- No comments in code. Provider SDKs never import each other.

## Alternatives

1. **Shared core plus provider adapters (chosen).** One copy of the safety rules
   and presentation contract; each broker contributes only its SDK mechanics.
   Keeps the two apps from drifting on safety while staying lean.
2. **Full per-provider duplication.** Each app copies the state machine and GUI.
   Leanest isolation, rejected because the safety rules and the screen would
   drift between IB and Alpaca, and every rule fix would have to be made twice.
3. **One app with a runtime provider flag.** `if (provider === "alpaca")` branches
   inside the engine. Rejected: it violates the no-mix goal and leaves both SDKs
   loaded in one process.

## Always-on test data (decided)

Alpaca has no fake or simulated stock stream. The always-on options are
real data on real sessions. Alpaca paper trading now runs 24/5 for NMS
securities (overnight 8:00 PM-4:00 AM ET through the BOATS ATS, plus
pre-market, regular, and after-hours, Sunday 8:00 PM ET to Friday 8:00 PM
ET). Crypto streams 24/7, including the weekend gap, with trades, quotes,
bars, and a real orderbook; `BTC/USD` is the canonical always-live symbol.
Alpaca stock quotes are top-of-book only, no depth ladder.

Consequence for the plan: the Alpaca market-data adapter reads both the
stock feed (trades, quotes, bars) and the crypto feed (trades, quotes,
bars, orderbook). A liquid NMS stock such as `SPY` is the order-path and
visual symbol for most of the week; `BTC/USD` covers the weekend and
proves the depth ladder. The depth panel is data-driven: stocks supply a
one-level book, crypto supplies a real ladder, and the GUI stays
identical. Confirm on a paper account whether the overnight BOATS session
flows through the free IEX feed or needs a SIP subscription before
relying on overnight equities for a visual drive.

## Applicable skills

- **how** over any subsystem before changing it.
- **interrogate** on the wire contract and the Broker seam before shipping.
- **unslop** on all prose, **technical-writing** on the docs.
- **show-me-your-work** to keep the decision trail across phases.

## Phases

1. [phase-1-broker-seam.md](phase-1-broker-seam.md) — extract the Broker door, keep IB.
2. [phase-2-wire-contract-prune.md](phase-2-wire-contract-prune.md) — prune wire types to the presentation contract.
3. [phase-3-core-restructure.md](phase-3-core-restructure.md) — move shared and IB code into their homes.
4. [phase-4-alpaca-market-data.md](phase-4-alpaca-market-data.md) — Alpaca stock + crypto data adapter.
5. [phase-5-alpaca-bracket-orders.md](phase-5-alpaca-bracket-orders.md) — Alpaca native bracket orders.
6. [phase-6-provider-app-entries.md](phase-6-provider-app-entries.md) — two spawn entries.
7. [phase-7-verify-skill-provider-target.md](phase-7-verify-skill-provider-target.md) — verify loop learns a provider.

## Verification

- Static: `npx tsc --noEmit` over `core/`, `brokers/`, and `apps/`.
- Runtime: the verify skill, `launch`, `doctor`, `drive <feature>`, `cleanup`,
  against the provider named in the run. Data proof before visual proof, per the
  repo contract.

## Implementation guidance

Every phase applies the poteto non-negotiables: name the data shape first, keep
each phase to two or three files, verify on the real surface, and hold the diff to
a cleanup pass before commit. Each phase is independently shippable and keeps the
IB app green throughout.
