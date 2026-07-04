import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Power } from "lucide-react";
import { Shell } from "@/components/Shell";
import { getStates, callService, type HAState } from "@/lib/ha.functions";

export const Route = createFileRoute("/lights")({ component: LightsPage });

function LightsPage() {
  const statesFn = useServerFn(getStates);
  const callFn = useServerFn(callService);
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["ha", "states"],
    queryFn: () => statesFn(),
    refetchInterval: 5000,
  });

  const lights = data.filter((e) => e.entity_id.startsWith("light."));
  const switches = data.filter(
    (e) =>
      e.entity_id.startsWith("switch.") &&
      !e.entity_id.includes("front_cam") &&
      !e.entity_id.includes("zigbee") &&
      !e.entity_id.includes("timer") &&
      !e.entity_id.includes("climate_react") &&
      !e.entity_id.includes("breaker"),
  );
  const cameraSwitches = data.filter((e) => e.entity_id.startsWith("switch.front_cam"));

  const toggle = useMutation({
    mutationFn: (v: { entity_id: string; on: boolean }) =>
      callFn({
        data: {
          domain: v.entity_id.split(".")[0],
          service: v.on ? "turn_on" : "turn_off",
          entity_id: v.entity_id,
        },
      }),
    onMutate: (v) => {
      qc.setQueryData<HAState[]>(["ha", "states"], (old) =>
        (old ?? []).map((s) =>
          s.entity_id === v.entity_id ? { ...s, state: v.on ? "on" : "off" } : s,
        ),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ha", "states"] }),
  });

  return (
    <Shell title="Lights & Switches" subtitle="Toggle any HA-controlled device on the property.">
      <Group title="Lighting" items={lights} onToggle={toggle.mutate} kind="light" />
      <div className="mt-8">
        <Group title="Switches" items={switches} onToggle={toggle.mutate} kind="switch" />
      </div>
      <div className="mt-8">
        <Group
          title="Camera controls"
          items={cameraSwitches}
          onToggle={toggle.mutate}
          kind="switch"
        />
      </div>
    </Shell>
  );
}

function Group({
  title,
  items,
  onToggle,
}: {
  title: string;
  items: HAState[];
  onToggle: (v: { entity_id: string; on: boolean }) => void;
  kind: "light" | "switch";
}) {
  return (
    <section>
      <h2 className="font-display text-2xl tracking-wider mb-3">{title}</h2>
      {items.length === 0 && (
        <div className="text-sm text-muted-foreground">Nothing to show.</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.map((e) => {
          const on = e.state === "on";
          return (
            <button
              key={e.entity_id}
              onClick={() => onToggle({ entity_id: e.entity_id, on: !on })}
              aria-pressed={on}
              className={`text-left rounded-2xl border p-5 transition-all shadow-soft ${
                on
                  ? "bg-gradient-brand border-primary shadow-glow"
                  : "bg-gradient-card border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-12 h-12 rounded-xl grid place-items-center ${
                    on ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {e.entity_id.startsWith("light.") ? (
                    <Lightbulb className="w-6 h-6" />
                  ) : (
                    <Power className="w-6 h-6" />
                  )}
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    on ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {on ? "On" : "Off"}
                </span>
              </div>
              <div
                className={`mt-4 font-medium ${on ? "text-primary-foreground" : "text-foreground"}`}
              >
                {e.attributes.friendly_name ?? e.entity_id}
              </div>
              <div
                className={`text-[11px] mt-1 ${
                  on ? "text-primary-foreground/70" : "text-muted-foreground"
                }`}
              >
                {e.entity_id}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
