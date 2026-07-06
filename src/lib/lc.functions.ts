import { createServerFn } from "@tanstack/react-start";
// assertUnlocked is dynamically imported inside handlers to keep server-only code out of client bundle

function lcUrl(path: string) {
  const base = process.env.LCLOGIC_URL ?? "https://lclogic2.primewave2.tech";
  return `${base}${path}`;
}

async function safeJson<T>(path: string, fallback: T): Promise<T> {
  const url = lcUrl(path);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error("[lc] fetch failed", url, res.status);
      return fallback;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error("[lc] fetch error", url, err);
    return fallback;
  }
}

export type Counts = { zones: string[]; counts: Record<string, number>; total: number };
export type Today = { date: string; entries: number; exits: number; visits: number };
export type Zones = { zones: string[] };
export type HourBucket = { hour: number; entries: number; exits: number; visits: number };
export type Hourly = { date: string; hours: HourBucket[] };
export type DayBucket = { date: string; entries: number; exits: number; visits: number };
export type Daily = { since: string; days: DayBucket[] };
export type EventRow = {
  ts: string;
  event_id: string;
  camera: string;
  zones: string[];
  kind: "entry" | "exit" | "visit";
};

export const getCounts = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  return safeJson<Counts>("/api/counts", { zones: [], counts: {}, total: 0 });
});

export const getToday = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  return safeJson<Today>("/api/today", { date: new Date().toISOString().slice(0, 10), entries: 0, exits: 0, visits: 0 });
});

export const getZones = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  return safeJson<Zones>("/api/zones", { zones: [] });
});

export const getHourly = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const empty: Hourly = {
    date: new Date().toISOString().slice(0, 10),
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, entries: 0, exits: 0, visits: 0 })),
  };
  return safeJson<Hourly>("/api/hourly", empty);
});

export const getDaily = createServerFn({ method: "GET" })
  .inputValidator((d: { days?: number }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertUnlocked();
    const days = data.days ?? 14;
    return safeJson<Daily>(`/api/daily?days=${days}`, { since: "", days: [] });
  });

export const getEvents = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number; kind?: string }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertUnlocked();
    const params = new URLSearchParams();
    params.set("limit", String(data.limit ?? 50));
    if (data.kind) params.set("kind", data.kind);
    return safeJson<EventRow[]>(`/api/events?${params}`, []);
  });

export const getSummary = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const emptyHourly: Hourly = {
    date: new Date().toISOString().slice(0, 10),
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, entries: 0, exits: 0, visits: 0 })),
  };
  const [counts, today, hourly, events] = await Promise.all([
    safeJson<Counts>("/api/counts", { zones: [], counts: {}, total: 0 }),
    safeJson<Today>("/api/today", {
      date: new Date().toISOString().slice(0, 10),
      entries: 0,
      exits: 0,
      visits: 0,
    }),
    safeJson<Hourly>("/api/hourly", emptyHourly),
    safeJson<EventRow[]>("/api/events?limit=50", []),
  ]);

  return { counts, today, events, hourly: hourly.hours };
});
