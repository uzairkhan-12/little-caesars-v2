import { createServerFn } from "@tanstack/react-start";
// assertUnlocked is dynamically imported inside handlers to keep server-only code out of client bundle

function lcUrl(path: string) {
  const raw = process.env.LCLOGIC_URL ?? "https://lclogic2.primewave2.tech";
  const base = raw.replace(/\/+$/, "");
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

// The lclogic API buckets hours in GMT/UTC, but the restaurant is in Riyadh
// (GMT+3) — shift every hour-of-day bucket so displayed hours match local
// time, e.g. API hour 0 (00:00-01:00 UTC) is actually 3 AM in Riyadh.
const RIYADH_UTC_OFFSET_HOURS = 3;
function toLocalHour(utcHour: number): number {
  return (utcHour + RIYADH_UTC_OFFSET_HOURS) % 24;
}

// Transform functions to convert 'events' field to 'visits'
function transformToday(data: TodayResponse): Today {
  return {
    date: data.date,
    entries: data.entries,
    exits: data.exits,
    visits: data.events,
  };
}

function transformHourly(data: HourlyResponse): Hourly {
  const hours = data.hours
    .map((h) => ({
      hour: toLocalHour(h.hour),
      entries: h.entries,
      exits: h.exits,
      visits: h.events,
    }))
    // Re-sort ascending by local hour so charts start at 12 AM instead of
    // following the original UTC bucket order (which now wraps mid-array).
    .sort((a, b) => a.hour - b.hour);
  return { date: data.date, hours };
}

function transformDaily(data: DailyResponse): Daily {
  return {
    since: data.since,
    days: data.days.map((d) => ({
      date: d.date,
      entries: d.entries,
      exits: d.exits,
      visits: d.events,
    })),
  };
}

export type Counts = { zones: string[]; counts: Record<string, number>; total: number };
export type Today = { date: string; entries: number; exits: number; visits: number };
export type Zones = { zones: string[] };
export type HourBucket = { hour: number; entries: number; exits: number; visits: number };
export type Hourly = { date: string; hours: HourBucket[] };
export type DayBucket = { date: string; entries: number; exits: number; visits: number };
export type Daily = { since: string; days: DayBucket[] };

// API response types (what the backend actually returns)
type TodayResponse = { date: string; entries: number; exits: number; events: number };
type HourBucketResponse = { hour: number; entries: number; exits: number; events: number };
type HourlyResponse = { date: string; hours: HourBucketResponse[] };
type DayBucketResponse = { date: string; entries: number; exits: number; events: number };
type DailyResponse = { since: string; days: DayBucketResponse[] };
// DOW API returns averaged buckets
type HourBucketDowResponse = {
  hour: number;
  entries_avg: number;
  exits_avg: number;
  events_avg: number;
  entries_total: number;
  exits_total: number;
  events_total: number;
};
type HourlyDowResponse = {
  dow: number;
  dow_name: string;
  days_range: number;
  occurrences: number;
  since: string;
  hours: HourBucketDowResponse[];
};
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
  const defaultToday = { date: new Date().toISOString().slice(0, 10), entries: 0, exits: 0, events: 0 } as TodayResponse;
  const data = await safeJson<TodayResponse>("/api/today", defaultToday);
  return transformToday(data);
});

export const getZones = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  return safeJson<Zones>("/api/zones", { zones: [] });
});

export const getHourlyByDay = createServerFn({ method: "GET" })
  .validator((d: { day: string }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertUnlocked();
    const emptyResponse: HourlyResponse = {
      date: data.day,
      hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, entries: 0, exits: 0, events: 0 })),
    };
    const result = await safeJson<HourlyResponse>(`/api/hourly?day=${data.day}`, emptyResponse);
    return transformHourly(result);
  });

export const getHourlyByDow = createServerFn({ method: "GET" })
  .validator((d: { dow: number; days?: number }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertUnlocked();
    const days = data.days ?? 30;
    const emptyDow: HourlyDowResponse = {
      dow: data.dow, dow_name: "", days_range: days, occurrences: 0, since: "",
      hours: Array.from({ length: 24 }, (_, h) => ({
        hour: h, entries_avg: 0, exits_avg: 0, events_avg: 0,
        entries_total: 0, exits_total: 0, events_total: 0,
      })),
    };
    const result = await safeJson<HourlyDowResponse>(
      `/api/hourly-by-dow?dow=${data.dow}&days=${days}`,
      emptyDow,
    );
    // Map averaged buckets → HourBucket using events_avg as visits, then
    // re-sort ascending by local hour so charts start at 12 AM.
    const buckets: HourBucket[] = result.hours
      .map((h) => ({
        hour: toLocalHour(h.hour),
        entries: Math.round(h.entries_avg),
        exits: Math.round(h.exits_avg),
        visits: Math.round(h.events_avg),
      }))
      .sort((a, b) => a.hour - b.hour);
    return { buckets, meta: { dow_name: result.dow_name, occurrences: result.occurrences, days_range: result.days_range } };
  });

export const getHourly = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const emptyResponse: HourlyResponse = {
    date: new Date().toISOString().slice(0, 10),
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, entries: 0, exits: 0, events: 0 })),
  };
  const data = await safeJson<HourlyResponse>("/api/hourly", emptyResponse);
  return transformHourly(data);
});

export const getDaily = createServerFn({ method: "GET" })
  .validator((d: { days?: number }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertUnlocked();
    const days = data.days ?? 14;
    const responseData = await safeJson<DailyResponse>(`/api/daily?days=${days}`, { since: "", days: [] });
    return transformDaily(responseData);
  });

export const getEvents = createServerFn({ method: "GET" })
  .validator((d: { limit?: number; kind?: string }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertUnlocked();
    const params = new URLSearchParams();
    params.set("limit", String(data.limit ?? 50));
    if (data.kind) params.set("kind", data.kind);
    return safeJson<EventRow[]>(`/api/events?${params}`, []);
  });

export const getSummary = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const emptyHourlyResponse: HourlyResponse = {
    date: new Date().toISOString().slice(0, 10),
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, entries: 0, exits: 0, events: 0 })),
  };
  const defaultToday = { date: new Date().toISOString().slice(0, 10), entries: 0, exits: 0, events: 0 } as TodayResponse;
  
  const [counts, todayResponse, hourlyResponse, events] = await Promise.all([
    safeJson<Counts>("/api/counts", { zones: [], counts: {}, total: 0 }),
    safeJson<TodayResponse>("/api/today", defaultToday),
    safeJson<HourlyResponse>("/api/hourly", emptyHourlyResponse),
    safeJson<EventRow[]>("/api/events?limit=50", []),
  ]);

  const today = transformToday(todayResponse);
  const hourly = transformHourly(hourlyResponse);

  return { counts, today, events, hourly: hourly.hours };
});
