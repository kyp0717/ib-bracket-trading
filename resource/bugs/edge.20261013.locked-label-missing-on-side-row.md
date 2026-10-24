# The LOCKED label was written to the wrong output element

## What happened
The web-03 scenario fills an entry order and then waits for the text
LOCKED to appear in the side column (`#ch-col`). It never did, even
though the server side reported the entry locked within seconds.

## Why it was surprising
page.html is one file holding three parts: markup (what elements exist),
CSS (how they look), and script (what happens on updates). The page has
two separate elements that both display the entry label: a floating tag
inside the chart pane (`#ch-second`) and a row in the side column
(`#ch-col`). Think of them as two output sinks fed from the same state.
The script added the LOCKED suffix only to the chart tag and never
wrote it to the side row, whose label stayed the static text ENTRY.
Updating one sink does not touch the other, and the scenario reads the
one that was never updated. This is a rendering omission, not a logic
bug: the state was correct the whole time.

## What prevents a repeat
renderLevels() in page.html now writes the label, including LOCKED when
the entry is locked, into the side row name cell on every redraw, for
both the on-chart and off-chart branches. web-03 covers it, so a
regression fails in the suite.
