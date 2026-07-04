import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { RefreshCw, Video } from "lucide-react";
import { Shell } from "@/components/Shell";
import { getStates } from "@/lib/ha.functions";

export const Route = createFileRoute("/camera")({ component: CameraPage });

function CameraPage() {
  const statesFn = useServerFn(getStates);
  const { data = [] } = useQuery({
    queryKey: ["ha", "states"],
    queryFn: () => statesFn(),
    refetchInterval: 8000,
  });
  const cameras = data.filter((e) => e.entity_id.startsWith("camera."));
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 3000);
    return () => clearInterval(i);
  }, []);

  return (
    <Shell title="Live Camera" subtitle="Frigate detection stream — refreshed every 3s.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cameras.map((c) => (
          <div
            key={c.entity_id}
            className="rounded-2xl overflow-hidden border border-border bg-gradient-card shadow-soft"
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary grid place-items-center">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display text-xl tracking-wider">
                    {c.attributes.friendly_name ?? c.entity_id}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                    RECORDING
                  </div>
                </div>
              </div>
              <button
                onClick={() => setTick(Date.now())}
                className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-primary/20 hover:text-primary"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
            <div className="relative aspect-video bg-black">
              <img
                src={`/api/camera/${c.entity_id}?t=${tick}`}
                alt={c.entity_id}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                }}
              />
            </div>
          </div>
        ))}
        {!cameras.length && (
          <div className="text-sm text-muted-foreground">No cameras discovered.</div>
        )}
      </div>
    </Shell>
  );
}
