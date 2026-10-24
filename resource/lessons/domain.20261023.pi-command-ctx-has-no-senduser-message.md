# Pi command handlers receive a context without sendUserMessage; the method lives on the extension `pi` object

Date: 2026-10-23. Source: running `/poteto-mode` in Pi threw
`Extension "command:poteto-mode" error: ctx.sendUserMessage is not a function`.

## What happened

`/poteto-mode` registered and set the mode entry, then threw
`ctx.sendUserMessage is not a function` from the pi-pstack extension.
The trailing call that queues `/skill:poteto-mode` failed because the
method did not exist on the command context.

## Why it happened

`pi.registerCommand` handlers get an `ExtensionCommandContext` (Pi SDK
1.4.0, `dist/core/extensions/types.d.ts`). That type has `waitForIdle`,
`newSession`, `fork`, `switchSession`, `reload`, `ui`, and the other
command-facing members, but no `sendUserMessage`. The method exists in
two other places: on the extension `pi` object
(`ExtensionAPI.sendUserMessage`) and on `ReplacedSessionContext`, which
is passed only to `withSession()` callbacks after a session switch.

pi-pstack@0.1.0 called `ctx.sendUserMessage` anyway, so the property was
`undefined` at runtime. npm has no newer pi-pstack release (0.1.0 is
`latest`), so the bug is still what ships.

## The fix

Patched the installed copy, one line, `ctx` to `pi`, in
`~/.pi/agent/npm/node_modules/pi-pstack/extensions/pstack/index.ts`
inside the `poteto-mode` command handler:

```ts
pi.sendUserMessage(`/skill:poteto-mode${args.trim() ? ` ${args.trim()}` : ""}`, { deliverAs: "steer", expandPromptTemplates: true });
```

`pi` is already in scope as the extension factory parameter. The patch
is local to node_modules and is lost on `npm update` or a reinstall of
pi-pstack; linden needs the same one-line change, and any future
pi-pstack release needs it upstream.

## Rules that fall out

- Command handlers get `ExtensionCommandContext`; it has no
  `sendUserMessage` or `sendMessage`. To send a user message from a
  command, call `pi.sendUserMessage()` or `pi.sendMessage()` on the
  ExtensionAPI.
- `sendUserMessage` also appears on `ReplacedSessionContext`, but only
  inside `withSession()` callbacks after `newSession`/`fork`/
  `switchSession`. Do not assume it is on the plain command context.
  Note the return types differ: `ExtensionAPI.sendUserMessage` returns
  `void`, while `ReplacedSessionContext.sendUserMessage` returns
  `Promise<void>`. Do not await the ExtensionAPI version.
- Before trusting an extension example, read the installed Pi SDK's
  `dist/core/extensions/types.d.ts` for the exact command-context
  surface. The shipped docs match it; a stale example does not.
- A patched file under `~/.pi/agent/npm/node_modules/` does not survive
  an update. Record such patches in a lesson so the other machine and
  the next install can re-apply them.
