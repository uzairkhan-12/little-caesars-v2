import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { Shell } from "@/components/Shell";
import { PeriodFilter, periodLabel, type PeriodValue } from "@/components/PeriodFilter";
import { getGateStatus } from "@/lib/gate.functions";
import { getEnergyBaselines, getEnergyReports } from "@/lib/energy-reports.functions";
import { getStates, type HAState } from "@/lib/ha.functions";
import {
  REPORT_DEVICES,
  REPORT_TABLE_LABELS,
  REPORT_TABLES,
  isMeterStale,
  riyadhEnergyDayKey,
  todayConsumption,
  type EnergyReportRow,
  type ReportTable,
} from "@/lib/energy-devices";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const PAGE_SIZE = 10;

type ReportRow = EnergyReportRow & { live?: boolean; stale?: boolean };

function haEnergy(states: HAState[], entityId: string): number | null {
  const raw = states.find((s) => s.entity_id === entityId)?.state;
  if (raw == null || raw === "" || raw === "unknown" || raw === "unavailable") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatKwh(n: number) {
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MWh`;
  }
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`;
}

/** Sum of stored daily consumption for the current filters. */
function filteredTotalEnergy(rows: EnergyReportRow[]) {
  return rows.reduce((sum, r) => sum + (r.consumption ?? 0), 0);
}

function ReportsPage() {
  const [table, setTable] = useState<ReportTable>("lights");
  const [deviceId, setDeviceId] = useState("all");
  const [period, setPeriod] = useState<PeriodValue>({ start: "", end: "" });
  const [page, setPage] = useState(1);

  const reportsFn = useServerFn(getEnergyReports);
  const statesFn = useServerFn(getStates);
  const baselinesFn = useServerFn(getEnergyBaselines);

  const reports = useQuery({
    queryKey: ["energy-reports", table],
    queryFn: () => reportsFn({ data: { table } }),
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

  const devices = REPORT_DEVICES[table];
  const todayKey = riyadhEnergyDayKey();
  const rows = reports.data ?? [];
  const months = useMemo(() => [...new Set(rows.map((r) => r.dayKey.slice(0, 7)))].sort(), [rows]);

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
          table,
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

  const includeLive = (!period.start || period.start <= todayKey) && (!period.end || period.end >= todayKey);

  const byDevice = useMemo(() => {
    return rows.filter((r) => deviceId === "all" || r.entityId === deviceId);
  }, [rows, deviceId]);

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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);
  const totalEnergy = useMemo(
    () => filteredTotalEnergy(byDevice) + (includeLive ? filteredTotalEnergy(liveRows) : 0),
    [byDevice, includeLive, liveRows],
  );
  const periodEnergy = useMemo(() => filteredTotalEnergy(filtered), [filtered]);
  const selectedDevice = devices.find((d) => d.entityId === deviceId)?.name;
  const rangeHint = periodLabel(period);
  const hasPeriod = Boolean(period.start || period.end);
  const scopeHint = `${REPORT_TABLE_LABELS[table]}${deviceId !== "all" && selectedDevice ? ` · ${selectedDevice}` : " · All devices"}`;

  useEffect(() => {
    setPage(1);
  }, [table, deviceId, period.start, period.end]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const changeTable = (next: ReportTable) => {
    setTable(next);
    setDeviceId("all");
    setPage(1);
  };

  const clearFilters = () => {
    setDeviceId("all");
    setPeriod({ start: "", end: "" });
    setPage(1);
  };

  return (
    <Shell title="Reports" subtitle="Closed 6:00 AM days plus today’s live consumption from each device, the same numbers as Branch.">
      <Tabs value={table} onValueChange={(v) => changeTable(v as ReportTable)}>
        <TabsList className="h-auto flex-wrap bg-card/70 border border-border p-1">
          {REPORT_TABLES.map((id) => (
            <TabsTrigger key={id} value={id} className="uppercase tracking-wider text-xs px-4">
              {REPORT_TABLE_LABELS[id]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-6 rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
        <div className="flex flex-col xl:flex-row xl:items-start gap-5">
          <Field label="Device">
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="bg-input border-border text-foreground w-full sm:w-64 [&_svg]:text-foreground [&_svg]:opacity-100">
                <SelectValue placeholder="All devices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All devices</SelectItem>
                {devices.map((d) => (
                  <SelectItem key={d.entityId} value={d.entityId}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Period</Label>
            <PeriodFilter value={period} onChange={setPeriod} months={months} />
          </div>
          <div className="flex xl:flex-col justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-accent" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Total Consumption</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{scopeHint}</p>
        <div className={`grid gap-4 ${hasPeriod ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
          {hasPeriod && (
            <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">In this period</p>
              <p className="text-xs text-muted-foreground mt-1">{rangeHint}</p>
              <p className="font-display text-3xl tabular-nums text-foreground mt-2">
                {reports.isLoading ? "…" : formatKwh(periodEnergy)}
              </p>
            </div>
          )}
          <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">All time</p>
            <p className="text-xs text-muted-foreground mt-1">{REPORT_TABLE_LABELS[table]} · every stored day</p>
            <p className="font-display text-3xl tabular-nums text-accent mt-2">
              {reports.isLoading ? "…" : formatKwh(totalEnergy)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-gradient-card border border-border shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="font-display text-xl tracking-wider">{REPORT_TABLE_LABELS[table]}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} reading{filtered.length === 1 ? "" : "s"}
              {deviceId !== "all" ? ` · ${devices.find((d) => d.entityId === deviceId)?.name}` : ""}
              {hasPeriod ? ` · ${rangeHint}` : ""}
            </p>
            {liveRows.some((r) => r.stale) && includeLive && (
              <p className="text-xs text-amber-400 mt-1">
                These kWh meters have not reported since before 6:00 AM, so today so far stays 0.00 until Home Assistant gets a new total. AC meters usually update continuously.
              </p>
            )}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-5">Device name</TableHead>
              <TableHead className="px-5">Consumption</TableHead>
              <TableHead className="px-5">Day</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="px-5 py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {reports.isError && (
              <TableRow>
                <TableCell colSpan={3} className="px-5 py-10 text-center text-muted-foreground">
                  Could not load reports. Refresh the page.
                </TableCell>
              </TableRow>
            )}
            {!reports.isLoading && !reports.isError && pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="px-5 py-10 text-center text-muted-foreground">
                  {rows.length === 0 && liveRows.length === 0
                    ? "No closed days yet. Today’s live consumption appears here once Home Assistant is reachable."
                    : "No readings match these filters. Clear or widen the date range."}
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((row: ReportRow) => (
              <TableRow key={`${row.live ? "live" : row.dayKey}-${row.entityId}`}>
                <TableCell className="px-5 font-medium">{row.deviceName}</TableCell>
                <TableCell className="px-5 tabular-nums font-semibold">
                  {row.consumption == null ? "—" : `${row.consumption.toFixed(2)} kWh`}
                </TableCell>
                <TableCell className="px-5 text-muted-foreground tabular-nums">
                  {row.live
                    ? row.stale
                      ? `${formatDay(row.day)} · meter last updated`
                      : `${formatDay(row.day)} · so far`
                    : formatDay(row.day)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {!reports.isLoading && filtered.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="px-5">Total consumption</TableCell>
                <TableCell className="px-5 tabular-nums font-semibold text-accent">{formatKwh(periodEnergy)}</TableCell>
                <TableCell className="px-5 text-muted-foreground">{rangeHint}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>

        <div className="px-5 py-4 border-t border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {filtered.length === 0 ? "No rows" : `Showing ${from}–${to} of ${filtered.length}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-input border-border"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground min-w-[7rem] text-center">
              Page {safePage} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-input border-border"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Shell>
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
