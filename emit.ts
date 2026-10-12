// Local event fan-out. One subscriber: the SSE writer in server.ts.
// This is a callback list, not a message bus.

type Msg = Record<string, unknown>;
const subs: ((m: Msg) => void)[] = [];

export function onEvent(fn: (m: Msg) => void): void {
  subs.push(fn);
}

export function emit(m: Msg): void {
  for (const fn of subs) {
    try {
      fn(m);
    } catch (e) {
      console.error("emit subscriber failed", e);
    }
  }
}
