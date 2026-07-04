import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Snowflake, Sun, Wind, Flame, Power, Minus, Plus } from "lucide-react";
import { Shell } from "@/components/Shell";
import { getStates, callService, type HAState } from "@/lib/ha.functions";

export const Route = createFileRoute("/climate")({ component: ClimatePage });

const modeIcons: Record<string, typeof Snowflake> = {
  cool: Snowflake,
  heat: Flame,
  fan_only: Wind,
  dry: Sun,
  off: Power,
  auto: Sun,
};

function ClimatePage() {
  const statesFn = useServerFn(getStates);
  const callFn = useServerFn(callService);
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["ha", "states"],
    queryFn: () => statesFn(),
    refetchInterval: 5000,
  });
  const climates = data.filter((e) => e.entity_id.startsWith("climate."));

  const setTemp = useMutation({
    mutationFn: (v: { entity_id: string; temperature: number }) =>
      callFn({
        data: {
          domain: "climate",
          service: "set_temperature",
          entity_id: v.entity_id,
          data: { temperature: v.temperature },
        },
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ha", "states"] }),
  });

  const setMode = useMutation({
    mutationFn: (v: { entity_id: string; hvac_mode: string }) =>
      callFn({
        data: {
          domain: "climate",
          service: "set_hvac_mode",
          entity_id: v.entity_id,
          data: { hvac_mode: v.hvac_mode },
        },
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ha", "states"] }),
  });

  return (
    <Shell title="Climate" subtitle="Manage air conditioners across the restaurant.">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {climates.map((c) => {
          const mode = c.state;
          const attrs = c.attributes as {
            temperature?: number;
            current_temperature?: number;
            hvac_modes?: string[];
            min_temp?: number;
            max_temp?: number;
            friendly_name?: string;
          };
          const target = Number(attrs.temperature ?? 22);
          const current = Number(attrs.current_temperature ?? target);
          const modes = attrs.hvac_modes ?? ["off", "cool", "heat", "fan_only", "dry"];
          const Icon = modeIcons[mode] ?? Snowflake;
          const active = mode !== "off";
          return (
            <div
              key={c.entity_id}
              className={`rounded-2xl border p-6 shadow-soft ${
                active
                  ? "bg-gradient-card border-primary/30"
                  : "bg-gradient-card border-border opacity-80"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {mode}
                  </div>
                  <div className="font-display text-2xl tracking-wider mt-1">
                    {attrs.friendly_name ?? c.entity_id}
                  </div>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl grid place-items-center ${
                    active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Current
                  </div>
                  <div className="font-display text-4xl tabular-nums">{current}°</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setTemp.mutate({ entity_id: c.entity_id, temperature: target - 1 })
                    }
                    className="w-10 h-10 rounded-full bg-muted hover:bg-primary/20 hover:text-primary grid place-items-center"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="text-center min-w-[70px]">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Target
                    </div>
                    <div className="font-display text-3xl text-primary tabular-nums">
                      {target}°
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setTemp.mutate({ entity_id: c.entity_id, temperature: target + 1 })
                    }
                    className="w-10 h-10 rounded-full bg-muted hover:bg-primary/20 hover:text-primary grid place-items-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {modes.map((m) => {
                  const MI = modeIcons[m] ?? Sun;
                  const on = m === mode;
                  return (
                    <button
                      key={m}
                      onClick={() => setMode.mutate({ entity_id: c.entity_id, hvac_mode: m })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs capitalize transition-colors ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <MI className="w-3.5 h-3.5" />
                      {m.replace("_", " ")}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!climates.length && (
          <div className="text-sm text-muted-foreground">No climate entities.</div>
        )}
      </div>
    </Shell>
  );
}

// Keep HAState in scope for tree-shake safety
export type _HAState = HAState;
