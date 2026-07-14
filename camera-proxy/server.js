#!/usr/bin/env node
/**
 * Standalone MJPEG camera proxy server.
 * Run on the Proxmox server alongside the main app:
 *   node camera-proxy/server.js
 * or as a systemd service on port 3001.
 *
 * Requires ffmpeg installed: apt install ffmpeg
 */

const http = require("http");
const { spawn } = require("child_process");

const PORT = process.env.CAMERA_PROXY_PORT || 3001;

const CAMERAS = {
  cam1: "rtsp://admin:adm1n234@192.168.5.21:554/h264Preview_01_main",
  cam2: "rtsp://admin:adm1n234@192.168.5.20:554/h264Preview_01_main",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, cameras: Object.keys(CAMERAS) }));
    return;
  }

  // CORS — allow requests from the main app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  // /stream/cam1  or  /stream/cam2
  const match = url.pathname.match(/^\/stream\/([a-z0-9_-]+)$/);
  if (!match) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const camId = match[1];
  const rtspUrl = CAMERAS[camId];
  if (!rtspUrl) {
    res.writeHead(404);
    res.end("Camera not found");
    return;
  }

  const boundary = "mjpegboundary";
  res.writeHead(200, {
    "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    "Transfer-Encoding": "chunked",
  });

  console.log(`[camera-proxy] Starting stream for ${camId} (${rtspUrl})`);

  const ff = spawn("ffmpeg", [
    "-rtsp_transport", "tcp",
    "-i", rtspUrl,
    "-f", "mjpeg",
    "-q:v", "3",        // quality: 2=best 31=worst
    "-r", "15",         // 15 fps
    "-vf", "scale=1280:-1",  // HD 720p width
    "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  ff.stderr.on("data", () => {}); // suppress ffmpeg logs

  ff.stdout.on("data", (chunk) => {
    try {
      res.write(
        `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${chunk.length}\r\n\r\n`
      );
      res.write(chunk);
      res.write("\r\n");
    } catch {
      ff.kill("SIGKILL");
    }
  });

  ff.on("close", () => {
    console.log(`[camera-proxy] Stream ended for ${camId}`);
    try { res.end(); } catch {}
  });

  ff.on("error", (err) => {
    console.error(`[camera-proxy] ffmpeg error for ${camId}:`, err.message);
    try { res.end(); } catch {}
  });

  // Kill ffmpeg if client disconnects
  req.on("close", () => {
    console.log(`[camera-proxy] Client disconnected for ${camId}`);
    ff.kill("SIGKILL");
  });
});

server.listen(PORT, () => {
  console.log(`[camera-proxy] Running on http://0.0.0.0:${PORT}`);
  console.log(`[camera-proxy] Cameras: ${Object.keys(CAMERAS).join(", ")}`);
});
