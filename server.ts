// HTTP server, SSE stream, static page, action routes.
// The page and the order logic share one process and one state;
// routes call bracket.ts directly.

import http from "http";
import { readFile } from "fs";
import * as ibmod from "./ib";
import * as bracket from "./bracket";
import * as chart from "./chart";
import { onEvent } from "./emit";

const sseClients = new Set<http.ServerResponse>();

onEvent((msg) => {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch {
      /* dropped client, pruned on close event */
    }
  }
});

function sendJson(res: http.ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1e5) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const raw = await readBody(req);
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/") {
      readFile("page.html", (err, data) => {
        if (err) {
          sendJson(res, 500, { error: String(err) });
          return;
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end(data);
      });
      return;
    }

    if (req.method === "GET" && path === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 3000\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      emitSnapshot(res, { t: "conn", ...ibmod.state });
      emitSnapshot(res, { t: "bracket", symbol: "*", bracket: bracket.snapshot() });
      emitSnapshot(res, { t: "hist", tf: "10s", bars: chart.histSnapshot("10s") });
      emitSnapshot(res, { t: "hist", tf: "1m", bars: chart.histSnapshot("1m") });
      emitSnapshot(res, { t: "hist", tf: "1d", bars: chart.histSnapshot("1d") });
      emitSnapshot(res, { t: "tapeFull", trades: chart.tapeSnapshot() });
      emitSnapshot(res, { t: "depth", book: chart.bookSnapshot() });
      return;
    }

    if (req.method === "GET" && path === "/status") {
      sendJson(res, 200, { ...ibmod.state, symbol: chart.getSymbol(), pending: bracket.pending() });
      return;
    }

    if (req.method === "GET" && path === "/api/quote") {
      const q = chart.quote();
      if (!q) {
        sendJson(res, 404, { ok: false, error: "no tape yet" });
        return;
      }
      sendJson(res, 200, { ...q, symbol: chart.getSymbol() });
      return;
    }

    if (req.method === "POST" && path === "/api/flatten") {
      const body = await readJson(req);
      const result = bracket.flatten(String(body.symbol ?? "").toUpperCase());
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === "POST" && path === "/api/symbol") {
      const body = await readJson(req);
      const symbol = String(body.symbol ?? "").toUpperCase().trim();
      if (!symbol) {
        sendJson(res, 400, { ok: false, error: "symbol required" });
        return;
      }
      // A live bracket belongs to its symbol. Switching away from it
      // disarms it first, so no bracket is left silently resting.
      for (const s of bracket.workingSymbols()) {
        if (s !== symbol) bracket.disarm(s, `symbol switch to ${symbol}`);
      }
      chart.setSymbol(symbol);
      sendJson(res, 200, { ok: true, symbol });
      return;
    }

    if (req.method === "POST" && path === "/api/arm") {
      const body = await readJson(req);
      const result = bracket.arm({
        symbol: String(body.symbol ?? "").toUpperCase(),
        qty: Number(body.qty),
        entry: Number(body.entry),
        stop: Number(body.stop),
        target: Number(body.target),
        orderType: body.orderType === "MKT" ? "MKT" : "LMT",
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === "POST" && path === "/api/disarm") {
      const body = await readJson(req);
      const result = bracket.disarm(String(body.symbol ?? "").toUpperCase(), String(body.reason ?? "gui"));
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === "POST" && path === "/api/levels") {
      const body = await readJson(req);
      const result = bracket.editLevels(String(body.symbol ?? "").toUpperCase(), {
        entry: body.entry === undefined || body.entry === null ? undefined : Number(body.entry),
        stop: body.stop === undefined || body.stop === null ? undefined : Number(body.stop),
        target: body.target === undefined || body.target === null ? undefined : Number(body.target),
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (e) {
    sendJson(res, 500, { error: String(e) });
  }
});

function emitSnapshot(res: http.ServerResponse, msg: unknown): void {
  res.write(`data: ${JSON.stringify(msg)}\n\n`);
}

ibmod.connect();
server.listen(ibmod.state.webPort, () => {
  console.log(`web ui on http://localhost:${ibmod.state.webPort}`);
});
