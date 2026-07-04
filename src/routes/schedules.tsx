import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Zap } from "lucide-react";
import { Shell } from "@/components/Shell";
import { getStates, callService } from "@/lib/ha.functions";

export const Route = createFileRoute("/schedules")({ component: SchedulesPage });

function SchedulesPage() {
  const statesFn = useServerFn(getStates);
  const callFn = useServerFn(callService);
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["ha", "states"],
    queryFn: () => statesFn(),
    refetchInterval: 6000,
  });

  const automations = data.filter((e) => e.entity_id.startsWith("automation."));

  const toggle = useMutation({
    mutationFn: (v: { entity_id: string; on: boolean }) =>
      callFn({
        data: {
          domain: "automation",
          service: v.on ? "turn_on" : "turn_off",
          entity_id: v.entity_id,
        },
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ha", "states"] }),
  });

  const trigger = useMutation({
    mutationFn: (entity_id: string) =>
      callFn({ data: { domain: "automation", service: "trigger", entity_id } }),
  });

  return (
    <Shell
      title="Schedules"
      subtitle="Automations from Home Assistant — lighting on/off, timers and routines."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {automations.map((a) => {
          const on = a.state === "on";
          const attrs = a.attributes as {
            friendly_name?: string;
            last_triggered?: string | null;
          };
          return (
            <div
              key={a.entity_id}
              className="rounded-2xl bg-gradient-card border border-border p-6 shadow-soft"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl grid place-items-center ${
                      on ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-display text-xl tracking-wider">
                      {(attrs.friendly_name ?? a.entity_id).trim()}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{a.entity_id}</div>
                  </div>
                </div>
                <Toggle on={on} onChange={(next) => toggle.mutate({ entity_id: a.entity_id, on: next })} label={a.entity_id} />

              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                Last triggered:{" "}
                <span className="text-foreground">
                  {attrs.last_triggered
                    ? new Date(attrs.last_triggered).toLocaleString()
                    : "never"}
                </span>
              </div>
              <button
                onClick={() => trigger.mutate(a.entity_id)}
                className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium"
              >
                <Zap className="w-4 h-4" /> Run now
              </button>
            </div>
          );
        })}
        {!automations.length && (
          <div className="text-sm text-muted-foreground">No automations found.</div>
        )}
      </div>

      <div className="mt-8 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
        <h2 className="font-display text-2xl tracking-wider mb-2">Create new schedule</h2>
        <p className="text-sm text-muted-foreground">
          New automations are created in Home Assistant directly (Settings → Automations). Once
          saved they appear here automatically and can be toggled or triggered from this panel.
        </p>
      </div>
    </Shell>
  );
}
