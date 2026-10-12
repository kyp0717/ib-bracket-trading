// Append-only audit log. Every order action lands here and on SSE.

import { appendFile } from "fs";
import { emit } from "./emit";

export const recent: string[] = [];

export function audit(event: string, detail: string): void {
  const line = `${new Date().toISOString()} | ${event} | ${detail}`;
  recent.push(line);
  if (recent.length > 300) recent.shift();
  appendFile("audit.log", line + "\n", () => {});
  emit({ t: "audit", line });
}
