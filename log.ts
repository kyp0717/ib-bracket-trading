import { emit } from "./emit";
import { host, upload, uploadSync } from "./s3";

export const recent: string[] = [];

let pending: string[] = [];
let chunkSeq = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function day(): string {
  return new Date().toISOString().slice(0, 10);
}

function flush(): void {
  if (!pending.length) return;
  const body = pending.join("\n") + "\n";
  pending = [];
  chunkSeq++;
  upload(`audit/${host()}/${day()}/chunk-${Date.now()}-${chunkSeq}.log`, body);
}

export function audit(event: string, detail: string): void {
  const line = `${new Date().toISOString()} | ${event} | ${detail}`;
  recent.push(line);
  if (recent.length > 2000) recent.shift();
  pending.push(line);
  if (pending.length >= 200) flush();
  else if (!flushTimer) {
    flushTimer = setInterval(flush, 2000);
    flushTimer.unref();
  }
  emit("exec", { t: "audit", line });
}

export function flushAuditNow(): void {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  const body = pending;
  pending = [];
  if (!body.length) return;
  chunkSeq++;
  uploadSync(`audit/${host()}/${day()}/chunk-${Date.now()}-${chunkSeq}.log`, body.join("\n") + "\n");
}

process.on("SIGTERM", () => flushAuditNow());
process.on("SIGINT", () => flushAuditNow());
