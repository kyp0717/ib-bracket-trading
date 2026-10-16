---
name: track-feature
description: Use when a user-facing feature ships, when selectors, routes, or API endpoints change, or on a drift sweep of the feature inventory. Builds and maintains exactly one thing, the markdown files under resource/features/, and nothing else. Step 5 of the SDLC workflow in AGENTS.md.
---

# Track feature

The feature inventory is a folder of markdown files, one per feature
area, indexed by a README. It is prose an agent reads once per task,
not a graph and not generated docs. Each file answers the same four
questions so any agent can open one and know what exists, how to drive
it, and what usually lies, without rereading `page.html`.

## Procedure

1. Identify the feature area touched. One file per area under
   `resource/features/`; split a file only when a section needs its own
   preconditions.
2. Ground the wire surface with graft: `graft grep` and `graft ask`
   over `src/server.ts`, `wire.ts`, and `emit.ts` give the endpoints,
   SSE channels, and payload shapes. Graft supplies pointers
   (`server.ts:55`, `/api/quote`); it does not write the file.
3. Ground the DOM surface with one Playwright pass against the running
   page: open it with `guiPage`, collect the ids, visible labels, and
   default states the area owns. Read `page.html` only for ids graft
   cannot see.
4. Write or update the one feature file with exactly these headings:
   - `Sub-features`: what exists, one line each, with the id or route.
   - `How to reach it`: the user path or the API call that surfaces it.
   - `How to drive it`: Playwright steps or the exact request, with
     the selectors that survive refactors.
   - `What usually lies`: the gotchas, each pointing at its lesson in
     `resource/lessons/` when one exists.
5. Update `resource/features/README.md`: sweep order, preconditions,
   and the one-line index entry if the area is new.

## Rules

- Behavior level only. No source narration, no architecture. If an
  entry reads like graft output, it is wrong.
- Drift is fixed in the same commit as the change that caused it.
- Never edit scenarios, never run suites, never place or cancel
  orders. Driving the page is read-only measurement.
- If `validate` reports drift (selector gone, route renamed), that is
  this skill's trigger, not validate's job to fix.

## Layout

```
resource/features/
  README.md          index, preconditions, sweep order
  <area>.md          one per feature area, four headings each
```
