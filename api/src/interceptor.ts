import { decode } from "@msgpack/msgpack";

export interface InterceptorOptions {
  source?: string;
}

export function installInterceptor(options?: InterceptorOptions): void {
  const source = options?.source ?? "colonist-io-api";

  const OriginalWebSocket = window.WebSocket;

  const WsProxy = function (this: WebSocket, url: string | URL, protocols?: string | string[]) {
    const ws = protocols
      ? new OriginalWebSocket(url, protocols)
      : new OriginalWebSocket(url);

    const urlStr = typeof url === "string" ? url : url.toString();
    console.log(`[${source}] WebSocket intercepted:`, urlStr);

    ws.addEventListener("message", (event: MessageEvent) => {
      try {
        let decoded: unknown = null;

        if (event.data instanceof ArrayBuffer) {
          decoded = decode(new Uint8Array(event.data));
        } else if (event.data instanceof Blob) {
          // Convert Blob to ArrayBuffer then decode
          event.data.arrayBuffer().then((buffer) => {
            try {
              const msg = decode(new Uint8Array(buffer));
              window.postMessage(
                { source, payload: JSON.stringify(msg) },
                "*"
              );
            } catch {
              // Not msgpack
            }
          });
          return;
        } else if (typeof event.data === "string") {
          // Some messages may still be JSON strings
          decoded = event.data;
        }

        if (decoded !== null) {
          const payload = typeof decoded === "string" ? decoded : JSON.stringify(decoded);
          window.postMessage(
            { source, payload },
            "*"
          );
        }
      } catch {
        // Ignore decode errors
      }
    });

    return ws;
  } as unknown as typeof WebSocket;

  WsProxy.prototype = OriginalWebSocket.prototype;
  Object.defineProperty(WsProxy, "CONNECTING", { value: 0 });
  Object.defineProperty(WsProxy, "OPEN", { value: 1 });
  Object.defineProperty(WsProxy, "CLOSING", { value: 2 });
  Object.defineProperty(WsProxy, "CLOSED", { value: 3 });

  window.WebSocket = WsProxy;
}
