# Confirm modal

The dialog that gates bracket activation. Clicking `#ch-arm` while flat
opens it; it summarizes the order and either places it or closes without
placing.

## Sub-features

- `modal` (`#modal`) full-screen overlay.
- `confirm-summary` (`#confirmText`) one line:
  `SYM qty=N LMT entry=E stop=S target=T`.
- `confirm-place` (`#confirmYes`) places the bracket (accent button).
- `confirm-cancel` (`#confirmNo`) closes without placing.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/`, wait for levels to appear, then click
  the `#ch-arm` head button. No levels means no modal; the feedback line
  reads `no bracket levels`.

## Driving it with verify-bracket-web

Preconditions:

- IB reconciled and levels rendered on the bracket rail, so `#ch-arm`
  opens the modal instead of reporting `no bracket levels`.

- **Open.** Click `#ch-arm`. Run
  `page.click('#ch-arm')`. Assert `#confirmText` names the watched
  symbol and the size from `#ch-size`.
- **Cancel.** Click `#confirmNo`. Run `page.click('#confirmNo')`. The
  overlay hides and no `activate` line lands in `/api/audit`.
- **Confirm.** Click `#confirmYes`. Run `page.click('#confirmYes')`. The
  arm button flips to ENABLE and the entry cell in the order rail
  (`#ch-orders`) reports submitted. Data proof:
  `curl -s http://127.0.0.1:8080/api/audit` contains an `activate` line;
  `curl -s http://127.0.0.1:8080/status` shows `cancelInFlight:false`
  and a non-null bracket via the `/events` pipe.
- **Proof.** Screenshot the open modal before confirming at
  `evidence/confirm-modal/modal-open.png`, then the armed state after at
  `evidence/confirm-modal/bracket-armed.png`, plus the `/api/audit`
  activation line.

## Gotchas

- The modal is the only user path to activation. A direct
  `/api/bracket/activate` POST is a data proof, not the user path; do
  not double-count it as the modal.
- `confirmYes` fires the request and closes immediately; a rejection
  surfaces later in the feedback line, not in the modal.
- Fill paths run only inside 09:30-15:45 ET; outside that window treat
  activation as unreachable and say so.
