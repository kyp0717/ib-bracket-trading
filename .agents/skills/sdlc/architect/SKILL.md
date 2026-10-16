---
name: architect
description: Use before implementing any nontrivial change that crosses a function or module boundary. Explores two or three candidate shapes in parallel, evaluates them against the AGENTS.md contract, picks one, and records why the losers lost. Step 1 of the SDLC workflow in AGENTS.md.
---

# Architect

All builds here are incremental. The full design is never known up
front, so this skill designs only the delta in front of you, against
the existing contract. It exists because the first design an agent
writes is usually the one it imagined first, not the best one.

## Procedure

1. Name the data shape first. Every value that crosses a boundary gets
   a named type in `wire.ts` before any design is compared. The Pocock
   rule: let the compiler point at every consumer.
2. Sketch two or three candidate shapes for the change. A sketch is a
   skeleton, signatures, and where the code lives, not an
   implementation. Stop sketching once a candidate can be judged.
3. Judge each candidate against, in this order:
   - Safety (AGENTS.md): long-only, one live bracket, cancel never
     blocked, audit on every transition.
   - The layout and proof contracts in AGENTS.md.
   - The speed rules: edit, restart, click, under ten seconds. A
     candidate that needs a build step or a new service loses.
   - The type check and the existing suite staying green.
4. Pick one. Record the rejection reasons in your reply, one line per
   loser. The next increment must not relitigate them without new
   evidence.
5. Implement only after the pick. Do not gold-plate the sketch into
   the design.

## When not to run

- Typo-scale edits and comment-strip sweeps.
- A change whose shape is fully pinned by an existing type or a
  scenario already in the tree.

## Boundary

Design forks that survive step 4 as ties, or that touch order paths,
the live account rules, or a wire type, go to the `interrogate` skill
before implementing. This skill explores; it does not defend.
