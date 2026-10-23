export class EventSource {
  onmessage: ((e: { data: string }) => void) | null = null;
  private closed = false;

  constructor(url: string) {
    fetch(url).then(async (res) => {
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (!this.closed) {
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

  close(): void {
    this.closed = true;
  }
}
