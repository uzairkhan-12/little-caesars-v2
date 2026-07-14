# Live camera bridge (go2rtc)

Home Assistant's `camera_proxy_stream` re-encodes/downscales feeds, so the
dashboard's "Live cameras" section instead talks directly to your RTSP cameras
through [go2rtc](https://github.com/AlexxIT/go2rtc), a small bridge that
converts RTSP into something a browser `<img>` tag can render (MJPEG) — or
WebRTC later, if needed.

```
Reolink cameras (RTSP, LAN)
        │
        ▼
   go2rtc (this folder, on Proxmox/LAN)  — never exposed to the internet
        │  http://127.0.0.1:1984
        ▼
little-caesars-v2 app  — /api/rtsp/$entity (behind login gate)
        │
        ▼
   Browser <img src="/api/rtsp/cam1?stream=1">
```

## Setup (standalone binary + systemd — no Docker needed)

Most Proxmox LXC containers don't have Docker available, so go2rtc runs as a
plain binary managed by systemd.

1. Download the binary and make it executable:

   ```bash
   mkdir -p /opt/go2rtc
   curl -L -o /opt/go2rtc/go2rtc https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64
   chmod +x /opt/go2rtc/go2rtc
   ```

2. Copy the example config to `/opt/go2rtc/go2rtc.yaml` and fill in your real
   camera credentials (this file holds secrets — never commit it):

   ```bash
   cp go2rtc.yaml.example /opt/go2rtc/go2rtc.yaml
   # edit /opt/go2rtc/go2rtc.yaml with your actual rtsp:// URLs
   ```

   **Read the comments in `go2rtc.yaml.example` about the `ffmpeg:` line** —
   it's required to actually produce an MJPEG stream (see "Why is
   `stream.mjpeg` empty?" below), not optional boilerplate.

3. Install `ffmpeg` if it isn't already present (needed for the MJPEG
   transcode step):

   ```bash
   which ffmpeg || apt install -y ffmpeg
   ```

4. Create the systemd service:

   ```bash
   cat > /etc/systemd/system/go2rtc.service << 'EOF'
   [Unit]
   Description=go2rtc RTSP to web bridge (HD camera streaming)
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/opt/go2rtc
   ExecStart=/opt/go2rtc/go2rtc -config /opt/go2rtc/go2rtc.yaml
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   EOF
   systemctl daemon-reload
   systemctl enable --now go2rtc
   ```

5. Sanity-check it directly before wiring up the app:

   ```bash
   # single snapshot (should return a real JPEG)
   curl -o /tmp/test.jpg "http://127.0.0.1:1984/api/frame.jpeg?src=cam1"

   # continuous MJPEG (should keep growing for as long as it runs, not stay at 0 bytes)
   curl -o /tmp/test.mjpeg --max-time 5 "http://127.0.0.1:1984/api/stream.mjpeg?src=cam1"
   ls -la /tmp/test.mjpeg
   ```

   If `test.mjpeg` is 0 bytes, check `journalctl -u go2rtc -n 50` for a
   `codecs not matched` error — see the note below.

6. In the little-caesars-v2 app's `.env` (on whichever host runs the app —
   same Proxmox box, per your setup), point it at go2rtc and list the
   cameras to show:

   ```bash
   GO2RTC_URL=http://127.0.0.1:1984   # or the LAN IP if go2rtc runs elsewhere
   RTSP_CAMERAS=cam1:Cashier Counter,cam2:Dining Area
   ```

7. Restart the app. The dashboard's "Live cameras" section will now proxy live
   MJPEG through `/api/rtsp/$entity`, same security model (login-gated) as
   the existing Home Assistant camera tiles.

## Why is `stream.mjpeg` empty / "codecs not matched" in the logs?

go2rtc's MJPEG endpoint needs an actual MJPEG track to serve. A plain
`rtsp://...` source only gives it whatever the camera encodes (usually H.264
or H.265) — go2rtc can't just relabel that as MJPEG. Reolink's RTSP path is
often named `h264Preview_01_main` for backwards compatibility even when the
camera is actually set to encode **H.265/HEVC** (check the camera's own
Settings > Display > Encode format if unsure) — but either way, H.264 or
H.265, an `ffmpeg:` transcode source is required to produce MJPEG:

```yaml
streams:
  cam1:
    - rtsp://admin:pass@192.168.5.21:554/h264Preview_01_main
    - ffmpeg:cam1#video=mjpeg#width=1920
```

The `ffmpeg:cam1` line re-uses the RTSP source already defined above it and
transcodes on demand (lazy — only runs while someone has a tile open, not
constantly). `width=1920` caps the transcode to 1080p to keep CPU usage sane
on a container without hardware acceleration; drop it for native 4K if you
have the CPU headroom. See go2rtc's [hardware acceleration
docs](https://github.com/AlexxIT/go2rtc/blob/master/internal/ffmpeg/hardware/README.md)
if you want to explore GPU-accelerated transcoding instead.

## Notes

- **Never expose port 1984 (or the RTSP ports) to the public internet.**
  go2rtc has no auth by default — only the app should be able to reach it,
  which is why it proxies through `/api/rtsp/$entity` instead of the browser
  hitting go2rtc directly.
- Stream names in `go2rtc.yaml` (`cam1`, `cam2`, ...) must match the ids used
  in `RTSP_CAMERAS`.
- Reolink's `h264Preview_01_main` path is the full-resolution main stream;
  there's usually also a `h264Preview_01_sub` lower-res substream if you ever
  need to reduce transcode CPU cost further for a given tile.
