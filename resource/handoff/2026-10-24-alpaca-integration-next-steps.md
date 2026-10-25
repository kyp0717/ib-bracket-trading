# 2026-10-24: Alpaca integration paused, next steps

## Where we stopped

All seven phases of the Alpaca integration are done, committed, and pushed
(`3ee6cb4` through `d0d47e2`). The IB app behaves identically to before the
work. The plan under `resource/plans/alpaca-provider/overview.md` records
each phase and its commit.

Repos and their last commits:

- `ib-bracket-trading` main at `d0d47e2` (docs pass, everything pushed).
- `scanner-ts` main at `0901943` (sources seam and resource skeleton, pushed).

End-of-night state: no app running, port 8080 free, no stray processes,
book flat, nothing uncommitted except the operator's own
`resource/remote-boot/` plan, left untouched on purpose.

## The one blocker

No Alpaca paper keys exist on woodlawn. Checked every `.env` under
`~/work`, shell rc files, and dotfiles. `APCA_API_KEY_ID` and
`APCA_API_SECRET_KEY` are nowhere. Phases 4 and 5 are compile-proven and
no-keys-checked, but not runtime-proven.

## Tomorrow, in order

1. `hostname` first, per the two-machine rule.
2. Get the Alpaca paper keys: check linden, or copy them from the Alpaca
   paper dashboard. Write them into a gitignored `.env` in this repo with
   `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY` (underscore names; the
   adapter sends them as `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY`
   headers). Do not write a placeholder; a fake key passes the presence
   check and fails at Alpaca auth.
3. Export the vars, then
   `bash .pi/skills/verify-bracket-web/bin/launch.sh alpaca` and
   `bash .pi/skills/verify-bracket-web/bin/doctor.sh`.
4. Visual drive: `BTC/USD` (streams 24/7) through the render drive and the
   chart. Confirm candles, tape, and the crypto depth ladder populate.
5. Order drive during an Alpaca session that accepts orders: a liquid NMS
   stock bracket through activate, arm flip, flatten, and end flat. Data
   proof via `/api/audit`, visual proof via screenshot.
6. Close phases 4 and 5 in `resource/plans/alpaca-provider/overview.md`
   (remove the "runtime proof still owed" note).
7. Run the full verify loop once for `ib` and once for `alpaca`.

## Notes for whoever picks this up

- IB Gateway paper was down on 4002 at shutdown; the IB app's retry loop
  handles that. Start the gateway before any IB drive.
- The scanner now lives in `scanner-ts` and is out of the trading repo's
  gate. Do not run the scanner and a trading app at the same time.
- The `archive/` tree is out of scope; do not read it unless asked.
