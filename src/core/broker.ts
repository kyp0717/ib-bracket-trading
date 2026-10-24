import type { Bar, BracketSnapshot, ConnState, DepthBook, Trade } from "./wire";

export interface BrokerActivateParams {
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  orderType: "LMT" | "MKT";
}

export interface BrokerLevels {
  entry?: number;
  stop?: number;
  target?: number;
}

export interface BrokerResult {
  ok: boolean;
  error?: string;
}

export type HistTf = "10s" | "1m" | "1d";

export interface Broker {
  readonly state: ConnState;
  connect(): void;
  subscribe(symbol: string): void;
  unsubscribe(symbol: string): void;
  quote(): Trade | null;
  activate(params: BrokerActivateParams): BrokerResult;
  deactivate(reason: string): BrokerResult;
  editLevels(levels: BrokerLevels): BrokerResult;
  flatten(symbol: string, offset: number): BrokerResult;
  pending(): boolean;
  hasWorking(): boolean;
  position(symbol: string): number;
  snapshot(): BracketSnapshot;
  getSymbol(): string;
  histSnapshot(tf: HistTf): Bar[];
  tapeSnapshot(): Trade[];
  bookSnapshot(): DepthBook;
}
