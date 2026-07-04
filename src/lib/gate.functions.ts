import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type GateSession = { unlocked?: boolean; user?: string };

function getSessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password) throw new Error("SESSION_SECRET is not set");
  return {
    password,
    name: "lc-gate",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
export async function assertUnlocked() {
  const session = await useSession<GateSession>(getSessionConfig());
  if (!session.data.unlocked) {
    throw new Response("Unauthorized", { status: 401 });
  }
}


export const getGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(getSessionConfig());
  return {
    unlocked: Boolean(session.data.unlocked),
    user: session.data.user ?? null,
  };
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const expectedUser = process.env.SITE_USERNAME;
    const expectedPass = process.env.SITE_PASSWORD;
    if (!expectedUser || !expectedPass) {
      throw new Error("Site credentials are not configured");
    }
    const ok = safeEqual(data.username, expectedUser) && safeEqual(data.password, expectedPass);
    if (!ok) return { ok: false as const };
    const session = await useSession<GateSession>(getSessionConfig());
    await session.update({ unlocked: true, user: expectedUser });
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(getSessionConfig());
  await session.clear();
  return { ok: true as const };
});
