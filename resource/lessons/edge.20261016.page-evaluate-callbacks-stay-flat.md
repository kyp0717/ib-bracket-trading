# tsx injects `__name` into page.evaluate callbacks that declare nested functions

Date: 2026-10-16. Surfaced by `test/web-interface/09-header-layout.ts` going
red twice with `ReferenceError: __name is not defined` inside
`page.evaluate`, on a scenario that otherwise had no app-side cause.

## What happened

The rewritten 09 scenario built its measurement closure like this:

```ts
const m = await page.evaluate(() => {
  const rect = (id: string) => document.getElementById(id)!.getBoundingClientRect();
  ...
});
```

Every run died before the first check: `Error: page.evaluate:
ReferenceError: __name is not defined`, evaluated in the browser. Even
after dropping the `: string` annotation the error persisted, because
the nested `rect` arrow was still there.

## Why it happened

`tsx` transpiles every scenario file to CJS with esbuild `keepNames`
on. Any function expression in the file gets wrapped in a
`__name(fn, "fn")` helper call that lives in the module scope of the
test process. Playwright serializes the callback source and evaluates
it in the browser, where `__name` does not exist. Type-only syntax
(`as HTMLElement`, non-null `!`) compiles away and is safe; a real
nested function does not. Sibling scenarios never hit this because
their `page.evaluate` callbacks contain statements only, never helper
functions, so nothing injects a helper identifier.

## The fix

No app code involved. In `test/web-interface/09-header-layout.ts` the
closure now inlines every `getBoundingClientRect()` call and declares
no nested functions. The scenario then passed 12/12.

## Rules that fall out

- In any `page.evaluate` / `$eval` callback in this test tree, write
  plain statements only: no nested functions, no destructuring helpers.
- Casts and non-null assertions inside the callback are fine; they
  erase at compile time.
- If a measurement needs a helper, hoist it so the callback stays a
  flat list of statements, or compute outside the callback.
