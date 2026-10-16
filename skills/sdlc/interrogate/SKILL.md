---
name: interrogate
description: Use for contested or high-stakes design decisions only, gated by the architect skill or by touching order paths, live account rules, or wire.ts types. Produces the strongest objections to the chosen design and a proceed-or-revise verdict with evidence. Step 2 of the SDLC workflow in AGENTS.md; not every increment reaches it.
---

# Interrogate

Adversarial review for designs that are expensive to get wrong. Most
increments never run it; running it on every change produces contrarian
noise and gets ignored.

## Gate

Run only when at least one holds:

- `architect` ended in a tie or near-tie between candidates.
- The change touches order paths, the live account rules, or a type in
  `wire.ts`.
- The change is hard to reverse (deleting a module, renaming a wire
  field, changing the audit format).

Otherwise proceed to implement.

## Procedure

1. Enumerate the load-bearing claims of the chosen design. Three to
   five, no more.
2. For each claim, write the strongest objection you can. Steelman the
   loser designs from `architect`.
3. Test each objection against evidence, cheapest first: the lessons in
   `resource/lessons/`, the rules in AGENTS.md, then a paper-port
   experiment if the objection is about behavior. An objection that
   survives evidence wins.
4. Verdict: proceed, or revise and state exactly what changes. A
   revise verdict goes back to `architect` with the objection as a new
   constraint; do not redesign silently.
5. Log the verdict and the surviving objections in the reply. If
   `show-me-your-work` style decision trails are in use, this verdict
   is an entry.

## Boundary

This skill argues. It does not implement, does not run scenarios, and
does not update the feature map. Both belong to later SDLC steps.
