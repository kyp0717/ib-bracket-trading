import { EventName, IBApi } from '@stoqey/ib';

export interface ServerOrder {
  orderId: number;
  parentId: number;
  symbol: string;
  action: string;
  orderType: string;
  totalQuantity: number;
  lmtPrice: number;
  auxPrice: number;
  status: string;
  ocaGroup: string;
}

export async function serverOrders(port: number, clientId: number, timeoutMs = 20000): Promise<ServerOrder[]> {
  const ib = new IBApi({ host: '127.0.0.1', port, clientId });
  const orders: ServerOrder[] = [];
  let done = false;
  const finished = new Promise<ServerOrder[]>((resolve) => {
    const finish = () => {
      if (done) return;
      done = true;
      ib.disconnect();
      resolve(orders);
    };
    const timer = setTimeout(finish, timeoutMs);
    ib.on(EventName.error, (err) => console.error('PROBE-ERR ' + String(err ?? '')));
    ib.on(EventName.connected, () => ib.reqAllOpenOrders());
    ib.on(EventName.openOrder, (orderId, contract, order, orderState) => {
      orders.push({
        orderId,
        parentId: order.parentId ?? 0,
        symbol: String(contract.symbol ?? ''),
        action: String(order.action),
        orderType: String(order.orderType),
        totalQuantity: Number(order.totalQuantity),
        lmtPrice: Number(order.lmtPrice ?? 0),
        auxPrice: Number(order.auxPrice ?? 0),
        status: String(orderState?.status ?? ''),
        ocaGroup: String(order.ocaGroup ?? ''),
      });
    });
    ib.on(EventName.openOrderEnd, () => {
      clearTimeout(timer);
      finish();
    });
  });
  ib.connect();
  return finished;
}
