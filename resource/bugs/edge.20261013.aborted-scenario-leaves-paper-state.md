# An aborted scenario leaves paper account state behind

## What happened
A failed run of the web-03 scenario left a real +100 SPY position on
the paper account with no open orders. Nothing cleaned it up until it
was found by hand and flattened.

## Why it was surprising
Two things compounded. First, web-01 uses qty=100 and its limit order
filled before the modal cancel landed, so the suite itself created a
position it never planned to hold. Second, web-03 aborts on its first
failed check, and its cleanup (deactivate, flatten) sits after the
checks in the same block, so the abort skips it. The AGENTS.md safety
rule says never leave a position; the suite quietly violated it.

## What prevents a repeat
After any red run, probe the gateway before assuming the account is
clean, and flatten whatever you find. The structural fix is to move
scenario cleanup into a finally-style block so it runs even on abort;
until that lands, treat every red run as leaving live state behind.
