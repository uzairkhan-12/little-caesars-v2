# HD camera bridge (go2rtc)

Home Assistant's `camera_proxy_stream` re-encodes/downscales feeds, so the
dashboard's "HD cameras" section instead talks directly to your RTSP cameras
through [go2rtc](https://github.com/AlexxIT/go2rtc), a small bridge that
converts RTSP into something a browser `<img>` tag can render (MJPEG) — or
WebRTC later, if needed.

```
Reolink cameras (RTSP, LAN)
        │
        ▼
   go2rtc (this folder, on Proxmox/LAN)  — never exposed to the internet
        │  http://<proxmox-host>:1984
        ▼
little-caesars-v2 app  — /api/rtsp/$entity (behind login gate)
        │
        ▼
   Browser <img src="/api/rtsp/cam1?stream=1">
```

## Setup

1. Copy the example config and fill in your real camera credentials (this
   file is gitignored — it never gets committed):

   ```bash
   cd deploy/go2rtc
   cp go2rtc.yaml.example go2rtc.yaml
   # edit go2rtc.yaml with your actual rtsp:// URLs
   ```

2. Start go2rtc (on the Proxmox host, or an LXC/VM on the same LAN as the
   cameras):

   ```bash
   docker compose up -d
   ```

3. Sanity-check it directly before wiring up the app:

   ```bash
   curl -o test.jpg "http://localhost:1984/api/frame.jpeg?src=cam1"
   ```

4. In the little-caesars-v2 app's `.env` (on whichever host runs the app —
   same Proxmox box, per your setup), point it at go2rtc and list the
   cameras to show:

   ```bash
   GO2RTC_URL=http://127.0.0.1:1984   # or the LAN IP if go2rtc runs elsewhere
   RTSP_CAMERAS=cam1:Front Counter,cam2:Drive Thru
   ```

5. Restart the app. The dashboard's "HD cameras" section will now proxy live
   MJPEG through `/api/rtsp/$entity`, same security model (login-gated) as
   the existing Home Assistant camera tiles.

## Notes

- **Never expose port 1984 (or the RTSP ports) to the public internet.**
  go2rtc has no auth by default — only the app should be able to reach it,
  which is why it proxies through `/api/rtsp/$entity` instead of the browser
  hitting go2rtc directly.
- Stream names in `go2rtc.yaml` (`cam1`, `cam2`, ...) must match the ids used
  in `RTSP_CAMERAS`.
- Reolink's `h264Preview_01_main` path is the full-resolution main stream;
  there's usually also a `h264Preview_01_sub` lower-res substream if you ever
  need to reduce bandwidth for a given tile.
