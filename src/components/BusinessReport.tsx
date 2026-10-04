import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodFilter, usePeriodLabel, type PeriodValue } from "@/components/PeriodFilter";
import { downloadCsv } from "@/lib/csv";
import { CHART_BLUE, CHART_ORANGE } from "@/lib/chart-colors";
import { currentShiftDay, getBusinessReport, type BusinessScope } from "@/lib/lc.functions";
import { useI18n, type TFunction } from "@/lib/i18n";
import { formatHour12 } from "@/lib/utils";

function formatDuration(seconds: number, t: TFunction) {
  if (seconds <= 0) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t("durationUnder");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t("durationM", { minutes: rest });
  return t("durationHm", { hours, minutes: rest });
}

function monthKeys() {
  const today = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(today);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const keys: string[] = [];
  for (let y = 2026, m = 7; y < year || (y === year && m <= month); ) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function BusinessReport() {
  const { t, locale, lang, known } = useI18n();
  const periodText = usePeriodLabel();
  const reportFn = useServerFn(getBusinessReport);
  const shiftDay = currentShiftDay();
  const [period, setPeriod] = useState<PeriodValue>({ start: shiftDay, end: shiftDay });
  const [zone, setZone] = useState("all");
  const [scope, setScope] = useState<BusinessScope>("shift");
  const months = useMemo(() => monthKeys(), []);
  const report = useQuery({
    queryKey: ["business-report", period.start, period.end, zone, scope],
    queryFn: () => reportFn({ data: { start: period.start, end: period.end, zone, scope } }),
    refetchInterval: 60_000,
  });
  const data = report.data;
  const occupiedConfig = { minutes: { label: t("occupiedTime"), color: CHART_BLUE } } satisfies ChartConfig;
  const peopleConfig = { entries: { label: t("customerVisits"), color: CHART_ORANGE } } satisfies ChartConfig;
  const tableBars = useMemo(
    () =>
      (data?.tables ?? []).map((table) => ({
        name: known(table.zone.replace(/_/g, " ")),
        minutes: Math.round(table.occupiedSeconds / 60),
      })),
    [data?.tables, known],
  );
  const peopleBars = useMemo(
    () =>
      (data?.series ?? []).map((row) => ({
        label:
          data?.seriesKind === "day"
            ? new Date(`${row.key}T12:00:00+03:00`).toLocaleDateString(locale, {
                timeZone: "Asia/Riyadh",
                day: "numeric",
                month: "short",
              })
            : formatHour12(Number(row.key), lang),
        entries: row.entries,
      })),
    [data?.series, data?.seriesKind, lang, locale],
  );
  const rangeLabel = [periodText(period), scope === "shift" ? t("acScopeShiftHint") : t("acScopeAll")]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
    <div className="mt-4 rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
      <div className="flex flex-col xl:flex-row xl:items-start gap-5">
        <Field label={t("tableLabel")}>
          <Select value={zone} onValueChange={setZone}>
            <SelectTrigger className="bg-input border-border text-foreground w-full sm:w-64 [&_svg]:text-foreground [&_svg]:opacity-100">
              <SelectValue placeholder={t("allTables")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allTables")}</SelectItem>
              {(data?.zones ?? []).map((name) => (
                <SelectItem key={name} value={name}>
                  <span className="capitalize">{known(name.replace(/_/g, " "))}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("acScope")}>
          <div className="flex flex-wrap gap-1 rounded-lg bg-background/50 border border-border p-1 w-fit">
            <button
              type="button"
              onClick={() => setScope("shift")}
              className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-wider ${scope === "shift" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              {t("acScopeShift")}
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-wider ${scope === "all" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              {t("acScopeAll")}
            </button>
          </div>
        </Field>
        <div className="flex-1 space-y-1.5 min-w-0">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("period")}</Label>
          <PeriodFilter value={period} onChange={setPeriod} months={months} />
        </div>
        <div className="flex xl:flex-col justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const day = currentShiftDay();
              setPeriod({ start: day, end: day });
              setZone("all");
              setScope("shift");
            }}
          >
            {t("reset")}
          </Button>
        </div>
      </div>
    </div>
    <section className="mt-5 rounded-2xl bg-gradient-card border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent">{t("businessReport")}</p>
          <h2 className="font-display text-xl tracking-wider mt-1">{rangeLabel}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t("businessReportHint")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("occupiedNote")}</p>
          {data?.occupancyEstimated ? <p className="text-xs text-muted-foreground mt-1">{t("occupancyEstimated")}</p> : null}
          {data?.calendarCustomers ? <p className="text-xs text-muted-foreground mt-1">{t("businessCalendar")}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-input border-border shrink-0"
          disabled={report.isLoading || (data?.tables.length ?? 0) === 0}
          onClick={() => {
            if (!data) return;
            const stamp = [period.start, period.end, scope, zone].filter(Boolean).join("_");
            downloadCsv(
              `business-${stamp}.csv`,
              [t("tableLabel"), t("inRestaurant"), t("peak"), `${t("occupiedTime")} (min)`],
              data.tables.map((table) => [
                known(table.zone.replace(/_/g, " ")),
                data.current ? table.peopleNow : null,
                table.peak,
                Math.round(table.occupiedSeconds / 60),
              ]),
            );
          }}
        >
          <Download className="w-4 h-4" />
          {t("exportExcel")}
        </Button>
      </div>

      <div className="px-5 py-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("customerVisits")}</p>
          <p className="font-display text-3xl tabular-nums text-accent mt-1">{report.isLoading ? "…" : (data?.customers ?? 0).toLocaleString(locale)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("inRestaurant")}</p>
          <p className="font-display text-3xl tabular-nums mt-1">{!data?.current ? "—" : report.isLoading ? "…" : data.peopleNow.toLocaleString(locale)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("tablesInUse")}</p>
          <p className="font-display text-3xl tabular-nums mt-1">
            {!data?.current ? "—" : report.isLoading ? "…" : `${data.occupiedTables}`}
            {data?.current ? <span className="text-base font-normal text-muted-foreground"> / {data.tableCount}</span> : null}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("occupiedTime")}</p>
          <p className="font-display text-3xl tabular-nums mt-1">
            {report.isLoading
              ? "…"
              : formatDuration(data?.occupiedSeconds ?? 0, t)}
          </p>
        </div>
      </div>

      {report.isError ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("reportsError")}</p>
      ) : (
        <div className="px-3 sm:px-5 pb-5 grid gap-5 xl:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-2">{t("occupiedTime")}</p>
            <ChartContainer config={occupiedConfig} className="aspect-auto h-56 w-full">
              <BarChart data={tableBars} margin={{ left: 4, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="minutes" fill="var(--color-minutes)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ChartContainer>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-2">{t("customerVisits")}</p>
            <ChartContainer config={peopleConfig} className="aspect-auto h-56 w-full">
              <BarChart data={peopleBars} margin={{ left: 4, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={peopleBars.length > 16 ? Math.ceil(peopleBars.length / 10) : 0} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="entries" fill="var(--color-entries)" radius={[6, 6, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ChartContainer>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-5">{t("tableLabel")}</TableHead>
            <TableHead className="px-5">{t("inRestaurant")}</TableHead>
            <TableHead className="px-5">{t("peak")}</TableHead>
            <TableHead className="px-5">{t("occupiedTime")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.tables ?? []).length === 0 && !report.isLoading ? (
            <TableRow>
              <TableCell colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">
                {t("noTableUse")}
              </TableCell>
            </TableRow>
          ) : (
            (data?.tables ?? []).map((table) => (
              <TableRow key={table.zone}>
                <TableCell className="px-5 font-medium capitalize">{known(table.zone.replace(/_/g, " "))}</TableCell>
                <TableCell className="px-5 tabular-nums">{data?.current ? table.peopleNow.toLocaleString(locale) : "—"}</TableCell>
                <TableCell className="px-5 tabular-nums">{table.peak.toLocaleString(locale)}</TableCell>
                <TableCell className="px-5 tabular-nums">{formatDuration(table.occupiedSeconds, t)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
    </>
  );
}
