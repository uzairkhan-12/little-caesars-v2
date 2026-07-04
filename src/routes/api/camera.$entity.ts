import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/camera/$entity")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const url = process.env.HOME_ASSISTANT_URL;
        const token = process.env.HOME_ASSISTANT_TOKEN;
        if (!url || !token) return new Response("Not configured", { status: 500 });
        const res = await fetch(`${url}/api/camera_proxy/${encodeURIComponent(params.entity)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return new Response("Camera unavailable", { status: res.status });
        const buf = await res.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
