import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Zap } from "lucide-react";
import { Shell } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";
import { Toggle } from "@/components/Toggle";
import { getStates, callService } from "@/lib/ha.functions";
import { getGateStatus } from "@/lib/gate.functions";

export const Route = createFileRoute("/schedules")({
  beforeLoad: async () => {
    try {
      const status = await getGateStatus();
      if (!status.unlocked || status.role !== "admin") {
        throw redirect({ to: "/branch" });
      }
    } catch (err) {
      throw redirect({ to: "/login" });
    }
  },
  component: SchedulesPage,
});

function SchedulesPage() {
  const { t, locale, known } = useI18n();
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
    <Shell title={t("navSchedules")}>
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
                      {known((attrs.friendly_name ?? a.entity_id).trim())}
                    </div>
                  </div>
                </div>
                <Toggle on={on} onChange={(next) => toggle.mutate({ entity_id: a.entity_id, on: next })} label={known(attrs.friendly_name ?? t("schedule"))} />

              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                {t("lastTriggered")}{" "}
                <span className="text-foreground">
                  {attrs.last_triggered
                    ? new Date(attrs.last_triggered).toLocaleString(locale, { timeZone: "Asia/Riyadh" })
                    : t("never")}
                </span>
              </div>
              <button
                onClick={() => trigger.mutate(a.entity_id)}
                className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium"
              >
                <Zap className="w-4 h-4" /> {t("runNow")}
              </button>
            </div>
          );
        })}
        {!automations.length && (
          <div className="text-sm text-muted-foreground">{t("noAutomations")}</div>
        )}
      </div>
    </Shell>
  );
}
