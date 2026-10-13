# Go-live pending tasks

Date: 2026-10-13. Status: not ready for live trading. Owner of this
file: whoever picks up the next task. Update the status line as items
land, and move finished items to the bottom under Done with the date.

## Live blockers, in order of danger

1. **A page reload can strip protection.** deactivate cancels stop and
   target even when the entry has filled, and a symbol load right after
   a restart kills the bracket. A stray refresh at the wrong second
   turns an open position into a naked one. Fix or guard this, and add
   a test that reloads the page on a filled bracket and proves the
   children survive. Status: open.
2. **Flatten can lie near the close.** flatten returns ok while the
   gateway holds the MKT order for tomorrow's open. The fix is designed
   and proven (send a marketable limit at the current bid instead of
   MKT, always) but not implemented. See
   resource/lessons/20261013-market-orders-are-limit-only-outside-regular-hours.md.
   Status: open.
3. **Full suite not green since the fixes.** Reconnect rebuild and
   tick-by-tick cadence are each proven in isolation, never in one run.
   First action in regular hours: `bash test/run-all.sh 4002` between
   09:30 and 15:45 ET. Status: open, scheduled for next session.
4. **No sustained paper observation.** One week of regular-hours paper
   runs, flat and clean at the end of each day, before real money.
   Status: open, starts after item 3.

## Same-checklist smaller items

5. GUI size buttons default to 100 shares. First live day must be qty
   1. Status: open (decide: change the default or make it a setting).
6. Confirm the web UI binds to localhost only. Status: open, check
   server.ts listen address.
7. Write the manual escape hatch: how to flatten from IB's own
   interface if the app dies mid-position. Belongs in
   resource/go-live/handoff/. Status: open.

## Done

(nothing yet)
