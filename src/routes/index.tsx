import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Activity,
  Lightbulb,
  Video,
  Snowflake,
  Zap,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { getSummary } from "@/lib/lc.functions";
import { getStates, callService } from "@/lib/ha.functions";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const summaryFn = useServerFn(getSummary);
  const statesFn = useServerFn(getStates);
  const callFn = useServerFn(callService);
  const qc = useQueryClient();

  const summary = useQuery({
    queryKey: ["lc", "summary"],
    queryFn: () => summaryFn(),
    refetchInterval: 5000,
  });
  const states = useQuery({
    queryKey: ["ha", "states"],
    queryFn: () => statesFn(),
    refetchInterval: 8000,
  });

  const toggle = useMutation({
    mutationFn: (v: { entity_id: string; on: boolean }) =>
      callFn({
        data: {
          domain: v.entity_id.split(".")[0],
          service: v.on ? "turn_on" : "turn_off",
          entity_id: v.entity_id,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ha", "states"] }),
  });

  const s = summary.data;
  const total = s?.counts.total ?? 0;
  const today = s?.today;
  const lights = (states.data ?? []).filter((e) => e.entity_id.startsWith("light."));
  const climates = (states.data ?? []).filter((e) => e.entity_id.startsWith("climate."));
  const activeClimates = climates.filter((c) => c.state !== "off").length;
  const energy = (states.data ?? []).find(
    (e) => e.entity_id === "sensor.smart_energy_breaker_power",
  );

  return (
    <Shell title="Command Deck" subtitle="Live floor, lighting and traffic — refreshed every few seconds.">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="In restaurant now"
          value={total}
          hint={`${s?.counts.zones.length ?? 0} tracked zones`}
          tone="primary"
        />
        <StatCard
          icon={ArrowUpRight}
          label="Entries today"
          value={today?.entries ?? 0}
          hint={today?.date ?? ""}
          tone="success"
        />
        <StatCard
          icon={ArrowDownRight}
          label="Exits today"
          value={today?.exits ?? 0}
          hint={today?.date ?? ""}
          tone="warning"
        />
        <StatCard
          icon={Activity}
          label="Visits logged"
          value={today?.visits ?? 0}
          hint="Includes ambiguous"
          tone="accent"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-2xl tracking-wider">Zone occupancy</h2>
              <p className="text-xs text-muted-foreground">Live from Frigate detections</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-success/15 text-success flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Live
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {s?.counts.zones.map((z) => {
              const count = s.counts.counts[z] ?? 0;
              return (
                <div
                  key={z}
                  className="rounded-xl bg-card border border-border p-4 flex flex-col gap-2 relative overflow-hidden"
                >
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {z.replace(/_/g, " ")}
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="font-display text-5xl tabular-nums">{count}</div>
                    <div
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        count > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {count > 0 ? "occupied" : "empty"}
                    </div>
                  </div>
                </div>
              );
            })}
            {!s?.counts.zones.length && (
              <div className="col-span-full text-sm text-muted-foreground">Loading zones…</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-2xl tracking-wider">Quick controls</h2>
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-3">
            {lights.map((l) => {
              const on = l.state === "on";
              return (
                <div
                  key={l.entity_id}
                  className="flex items-center justify-between rounded-xl bg-card border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg grid place-items-center ${
                        on ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        {l.attributes.friendly_name ?? l.entity_id}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {on ? "On" : "Off"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggle.mutate({ entity_id: l.entity_id, on: !on })}
                    aria-pressed={on}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      on ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        on ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
            {!lights.length && (
              <div className="text-sm text-muted-foreground">No lights discovered.</div>
            )}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <MiniStat icon={Snowflake} label="AC on" value={`${activeClimates}/${climates.length}`} />
              <MiniStat
                icon={Zap}
                label="Power"
                value={energy ? `${energy.state}W` : "—"}
              />
              <Link
                to="/camera"
                className="rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 p-3 flex flex-col items-center gap-1 text-primary transition-colors"
              >
                <Video className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider">Camera</span>
              </Link>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <h2 className="font-display text-2xl tracking-wider mb-4">Traffic today</h2>
          <HourlyChart hourly={s?.hourly ?? []} />
        </section>
        <section className="rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl tracking-wider">Recent events</h2>
            <Link to="/statistics" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          <ul className="space-y-2 max-h-80 overflow-auto pr-1">
            {(s?.events ?? []).map((e) => (
              <li
                key={e.event_id}
                className="flex items-center gap-3 text-sm p-2.5 rounded-lg hover:bg-muted/40"
              >
                <KindBadge kind={e.kind} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {e.zones.length ? e.zones.join(" · ") : "no zones"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(e.ts).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
            {!s?.events.length && (
              <li className="text-sm text-muted-foreground">No events yet.</li>
            )}
          </ul>
        </section>
      </div>
    </Shell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  hint?: string;
  tone: "primary" | "success" | "warning" | "accent";
}) {
  const toneMap = {
    primary: "from-primary/25 to-primary/5 text-primary",
    success: "from-success/25 to-success/5 text-success",
    warning: "from-warning/25 to-warning/5 text-warning",
    accent: "from-accent/25 to-accent/5 text-accent",
  } as const;
  return (
    <div className="relative rounded-2xl bg-gradient-card border border-border p-5 shadow-soft overflow-hidden">
      <div
        className={`absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br ${toneMap[tone]} blur-2xl opacity-70`}
      />
      <div className="relative flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <Icon className={`w-4 h-4 ${toneMap[tone].split(" ").pop()}`} />
      </div>
      <div className="relative font-display text-5xl tabular-nums">{value}</div>
      {hint && <div className="relative text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-card border border-border p-3 flex flex-col items-center gap-1">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function KindBadge({ kind }: { kind: "entry" | "exit" | "visit" }) {
  const map = {
    entry: { c: "bg-success/15 text-success", I: ArrowUpRight },
    exit: { c: "bg-warning/15 text-warning", I: ArrowDownRight },
    visit: { c: "bg-muted text-muted-foreground", I: Activity },
  } as const;
  const { c, I } = map[kind];
  return (
    <span className={`w-8 h-8 rounded-lg grid place-items-center ${c}`}>
      <I className="w-4 h-4" />
    </span>
  );
}

function HourlyChart({
  hourly,
}: {
  hourly: Array<{ hour: number; entries: number; exits: number; visits: number }>;
}) {
  const max = Math.max(1, ...hourly.map((h) => h.entries + h.exits + h.visits));
  return (
    <div>
      <div className="flex items-end gap-1 h-48">
        {hourly.map((h) => {
          const total = h.entries + h.exits + h.visits;
          const pct = (total / max) * 100;
          return (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-t bg-gradient-brand transition-all"
                  style={{ height: `${pct}%`, minHeight: total ? 2 : 0 }}
                  title={`${h.hour}:00 · ${total} events`}
                />
              </div>
              <div className="text-[9px] text-muted-foreground tabular-nums">
                {h.hour % 3 === 0 ? h.hour : ""}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">
        <span>00:00 UTC</span>
        <span>Events per hour</span>
        <span>23:00 UTC</span>
      </div>
    </div>
  );
}
