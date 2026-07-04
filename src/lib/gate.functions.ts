import { createServerFn } from "@tanstack/react-start";

export const getGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  return {
    unlocked: Boolean(session.data.unlocked),
    user: session.data.user ?? null,
  };
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const { getGateSession, safeEqual } = await import("./gate.server");
    const expectedUser = process.env.SITE_USERNAME;
    const expectedPass = process.env.SITE_PASSWORD;
    if (!expectedUser || !expectedPass) {
      throw new Error("Site credentials are not configured");
    }
    const ok =
      safeEqual(data.username, expectedUser) && safeEqual(data.password, expectedPass);
    if (!ok) return { ok: false as const };
    const session = await getGateSession();
    await session.update({ unlocked: true, user: expectedUser });
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});
