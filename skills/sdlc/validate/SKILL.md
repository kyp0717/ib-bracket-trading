---
name: validate
description: Use after implementing a change, before declaring it done. Drives the running app against the feature files in resource/features/, proves behavior with the existing suite and evidence, and reports PASS/FAIL. Step 6 of the SDLC workflow in AGENTS.md; reads the map, never edits it.
---

# Validate

The runner half of the pair. `track-feature` writes the inventory;
this skill reads it, drives the app, and returns evidence. If the map
and the app disagree, the app wins the argument and the map loses:
stop and hand the drift to `track-feature`.

## Procedure

1. Doctor first: `npx tsx test/health-check/health-check.ts <port>`
   must pass before anything drives the app. Paper port only. Nothing
   under this procedure points at 4001.
2. Read the feature file for the changed area in
   `resource/features/`. It defines the coverage set: every reachable
   entry point, and the success, cancel, error, empty, and persistence
   paths the change can affect.
3. Drive each path. Authoring scenarios belongs to the `build-test`
   skill; this skill runs what exists and writes new checks only
   through it.
4. Prove. Every check is one `pass`/`fail` line reached through
   `waitFor`, screenshots name themselves from the scenario path and
   land in the S3 evidence bucket. A claim without captured evidence
   counts as not checked.
5. Clean up. Deactivate any live bracket, flatten until flat, leave
   the book clean. A session never ends with a position or a resting
   bracket on the account.
6. Report PASS/FAIL per feature file checked, with the evidence
   pointers. FAIL names the broken contract from the check name.

## Sweep mode

For a broad regression pass, walk `resource/features/README.md` top
to bottom in its sweep order instead of the changed area only.

## Rules

- Read-only against the map. Drift is reported, never fixed here.
- Fills run inside 09:30 to 15:45 ET; outside that window treat fill
  paths as unreachable and say so, per the lessons.
- A red check routes to `lesson-learned` before anything else.
