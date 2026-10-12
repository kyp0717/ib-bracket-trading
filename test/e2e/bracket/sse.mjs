// Minimal SSE client for Node, which has no global EventSource here.
// Supports exactly what the suites need: one onmessage callback and close().

export class EventSource {
  constructor(url) {
    this.onmessage = null;
    this._closed = false;
    fetch(url).then(async (res) => {
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (!this._closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data:') && this.onmessage) {
              this.onmessage({ data: line.slice(5).trimStart() });
            }
          }
        }
      }
    }).catch(() => {});
  }

  close() {
    this._closed = true;
  }
}
