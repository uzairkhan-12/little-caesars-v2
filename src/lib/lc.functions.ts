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

function riyadhTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftMonthKey(ym: string, delta: number) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonthKey(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampDayKey(ym: string, day: number) {
  return `${ym}-${String(Math.min(Math.max(day, 1), daysInMonthKey(ym))).padStart(2, "0")}`;
}

function pctChange(current: number, previous: number | null) {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function sumVisits(days: DayBucket[], from: string, to: string) {
  return days.filter((d) => d.date >= from && d.date <= to).reduce((s, d) => s + d.entries, 0);
}

const DAYPARTS: Array<{ name: string; hours: number[] }> = [
  { name: "Breakfast", hours: [6, 7, 8, 9] },
  { name: "Lunch", hours: [10, 11, 12, 13] },
  { name: "Afternoon", hours: [14, 15, 16] },
  { name: "Dinner", hours: [17, 18, 19, 20] },
  { name: "Late night", hours: [21, 22, 23, 0, 1, 2, 3, 4, 5] },
];

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type VisitorOverview = {
  todayVisits: number;
  todayPeakHour: number | null;
  tables: number;
  occupiedTables: number;
  occupancy: number;
  tableUsePct: number | null;
  tableZones: Array<{ name: string; count: number }>;
  mtd: number;
  prevMtd: number | null;
  yearMtd: number | null;
  mtdChangePct: number | null;
  yearChangePct: number | null;
  quarter: number;
  yearToDate: number;
  throughDay: number;
  cumulative: Array<{ day: number; current: number; previous: number; year: number }>;
  dayparts: Array<{ name: string; current: number }>;
  heatmap: Array<{ dow: number; name: string; hours: number[] }>;
  busiest: string | null;
  quietest: string | null;
};

export const getVisitorOverview = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const todayKey = riyadhTodayKey();
  const thisMonth = todayKey.slice(0, 7);
  const throughDay = Number(todayKey.slice(8, 10));
  const prevMonth = shiftMonthKey(thisMonth, -1);
  const lastYear = `${Number(thisMonth.slice(0, 4)) - 1}-${thisMonth.slice(5, 7)}`;
  const mtdTo = todayKey;
  const prevTo = clampDayKey(prevMonth, throughDay);
  const yearTo = clampDayKey(lastYear, throughDay);

  const emptyHourly: HourlyResponse = {
    date: todayKey,
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, entries: 0, exits: 0, events: 0 })),
  };
  const emptyDow = (dow: number): HourlyDowResponse => ({
    dow,
    dow_name: DOW_NAMES[dow] ?? "",
    days_range: 28,
    occurrences: 0,
    since: "",
    hours: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      entries_avg: 0,
      exits_avg: 0,
      events_avg: 0,
      entries_total: 0,
      exits_total: 0,
      events_total: 0,
    })),
  });

  const [dailyRaw, todayRaw, hourlyRaw, counts, ...dowRaws] = await Promise.all([
    safeJson<DailyResponse>("/api/daily?days=365", { since: "", days: [] }),
    safeJson<TodayResponse>(`/api/today`, {
      date: todayKey,
      entries: 0,
      exits: 0,
      events: 0,
    }),
    safeJson<HourlyResponse>("/api/hourly", emptyHourly),
    safeJson<Counts>("/api/counts", { zones: [], counts: {}, total: 0 }),
    ...[0, 1, 2, 3, 4, 5, 6].map((dow) =>
      safeJson<HourlyDowResponse>(`/api/hourly-by-dow?dow=${dow}&days=28`, emptyDow(dow)),
    ),
  ]);

  const daily = transformDaily(dailyRaw).days;
  const today = transformToday(todayRaw);
  const hourly = transformHourly(hourlyRaw).hours;
  const todayRow = daily.find((d) => d.date === todayKey);
  if (todayRow) todayRow.entries = today.entries;
  else daily.push({ date: todayKey, entries: today.entries, exits: today.exits, visits: today.visits });
  const mtd = sumVisits(daily, `${thisMonth}-01`, mtdTo);
  const prevHas = daily.some((d) => d.date >= `${prevMonth}-01` && d.date <= prevTo);
  const yearHas = daily.some((d) => d.date >= `${lastYear}-01` && d.date <= yearTo);
  const prevMtd = prevHas ? sumVisits(daily, `${prevMonth}-01`, prevTo) : null;
  const yearMtd = yearHas ? sumVisits(daily, `${lastYear}-01`, yearTo) : null;
  const qStartMonth = Math.floor((Number(thisMonth.slice(5, 7)) - 1) / 3) * 3 + 1;
  const quarterFrom = `${thisMonth.slice(0, 4)}-${String(qStartMonth).padStart(2, "0")}-01`;
  const quarter = sumVisits(daily, quarterFrom, todayKey);
  const yearToDate = sumVisits(daily, `${thisMonth.slice(0, 4)}-01-01`, todayKey);

  const cumulative = Array.from({ length: throughDay }, (_, i) => {
    const d = i + 1;
    return {
      day: d,
      current: sumVisits(daily, `${thisMonth}-01`, clampDayKey(thisMonth, d)),
      previous: sumVisits(daily, `${prevMonth}-01`, clampDayKey(prevMonth, d)),
      year: sumVisits(daily, `${lastYear}-01`, clampDayKey(lastYear, d)),
    };
  });

  const avgHour = Array.from({ length: 24 }, () => 0);
  for (const raw of dowRaws) {
    for (const h of raw.hours) {
      avgHour[toLocalHour(h.hour)] += h.entries_avg / 7;
    }
  }
  const dayparts = DAYPARTS.map((p) => ({
    name: p.name,
    current: p.hours.reduce((s, h) => s + avgHour[h] * throughDay, 0),
  }));

  const heatmap = dowRaws.map((raw, dow) => {
    const hours = Array.from({ length: 24 }, () => 0);
    for (const h of raw.hours) hours[toLocalHour(h.hour)] = h.entries_avg;
    return { dow, name: raw.dow_name || DOW_NAMES[dow], hours };
  });

  let busiest: { label: string; n: number } | null = null;
  let quietest: { label: string; n: number } | null = null;
  for (const row of heatmap) {
    for (let h = 10; h <= 23; h++) {
      const n = row.hours[h] ?? 0;
      const label = `${row.name} ${((h + 11) % 12) + 1}${h >= 12 ? " PM" : " AM"}`;
      if (!busiest || n > busiest.n) busiest = { label, n };
      if (n > 0 && (!quietest || n < quietest.n)) quietest = { label, n };
    }
  }

  const tableZones = counts.zones
    .filter((z) => !z.includes("entrance"))
    .map((z) => ({ name: z, count: counts.counts[z] ?? 0 }));
  const occupiedTables = tableZones.filter((z) => z.count > 0).length;
  const peakHour = hourly.reduce<{ hour: number; visits: number } | null>((best, h) => {
    if (!best || h.entries > best.visits) return { hour: h.hour, visits: h.entries };
    return best;
  }, null);

  const out: VisitorOverview = {
    todayVisits: today.entries,
    todayPeakHour: peakHour && peakHour.visits > 0 ? peakHour.hour : null,
    tables: tableZones.length,
    occupiedTables,
    occupancy: counts.total,
    tableUsePct: tableZones.length ? (occupiedTables / tableZones.length) * 100 : null,
    tableZones,
    mtd,
    prevMtd,
    yearMtd,
    mtdChangePct: pctChange(mtd, prevMtd),
    yearChangePct: pctChange(mtd, yearMtd),
    quarter,
    yearToDate,
    throughDay,
    cumulative,
    dayparts,
    heatmap,
    busiest: busiest?.label ?? null,
    quietest: quietest?.label ?? null,
  };
  return out;
});
