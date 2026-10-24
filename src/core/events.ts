import type { DepthBook } from "./wire";

export interface PlaceBracketIntent {
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  orderType: "LMT" | "MKT";
  parentId: number;
  stopId: number;
  targetId: number;
}

export interface ModifyLegsIntent {
  symbol: string;
  parentId: number;
  stopId: number;
  targetId: number;
  stopQty: number;
  targetQty: number;
  stop: number;
  target: number;
}

export interface PlaceFlattenIntent {
  symbol: string;
  action: "BUY" | "SELL";
  qty: number;
  price: number;
}

export interface ReconciledLegEvent {
  parentId: number;
  parentOrderId: number;
  symbol: string;
  entry: number;
  orderType: "LMT" | "MKT";
  leg: "stop" | "target";
  orderId: number;
  qty: number;
  price: number;
  rawType: string;
}

export interface BracketIntents {
  reconciled(): boolean;
  takeOrderIds(n: number): number;
  placeBracket(intent: PlaceBracketIntent): void;
  modifyLegs(intent: ModifyLegsIntent): void;
  placeFlatten(intent: PlaceFlattenIntent): number;
  cancel(orderId: number): void;
  book(): DepthBook;
}
