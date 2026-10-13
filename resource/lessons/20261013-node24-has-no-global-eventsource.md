# Node 24 has no global EventSource

## What happened
Every scenario in both suites died in the first second with
`ReferenceError: EventSource is not defined` thrown from `live()` in
test/suite.ts. No real check ran. The whole suite reported FAIL without
testing anything.

## Why it was surprising
The helper relied on Node providing a global EventSource. Node 22 had
one behind a flag, so the suite worked on machines with that setup.
Node 24 on linden has none, and nothing in the repo declared where
EventSource was supposed to come from.

## What prevents a repeat
test/sse.ts ships a small EventSource replacement and suite.ts now
imports it as a local binding. page.html uses the browser's own
EventSource, which browsers always have, so the page was never affected.
