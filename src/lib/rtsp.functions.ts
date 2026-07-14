import { createServerFn } from "@tanstack/react-start";
// assertUnlocked is dynamically imported inside handlers to keep server-only code out of client bundle

export type RtspCamera = { id: string; name: string };

// RTSP_CAMERAS format: "id:Label,id2:Label2" e.g. "cam1:Front Counter,cam2:Drive Thru"
// The actual rtsp:// URLs (with credentials) live only in the go2rtc config on the
// Proxmox host — this app never sees or exposes them.
function parseCameraList(raw: string | undefined): RtspCamera[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, ...rest] = entry.split(":");
      const name = rest.join(":").trim();
      return { id: id.trim(), name: name || id.trim() };
    })
    .filter((c) => c.id.length > 0);
}

export const getRtspCameras = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  return parseCameraList(process.env.RTSP_CAMERAS);
});
