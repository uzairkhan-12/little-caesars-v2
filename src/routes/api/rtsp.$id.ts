import { createFileRoute } from "@tanstack/react-router";
import { assertUnlocked } from "@/lib/gate.server";
import { spawn } from "child_process";

// Static camera definitions - RTSP sources
const CAMERAS: Record<string, { name: string; rtsp: string }> = {
  cam1: {
    name: "Camera 1",
    rtsp: "rtsp://admin:adm1n234@192.168.5.21:554/h264Preview_01_main",
  },
  cam2: {
    name: "Camera 2",
    rtsp: "rtsp://admin:adm1n234@192.168.5.20:554/h264Preview_01_main",
  },
};

export { CAMERAS };

export const Route = createFileRoute("/api/rtsp/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          await assertUnlocked();
        } catch (r) {
          return r as Response;
        }

        const cam = CAMERAS[params.id];
        if (!cam) return new Response("Camera not found", { status: 404 });

        const boundary = "mjpegboundary";

        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        // Use ffmpeg to convert RTSP → MJPEG frames
        const ff = spawn("ffmpeg", [
          "-rtsp_transport", "tcp",
          "-i", cam.rtsp,
          "-f", "mjpeg",
          "-q:v", "5",       // quality (2=best, 31=worst)
          "-r", "10",        // 10 fps
          "-vf", "scale=1280:-1",
          "pipe:1",
        ], { stdio: ["ignore", "pipe", "ignore"] });

        const encoder = new TextEncoder();

        ff.stdout.on("data", (chunk: Buffer) => {
          const header = encoder.encode(
            `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${chunk.length}\r\n\r\n`
          );
          const tail = encoder.encode("\r\n");
          writer.write(header).catch(() => ff.kill());
          writer.write(chunk).catch(() => ff.kill());
          writer.write(tail).catch(() => ff.kill());
        });

        ff.on("close", () => {
          writer.close().catch(() => {});
        });

        ff.on("error", () => {
          writer.close().catch(() => {});
        });

        return new Response(readable, {
          status: 200,
          headers: {
            "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
            "Cache-Control": "no-store",
            "Connection": "keep-alive",
          },
        });
      },
    },
  },
});
