# A bare re-export creates no local binding

## What happened
test/suite.ts had `export { EventSource } from './sse'`, and the very
same file used `new EventSource(...)` inside `live()`. That reference
resolved to the Node global, not the polyfill, so the polyfill sat
unused while the helper crashed on the missing global.

## Why it was surprising
`export { X } from './mod'` forwards the name to anything that imports
this file, but it does not create a local variable named X. The local
reference silently fell through to the global scope. The compiler is
happy either way, so the static gate could not flag it.

## What prevents a repeat
suite.ts now does `import { EventSource } from './sse'` followed by a
plain re-export, so the local name exists. Rule of thumb for this repo:
if a helper depends on something a browser or Node may or may not
provide globally, import it explicitly at the top of the file.
