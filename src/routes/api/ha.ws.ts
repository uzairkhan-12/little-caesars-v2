import { createFileRoute } from "@tanstack/react-router";
import { assertUnlocked } from "@/lib/gate.functions";

// Cloudflare Workers globals
declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

export const Route = createFileRoute("/api/ha/ws")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await assertUnlocked(); } catch (r) { return r as Response; }
        if (request.headers.get("Upgrade") !== "websocket") {
          return new Response("Expected WebSocket upgrade", { status: 426 });
        }

        const haUrl = process.env.HOME_ASSISTANT_URL;
        const token = process.env.HOME_ASSISTANT_TOKEN;
        if (!haUrl || !token) {
          return new Response("HA not configured", { status: 500 });
        }

        const wsUrl = haUrl.replace(/^http/, "ws") + "/api/websocket";
        const upstreamRes = await fetch(wsUrl, {
          headers: { Upgrade: "websocket" },
        });
        const upstream = (upstreamRes as unknown as { webSocket?: WebSocket }).webSocket;
        if (!upstream) {
          return new Response("Upstream WebSocket unavailable", { status: 502 });
        }
        (upstream as unknown as { accept: () => void }).accept();

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        (server as unknown as { accept: () => void }).accept();

        // Upstream -> client, transparently handling the HA auth handshake.
        upstream.addEventListener("message", (ev: MessageEvent) => {
          const raw = typeof ev.data === "string" ? ev.data : "";
          try {
            const msg = JSON.parse(raw);
            if (msg.type === "auth_required") {
              upstream.send(JSON.stringify({ type: "auth", access_token: token }));
              return;
            }
            if (msg.type === "auth_ok") {
              server.send(JSON.stringify({ type: "ready" }));
              return;
            }
            if (msg.type === "auth_invalid") {
              try { server.close(4001, "auth_invalid"); } catch { /* noop */ }
              return;
            }
          } catch { /* fall through */ }
          server.send(raw);
        });

        // Client -> upstream (raw pass-through)
        server.addEventListener("message", (ev: MessageEvent) => {
          upstream.send(typeof ev.data === "string" ? ev.data : "");
        });

        const closeBoth = () => {
          try { upstream.close(); } catch { /* noop */ }
          try { server.close(); } catch { /* noop */ }
        };
        upstream.addEventListener("close", closeBoth);
        upstream.addEventListener("error", closeBoth);
        server.addEventListener("close", closeBoth);
        server.addEventListener("error", closeBoth);

        return new Response(null, {
          status: 101,
          webSocket: client,
        } as ResponseInit & { webSocket: WebSocket });
      },
    },
  },
});
