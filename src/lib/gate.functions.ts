import { createServerFn } from "@tanstack/react-start";

export const getGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  return {
    unlocked: Boolean(session.data.unlocked),
    user: session.data.user ?? null,
    role: session.data.role ?? null,
  };
});

export const login = createServerFn({ method: "POST" })
  .validator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const { getGateSession, safeEqual } = await import("./gate.server");
    
    // Define users with roles
    const adminUser = process.env.SITE_USERNAME ?? "admin";
    const adminPass = process.env.SITE_PASSWORD ?? "admin";
    const employeeUser = process.env.EMPLOYEE_USERNAME ?? "employee";
    const employeePass = process.env.EMPLOYEE_PASSWORD ?? "employee";
    
    let role: "admin" | "employee" | null = null;
    
    if (safeEqual(data.username, adminUser) && safeEqual(data.password, adminPass)) {
      role = "admin";
    } else if (safeEqual(data.username, employeeUser) && safeEqual(data.password, employeePass)) {
      role = "employee";
    } else {
      return { ok: false as const };
    }
    
    const session = await getGateSession();
    await session.update({ unlocked: true, user: data.username, role });
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});
