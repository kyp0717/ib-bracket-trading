
import { IBApi, EventName, Stock, Contract } from "@stoqey/ib";
import { emit } from "../../core/emit";
import { audit } from "../../core/log";
import * as adapter from "./bracket";
import * as core from "../../core/bracket";
import * as chart from "./chart";
import type { ConnState } from "../../core/wire";
import type { Broker } from "../../core/broker";

const INFO_CODES = new Set([2104, 2106, 2158]);
const DISCONNECT_CODES = new Set([1100, 2110, 1300]);

function argVal(name: string, dflt: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

type IbProg = "ibgw" | "tws" | "unknown";

type IbAcct = "paper" | "live" | "unknown";

interface IbConnState {
  host: string;
  ibPort: number;
  webPort: number;
  clientId: number;
  ibProg: IbProg;
  ibAcct: IbAcct;
  connected: boolean;
  nextValidId: number;
  reconciled: boolean;
}

function progFromPort(port: number): IbProg {
  if (port === 4001 || port === 4002) return "ibgw";
  if (port === 7496 || port === 7497) return "tws";
  return "unknown";
}

const conn: IbConnState = {
  host: argVal("--host", "127.0.0.1"),
  ibPort: Number(argVal("--ibport", "4001")),
  webPort: Number(argVal("--port", "8080")),
  clientId: 90,
  ibProg: progFromPort(Number(argVal("--ibport", "4001"))),
  ibAcct: "unknown",
  connected: false,
  nextValidId: 0,
  reconciled: false,
};

function pillLabel(): string {
  const prog = conn.ibProg === "ibgw" ? "IBGW" : conn.ibProg === "tws" ? "TWS" : "IB?";
  const acct = conn.ibAcct === "paper" ? "PAPER" : conn.ibAcct === "live" ? "LIVE" : "?";
  return `${prog} ${conn.ibPort} ${acct} id ${conn.clientId}`;
}

export const state: ConnState = {
  webPort: conn.webPort,
  provider: "ib",
  accountMode: "paper",
  label: pillLabel(),
  connected: false,
  reconciled: false,
};

function publish(): void {
  state.accountMode = conn.ibAcct === "live" ? "live" : "paper";
  state.label = pillLabel();
  state.connected = conn.connected;
  state.reconciled = conn.reconciled;
}

export function setReconciled(): void {
  conn.reconciled = true;
  publish();
}

export const ib = new IBApi({
  host: conn.host,
  port: conn.ibPort,
  clientId: conn.clientId,
});

let idCounter = 0;
let wired = false;

const on = (ev: string, fn: (...args: any[]) => void): void => {
  (ib as any).on(ev, fn);
};

export function takeOrderIds(n: number): number {
  const base = Math.max(idCounter, conn.nextValidId);
  idCounter = base + n;
  conn.nextValidId = idCounter;
  return base;
}

export function contractFor(symbol: string): Contract {
  return new Stock(symbol, "SMART", "USD");
}

export function connect(): void {
  if (!wired) {
    wire();
    wired = true;
  }
  try {
    ib.connect();
  } catch (e) {
    console.error("connect failed, retrying in 5s", e);
    setTimeout(connect, 5000);
  }
}

function wire(): void {
  on(EventName.connected, () => {
    conn.connected = true;
    publish();
    emit("exec", { t: "conn", ...state });
    console.log(`connected to ${conn.host}:${conn.ibPort}`);

    adapter.beginReconcile();
  });

  on(EventName.disconnected, () => {
    conn.connected = false;
    conn.reconciled = false;
    conn.ibAcct = "unknown";
    publish();
    core.blockActivations();
    emit("exec", { t: "conn", ...state });
    console.log("disconnected, retrying in 5s");
    setTimeout(connect, 5000);
  });

  on(EventName.nextValidId, (orderId: number) => {
    conn.nextValidId = Math.max(conn.nextValidId, orderId);
    idCounter = conn.nextValidId;
    publish();
    emit("exec", { t: "conn", ...state });
  });

  on(EventName.error, (err: Error, code: number, reqId: number) => {
    if (INFO_CODES.has(code)) {
      console.log(`info ${code}: ${err.message}`);
      emit("exec", { t: "info", msg: `${code} ${err.message}` });
      return;
    }
    if (DISCONNECT_CODES.has(code)) {
      console.log(`connection notice ${code}: ${err.message}`);
      return;
    }
    console.error(`error ${code} req ${reqId}: ${err.message}`);
    audit("error", `code=${code} req=${reqId} ${err.message}`);
    emit("exec", { t: "info", msg: `ERR ${code}: ${err.message}` });
  });

  on(EventName.managedAccounts, (accountsList: string) => {
    const accts = accountsList.split(",").map((a) => a.trim()).filter(Boolean);
    conn.ibAcct = accts.some((a) => a.startsWith("DU")) ? "paper" : accts.length ? "live" : "unknown";
    publish();
    emit("exec", { t: "conn", ...state });
  });

  on(
    EventName.orderStatus,
    (orderId: number, status: string, filled: number, remaining: number,
     avgFillPrice: number, permId: number, parentId: number,
     lastFillPrice: number, clientId: number, whyHeld: string) => {
      core.onLegStatus(orderId, status, filled, avgFillPrice);
    }
  );

  on(EventName.openOrder, (orderId: number, contract: Contract, order: any) => {
    adapter.onOpenOrder(orderId, contract.symbol ?? "", order);
  });

  on(EventName.openOrderEnd, () => adapter.onReconcileStep("openOrders"));

  on(EventName.contractDetails, (reqId: number, details: any) => {
    chart.onContractDetails(reqId, details?.contract?.primaryExchange ?? "", details?.validExchanges ?? "");
  });

  on(EventName.contractDetailsEnd, (reqId: number) => {
    chart.onContractDetailsEnd(reqId);
  });

  on(EventName.position, (account: string, contract: Contract, pos: number, avgCost: number) => {
    core.onPosition(contract.symbol ?? "", pos);
  });

  on(EventName.positionEnd, () => {
    adapter.onReconcileStep("positions");
    ib.cancelPositions();
  });

  on(
    EventName.historicalData,
    (reqId: number, time: string, open: number, high: number, low: number,
     close: number, volume: number, count: number, wap: number) => {
      
      if (typeof time === "string" && time.startsWith("finished")) {
        chart.onHistoricalDataEnd(reqId);
        return;
      }
      chart.onHistoricalData(reqId, Number(time), open, high, low, close, volume);
    }
  );

  on(
    EventName.historicalDataUpdate,
    (reqId: number, time: string, open: number, high: number, low: number,
     close: number, volume: number, barCount: number, wap: number) => {
      chart.onHistoricalDataUpdate(reqId, { time, open, high, low, close, volume });
    }
  );

  on(
    EventName.tickByTickAllLast,
    (reqId: number, tickType: number, time: string, price: number, size: number,
     attrib: any, exchange: string, specialConditions: string) => {
      chart.onTick(reqId, Number(time), price, size);
    }
  );

  on(
    EventName.updateMktDepth,
    (reqId: number, pos: number, op: number, side: number, price: number, size: number) => {
      chart.onDepth(reqId, pos, op, side, price, size);
    }
  );

  on(
    EventName.updateMktDepthL2,
    (reqId: number, pos: number, marketMaker: string, op: number, side: number,
     price: number, size: number, isSmartDepth: boolean) => {
      chart.onDepth(reqId, pos, op, side, price, size);
    }
  );
}

export function place(contract: Contract, order: any): void {
  ib.placeOrder(order.orderId, contract, order);
}

export function cancel(orderId: number): void {
  ib.cancelOrder(orderId);
}

export function createBroker(): Broker {
  return {
    state,
    connect,
    subscribe: (symbol: string) => chart.setSymbol(symbol),
    unsubscribe: (_symbol: string) => {},
    quote: () => chart.quote(),
    activate: (params) => core.activate(params),
    deactivate: (reason) => core.deactivate(reason),
    editLevels: (levels) => core.editLevels(levels),
    flatten: (symbol, offset) => core.flatten(symbol, offset),
    pending: () => core.pending(),
    hasWorking: () => core.hasWorking(),
    position: (symbol) => core.position(symbol),
    snapshot: () => core.snapshot(),
    getSymbol: () => chart.getSymbol(),
    histSnapshot: (tf) => chart.histSnapshot(tf),
    tapeSnapshot: () => chart.tapeSnapshot(),
    bookSnapshot: () => chart.bookSnapshot(),
  };
}
