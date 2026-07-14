import { createFileRoute } from "@tanstack/react-router";
import { assertUnlocked } from "@/lib/gate.server";

// Proxies live HD camera feeds from a local go2rtc instance (RTSP -> MJPEG bridge)
// running on the same network as the cameras. Keeps go2rtc off the public internet
// and behind this app's login gate, same pattern as /api/camera/$entity for Home Assistant.
export const Route = createFileRoute("/api/rtsp/$entity")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          await assertUnlocked();
        } catch (r) {
          return r as Response;
        }
        const url = process.env.GO2RTC_URL;
        if (!url) return new Response("Not configured", { status: 500 });
        const stream = new URL(request.url).searchParams.get("stream") === "1";
        const src = encodeURIComponent(params.entity);
        const endpoint = stream
          ? `${url}/api/stream.mjpeg?src=${src}`
          : `${url}/api/frame.jpeg?src=${src}`;
        let res: Response;
        try {
          res = await fetch(endpoint);
        } catch (err) {
          console.error("[rtsp] fetch error", endpoint, err);
          return new Response("Camera unavailable", { status: 502 });
        }
        if (!res.ok || !res.body)
          return new Response("Camera unavailable", { status: res.status || 502 });
        return new Response(res.body, {
          status: 200,
          headers: {
            "Content-Type":
              res.headers.get("content-type") ??
              (stream ? "multipart/x-mixed-replace" : "image/jpeg"),
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
