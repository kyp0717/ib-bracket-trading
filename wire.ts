export interface Leg {
  orderId: number;
  status: string;
  filled: number;
  avgPrice: number;
}

export type BracketState = "working" | "partial" | "closed";

export interface Bracket {
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  orderType: "LMT" | "MKT";
  state: BracketState;
  entryLocked: boolean;
  parent: Leg;
  stopLeg: Leg;
  targetLeg: Leg;
  ocaGroup: string;
}

export interface BracketSnapshot {
  current: Bracket | null;
  _pending: boolean;
}

export interface DepthLevel {
  price: number;
  size: number;
}

export interface DepthBook {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  time: number;
  price: number;
  size: number;
}

export interface ConnState {
  host: string;
  ibPort: number;
  webPort: number;
  clientId: number;
  connected: boolean;
  nextValidId: number;
  reconciled: boolean;
}
