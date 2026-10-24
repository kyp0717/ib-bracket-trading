import { OrderAction, OrderType } from "@stoqey/ib";
import * as ibmod from "./index";
import * as core from "../../core/bracket";
import { bookSnapshot } from "./chart";
import { audit } from "../../core/log";
import { emit } from "../../core/emit";
import type { ModifyLegsIntent, PlaceBracketIntent, PlaceFlattenIntent } from "../../core/events";

function placeBracket(p: PlaceBracketIntent): void {
  const contract = ibmod.contractFor(p.symbol);
  const ocaGroup = `br-${p.symbol}-${p.parentId}`;
  const parent: any = {
    orderId: p.parentId,
    action: OrderAction.BUY,
    orderType: p.orderType === "LMT" ? OrderType.LMT : OrderType.MKT,
    totalQuantity: p.qty,
    lmtPrice: p.orderType === "LMT" ? p.entry : undefined,
    tif: "DAY",
    transmit: false,
    outsideRth: true,
  };
  const stopOrder: any = {
    orderId: p.stopId,
    parentId: p.parentId,
    action: OrderAction.SELL,
    orderType: OrderType.STP_LMT,
    totalQuantity: p.qty,
    auxPrice: p.stop,
    lmtPrice: p.stop,
    tif: "GTC",
    transmit: false,
    ocaGroup,
    ocaType: 1,
    outsideRth: true,
  };
  const targetOrder: any = {
    orderId: p.targetId,
    parentId: p.parentId,
    action: OrderAction.SELL,
    orderType: OrderType.LMT,
    totalQuantity: p.qty,
    lmtPrice: p.target,
    tif: "GTC",
    transmit: true,
    ocaGroup,
    ocaType: 1,
    outsideRth: true,
  };
  ibmod.place(contract, parent);
  ibmod.place(contract, stopOrder);
  ibmod.place(contract, targetOrder);
}

function modifyLegs(m: ModifyLegsIntent): void {
  const contract = ibmod.contractFor(m.symbol);
  const ocaGroup = `br-${m.symbol}-${m.parentId}`;
  ibmod.place(contract, {
    orderId: m.stopId,
    parentId: m.parentId,
    action: OrderAction.SELL,
    orderType: OrderType.STP_LMT,
    totalQuantity: m.stopQty,
    auxPrice: m.stop,
    lmtPrice: m.stop,
    tif: "GTC",
    transmit: true,
    ocaGroup,
    ocaType: 1,
    outsideRth: true,
  });
  ibmod.place(contract, {
    orderId: m.targetId,
    parentId: m.parentId,
    action: OrderAction.SELL,
    orderType: OrderType.LMT,
    totalQuantity: m.targetQty,
    lmtPrice: m.target,
    tif: "GTC",
    transmit: true,
    ocaGroup,
    ocaType: 1,
    outsideRth: true,
  });
}

function placeFlatten(f: PlaceFlattenIntent): number {
  const orderId = ibmod.takeOrderIds(1);
  ibmod.place(ibmod.contractFor(f.symbol), {
    orderId,
    action: f.action === "SELL" ? OrderAction.SELL : OrderAction.BUY,
    orderType: OrderType.LMT,
    totalQuantity: f.qty,
    lmtPrice: f.price,
    tif: "DAY",
    transmit: true,
    outsideRth: true,
  });
  return orderId;
}

core.bindIntents({
  reconciled: () => ibmod.state.reconciled,
  takeOrderIds: (n) => ibmod.takeOrderIds(n),
  placeBracket,
  modifyLegs,
  placeFlatten,
  cancel: (orderId) => ibmod.cancel(orderId),
  book: () => bookSnapshot(),
});

let reconcilePending = { openOrders: false, positions: false };
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

const reconcileParents = new Map<number, any>();
const reconcileOrphans = new Map<number, { orderId: number; symbol: string; order: any }[]>();
const reconcileAdopted = new Set<number>();

export function beginReconcile(): void {
  core.blockActivations();
  reconcilePending = { openOrders: true, positions: true };
  reconcileParents.clear();
  reconcileOrphans.clear();
  reconcileAdopted.clear();
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(finishReconcileIfDone, 5000);
  try {
    ibmod.ib.reqOpenOrders();
    ibmod.ib.reqPositions();
  } catch {
  }
  emit("exec", { t: "conn", ...ibmod.state });
}

export function onReconcileStep(which: "openOrders" | "positions"): void {
  reconcilePending[which] = false;
  finishReconcileIfDone();
}

function finishReconcileIfDone(): void {
  if (reconcilePending.openOrders || reconcilePending.positions) return;
  if (!core.unblockActivations()) return;
  ibmod.setReconciled();
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = null;
  audit("reconcile", "open orders and positions replayed, activations open");
  for (const [parentId, orphans] of reconcileOrphans) {
    for (const o of orphans) {
      ibmod.cancel(o.orderId);
      audit("reconcile-orphan-cancel", `${o.symbol}: child of missing parent ${parentId}, order ${o.orderId}`);
    }
  }
  reconcileOrphans.clear();
  for (const [orderId, parent] of reconcileParents) {
    if (reconcileAdopted.has(orderId)) continue;
    ibmod.cancel(orderId);
    audit("reconcile-orphan-cancel", `${parent.symbol}: parent without live children, order ${orderId}`);
  }
  reconcileParents.clear();
  emit("exec", { t: "conn", ...ibmod.state });
  emit("exec", { t: "bracket", bracket: core.snapshot() });
}

export function onOpenOrder(orderId: number, symbol: string, order: any): void {
  if (core.hasOrder(orderId)) {
    return;
  }
  if (!reconcilePending.openOrders) return;
  if (!order.parentId) {
    if (order.orderType === "LMT" || order.orderType === "MKT") {
      reconcileParents.set(orderId, { symbol, order });
      const orphans = reconcileOrphans.get(orderId);
      if (orphans) {
        reconcileOrphans.delete(orderId);
        for (const o of orphans) attachReconciledLeg(o.orderId, o.symbol, o.order);
      }
    }
    return;
  }
  if (!reconcileParents.has(order.parentId)) {
    const list = reconcileOrphans.get(order.parentId) ?? [];
    list.push({ orderId, symbol, order });
    reconcileOrphans.set(order.parentId, list);
    return;
  }
  attachReconciledLeg(orderId, symbol, order);
}

function attachReconciledLeg(orderId: number, symbol: string, order: any): void {
  const parent = reconcileParents.get(order.parentId);
  if (!parent) return;
  reconcileAdopted.add(order.parentId);
  const leg = order.orderType === "STP" ? "stop" : "target";
  core.onReconciledLeg({
    parentId: order.parentId,
    parentOrderId: parent.order.orderId ?? order.parentId,
    symbol: parent.symbol,
    entry: parent.order.lmtPrice || 0,
    orderType: parent.order.orderType,
    leg,
    orderId,
    qty: order.totalQuantity,
    price: leg === "stop" ? order.auxPrice : order.lmtPrice,
    rawType: order.orderType,
  });
}
