
export type Msg = Record<string, unknown>;
export type Channel = "exec" | "market";

const listeners: Record<Channel, Set<(m: Msg) => void>> = {
  exec: new Set(),
  market: new Set(),
};

export function onEvent(channel: Channel, fn: (m: Msg) => void): void {
  listeners[channel].add(fn);
}

export function emit(channel: Channel, m: Msg): void {
  for (const fn of listeners[channel]) fn(m);
}
