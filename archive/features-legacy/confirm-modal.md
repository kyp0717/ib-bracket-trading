# Confirm modal

The dialog that gates bracket activation.

## Sub-features

- `modal`: full-screen overlay.
- `confirmText`: one-line summary, `SYM qty=N LMT entry=E stop=S
  target=T`.
- `confirmYes`: places the bracket (accent button).
- `confirmNo`: closes without placing.

## How to reach it

Click `ch-arm` while flat with levels present. No levels, no modal:
the feedback line reads `no bracket levels`.

## How to drive it

- Open: assert `confirmText` names the watched symbol and the size from
  `#ch-size`.
- Cancel: click `confirmNo`, assert the overlay hides and no activation
  audit line lands.
- Confirm: click `confirmYes`, assert the arm button flips to ENABLE
  and the entry cell in the order rail reports submitted.
- Esc: closes the overlay without placing (`10-keyboard-escape.ts`).

## What usually lies

- The modal is the only path to activation; calling
  `/api/bracket/activate` from a test bypasses it on purpose. GUI
  behavior proofs must click, API proofs may post directly, and mixing
  them up double-counts one path.
- `confirmYes` fires the request and closes immediately; a rejection
  surfaces later in the feedback line, not in the modal.
