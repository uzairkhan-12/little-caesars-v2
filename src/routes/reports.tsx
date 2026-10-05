import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { BusinessReport } from "@/components/BusinessReport";
import { Shell } from "@/components/Shell";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useI18n, type TFunction } from "@/lib/i18n";
import { cn, formatHour12 } from "@/lib/utils";
import { PeriodFilter, usePeriodLabel, type PeriodValue } from "@/components/PeriodFilter";
import { downloadCsv } from "@/lib/csv";
import { getGateStatus } from "@/lib/gate.functions";
import {
  getAcQuarterBaselines,
  getAcQuarterReports,
  getEnergyBaselines,
  getEnergyReports,
  getHourlyBaselines,
  getHourlyEnergyReports,
  getMidnightBaselines,
  getMidnightEnergyReports,
} from "@/lib/energy-reports.functions";
import { getStates, type HAState } from "@/lib/ha.functions";
import { getHourlyByDay, getReportCustomers, SHIFT_CLOSE_HOUR, SHIFT_OPEN_HOUR } from "@/lib/lc.functions";
import { CHART_BLUE, CHART_GREEN, CHART_ORANGE, CHART_PURPLE } from "@/lib/chart-colors";
import {
  AC_UNITS,
  REPORT_DEVICES,
  REPORT_TABLE_LABELS,
  REPORT_TABLES,
  addCalendarKey,
  automationSavedByHour,
  isHourMeterStale,
  isMeterStale,
  isMidnightMeterStale,
  riyadhCalendarDayKey,
  riyadhEnergyDayKey,
  riyadhHourKey,
  riyadhQuarterKey,
  todayConsumption,
  type AcQuarterRow,
  type EnergyReportRow,
  type ReportTable,
} from "@/lib/energy-devices";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/reports")({
  beforeLoad: async () => {
    try {
      const status = await getGateStatus();
      if (!status.unlocked || status.role !== "admin") {
        throw redirect({ to: "/branch" });
      }
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: ReportsPage,
});

/** One page is every device reading for a single day, newest day first. */
function pagesByDay<T>(rows: T[], dayOf: (row: T) => string): T[][] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const day = dayOf(row);
    let group = groups.get(day);
    if (!group) {
      group = [];
      groups.set(day, group);
      order.push(day);
    }
    group.push(row);
  }
  return order.map((day) => groups.get(day)!);
}

function dayPageWindow<T>(pages: T[][], page: number) {
  const pageCount = Math.max(1, pages.length);
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const pageRows = pages[safePage - 1] ?? [];
  const before = pages.slice(0, safePage - 1).reduce((sum, group) => sum + group.length, 0);
  const total = before + pages.slice(safePage - 1).reduce((sum, group) => sum + group.length, 0);
  return {
    pageCount,
    safePage,
    pageRows,
    from: total === 0 ? 0 : before + 1,
    to: total === 0 ? 0 : before + pageRows.length,
  };
}

type LoadFilter = "all" | ReportTable;
type ReportView = "six" | "midnight" | "hourly" | "ac";
type AcScope = "shift" | "all";

/** Calendar date, or the shift day (10:00 through 04:59 next morning). Hours 05:00–09:59 are outside the shift. */
function acScopeDay(slotKey: string, scope: AcScope): string | null {
  const day = slotKey.slice(0, 10);
  if (scope === "all") return day;
  const hour = Number(slotKey.slice(11, 13));
  if (hour >= SHIFT_OPEN_HOUR) return day;
  if (hour < SHIFT_CLOSE_HOUR) return addCalendarKey(day, -1);
  return null;
}
type DeviceOption = { table: ReportTable; name: string; entityId: string };

type ReportRow = EnergyReportRow & { live?: boolean; stale?: boolean };

function devicesFor(filter: LoadFilter): DeviceOption[] {
  const tables = filter === "all" ? REPORT_TABLES : [filter];
  return tables.flatMap((id) => REPORT_DEVICES[id].map((device) => ({ table: id, ...device })));
}

function deviceLabel(device: DeviceOption, filter: LoadFilter, known: (text: string) => string) {
  const name = known(device.name);
  if (filter !== "all") return name;
  return `${known(REPORT_TABLE_LABELS[device.table])} · ${name}`;
}

function haEnergy(states: HAState[], entityId: string): number | null {
  const raw = states.find((s) => s.entity_id === entityId)?.state;
  if (raw == null || raw === "" || raw === "unknown" || raw === "unavailable") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatDay(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatKwh(n: number, locale: string) {
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MWh`;
  }
  return `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`;
}

/** Sum of stored daily consumption for the current filters. */
function filteredTotalEnergy(rows: Array<{ consumption?: number | null }>) {
  return rows.reduce((sum, r) => sum + (r.consumption ?? 0), 0);
}

function formatQuarter(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    timeZone: "Asia/Riyadh",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTemp(n: number | null, locale: string) {
  if (n == null) return "—";
  return `${n.toLocaleString(locale, { maximumFractionDigits: 1 })}°C`;
}

function ReportsPage() {
  const { t, locale, known } = useI18n();
  const periodText = usePeriodLabel();
  const [table, setTable] = useState<LoadFilter>("all");
  const [section, setSection] = useState<"energy" | "business">("energy");
  const [view, setView] = useState<ReportView>("six");
  const [deviceId, setDeviceId] = useState("all");
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const today = riyadhCalendarDayKey();
    return { start: `${today.slice(0, 7)}-01`, end: today };
  });
  const [page, setPage] = useState(1);
  const [midnightPage, setMidnightPage] = useState(1);
  const [energyHourDay, setEnergyHourDay] = useState(() => riyadhEnergyDayKey());
  const [calendarHourDay, setCalendarHourDay] = useState(() => riyadhCalendarDayKey());
  const [hourMode, setHourMode] = useState<"energy" | "calendar">("energy");
  const [acPage, setAcPage] = useState(1);
  const [acScope, setAcScope] = useState<AcScope>("shift");

  const reportsFn = useServerFn(getEnergyReports);
  const midnightReportsFn = useServerFn(getMidnightEnergyReports);
  const hourlyReportsFn = useServerFn(getHourlyEnergyReports);
  const statesFn = useServerFn(getStates);
  const baselinesFn = useServerFn(getEnergyBaselines);
  const midnightBaselinesFn = useServerFn(getMidnightBaselines);
  const hourlyBaselinesFn = useServerFn(getHourlyBaselines);
  const acReportsFn = useServerFn(getAcQuarterReports);
  const acBaselinesFn = useServerFn(getAcQuarterBaselines);
  const hourlyVisitsFn = useServerFn(getHourlyByDay);
  const reportCustomersFn = useServerFn(getReportCustomers);

  const reports = useQuery({
    queryKey: ["energy-reports", table],
    queryFn: () => reportsFn({ data: { table } }),
  });
  const midnightReports = useQuery({
    queryKey: ["energy-reports-midnight", table],
    queryFn: () => midnightReportsFn({ data: { table } }),
  });
  const hourlyReports = useQuery({
    queryKey: ["energy-reports-hourly", table],
    queryFn: () => hourlyReportsFn({ data: { table } }),
    refetchInterval: 60_000,
  });
  const states = useQuery({
    queryKey: ["ha", "states"],
    queryFn: () => statesFn(),
    refetchInterval: 15_000,
  });
  const baselines = useQuery({
    queryKey: ["energy-baselines"],
    queryFn: () => baselinesFn(),
    refetchInterval: 60_000,
  });
  const midnightBaselines = useQuery({
    queryKey: ["energy-baselines-midnight"],
    queryFn: () => midnightBaselinesFn(),
    refetchInterval: 60_000,
  });
  const hourlyBaselines = useQuery({
    queryKey: ["energy-baselines-hourly"],
    queryFn: () => hourlyBaselinesFn(),
    refetchInterval: 60_000,
  });
  const acReports = useQuery({
    queryKey: ["ac-quarter-reports"],
    queryFn: () => acReportsFn(),
    refetchInterval: 60_000,
  });
  const acBaselines = useQuery({
    queryKey: ["ac-quarter-baselines"],
    queryFn: () => acBaselinesFn(),
    refetchInterval: 60_000,
  });
  const devices = useMemo(() => devicesFor(table), [table]);
  const todayKey = riyadhEnergyDayKey();
  const calendarToday = riyadhCalendarDayKey();
  const hourKey = riyadhHourKey();
  const rows = reports.data ?? [];
  const midnightRows = midnightReports.data ?? [];
  const hourlyRows = hourlyReports.data ?? [];
  const months = useMemo(
    () => [...new Set([...rows, ...midnightRows, ...hourlyRows].map((r) => r.dayKey.slice(0, 7)))].sort(),
    [rows, midnightRows, hourlyRows],
  );

  const liveRows = useMemo((): ReportRow[] => {
    if (!states.data) return [];
    const base = baselines.data ?? {};
    const now = new Date().toISOString();
    return devices
      .filter((d) => deviceId === "all" || d.entityId === deviceId)
      .map((d) => {
        const ha = states.data?.find((s) => s.entity_id === d.entityId);
        const current = haEnergy(states.data ?? [], d.entityId);
        const consumption = todayConsumption(current, base[d.entityId]);
        const stale = isMeterStale(ha?.last_updated);
        return {
          table: d.table,
          deviceName: d.name,
          entityId: d.entityId,
          energy: current,
          consumption,
          day: stale && ha?.last_updated ? ha.last_updated : now,
          dayKey: todayKey,
          live: true,
          stale,
        };
      })
      .filter((r) => r.consumption != null);
  }, [states.data, baselines.data, devices, deviceId, table, todayKey]);

  const midnightLiveRows = useMemo((): ReportRow[] => {
    if (!states.data || !midnightBaselines.data) return [];
    const base = midnightBaselines.data;
    const now = new Date().toISOString();
    return devices
      .filter((d) => deviceId === "all" || d.entityId === deviceId)
      .flatMap((d) => {
        const baseline = base[d.entityId];
        if (baseline == null) return [];
        const ha = states.data?.find((s) => s.entity_id === d.entityId);
        const current = haEnergy(states.data ?? [], d.entityId);
        const consumption = todayConsumption(current, baseline);
        if (consumption == null) return [];
        const stale = isMidnightMeterStale(ha?.last_updated);
        return [
          {
            table: d.table,
            deviceName: d.name,
            entityId: d.entityId,
            energy: current,
            consumption,
            day: stale && ha?.last_updated ? ha.last_updated : now,
            dayKey: calendarToday,
            live: true,
            stale,
          },
        ];
      });
  }, [states.data, midnightBaselines.data, devices, deviceId, table, calendarToday]);

  const hourlyLiveRows = useMemo((): ReportRow[] => {
    if (!states.data || !hourlyBaselines.data) return [];
    const base = hourlyBaselines.data;
    const now = new Date().toISOString();
    return devices
      .filter((d) => deviceId === "all" || d.entityId === deviceId)
      .flatMap((d) => {
        const baseline = base[d.entityId];
        if (baseline == null) return [];
        const ha = states.data?.find((s) => s.entity_id === d.entityId);
        const current = haEnergy(states.data ?? [], d.entityId);
        const consumption = todayConsumption(current, baseline);
        if (consumption == null) return [];
        const stale = isHourMeterStale(ha?.last_updated);
        return [
          {
            table: d.table,
            deviceName: d.name,
            entityId: d.entityId,
            energy: current,
            consumption,
            day: stale && ha?.last_updated ? ha.last_updated : now,
            dayKey: hourKey,
            live: true,
            stale,
          },
        ];
      });
  }, [states.data, hourlyBaselines.data, devices, deviceId, table, hourKey]);

  const includeLive = (!period.start || period.start <= todayKey) && (!period.end || period.end >= todayKey);
  const includeMidnightLive =
    (!period.start || period.start <= calendarToday) && (!period.end || period.end >= calendarToday);

  const byDevice = useMemo(() => {
    return rows.filter((r) => deviceId === "all" || r.entityId === deviceId);
  }, [rows, deviceId]);

  const midnightByDevice = useMemo(() => {
    return midnightRows.filter((r) => deviceId === "all" || r.entityId === deviceId);
  }, [midnightRows, deviceId]);

  const hourlyByDevice = useMemo(() => {
    return hourlyRows.filter((r) => deviceId === "all" || r.entityId === deviceId);
  }, [hourlyRows, deviceId]);

  const filtered = useMemo(() => {
    const closed = byDevice
      .filter((r) => {
        if (period.start && r.dayKey < period.start) return false;
        if (period.end && r.dayKey > period.end) return false;
        return true;
      })
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.deviceName.localeCompare(b.deviceName)));
    return includeLive ? [...liveRows, ...closed] : closed;
  }, [byDevice, period.start, period.end, includeLive, liveRows]);

  const midnightFiltered = useMemo(() => {
    const closed = midnightByDevice
      .filter((r) => {
        if (period.start && r.dayKey < period.start) return false;
        if (period.end && r.dayKey > period.end) return false;
        return true;
      })
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.deviceName.localeCompare(b.deviceName)));
    return includeMidnightLive ? [...midnightLiveRows, ...closed] : closed;
  }, [midnightByDevice, period.start, period.end, includeMidnightLive, midnightLiveRows]);

  const dayPages = useMemo(() => pagesByDay(filtered, (row) => row.dayKey), [filtered]);
  const { pageCount, safePage, pageRows, from, to } = dayPageWindow(dayPages, page);
  const midnightDayPages = useMemo(() => pagesByDay(midnightFiltered, (row) => row.dayKey), [midnightFiltered]);
  const {
    pageCount: midnightPageCount,
    safePage: safeMidnightPage,
    pageRows: midnightPageRows,
    from: midnightFrom,
    to: midnightTo,
  } = dayPageWindow(midnightDayPages, midnightPage);
  const totalEnergy = useMemo(
    () => filteredTotalEnergy(byDevice) + (includeLive ? filteredTotalEnergy(liveRows) : 0),
    [byDevice, includeLive, liveRows],
  );
  const periodEnergy = useMemo(() => filteredTotalEnergy(filtered), [filtered]);
  const midnightPeriodEnergy = useMemo(() => filteredTotalEnergy(midnightFiltered), [midnightFiltered]);
  const selectedDevice = devices.find((d) => d.entityId === deviceId);
  const rangeHint = periodText(period);
  const hasPeriod = Boolean(period.start || period.end);
  const loadLabel = table === "all" ? t("allDevices") : known(REPORT_TABLE_LABELS[table]);
  const quarterKey = riyadhQuarterKey();
  const selectedAc = deviceId === "all" ? null : (AC_UNITS.find((unit) => unit.energyId === deviceId) ?? null);
  const acLiveRows = useMemo((): Array<AcQuarterRow & { live?: boolean }> => {
    if (!states.data || !acBaselines.data) return [];
    const now = new Date().toISOString();
    return AC_UNITS.filter((unit) => selectedAc == null || unit.climateId === selectedAc.climateId).flatMap((unit) => {
      const baseline = acBaselines.data?.[unit.climateId];
      if (baseline?.energy == null) return [];
      const climate = states.data?.find((state) => state.entity_id === unit.climateId);
      const current = haEnergy(states.data ?? [], unit.energyId);
      const consumption = todayConsumption(current, baseline.energy);
      if (consumption == null) return [];
      const reading = Number(climate?.attributes?.current_temperature);
      const target = Number(climate?.attributes?.temperature);
      return [
        {
          deviceName: unit.name,
          entityId: unit.climateId,
          energyEntityId: unit.energyId,
          readingTemp: Number.isFinite(reading) ? reading : null,
          targetTemp: Number.isFinite(target) ? target : null,
          energy: current,
          consumption,
          day: now,
          slotKey: quarterKey,
          live: true,
        },
      ];
    });
  }, [states.data, acBaselines.data, selectedAc, quarterKey]);
  const acScopeLabel = acScope === "shift" ? `${t("acScopeShift")} · ${t("acScopeShiftHint")}` : t("acScopeAll");
  const includeAcLive = (() => {
    const day = acScopeDay(quarterKey, acScope);
    if (!day) return false;
    if (period.start && day < period.start) return false;
    if (period.end && day > period.end) return false;
    return true;
  })();
  const acFiltered = useMemo(() => {
    const closed = (acReports.data ?? []).filter((row) => {
      if (selectedAc && row.entityId !== selectedAc.climateId) return false;
      const day = acScopeDay(row.slotKey, acScope);
      if (!day) return false;
      if (period.start && day < period.start) return false;
      if (period.end && day > period.end) return false;
      return true;
    });
    return includeAcLive ? [...acLiveRows, ...closed] : closed;
  }, [acReports.data, selectedAc, period.start, period.end, includeAcLive, acLiveRows, acScope]);
  const acDayPages = useMemo(
    () => pagesByDay(acFiltered, (row) => acScopeDay(row.slotKey, acScope) ?? row.slotKey.slice(0, 10)),
    [acFiltered, acScope],
  );
  const {
    pageCount: acPageCount,
    safePage: safeAcPage,
    pageRows: acPageRows,
    from: acFrom,
    to: acTo,
  } = dayPageWindow(acDayPages, acPage);
  const acPeriodEnergy = filteredTotalEnergy(acFiltered);
  const savedByHour = useMemo(() => {
    const source = acReports.data ?? [];
    if (table !== "all" && table !== "ac") return new Map<string, number>();
    if (deviceId === "all") return automationSavedByHour(source);
    const unit = AC_UNITS.find((item) => item.energyId === deviceId);
    if (!unit) return new Map<string, number>();
    return automationSavedByHour(source.filter((row) => row.entityId === unit.climateId));
  }, [acReports.data, table, deviceId]);
  const allDevices = table === "all" && deviceId === "all";
  const reportCustomers = useQuery({
    queryKey: ["report-customers", period.start, period.end],
    enabled: allDevices && section === "energy" && (view === "six" || view === "midnight"),
    refetchInterval: 60_000,
    queryFn: () => reportCustomersFn({ data: { start: period.start, end: period.end } }),
  });
  const customerLine = (customers: number | undefined, energy: number) => {
    if (!allDevices) return null;
    const count = reportCustomers.isSuccess ? (customers ?? 0) : null;
    return {
      customers: count,
      perCustomer: count != null && count > 0 ? energy / count : null,
      loading: reportCustomers.isLoading,
    };
  };
  const exportReadings = (kind: "six" | "midnight") => {
    const source = kind === "six" ? filtered : midnightFiltered;
    const stamp = [period.start, period.end].filter(Boolean).join("_") || "all";
    const total = source.reduce((sum, row) => sum + (row.consumption ?? 0), 0);
    const customers = allDevices
      ? kind === "six"
        ? reportCustomers.data?.energy
        : reportCustomers.data?.calendar
      : undefined;
    const summary: Array<Array<string | number | null>> = [];
    if (customers != null) {
      summary.push([t("totalCustomers"), "", customers, ""]);
      summary.push([
        t("kwhPerCustomer"),
        "",
        customers > 0 ? Math.round((total / customers) * 100) / 100 : null,
        "",
      ]);
    }
    downloadCsv(
      `${kind === "six" ? "energy-6am" : "energy-midnight"}-${stamp}.csv`,
      [t("deviceName"), t("load"), `${t("consumption")} (kWh)`, t("day")],
      [
        ...source.map((row) => [
          known(row.deviceName),
          known(REPORT_TABLE_LABELS[row.table]),
          row.consumption == null ? null : Math.round(row.consumption * 100) / 100,
          (row as ReportRow).live ? `${formatDay(row.day, locale)} · ${t("openHour")}` : formatDay(row.day, locale),
        ]),
        ...summary,
        [t("totalConsumptionRow"), "", Math.round(total * 100) / 100, ""],
      ],
    );
  };
  const exportAcLog = () => {
    const stamp = [acScope, period.start, period.end].filter(Boolean).join("_") || "all";
    downloadCsv(
      `ac-log-${stamp}.csv`,
      [t("deviceName"), `${t("readingTemp")} (°C)`, `${t("target")} (°C)`, `${t("consumption")} (kWh)`, t("day")],
      [
        ...acFiltered.map((row) => {
          const when = formatQuarter(row.day, locale);
          return [
            `${known(REPORT_TABLE_LABELS.ac)} · ${known(row.deviceName)}`,
            row.readingTemp,
            row.targetTemp,
            row.consumption == null ? null : Math.round(row.consumption * 100) / 100,
            row.slotKey === quarterKey ? `${when} · ${t("openHour")}` : when,
          ];
        }),
        [t("totalConsumptionRow"), "", "", Math.round(acPeriodEnergy * 100) / 100, ""],
      ],
    );
  };
  const hourlyDayKey = hourMode === "energy" ? energyHourDay : calendarHourDay;
  const hourlyVisits = useQuery({
    queryKey: ["reports-hourly-visits", hourMode, hourlyDayKey],
    enabled: view === "hourly",
    refetchInterval: 60_000,
    queryFn: async () => {
      const load = async (day: string) => {
        const result = await hourlyVisitsFn({ data: { day } });
        return { date: day, hours: result.hours };
      };
      if (hourMode === "calendar") return [await load(hourlyDayKey)];
      return Promise.all([load(hourlyDayKey), load(addCalendarKey(hourlyDayKey, 1))]);
    },
  });
  const customersByHour = useMemo(() => {
    if (!hourlyVisits.data) return null;
    const map = new Map<string, number>();
    for (const day of hourlyVisits.data) {
      for (const bucket of day.hours) map.set(`${day.date}T${String(bucket.hour).padStart(2, "0")}`, bucket.entries);
    }
    return map;
  }, [hourlyVisits.data]);

  useEffect(() => {
    setPage(1);
    setMidnightPage(1);
    setAcPage(1);
  }, [table, deviceId, period.start, period.end]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (midnightPage !== safeMidnightPage) setMidnightPage(safeMidnightPage);
  }, [midnightPage, safeMidnightPage]);

  useEffect(() => {
    if (acPage !== safeAcPage) setAcPage(safeAcPage);
  }, [acPage, safeAcPage]);

  useEffect(() => {
    if (view === "ac" && deviceId !== "all" && !AC_UNITS.some((unit) => unit.energyId === deviceId)) {
      setDeviceId("all");
    }
  }, [view, deviceId]);

  const changeTable = (next: string) => {
    if (next !== "all" && !(REPORT_TABLES as readonly string[]).includes(next)) return;
    setTable(next as LoadFilter);
    setDeviceId("all");
    setPage(1);
    setMidnightPage(1);
    setAcPage(1);
  };

  const clearFilters = () => {
    setTable("all");
    setDeviceId("all");
    setPeriod(() => {
      const today = riyadhCalendarDayKey();
      return { start: `${today.slice(0, 7)}-01`, end: today };
    });
    setPage(1);
    setMidnightPage(1);
    setAcPage(1);
    setAcScope("shift");
  };

  return (
    <Shell title={t("navReports")}>
      <Tabs value={section} onValueChange={(next) => setSection(next as "energy" | "business")}>
        <TabsList className="h-auto flex-wrap bg-card/70 border border-border p-1">
          <TabsTrigger value="energy" className="text-sm px-4 py-2">
            {t("energyReport")}
          </TabsTrigger>
          <TabsTrigger value="business" className="text-sm px-4 py-2">
            {t("businessReport")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="energy">
      <Tabs
        className="mt-4"
        value={view}
        onValueChange={(next) => {
          const picked = next as ReportView;
          setView(picked);
          if (picked === "ac" && deviceId !== "all" && !AC_UNITS.some((unit) => unit.energyId === deviceId)) {
            setDeviceId("all");
          }
        }}
      >
        <TabsList className="h-auto flex-wrap bg-card/70 border border-border p-1">
          <TabsTrigger value="six" className="text-sm px-4 py-2">
            {t("reportViewSix")}
          </TabsTrigger>
          <TabsTrigger value="midnight" className="text-sm px-4 py-2">
            {t("reportViewMidnight")}
          </TabsTrigger>
          <TabsTrigger value="hourly" className="text-sm px-4 py-2">
            {t("reportViewHourly")}
          </TabsTrigger>
          <TabsTrigger value="ac" className="text-sm px-4 py-2">
            {t("acLog")}
            </TabsTrigger>
        </TabsList>

      <div className="mt-4 rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
        <div className="flex flex-col gap-5">
          <Field label={t("load")}>
            <div className="flex flex-wrap gap-1 rounded-lg bg-background/50 border border-border p-1 w-fit">
              {view === "ac" ? (
                <button type="button" className="rounded-md px-3 py-1.5 text-xs uppercase tracking-wider bg-background text-foreground shadow">
                  {known(REPORT_TABLE_LABELS.ac)}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => changeTable("all")}
                    className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-wider ${table === "all" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
                  >
                    {t("allDevices")}
                  </button>
                  {REPORT_TABLES.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => changeTable(id)}
                      className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-wider ${table === id ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
                    >
                      {known(REPORT_TABLE_LABELS[id])}
                    </button>
                  ))}
                </>
              )}
            </div>
          </Field>
        <div className="flex flex-col xl:flex-row xl:items-start gap-5">
          <Field label={t("device")}>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="bg-input border-border text-foreground w-full sm:w-80 [&_svg]:text-foreground [&_svg]:opacity-100">
                <SelectValue placeholder={t("allDevices")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{view === "ac" ? t("allAc") : t("allDevices")}</SelectItem>
                {view === "ac"
                  ? AC_UNITS.map((unit) => (
                      <SelectItem key={unit.energyId} value={unit.energyId}>
                        {known(unit.name)}
                      </SelectItem>
                    ))
                  : devices.map((d) => (
                  <SelectItem key={d.entityId} value={d.entityId}>
                        {deviceLabel(d, table, known)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {view === "ac" ? (
            <Field label={t("acScope")}>
              <div className="flex flex-wrap gap-1 rounded-lg bg-background/50 border border-border p-1 w-fit">
                <button
                  type="button"
                  onClick={() => {
                    setAcScope("shift");
                    setAcPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-wider ${acScope === "shift" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
                >
                  {t("acScopeShift")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAcScope("all");
                    setAcPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-wider ${acScope === "all" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
                >
                  {t("acScopeAll")}
                </button>
              </div>
            </Field>
          ) : null}
          {view !== "hourly" ? (
          <div className="flex-1 space-y-1.5 min-w-0">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("period")}</Label>
            <PeriodFilter value={period} onChange={setPeriod} months={months} />
          </div>
          ) : null}
          <div className="flex xl:flex-col justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              {t("reset")}
            </Button>
          </div>
        </div>
      </div>
        </div>

        <TabsContent value="six">
          <ReadingsTable
            title={loadLabel}
            summary={{
              value: reports.isLoading ? "…" : formatKwh(hasPeriod ? periodEnergy : totalEnergy, locale),
              label: hasPeriod ? rangeHint : t("allTime"),
              extra: hasPeriod && !reports.isLoading ? `${t("allTime")} · ${formatKwh(totalEnergy, locale)}` : "",
            }}
            count={filtered.length}
            showLoad={table === "all"}
            deviceName={deviceId !== "all" && selectedDevice ? deviceLabel(selectedDevice, table, known) : ""}
            rangeHint={hasPeriod ? rangeHint : ""}
            note={liveRows.some((r) => r.stale) && includeLive ? t("staleMeters") : ""}
            loading={reports.isLoading}
            error={reports.isError}
            empty={rows.length === 0 && liveRows.length === 0 ? t("noClosedDays") : t("noReadings")}
            pageRows={pageRows}
            showFooter={!reports.isLoading && filtered.length > 0}
            periodEnergy={periodEnergy}
            footerHint={rangeHint}
            customers={customerLine(reportCustomers.data?.energy, periodEnergy)}
            from={from}
            to={to}
            page={safePage}
            pageCount={pageCount}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
            onExport={() => exportReadings("six")}
          />
        </TabsContent>

        <TabsContent value="midnight">
          <ReadingsTable
            title={loadLabel}
            hint={t("midnightTableHint")}
            count={midnightFiltered.length}
            showLoad={table === "all"}
            deviceName={deviceId !== "all" && selectedDevice ? deviceLabel(selectedDevice, table, known) : ""}
            rangeHint={hasPeriod ? rangeHint : ""}
            note={midnightLiveRows.some((r) => r.stale) && includeMidnightLive ? t("midnightStale") : ""}
            loading={midnightReports.isLoading}
            error={midnightReports.isError}
            empty={midnightRows.length === 0 && midnightLiveRows.length === 0 ? t("midnightEmpty") : t("noReadings")}
            pageRows={midnightPageRows}
            showFooter={!midnightReports.isLoading && midnightFiltered.length > 0}
            periodEnergy={midnightPeriodEnergy}
            footerHint={rangeHint}
            customers={customerLine(reportCustomers.data?.calendar, midnightPeriodEnergy)}
            from={midnightFrom}
            to={midnightTo}
            page={safeMidnightPage}
            pageCount={midnightPageCount}
            onPrev={() => setMidnightPage((p) => Math.max(1, p - 1))}
            onNext={() => setMidnightPage((p) => Math.min(midnightPageCount, p + 1))}
            onExport={() => exportReadings("midnight")}
          />
        </TabsContent>

        <TabsContent value="hourly">
          <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-card/70 border border-border p-1 w-fit">
            <button
              type="button"
              onClick={() => setHourMode("energy")}
              className={`rounded-md px-3 py-1.5 text-sm ${hourMode === "energy" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              {t("sixAmWindow")}
            </button>
            <button
              type="button"
              onClick={() => setHourMode("calendar")}
              className={`rounded-md px-3 py-1.5 text-sm ${hourMode === "calendar" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              {t("midnightWindow")}
            </button>
          </div>
          <HourlyWindow
            mode={hourMode}
            dayKey={hourMode === "energy" ? energyHourDay : calendarHourDay}
            todayKey={hourMode === "energy" ? todayKey : calendarToday}
            onDay={hourMode === "energy" ? setEnergyHourDay : setCalendarHourDay}
            title={loadLabel}
            deviceName={deviceId !== "all" && selectedDevice ? deviceLabel(selectedDevice, table, known) : ""}
            rows={hourlyByDevice}
            liveRows={hourlyLiveRows}
            nowKey={hourKey}
            loading={hourlyReports.isLoading}
            error={hourlyReports.isError}
            customersByHour={customersByHour}
            savedByHour={savedByHour}
          />
        </TabsContent>

        <TabsContent value="ac">
          <AcLogTable
              onExport={exportAcLog}
              count={acFiltered.length}
              deviceName={selectedAc ? `${known(REPORT_TABLE_LABELS.ac)} · ${known(selectedAc.name)}` : ""}
              rangeHint={[hasPeriod ? rangeHint : "", acScopeLabel].filter(Boolean).join(" · ")}
              loading={acReports.isLoading}
              error={acReports.isError}
              empty={(acReports.data ?? []).length === 0 && acLiveRows.length === 0 ? t("acLogEmpty") : t("noReadings")}
              pageRows={acPageRows}
              showFooter={!acReports.isLoading && acFiltered.length > 0}
              periodEnergy={acPeriodEnergy}
              footerHint={rangeHint}
              from={acFrom}
              to={acTo}
              page={safeAcPage}
              pageCount={acPageCount}
              onPrev={() => setAcPage((p) => Math.max(1, p - 1))}
            onNext={() => setAcPage((p) => Math.min(acPageCount, p + 1))}
          />
        </TabsContent>
      </Tabs>
        </TabsContent>
        <TabsContent value="business">
          <BusinessReport />
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function readingDay(row: ReportRow, t: TFunction, locale: string) {
  if (!row.live) return formatDay(row.day, locale);
  return row.stale ? t("meterLastUpdated", { day: formatDay(row.day, locale) }) : t("soFar", { day: formatDay(row.day, locale) });
}

function ReadingRow({ row, nested }: { row: ReportRow; nested?: boolean }) {
  const { t, locale, known } = useI18n();
  return (
    <TableRow>
      <TableCell className={`px-5 font-medium ${nested ? "ps-12" : ""}`}>{known(row.deviceName)}</TableCell>
      <TableCell className="px-5 tabular-nums font-semibold">
        {row.consumption == null ? "—" : `${row.consumption.toFixed(2)} kWh`}
      </TableCell>
      <TableCell className="px-5 text-muted-foreground tabular-nums">{readingDay(row, t, locale)}</TableCell>
    </TableRow>
  );
}

function GroupedReadings({ rows }: { rows: ReportRow[] }) {
  const { known } = useI18n();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groups = REPORT_TABLES.map((id) => ({
    id,
    rows: rows.filter((row) => row.table === id),
  })).filter((group) => group.rows.length > 0);

  return groups.map((group) => {
    const expanded = open[group.id] === true;
    const total = group.rows.reduce((sum, row) => sum + (row.consumption ?? 0), 0);
    return (
      <Fragment key={group.id}>
        <TableRow className="bg-muted/40 hover:bg-muted/60">
          <TableCell className="px-3 py-2">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-start"
              onClick={() => setOpen((current) => ({ ...current, [group.id]: !expanded }))}
              aria-expanded={expanded}
            >
              <ChevronDown className={`w-4 h-4 shrink-0 transition ${expanded ? "" : "-rotate-90 rtl:rotate-90"}`} />
              <span className="font-medium">{known(REPORT_TABLE_LABELS[group.id])}</span>
              <span className="text-xs text-muted-foreground">{group.rows.length}</span>
            </button>
          </TableCell>
          <TableCell className="px-5 py-2 tabular-nums font-semibold">{total.toFixed(2)} kWh</TableCell>
          <TableCell className="px-5 py-2" />
        </TableRow>
        {expanded ? group.rows.map((row) => <ReadingRow key={`${row.live ? "live" : row.dayKey}-${row.entityId}`} row={row} nested />) : null}
      </Fragment>
    );
  });
}

function ReadingsTable({
  eyebrow,
  title,
  hint,
  summary,
  count,
  showLoad,
  deviceName,
  rangeHint,
  note,
  loading,
  error,
  empty,
  pageRows,
  showFooter,
  periodEnergy,
  footerHint,
  customers,
  from,
  to,
  page,
  pageCount,
  onPrev,
  onNext,
  onExport,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  summary?: { value: string; label: string; extra?: string };
  count: number;
  showLoad?: boolean;
  deviceName: string;
  rangeHint: string;
  note: string;
  loading: boolean;
  error: boolean;
  empty: string;
  pageRows: ReportRow[];
  showFooter: boolean;
  periodEnergy: number;
  footerHint: string;
  customers?: { customers: number | null; perCustomer: number | null; loading: boolean } | null;
  from: number;
  to: number;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  onExport: () => void;
}) {
  const { t, locale, known } = useI18n();
  return (
      <div className="mt-5 rounded-2xl bg-gradient-card border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
          {eyebrow ? <p className="text-[11px] uppercase tracking-[0.16em] text-accent">{eyebrow}</p> : null}
          <h2 className="font-display text-xl tracking-wider">{title}</h2>
          {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
            <p className="text-xs text-muted-foreground mt-0.5">
            {count === 1 ? t("readingsOne", { count }) : t("readingsMany", { count })}
            {deviceName ? ` · ${deviceName}` : ""}
            {rangeHint ? ` · ${rangeHint}` : ""}
          </p>
          {note ? <p className="text-xs text-amber-400 mt-1">{note}</p> : null}
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2">
          {summary ? (
            <div className="sm:text-end">
              <p className="font-display text-3xl tabular-nums text-accent">{summary.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{summary.label}</p>
              {summary.extra ? <p className="text-xs text-muted-foreground">{summary.extra}</p> : null}
            </div>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="bg-input border-border shrink-0" disabled={loading || count === 0} onClick={onExport}>
            <Download className="w-4 h-4" />
            {t("exportExcel")}
          </Button>
        </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
            <TableHead className="px-5">{t("deviceName")}</TableHead>
            <TableHead className="px-5">{t("consumption")}</TableHead>
            <TableHead className="px-5">{t("day")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {loading && (
              <TableRow>
                <TableCell colSpan={3} className="px-5 py-10 text-center text-muted-foreground">
                {t("loading")}
                </TableCell>
              </TableRow>
            )}
          {error && (
              <TableRow>
                <TableCell colSpan={3} className="px-5 py-10 text-center text-muted-foreground">
                {t("reportsError")}
                </TableCell>
              </TableRow>
            )}
          {!loading && !error && pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="px-5 py-10 text-center text-muted-foreground">
                {empty}
                </TableCell>
              </TableRow>
            )}
          {showLoad ? (
            <GroupedReadings rows={pageRows} />
          ) : (
            pageRows.map((row) => <ReadingRow key={`${row.live ? "live" : row.dayKey}-${row.entityId}`} row={row} />)
          )}
          </TableBody>
        {showFooter && (
            <TableFooter>
              {customers ? (
                <>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-5">{t("totalCustomers")}</TableCell>
                    <TableCell className="px-5 tabular-nums font-semibold">
                      {customers.loading ? "…" : customers.customers == null ? "—" : customers.customers.toLocaleString(locale)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-5">{t("kwhPerCustomer")}</TableCell>
                    <TableCell className="px-5 tabular-nums font-semibold">
                      {customers.loading
                        ? "…"
                        : customers.perCustomer == null
                          ? "—"
                          : `${customers.perCustomer.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </>
              ) : null}
              <TableRow className="hover:bg-transparent">
              <TableCell className="px-5">{t("totalConsumptionRow")}</TableCell>
              <TableCell className="px-5 tabular-nums font-semibold text-accent">{formatKwh(periodEnergy, locale)}</TableCell>
              <TableCell className="px-5 text-muted-foreground">{footerHint}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>

        <div className="px-5 py-4 border-t border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-muted-foreground">
          {count === 0 ? t("noRows") : t("showingRows", { from, to, total: count })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-input border-border"
            disabled={page <= 1}
            onClick={onPrev}
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            {t("previous")}
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground min-w-[7rem] text-center">
            {t("pageOf", { page, pages: pageCount })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-input border-border"
            disabled={page >= pageCount}
            onClick={onNext}
          >
            {t("next")}
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}

type HourPoint = {
  key: string;
  label: string;
  kwh: number | null;
  customers: number | null;
  saved: number | null;
  live: boolean;
  future: boolean;
};

function hourWindowKeys(dayKey: string, mode: "energy" | "calendar") {
  if (mode === "calendar") {
    return Array.from({ length: 24 }, (_, hour) => `${dayKey}T${String(hour).padStart(2, "0")}`);
  }
  const next = addCalendarKey(dayKey, 1);
  const keys: string[] = [];
  for (let hour = 6; hour < 24; hour++) keys.push(`${dayKey}T${String(hour).padStart(2, "0")}`);
  for (let hour = 0; hour < 6; hour++) keys.push(`${next}T${String(hour).padStart(2, "0")}`);
  return keys;
}

function formatDayKey(dayKey: string, locale: string) {
  return new Date(`${dayKey}T12:00:00+03:00`).toLocaleDateString(locale, {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function HourlyWindow({
  mode,
  dayKey,
  todayKey,
  onDay,
  title,
  deviceName,
  rows,
  liveRows,
  nowKey,
  loading,
  error,
  customersByHour,
  savedByHour,
}: {
  mode: "energy" | "calendar";
  dayKey: string;
  todayKey: string;
  onDay: (day: string) => void;
  title: string;
  deviceName: string;
  rows: EnergyReportRow[];
  liveRows: ReportRow[];
  nowKey: string;
  loading: boolean;
  error: boolean;
  customersByHour: Map<string, number> | null;
  savedByHour: Map<string, number>;
}) {
  const { t, locale, lang } = useI18n();
  const chartConfig = {
    kwh: { label: t("consumption"), color: CHART_BLUE },
    customers: { label: t("customersEntered"), color: CHART_ORANGE },
    live: { label: t("openHour"), color: CHART_PURPLE },
    saved: { label: t("savedByAutomation"), color: CHART_GREEN },
  } satisfies ChartConfig;

  const points = useMemo((): HourPoint[] => {
    const closed = new Map<string, number>();
    for (const row of rows) {
      if (row.consumption == null) continue;
      closed.set(row.dayKey, (closed.get(row.dayKey) ?? 0) + row.consumption);
    }
    const liveTotal = liveRows.reduce((sum, row) => sum + (row.consumption ?? 0), 0);
    const hasLive = liveRows.some((row) => row.consumption != null);
    return hourWindowKeys(dayKey, mode).map((key) => {
      const hour = Number(key.slice(11, 13));
      const live = key === nowKey;
      const future = key > nowKey;
      const kwh = live ? (hasLive ? liveTotal : null) : future ? null : (closed.get(key) ?? null);
      const customers = customersByHour == null || future ? null : (customersByHour.get(key) ?? 0);
      const savedRaw = savedByHour.get(key) ?? 0;
      const saved = future || savedRaw < 0.005 ? null : savedRaw;
      return { key, label: formatHour12(hour, lang), kwh, customers, saved, live, future };
    });
  }, [rows, liveRows, dayKey, mode, nowKey, lang, customersByHour, savedByHour]);

  const recorded = points.filter((point) => point.kwh != null);
  const total = recorded.reduce((sum, point) => sum + (point.kwh ?? 0), 0);
  const savedTotal = points.reduce((sum, point) => sum + (point.saved ?? 0), 0);
  const savedPeak = points.reduce((max, point) => Math.max(max, point.saved ?? 0), 0);
  const peak = recorded.reduce<HourPoint | null>((best, point) => {
    if (!best || (point.kwh ?? 0) > (best.kwh ?? 0)) return point;
    return best;
  }, null);
  const endKey = addCalendarKey(dayKey, 1);
  const clock = formatHour12(mode === "energy" ? 6 : 0, lang);
  const span = t("hourlySpan", {
    from: `${formatDayKey(dayKey, locale)} · ${clock}`,
    to: `${formatDayKey(endKey, locale)} · ${clock}`,
  });
  const livePoint = points.find((point) => point.live);
  const stale = Boolean(livePoint && (livePoint.kwh ?? 0) === 0 && liveRows.some((row) => row.stale));

  return (
    <section className="mt-5 rounded-2xl bg-gradient-card border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent">
            {mode === "energy" ? t("sixAmWindow") : t("midnightWindow")}
          </p>
          <h2 className="font-display text-xl tracking-wider mt-1">{title}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {span}
            {deviceName ? ` · ${deviceName}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t("hourlyChartHint")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("savedHint")}</p>
          {stale ? <p className="text-xs text-amber-400 mt-1">{t("hourlyStale")}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-input border-border"
            disabled={loading || recorded.length === 0}
            onClick={() =>
              downloadCsv(
                `hourly-${mode}-${dayKey}.csv`,
                [t("hour"), `${t("consumption")} (kWh)`, t("customerVisits"), `${t("savedByAutomation")} (kWh)`],
                points.map((point) => [
                  point.label,
                  point.kwh == null ? null : Math.round(point.kwh * 100) / 100,
                  point.customers,
                  point.saved == null ? null : Math.round(point.saved * 100) / 100,
                ]),
              )
            }
          >
            <Download className="w-4 h-4" />
            {t("exportExcel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-input border-border"
            onClick={() => onDay(addCalendarKey(dayKey, -1))}
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            {t("previous")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-input border-border"
            disabled={dayKey >= todayKey}
            onClick={() => onDay(addCalendarKey(dayKey, 1))}
          >
            {t("next")}
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>

      <div className="px-5 py-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("dayTotal")}</p>
          <p className="font-display text-3xl tabular-nums text-accent mt-1">{loading ? "…" : formatKwh(total, locale)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("peakHour")}</p>
          <p className="font-display text-3xl tabular-nums mt-1">{loading || !peak ? "—" : peak.label}</p>
          {peak?.kwh != null ? <p className="text-xs text-muted-foreground tabular-nums mt-1">{peak.kwh.toFixed(2)} kWh</p> : null}
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("hoursRecorded")}</p>
          <p className="font-display text-3xl tabular-nums mt-1">
            {loading ? "…" : recorded.length}
            <span className="text-base font-normal text-muted-foreground"> / 24</span>
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("savedByAutomation")}</p>
          <p className="font-display text-3xl tabular-nums mt-1" style={{ color: CHART_GREEN }}>
            {loading ? "…" : formatKwh(savedTotal, locale)}
          </p>
        </div>
      </div>

      <div className="px-3 sm:px-5 pb-2">
        {error ? (
          <p className="px-2 py-10 text-center text-sm text-muted-foreground">{t("reportsError")}</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <ComposedChart data={points} margin={{ left: 4, right: 8, top: 12, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} interval={1} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="kwh" tickLine={false} axisLine={false} width={44} tickFormatter={(value) => Number(value).toFixed(1)} />
              <YAxis yAxisId="customers" orientation="right" tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <YAxis yAxisId="saved" hide domain={[0, savedPeak > 0 ? savedPeak * 1.25 : 1]} />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                content={
                  <ChartTooltipContent
                    formatter={(_value, _name, item) => {
                      const point = item.payload as HourPoint;
                      if (item.dataKey === "customers") {
                        return point.customers == null ? "—" : t("customersCount", { count: point.customers });
                      }
                      if (item.dataKey === "saved") {
                        return point.saved == null ? "—" : `${point.saved.toFixed(2)} kWh`;
                      }
                      if (point.kwh == null) return "—";
                      const text = `${point.kwh.toFixed(2)} kWh`;
                      return point.live ? `${text} · ${t("openHour")}` : text;
                    }}
                  />
                }
              />
              <Bar yAxisId="kwh" dataKey="kwh" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {points.map((point) => (
                  <Cell key={point.key} fill={point.live ? "var(--color-live)" : "var(--color-kwh)"} />
                ))}
              </Bar>
              <Line
                yAxisId="saved"
                dataKey="saved"
                stroke="var(--color-saved)"
                strokeWidth={2}
                connectNulls={false}
                dot={(dot) => {
                  const point = dot.payload as HourPoint | undefined;
                  if (point?.saved == null || dot.cx == null || dot.cy == null) return <g key={dot.key} />;
                  return <circle key={dot.key} cx={dot.cx} cy={dot.cy} r={3.5} fill="var(--color-saved)" />;
                }}
              />
              <Line yAxisId="customers" dataKey="customers" stroke="var(--color-customers)" strokeWidth={2} dot={false} connectNulls={false} />
            </ComposedChart>
          </ChartContainer>
        )}
        {!loading && !error && recorded.length === 0 ? (
          <p className="px-2 pb-3 text-center text-xs text-muted-foreground">{t("noHourlyDay")}</p>
        ) : null}
        <div className="flex items-center gap-4 px-2 pb-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_BLUE }} />
            {t("consumption")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_PURPLE }} />
            {t("openHour")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_ORANGE }} />
            {t("customersEntered")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_GREEN }} />
            {t("savedByAutomation")}
          </span>
        </div>
      </div>

      <div className="px-5 pb-5 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2">
        {points.map((point) => {
          const isPeak = peak?.key === point.key && point.kwh != null;
          return (
            <div
              key={point.key}
              className={cn(
                "rounded-xl border px-2.5 py-2 min-h-[4.5rem]",
                point.live ? "border-accent bg-accent/10" : "border-border/60 bg-background/30",
                isPeak && !point.live ? "border-primary/50" : "",
                point.future ? "opacity-45" : "",
              )}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{point.label}</p>
              <p className="font-display text-lg tabular-nums leading-tight mt-1">
                {point.customers == null ? "—" : point.customers.toLocaleString(locale)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {point.kwh == null ? (point.live ? t("openHour") : "") : `${point.kwh.toFixed(2)} kWh`}
              </p>
              {point.saved != null ? (
                <p className="text-[10px] tabular-nums mt-0.5" style={{ color: CHART_GREEN }}>
                  {point.saved.toFixed(2)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AcLogTable({
  onExport,
  count,
  deviceName,
  rangeHint,
  loading,
  error,
  empty,
  pageRows,
  showFooter,
  periodEnergy,
  footerHint,
  from,
  to,
  page,
  pageCount,
  onPrev,
  onNext,
}: {
  onExport: () => void;
  count: number;
  deviceName: string;
  rangeHint: string;
  loading: boolean;
  error: boolean;
  empty: string;
  pageRows: Array<AcQuarterRow & { live?: boolean }>;
  showFooter: boolean;
  periodEnergy: number;
  footerHint: string;
  from: number;
  to: number;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t, locale, known } = useI18n();
  return (
    <section className="mt-5 rounded-2xl bg-gradient-card border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent">{t("acLog")}</p>
          <h2 className="font-display text-xl tracking-wider mt-1">{t("acLog")}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t("acLogHint")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {count === 1 ? t("readingsOne", { count }) : t("readingsMany", { count })}
            {deviceName ? ` · ${deviceName}` : ""}
            {rangeHint ? ` · ${rangeHint}` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="bg-input border-border shrink-0" disabled={loading || count === 0} onClick={onExport}>
          <Download className="w-4 h-4" />
          {t("exportExcel")}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-5">{t("deviceName")}</TableHead>
            <TableHead className="px-5">{t("readingTemp")}</TableHead>
            <TableHead className="px-5">{t("target")}</TableHead>
            <TableHead className="px-5">{t("consumption")}</TableHead>
            <TableHead className="px-5">{t("day")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                {t("loading")}
              </TableCell>
            </TableRow>
          )}
          {error && (
            <TableRow>
              <TableCell colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                {t("reportsError")}
              </TableCell>
            </TableRow>
          )}
          {!loading && !error && pageRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {pageRows.map((row) => (
            <TableRow key={`${row.live ? "live" : row.slotKey}-${row.entityId}`}>
              <TableCell className="px-5 font-medium">
                {known(REPORT_TABLE_LABELS.ac)} · {known(row.deviceName)}
              </TableCell>
              <TableCell className="px-5 tabular-nums">{formatTemp(row.readingTemp, locale)}</TableCell>
              <TableCell className="px-5 tabular-nums">{formatTemp(row.targetTemp, locale)}</TableCell>
              <TableCell className="px-5 tabular-nums font-semibold">
                {row.consumption == null ? "—" : `${row.consumption.toFixed(2)} kWh`}
              </TableCell>
              <TableCell className="px-5 text-muted-foreground tabular-nums">
                {row.live ? `${formatQuarter(row.day, locale)} · ${t("openHour")}` : formatQuarter(row.day, locale)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {showFooter && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="px-5" colSpan={3}>
                {t("totalConsumptionRow")}
              </TableCell>
              <TableCell className="px-5 tabular-nums font-semibold text-accent">{formatKwh(periodEnergy, locale)}</TableCell>
              <TableCell className="px-5 text-muted-foreground">{footerHint}</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <div className="px-5 py-4 border-t border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {count === 0 ? t("noRows") : t("showingRows", { from, to, total: count })}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="bg-input border-border" disabled={page <= 1} onClick={onPrev}>
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            {t("previous")}
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground min-w-[7rem] text-center">
            {t("pageOf", { page, pages: pageCount })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-input border-border"
            disabled={page >= pageCount}
            onClick={onNext}
            >
            {t("next")}
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            </Button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
