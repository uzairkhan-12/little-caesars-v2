import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CalendarIcon, Zap } from "lucide-react";
import { Shell } from "@/components/Shell";
import { getGateStatus } from "@/lib/gate.functions";
import { getEnergyReports } from "@/lib/energy-reports.functions";
import {
  REPORT_DEVICES,
  REPORT_TABLE_LABELS,
  REPORT_TABLES,
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
import { Input } from "@/components/ui/input";
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
        throw redirect({ to: "/" });
      }
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: ReportsPage,
});

const PAGE_SIZE = 10;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayDate() {
  return toDateInput(new Date());
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
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
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`;
}

/** Sum of stored daily consumption for the current filters. */
function filteredTotalEnergy(rows: EnergyReportRow[]) {
  return rows.reduce((sum, r) => sum + (r.consumption ?? 0), 0);
}

function ReportsPage() {
  const [table, setTable] = useState<ReportTable>("lights");
  const [deviceId, setDeviceId] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);

  const reportsFn = useServerFn(getEnergyReports);

  const reports = useQuery({
    queryKey: ["energy-reports", table],
    queryFn: () => reportsFn({ data: { table } }),
  });

  const devices = REPORT_DEVICES[table];
  const rows = reports.data ?? [];

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (deviceId !== "all" && r.entityId !== deviceId) return false;
        if (start && r.dayKey < start) return false;
        if (end && r.dayKey > end) return false;
        return true;
      })
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.deviceName.localeCompare(b.deviceName)));
  }, [rows, deviceId, start, end]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);
  const totalEnergy = useMemo(() => filteredTotalEnergy(filtered), [filtered]);
  const selectedDevice = devices.find((d) => d.entityId === deviceId)?.name;
  const rangeHint =
    start && end ? (start === end ? formatDay(`${start}T00:00:00+03:00`) : `${formatDay(`${start}T00:00:00+03:00`)} – ${formatDay(`${end}T00:00:00+03:00`)}`) : "All days";

  useEffect(() => {
    setPage(1);
  }, [table, deviceId, start, end]);

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
    setStart("");
    setEnd("");
    setPage(1);
  };

  return (
    <Shell title="Reports" subtitle="Each row is one 6:00 AM–6:00 AM Asia/Riyadh day. Filter by device and date range.">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label="Device">
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="bg-input border-border text-foreground [&_svg]:text-foreground [&_svg]:opacity-100">
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
          <Field label="Start">
            <DateField value={start} onChange={setStart} />
          </Field>
          <Field label="End">
            <DateField value={end} onChange={setEnd} />
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setStart(todayDate()); setEnd(todayDate()); }}>
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStart(daysAgo(6));
                  setEnd(todayDate());
                }}
              >
                Last 7 days
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-gradient-card border border-border shadow-soft p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Total Consumption</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {REPORT_TABLE_LABELS[table]}
            {deviceId !== "all" && selectedDevice ? ` · ${selectedDevice}` : " · All devices"}
            {` · ${rangeHint}`}
          </p>
        </div>
        <div className="font-display text-4xl tabular-nums text-accent">
          {reports.isLoading ? "…" : formatKwh(totalEnergy)}
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-gradient-card border border-border shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="font-display text-xl tracking-wider">{REPORT_TABLE_LABELS[table]}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} reading{filtered.length === 1 ? "" : "s"}
              {deviceId !== "all" ? ` · ${devices.find((d) => d.entityId === deviceId)?.name}` : ""}
            </p>
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
            {!reports.isLoading && pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="px-5 py-10 text-center text-muted-foreground">
                  {rows.length === 0
                    ? "No closed days yet. The 6:00 AM job writes the previous day's consumption here."
                    : "No readings match these filters. Clear or widen the date range."}
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((row: EnergyReportRow) => (
              <TableRow key={`${row.dayKey}-${row.entityId}`}>
                <TableCell className="px-5 font-medium">{row.deviceName}</TableCell>
                <TableCell className="px-5 tabular-nums font-semibold">
                  {row.consumption == null ? "—" : `${row.consumption.toFixed(2)} kWh`}
                </TableCell>
                <TableCell className="px-5 text-muted-foreground tabular-nums">{formatDay(row.day)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {!reports.isLoading && filtered.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="px-5">Total consumption</TableCell>
                <TableCell className="px-5 tabular-nums font-semibold text-accent">{formatKwh(totalEnergy)}</TableCell>
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

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-input border-border text-foreground pr-9 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-y-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-9 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground" />
    </div>
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
