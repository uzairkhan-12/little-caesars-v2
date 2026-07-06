import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";


import {
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Activity,
  Lightbulb,
  Video,
  Snowflake,
  Sun,
  Wind,
  Flame,
  Power,
  Minus,
  Plus,
  Zap,
  Thermometer,
  X,
  Maximize2,

} from "lucide-react";
import { Shell } from "@/components/Shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/Toggle";
import { getSummary } from "@/lib/lc.functions";
import { getStates, callService, type HAState } from "@/lib/ha.functions";

export const Route = createFileRoute("/")({ component: Home });

const modeIcons: Record<string, typeof Snowflake> = {
  cool: Snowflake,
  heat: Flame,
  fan_only: Wind,
  dry: Sun,
  off: Power,
  auto: Sun,
};

function Home() {
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
    refetchInterval: 6000,
  });

  const call = useMutation({
    mutationFn: (v: { domain: string; service: string; entity_id: string; data?: Record<string, unknown> }) =>
      callFn({ data: v }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ha", "states"] }),
  });

  const data = states.data ?? [];
  const climates = data.filter((e) => e.entity_id.startsWith("climate."));
  const lights = data.filter((e) => e.entity_id.startsWith("light."));
  const cameras = data.filter((e) => e.entity_id.startsWith("camera."));
  const power = data.find((e) => e.entity_id === "sensor.smart_energy_breaker_power");
  const voltage = data.find((e) => e.entity_id === "sensor.smart_energy_breaker_voltage");
  const energy = data.find((e) => e.entity_id === "sensor.smart_energy_breaker_energy");
  const breakerTemp = data.find((e) => e.entity_id === "sensor.smart_energy_breaker_temperature");
  const weather = data.find((e) => e.entity_id.startsWith("weather."));

  const s = summary.data;
  const total = s?.counts.total ?? 0;
  const today = s?.today;

  return (
    <Shell>
      {/* KPI row */}
      <section>
        <SectionHeader title="Live overview" hint="Refreshes every few seconds" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="In restaurant" value={total} hint={`${s?.counts.zones.length ?? 0} zones`} tone="primary" />
          <StatCard icon={ArrowUpRight} label="Entries today" value={today?.entries ?? 0} hint={today?.date ?? ""} tone="primary" />
          <StatCard icon={ArrowDownRight} label="Exits today" value={today?.exits ?? 0} hint={today?.date ?? ""} tone="accent" />
          <StatCard icon={Activity} label="Visits" value={today?.visits ?? 0} hint="Logged today" tone="primary" />
        </div>
      </section>

      {/* Climate section */}
      <section className="mt-10">
        <SectionHeader title="Climate control" hint={`${climates.filter((c) => c.state !== "off").length} of ${climates.length} running`} />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {climates.map((c) => (
            <ClimateCard
              key={c.entity_id}
              c={c}
              onTemp={(t) =>
                call.mutate({
                  domain: "climate",
                  service: "set_temperature",
                  entity_id: c.entity_id,
                  data: { temperature: t },
                })
              }
              onMode={(m) =>
                call.mutate({
                  domain: "climate",
                  service: "set_hvac_mode",
                  entity_id: c.entity_id,
                  data: { hvac_mode: m },
                })
              }
              onFan={(f) =>
                call.mutate({
                  domain: "climate",
                  service: "set_fan_mode",
                  entity_id: c.entity_id,
                  data: { fan_mode: f },
                })
              }
              onSwing={(s) =>
                call.mutate({
                  domain: "climate",
                  service: "set_swing_mode",
                  entity_id: c.entity_id,
                  data: { swing_mode: s },
                })
              }
            />
          ))}
          {!climates.length && <EmptyCard label="No climate entities" />}
        </div>
      </section>

      {/* Lighting row */}
      <section className="mt-10">
        <SectionHeader title="Lighting" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {lights.map((l) => {
            const on = l.state === "on";
            return (
              <div
                key={l.entity_id}
                className={`rounded-2xl border p-5 shadow-soft transition-all ${
                  on ? "bg-gradient-brand border-primary shadow-glow" : "bg-gradient-card border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl grid place-items-center ${on ? "bg-white/20" : "bg-muted"}`}>
                      <Lightbulb className={`w-6 h-6 ${on ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className={`font-medium ${on ? "text-primary-foreground" : ""}`}>
                        {l.attributes.friendly_name ?? l.entity_id}
                      </div>
                      <div className={`text-[11px] ${on ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {on ? "On" : "Off"}
                      </div>
                    </div>
                  </div>
                  <Toggle
                    on={on}
                    onChange={(next) =>
                      call.mutate({
                        domain: "light",
                        service: next ? "turn_on" : "turn_off",
                        entity_id: l.entity_id,
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
          {!lights.length && <EmptyCard label="No lights" />}
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat icon={Zap} label="Power" value={power ? `${power.state} W` : "—"} />
          <MiniStat icon={Activity} label="Voltage" value={voltage ? `${voltage.state} V` : "—"} />
          <MiniStat icon={Thermometer} label="Breaker" value={breakerTemp ? `${breakerTemp.state}°C` : "—"} />
          <MiniStat icon={Sun} label="Weather" value={weather ? String(weather.state) : "—"} />
        </div>
      </section>

      {/* Cameras row */}
      <section className="mt-10">
        <SectionHeader title="Live cameras" hint={`${cameras.length} online`} />
        {cameras.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cameras.map((c) => (
              <CameraTile key={c.entity_id} cam={c} />
            ))}
          </div>
        ) : (
          <EmptyCard label="No camera" />
        )}
      </section>

      {/* Zones + energy summary */}
      <section className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <SectionHeader title="Zone occupancy" hint="Live from Frigate" inline />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {s?.counts.zones.map((z) => {
              const count = s.counts.counts[z] ?? 0;
              return (
                <div key={z} className="rounded-xl bg-card border border-border p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {z.replace(/_/g, " ")}
                  </div>
                  <div className="flex items-end justify-between mt-1">
                    <div className="font-display text-4xl tabular-nums">{count}</div>
                    <div
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        count > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {count > 0 ? "busy" : "empty"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <SectionHeader title="Energy" hint="Smart breaker" inline />
          <div className="space-y-4">
            <BigMetric label="Power draw" value={power ? `${power.state}` : "0"} unit="W" tone="primary" />
            <BigMetric label="Total energy" value={energy ? `${energy.state}` : "0"} unit="kWh" tone="accent" />
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
              <MiniStat icon={Activity} label="Voltage" value={voltage ? `${voltage.state} V` : "—"} />
              <MiniStat icon={Thermometer} label="Temp" value={breakerTemp ? `${breakerTemp.state}°C` : "—"} />
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}

function SectionHeader({
  title,
  hint,
  inline,
}: {
  title: string;
  hint?: string;
  inline?: boolean;
}) {
  return (
    <div className={`flex items-end justify-between ${inline ? "mb-4" : "mb-4"}`}>
      <h2 className="font-display text-2xl tracking-wider">{title}</h2>
      {hint && <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{hint}</span>}
    </div>
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
  const tint = {
    primary: "from-primary/25 to-primary/5 text-primary",
    success: "from-success/25 to-success/5 text-success",
    warning: "from-warning/25 to-warning/5 text-warning",
    accent: "from-accent/25 to-accent/5 text-accent",
  } as const;
  return (
    <div className="relative rounded-2xl bg-gradient-card border border-border p-5 shadow-soft overflow-hidden">
      <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br ${tint[tone]} blur-2xl opacity-70`} />
      <div className="relative flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${tint[tone].split(" ").pop()}`} />
      </div>
      <div className="relative font-display text-5xl tabular-nums">{value}</div>
      {hint && <div className="relative text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center text-muted-foreground">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

function BigMetric({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "primary" | "accent";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-display text-4xl tabular-nums ${tone === "primary" ? "text-primary" : "text-accent"}`}>
          {value}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl bg-gradient-card border border-border p-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ClimateCard({
  c,
  onTemp,
  onMode,
  onFan,
  onSwing,
}: {
  c: HAState;
  onTemp: (t: number) => void;
  onMode: (m: string) => void;
  onFan: (f: string) => void;
  onSwing: (s: string) => void;
}) {
  const mode = c.state;
  const attrs = c.attributes as {
    temperature?: number;
    current_temperature?: number;
    current_humidity?: number;
    hvac_modes?: string[];
    fan_mode?: string;
    fan_modes?: string[];
    swing_mode?: string;
    swing_modes?: string[];
    friendly_name?: string;
  };
  const target = Number(attrs.temperature ?? 22);
  const current = Number(attrs.current_temperature ?? target);
  const humidity = attrs.current_humidity;
  const modes = attrs.hvac_modes ?? ["off", "cool", "heat", "fan_only", "dry"];
  const fanModes = attrs.fan_modes ?? [];
  const swingModes = attrs.swing_modes ?? [];
  const fanMode = attrs.fan_mode;
  const swingMode = attrs.swing_mode;
  const Icon = modeIcons[mode] ?? Snowflake;
  const active = mode !== "off";

  const accentText = "text-primary";
  const accentBg = "bg-primary/20 text-primary";
  const accentBorder = "border-primary/40";
  const accentGradient = "bg-gradient-to-br from-primary/15 via-primary/5 to-transparent";
  const modePillOn = "bg-primary text-primary-foreground";
  const hoverTint = "hover:bg-primary/20 hover:text-primary";

  const fmt = (s: string) => s.replace(/_/g, " ");

  return (
    <div
      className={`rounded-2xl border p-5 shadow-soft transition-all ${
        active ? `${accentGradient} ${accentBorder}` : "bg-gradient-card border-border opacity-90"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className={`text-[10px] uppercase tracking-wider ${active && cool ? "text-sky-300/80" : "text-muted-foreground"}`}>{mode}</div>
          <div className="font-display text-lg tracking-wider truncate">
            {attrs.friendly_name ?? c.entity_id}
          </div>
        </div>
        <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${active ? accentBg : "bg-muted text-muted-foreground"}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Now</div>
          <div className="font-display text-3xl tabular-nums">{current}°</div>
          {typeof humidity === "number" && (
            <div className="text-[11px] text-muted-foreground mt-0.5">{humidity}% humidity</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onTemp(target - 1)}
            className={`w-8 h-8 rounded-full bg-muted grid place-items-center ${hoverTint}`}
            aria-label="Decrease"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <div className="text-center min-w-[56px]">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Target</div>
            <div className={`font-display text-2xl tabular-nums ${active ? accentText : "text-primary"}`}>{target}°</div>
          </div>
          <button
            onClick={() => onTemp(target + 1)}
            className={`w-8 h-8 rounded-full bg-muted grid place-items-center ${hoverTint}`}
            aria-label="Increase"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {modes.map((m) => {
          const MI = modeIcons[m] ?? Sun;
          const on = m === mode;
          const isCoolPill = m === "cool";
          const onClass = isCoolPill ? "bg-sky-500 text-white" : modePillOn;
          return (
            <button
              key={m}
              onClick={() => onMode(m)}
              title={fmt(m)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider transition-colors ${
                on ? onClass : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <MI className="w-3 h-3" />
              {fmt(m)}
            </button>
          );
        })}
      </div>

      {(fanModes.length > 0 || swingModes.length > 0) && (
        <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-3">
          {fanModes.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Wind className="w-3 h-3" /> Fan
              </label>
              <Select value={fanMode ?? ""} onValueChange={onFan}>
                <SelectTrigger className="h-8 text-xs bg-card border-border capitalize">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {fanModes.map((f) => (
                    <SelectItem key={f} value={f} className="text-xs capitalize">
                      {fmt(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {swingModes.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Activity className="w-3 h-3" /> Swing
              </label>
              <Select value={swingMode ?? ""} onValueChange={onSwing}>
                <SelectTrigger className="h-8 text-xs bg-card border-border capitalize">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {swingModes.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs capitalize">
                      {fmt(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CameraTile({ cam }: { cam: HAState }) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [full]);

  const name = cam.attributes.friendly_name ?? cam.entity_id;

  return (
    <>
      <div className="rounded-2xl overflow-hidden border border-border bg-gradient-card shadow-soft">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary grid place-items-center">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display text-lg tracking-wider">{name}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                LIVE
              </div>
            </div>
          </div>
          <button
            onClick={() => setFull(true)}
            className="w-9 h-9 rounded-lg bg-muted hover:bg-primary/20 hover:text-primary grid place-items-center transition-colors"
            aria-label="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setFull(true)}
          className="relative aspect-video bg-black w-full block group"
          aria-label={`Expand ${name}`}
        >
          <img
            src={`/api/camera/${cam.entity_id}?stream=1`}
            alt={cam.entity_id}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors grid place-items-center">
            <Maximize2 className="w-8 h-8 text-white opacity-0 group-hover:opacity-90 transition-opacity" />
          </div>
        </button>
      </div>

      {full && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in"
          onClick={() => setFull(false)}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="font-display text-xl tracking-wider">{name}</span>
              <span className="text-[11px] uppercase tracking-widest text-white/60">Live</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFull(false); }}
              className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 grid place-items-center p-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={`/api/camera/${cam.entity_id}?stream=1`}
              alt={cam.entity_id}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}


