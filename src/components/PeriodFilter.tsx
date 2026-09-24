import { useMemo, useState } from "react";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { endOfMonth, format, parse, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PeriodValue = {
  start: string;
  end: string;
};

const TZ = "Asia/Riyadh";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function riyadhToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromKey(key: string) {
  return parse(key, "yyyy-MM-dd", new Date());
}

function monthLastKey(month: string) {
  return toKey(endOfMonth(parse(`${month}-01`, "yyyy-MM-dd", new Date())));
}

function isSameMonthRange(start: string, end: string) {
  return Boolean(start && end && start.slice(0, 7) === end.slice(0, 7) && start.endsWith("-01") && end === monthLastKey(start.slice(0, 7)));
}

function formatMonthLabel(month: string) {
  return format(parse(`${month}-01`, "yyyy-MM-dd", new Date()), "MMMM yyyy");
}

function formatRangeLabel(start: string, end: string) {
  if (!start && !end) return "All time";
  if (start && end && start === end) return format(fromKey(start), "d MMM yyyy");
  if (isSameMonthRange(start, end)) return formatMonthLabel(start.slice(0, 7));
  if (start && end) return `${format(fromKey(start), "d MMM yyyy")} – ${format(fromKey(end), "d MMM yyyy")}`;
  if (start) return `From ${format(fromKey(start), "d MMM yyyy")}`;
  return `Until ${format(fromKey(end), "d MMM yyyy")}`;
}

function presetsFor(today: Date): Array<{ id: string; label: string; start: string; end: string }> {
  const todayKey = toKey(today);
  return [
    { id: "all", label: "All time", start: "", end: "" },
    { id: "today", label: "Today", start: todayKey, end: todayKey },
    { id: "7d", label: "Last 7 days", start: toKey(subDays(today, 6)), end: todayKey },
    { id: "this-month", label: "This month", start: toKey(startOfMonth(today)), end: todayKey },
    { id: "last-month", label: "Last month", start: toKey(startOfMonth(subMonths(today, 1))), end: toKey(endOfMonth(subMonths(today, 1))) },
    { id: "year", label: "This year", start: toKey(startOfYear(today)), end: todayKey },
  ];
}

function activePresetId(value: PeriodValue, today: Date) {
  const list = presetsFor(today);
  return list.find((p) => p.start === value.start && p.end === value.end)?.id ?? (value.start || value.end ? "custom" : "all");
}

export function periodLabel(value: PeriodValue) {
  return formatRangeLabel(value.start, value.end);
}

export function PeriodFilter({
  value,
  onChange,
  months,
}: {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
  months: string[];
}) {
  const today = useMemo(() => riyadhToday(), []);
  const presetId = activePresetId(value, today);
  const presets = useMemo(() => presetsFor(today), [today]);
  const selectedMonth = isSameMonthRange(value.start, value.end) ? value.start.slice(0, 7) : "";
  const [monthOpen, setMonthOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [monthYear, setMonthYear] = useState(() => {
    const newest = [...months].sort().at(-1);
    return Number((selectedMonth || newest || toKey(today)).slice(0, 4));
  });
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() =>
    value.start && value.end ? { from: fromKey(value.start), to: fromKey(value.end) } : undefined,
  );

  const orderedMonths = useMemo(() => [...new Set(months)].sort(), [months]);
  const oldestMonth = orderedMonths[0];
  const newestMonth = orderedMonths.at(-1);

  const years = useMemo(() => {
    const set = new Set(orderedMonths.map((m) => Number(m.slice(0, 4))));
    set.add(today.getFullYear());
    return [...set].sort((a, b) => a - b);
  }, [orderedMonths, today]);

  const monthHasData = useMemo(() => new Set(orderedMonths), [orderedMonths]);

  const applyRange = (range: DateRange | undefined) => {
    setDraftRange(range);
    if (!range?.from || !range.to) return;
    const start = range.from <= range.to ? range.from : range.to;
    const end = range.from <= range.to ? range.to : range.from;
    onChange({ start: toKey(start), end: toKey(end) });
  };

  const pickMonth = (month: string) => {
    onChange({ start: `${month}-01`, end: monthLastKey(month) });
    setMonthOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={presetId === p.id ? "default" : "outline"}
            className={presetId === p.id ? undefined : "bg-input border-border"}
            onClick={() => {
              onChange({ start: p.start, end: p.end });
              setDraftRange(p.start && p.end ? { from: fromKey(p.start), to: fromKey(p.end) } : undefined);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Popover
          open={monthOpen}
          onOpenChange={(open) => {
            setMonthOpen(open);
            if (open) setMonthYear(Number((selectedMonth || newestMonth || toKey(today)).slice(0, 4)));
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-11 justify-between bg-input border-border font-normal",
                selectedMonth ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate">{selectedMonth ? formatMonthLabel(selectedMonth) : "Specific month"}</span>
              <CalendarIcon className="h-4 w-4 shrink-0 text-foreground opacity-100" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-4 bg-popover border-border">
            <div className="flex items-center justify-between mb-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={years.length > 0 && monthYear <= years[0]}
                onClick={() => setMonthYear((y) => y - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-display text-xl tracking-wider">{monthYear}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={years.length > 0 && monthYear >= years[years.length - 1]}
                onClick={() => setMonthYear((y) => y + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, i) => {
                const month = `${monthYear}-${pad(i + 1)}`;
                const enabled = monthHasData.has(month);
                const active = selectedMonth === month;
                return (
                  <Button
                    key={month}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    disabled={!enabled}
                    className={cn("h-9", !active && "bg-input border-border")}
                    onClick={() => pickMonth(month)}
                  >
                    {format(new Date(monthYear, i, 1), "MMM")}
                  </Button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <Popover
          open={rangeOpen}
          onOpenChange={(open) => {
            setRangeOpen(open);
            if (open) {
              setDraftRange(value.start && value.end ? { from: fromKey(value.start), to: fromKey(value.end) } : undefined);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-11 justify-between bg-input border-border font-normal",
                presetId === "custom" || (presetId !== "all" && !selectedMonth && value.start) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate">
                {value.start && value.end && !selectedMonth && presetId === "custom"
                  ? formatRangeLabel(value.start, value.end)
                  : "Custom range"}
              </span>
              <CalendarIcon className="h-4 w-4 shrink-0 text-foreground opacity-100" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0 bg-popover border-border">
            <Calendar
              mode="range"
              numberOfMonths={1}
              captionLayout="dropdown"
              selected={draftRange}
              onSelect={applyRange}
              defaultMonth={draftRange?.from ?? today}
              startMonth={oldestMonth ? fromKey(`${oldestMonth}-01`) : new Date(today.getFullYear() - 2, 0)}
              endMonth={today}
              disabled={{ after: today }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
