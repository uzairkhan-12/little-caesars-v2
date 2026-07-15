import { createFileRoute } from "@tanstack/react-router";
import { assertUnlocked } from "@/lib/gate.server";

export const Route = createFileRoute("/api/camera/$entity")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try { await assertUnlocked(); } catch (r) { return r as Response; }
        const url = process.env.HOME_ASSISTANT_URL;
        const token = process.env.HOME_ASSISTANT_TOKEN;
        if (!url || !token) return new Response("Not configured", { status: 500 });
        const stream = new URL(request.url).searchParams.get("stream") === "1";
        const endpoint = stream
          ? `${url}/api/camera_proxy_stream/${encodeURIComponent(params.entity)}`
          : `${url}/api/camera_proxy/${encodeURIComponent(params.entity)}`;
        let res: Response;
        try {
          res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (err) {
          console.error("[camera] fetch error", endpoint, err instanceof Error ? err.message : err);
          return new Response("Camera unavailable", { status: 502 });
        }
        if (!res.ok || !res.body) return new Response("Camera unavailable", { status: res.status || 502 });
        return new Response(res.body, {
          status: 200,
          headers: {
            "Content-Type": res.headers.get("content-type") ?? (stream ? "multipart/x-mixed-replace" : "image/jpeg"),
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
