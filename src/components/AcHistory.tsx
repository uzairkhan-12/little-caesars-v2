import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv } from "@/lib/csv";
import { getAcHistory } from "@/lib/energy-reports.functions";
import { useI18n } from "@/lib/i18n";

const PAGE = 12;

function formatWhen(key: string, locale: string) {
  const stamp = key.length === 16 ? `${key}:00` : key;
  return new Date(`${stamp}+03:00`).toLocaleString(locale, {
    timeZone: "Asia/Riyadh",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTemp(value: number | null, locale: string) {
  if (value == null) return "—";
  return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}°C`;
}

function formatMode(mode: string | null | undefined, known: (text: string) => string) {
  if (!mode) return "—";
  return known(mode.replace(/_/g, " "));
}

function formatDelta(value: number | null, locale: string) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString(locale, { maximumFractionDigits: 1 })}°`;
}

export function AcHistoryDialog({
  open,
  onOpenChange,
  entityId,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  name: string;
}) {
  const { t, locale, known } = useI18n();
  const historyFn = useServerFn(getAcHistory);
  const [tab, setTab] = useState<"log" | "changes">("log");
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ["ac-history", entityId],
    enabled: open,
    refetchInterval: 60_000,
    queryFn: () => historyFn({ data: { entityId } }),
  });
  const logs = history.data?.logs ?? [];
  const changes = history.data?.changes ?? [];
  const rows = tab === "log" ? logs : changes;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, pageCount);
  const from = rows.length === 0 ? 0 : (safePage - 1) * PAGE + 1;
  const to = Math.min(rows.length, safePage * PAGE);
  const pageRows = rows.slice((safePage - 1) * PAGE, safePage * PAGE);

  useEffect(() => {
    setPage(1);
  }, [tab, entityId]);

  const exportRows = () => {
    const stamp = entityId.replace(/^climate\./, "");
    if (tab === "log") {
      downloadCsv(
        `ac-history-${stamp}.csv`,
        [t("day"), t("hvacMode"), `${t("readingTemp")} (°C)`, `${t("target")} (°C)`, `${t("consumption")} (kWh)`],
        logs.map((row) => [
          formatWhen(row.slotKey, locale),
          row.hvacMode ? formatMode(row.hvacMode, known) : null,
          row.readingTemp,
          row.targetTemp,
          row.consumption == null ? null : Math.round(row.consumption * 100) / 100,
        ]),
      );
      return;
    }
    downloadCsv(
      `ac-changes-${stamp}.csv`,
      [t("day"), t("hvacMode"), `${t("readingTemp")} (°C)`, t("roomChange"), `${t("target")} (°C)`, t("targetChange")],
      changes.map((row) => [
        formatWhen(row.atKey, locale),
        row.hvacMode ? formatMode(row.hvacMode, known) : null,
        row.readingTemp,
        row.readingDelta,
        row.targetTemp,
        row.targetDelta,
      ]),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col gap-4">
        <DialogHeader className="pe-8 text-start">
          <DialogTitle className="font-display tracking-wider">{name}</DialogTitle>
          <DialogDescription>{t("acHistoryHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-background/50 border border-border p-1 w-fit">
            <button
              type="button"
              onClick={() => setTab("log")}
              className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-wider ${tab === "log" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              {t("acLog")}
            </button>
            <button
              type="button"
              onClick={() => setTab("changes")}
              className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-wider ${tab === "changes" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              {t("acChanges")}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-input border-border"
            disabled={history.isLoading || rows.length === 0}
            onClick={exportRows}
          >
            <Download className="w-4 h-4" />
            {t("exportExcel")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              {tab === "log" ? (
                <TableRow>
                  <TableHead className="px-4">{t("day")}</TableHead>
                  <TableHead className="px-4">{t("hvacMode")}</TableHead>
                  <TableHead className="px-4">{t("readingTemp")}</TableHead>
                  <TableHead className="px-4">{t("target")}</TableHead>
                  <TableHead className="px-4">{t("consumption")}</TableHead>
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead className="px-4">{t("day")}</TableHead>
                  <TableHead className="px-4">{t("hvacMode")}</TableHead>
                  <TableHead className="px-4">{t("readingTemp")}</TableHead>
                  <TableHead className="px-4">{t("roomChange")}</TableHead>
                  <TableHead className="px-4">{t("target")}</TableHead>
                  <TableHead className="px-4">{t("targetChange")}</TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {history.isLoading && (
                <TableRow>
                  <TableCell colSpan={tab === "log" ? 5 : 6} className="px-4 py-10 text-center text-muted-foreground">
                    {t("loading")}
                  </TableCell>
                </TableRow>
              )}
              {history.isError && (
                <TableRow>
                  <TableCell colSpan={tab === "log" ? 5 : 6} className="px-4 py-10 text-center text-muted-foreground">
                    {t("reportsError")}
                  </TableCell>
                </TableRow>
              )}
              {!history.isLoading && !history.isError && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={tab === "log" ? 5 : 6} className="px-4 py-10 text-center text-muted-foreground">
                    {tab === "log" ? t("acLogEmpty") : t("acChangeEmpty")}
                  </TableCell>
                </TableRow>
              )}
              {tab === "log"
                ? logs.slice((safePage - 1) * PAGE, safePage * PAGE).map((row) => (
                    <TableRow key={row.slotKey}>
                      <TableCell className="px-4 text-muted-foreground tabular-nums">{formatWhen(row.slotKey, locale)}</TableCell>
                      <TableCell className="px-4 capitalize">{formatMode(row.hvacMode, known)}</TableCell>
                      <TableCell className="px-4 tabular-nums">{formatTemp(row.readingTemp, locale)}</TableCell>
                      <TableCell className="px-4 tabular-nums">{formatTemp(row.targetTemp, locale)}</TableCell>
                      <TableCell className="px-4 tabular-nums font-semibold">
                        {row.consumption == null ? "—" : `${row.consumption.toFixed(2)} kWh`}
                      </TableCell>
                    </TableRow>
                  ))
                : changes.slice((safePage - 1) * PAGE, safePage * PAGE).map((row) => (
                    <TableRow key={row.atKey}>
                      <TableCell className="px-4 text-muted-foreground tabular-nums">{formatWhen(row.atKey, locale)}</TableCell>
                      <TableCell className="px-4 capitalize">{formatMode(row.hvacMode, known)}</TableCell>
                      <TableCell className="px-4 tabular-nums">{formatTemp(row.readingTemp, locale)}</TableCell>
                      <TableCell className="px-4 tabular-nums">{formatDelta(row.readingDelta, locale)}</TableCell>
                      <TableCell className="px-4 tabular-nums">{formatTemp(row.targetTemp, locale)}</TableCell>
                      <TableCell className="px-4 tabular-nums">{formatDelta(row.targetDelta, locale)}</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {rows.length === 0 ? t("noRows") : t("showingRows", { from, to, total: rows.length })}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="bg-input border-border" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              {t("previous")}
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground min-w-[7rem] text-center">
              {t("pageOf", { page: safePage, pages: pageCount })}
            </span>
            <Button type="button" variant="outline" size="sm" className="bg-input border-border" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
              {t("next")}
              <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
