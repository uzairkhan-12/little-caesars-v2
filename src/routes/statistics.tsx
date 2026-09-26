import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Shell } from "@/components/Shell";
import { VisitorTrafficSection } from "@/components/VisitorTraffic";
import { getEvents, getSummary } from "@/lib/lc.functions";
import { getGateStatus } from "@/lib/gate.functions";

export const Route = createFileRoute("/statistics")({
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
  component: StatisticsPage,
});

function StatisticsPage() {
  const summaryFn = useServerFn(getSummary);
  const eventsFn = useServerFn(getEvents);

  const { data: summary } = useQuery({
    queryKey: ["lc", "summary"],
    queryFn: () => summaryFn(),
    refetchInterval: 8000,
  });
  const { data: events = [] } = useQuery({
    queryKey: ["lc", "events", 200],
    queryFn: () => eventsFn({ data: { limit: 200 } }),
    refetchInterval: 10000,
  });

  return (
    <Shell title="Statistics">
      <VisitorTrafficSection className="mt-0" />

      <div className="mt-8 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
        <h2 className="font-display text-2xl tracking-wider mb-4">Zone totals</h2>
        <ul className="space-y-2">
          {(summary?.counts.zones ?? [])
            .map((z) => ({ z, c: summary?.counts.counts[z] ?? 0 }))
            .map(({ z, c }) => (
              <li key={z} className="flex justify-between text-sm py-2 border-b border-border/50">
                <span className="capitalize">{z.replace(/_/g, " ")}</span>
                <span className="font-semibold tabular-nums">{c}</span>
              </li>
            ))}
        </ul>
      </div>

      <section className="mt-8 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
        <h2 className="font-display text-2xl tracking-wider mb-4">Event log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Kind</th>
                <th className="py-2 pr-4">Zones</th>
                <th className="py-2 pr-4">Camera</th>
                <th className="py-2">Event ID</th>
              </tr>
            </thead>
            <tbody>
              {events.filter((e) => e.zones && e.zones.length > 0).map((e) => (
                <tr key={e.event_id} className="border-t border-border/40">
                  <td className="py-2 pr-4 tabular-nums">
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider ${
                        e.kind === "entry"
                          ? "bg-success/15 text-success"
                          : e.kind === "exit"
                            ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {e.kind}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {e.zones.join(", ") || "—"}
                  </td>
                  <td className="py-2 pr-4">{e.camera}</td>
                  <td className="py-2 font-mono text-[11px] text-muted-foreground">
                    {e.event_id}
                  </td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
