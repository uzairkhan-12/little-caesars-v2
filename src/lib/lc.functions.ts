import { createServerFn } from "@tanstack/react-start";
import { assertUnlocked } from "./gate.functions";

function lcUrl(path: string) {
  const base = process.env.LCLOGIC_URL ?? "https://lclogic.primewave2.tech";
  return `${base}${path}`;
}

async function safeJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(lcUrl(path), { headers: { Accept: "application/json" } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export type Counts = { zones: string[]; counts: Record<string, number>; total: number };
export type Today = { date: string; entries: number; exits: number; visits: number };
export type EventRow = {
  ts: string;
  event_id: string;
  camera: string;
  zones: string[];
  kind: "entry" | "exit" | "visit";
};

export const getCounts = createServerFn({ method: "GET" }).handler(async () => {
  await assertUnlocked();
  return safeJson<Counts>("/api/counts", { zones: [], counts: {}, total: 0 });
});

export const getToday = createServerFn({ method: "GET" }).handler(async () => {
  await assertUnlocked();
  return safeJson<Today>("/api/today", { date: new Date().toISOString().slice(0, 10), entries: 0, exits: 0, visits: 0 });
});

export const getEvents = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number; kind?: string }) => d)
  .handler(async ({ data }) => {
    await assertUnlocked();
    const params = new URLSearchParams();
    params.set("limit", String(data.limit ?? 50));
    if (data.kind) params.set("kind", data.kind);
    return safeJson<EventRow[]>(`/api/events?${params}`, []);
  });

export const getSummary = createServerFn({ method: "GET" }).handler(async () => {
  await assertUnlocked();
  const [counts, today, events] = await Promise.all([
    safeJson<Counts>("/api/counts", { zones: [], counts: {}, total: 0 }),
    safeJson<Today>("/api/today", {
      date: new Date().toISOString().slice(0, 10),
      entries: 0,
      exits: 0,
      visits: 0,
    }),
    safeJson<EventRow[]>("/api/events?limit=200", []),
  ]);

  // Hourly buckets for today
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    entries: 0,
    exits: 0,
    visits: 0,
  }));
  for (const e of events) {
    if (!e.ts.startsWith(todayStr)) continue;
    const h = new Date(e.ts).getUTCHours();
    if (e.kind === "entry") hours[h].entries++;
    else if (e.kind === "exit") hours[h].exits++;
    else hours[h].visits++;
  }

  return { counts, today, events: events.slice(0, 20), hourly: hours };
});
