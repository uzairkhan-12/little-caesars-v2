import {
  getRequestHost,
  getRequestProtocol,
  useSession,
} from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type GateSession = { unlocked?: boolean; user?: string };

export function getSessionConfig() {
  const password =
    process.env.SESSION_SECRET ??
    "build-time-placeholder-not-used-at-runtime-xxxxxxxxxxxxxxxxxxxx";
  const host = getRequestHost({ xForwardedHost: true });
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const isHttps = !isLocalhost || getRequestProtocol({ xForwardedProto: true }) === "https";
  return {
    password,
    name: "lc-gate",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? ("none" as const) : ("lax" as const),
      path: "/",
    },
  };
}

export function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export async function getGateSession() {
  return useSession<GateSession>(getSessionConfig());
}

export async function assertUnlocked() {
  const session = await getGateSession();
  if (!session.data.unlocked) {
    throw new Response("Unauthorized", { status: 401 });
  }
}
