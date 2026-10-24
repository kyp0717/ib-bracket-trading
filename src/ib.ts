
import { IBApi, EventName, Stock, Contract } from "@stoqey/ib";
import { emit } from "./emit";
import { audit } from "./log";
import * as bracket from "./bracket";
import * as chart from "./chart";
import type { ConnState, IbProg } from "./wire";
import type { Broker } from "./broker";

const INFO_CODES = new Set([2104, 2106, 2158]);
const DISCONNECT_CODES = new Set([1100, 2110, 1300]);

function argVal(name: string, dflt: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

function progFromPort(port: number): IbProg {
  if (port === 4001 || port === 4002) return "ibgw";
  if (port === 7496 || port === 7497) return "tws";
  return "unknown";
}

export const state: ConnState = {
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

export const ib = new IBApi({
  host: state.host,
  port: state.ibPort,
  clientId: state.clientId,
});

let idCounter = 0;
let wired = false;

const on = (ev: string, fn: (...args: any[]) => void): void => {
  (ib as any).on(ev, fn);
};

export function takeOrderIds(n: number): number {
  const base = Math.max(idCounter, state.nextValidId);
  idCounter = base + n;
  state.nextValidId = idCounter;
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
    state.connected = true;
    emit("exec", { t: "conn", ...state });
    console.log(`connected to ${state.host}:${state.ibPort}`);

    bracket.beginReconcile();
  });

  on(EventName.disconnected, () => {
    state.connected = false;
    state.reconciled = false;
    state.ibAcct = "unknown";
    bracket.blockActivations();
    emit("exec", { t: "conn", ...state });
    console.log("disconnected, retrying in 5s");
    setTimeout(connect, 5000);
  });

  on(EventName.nextValidId, (orderId: number) => {
    state.nextValidId = Math.max(state.nextValidId, orderId);
    idCounter = state.nextValidId;
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
    state.ibAcct = accts.some((a) => a.startsWith("DU")) ? "paper" : accts.length ? "live" : "unknown";
    emit("exec", { t: "conn", ...state });
  });

  on(
    EventName.orderStatus,
    (orderId: number, status: string, filled: number, remaining: number,
     avgFillPrice: number, permId: number, parentId: number,
     lastFillPrice: number, clientId: number, whyHeld: string) => {
      bracket.onOrderStatus(orderId, status, filled, remaining, avgFillPrice, parentId);
    }
  );

  on(EventName.openOrder, (orderId: number, contract: Contract, order: any) => {
    bracket.onOpenOrder(orderId, contract.symbol ?? "", order);
  });

  on(EventName.openOrderEnd, () => bracket.onReconcileStep("openOrders"));

  on(EventName.contractDetails, (reqId: number, details: any) => {
    chart.onContractDetails(reqId, details?.contract?.primaryExchange ?? "", details?.validExchanges ?? "");
  });

  on(EventName.contractDetailsEnd, (reqId: number) => {
    chart.onContractDetailsEnd(reqId);
  });

  on(EventName.position, (account: string, contract: Contract, pos: number, avgCost: number) => {
    bracket.onPosition(contract.symbol ?? "", pos);
  });

  on(EventName.positionEnd, () => {
    bracket.onReconcileStep("positions");
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
    activate: (params) => bracket.activate(params),
    deactivate: (reason) => bracket.deactivate(reason),
    editLevels: (levels) => bracket.editLevels(levels),
    flatten: (symbol, offset) => bracket.flatten(symbol, offset),
    pending: () => bracket.pending(),
    hasWorking: () => bracket.hasWorking(),
    position: (symbol) => bracket.position(symbol),
    snapshot: () => bracket.snapshot(),
    getSymbol: () => chart.getSymbol(),
    histSnapshot: (tf) => chart.histSnapshot(tf),
    tapeSnapshot: () => chart.tapeSnapshot(),
    bookSnapshot: () => chart.bookSnapshot(),
  };
}
