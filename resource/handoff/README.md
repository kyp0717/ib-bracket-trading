# Handoff notes

What the other machine, or the human at the desk, needs to know to run
and operate this app against a live account. One file per topic, named
YYYY-MM-DD-topic.md. Suggested first entries:

- How to start the app against the live gateway, which port, which
  client id, and how to confirm it reconciled before trusting it
- The manual escape hatch: flattening and cancelling from IB's own
  interface when the app is down mid-position
- The daily open and close checklist: verify flat, verify no resting
  orders, read audit.log for anything unexpected
- The kill criteria: what observed behavior means stop trading and
  go back to paper
