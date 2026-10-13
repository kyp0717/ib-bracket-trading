# pkill -f can kill the shell that invoked it

## What happened
A shell command that contained the literal text `tsx server.ts` (to
start the app) and also ran `pkill -f "tsx server.ts"` died with exit
code 143 (SIGTERM) before finishing its job. It killed itself.

## Why it was surprising
pkill -f matches the full command line of every process, and the
invoking shell's own command line contains the pattern text because the
start command is part of the same script. The runner script is safe
because the pattern lives inside a file; the trap only bites when the
kill runs in the same shell as a command that mentions the app.

## What prevents a repeat
Run the kill in its own shell call with nothing else in it, or use a
pattern the shell does not literally contain, for example
`pkill -f "server[.]ts"`. Do not rely on the bracket trick alone if the
same command line also starts the app; the start command re-introduces
the literal text. Separate calls are the reliable shape.
