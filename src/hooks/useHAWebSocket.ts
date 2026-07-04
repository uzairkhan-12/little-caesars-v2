import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { HAState } from "@/lib/ha.functions";

/**
 * Connects to the server-side Home Assistant WebSocket proxy and pushes
 * live state changes into the React Query cache used by the app so any UI
 * bound to ["ha", "states"] updates instantly.
 */
export function useHAWebSocket() {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let idCounter = 1;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ha/ws`);
      wsRef.current = ws;

      ws.addEventListener("message", (ev) => {
        let msg: {
          type?: string;
          event?: {
            event_type?: string;
            data?: { new_state?: HAState | null };
          };
        };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        if (msg.type === "ready") {
          ws.send(
            JSON.stringify({
              id: idCounter++,
              type: "subscribe_events",
              event_type: "state_changed",
            }),
          );
          // Refresh once so cache aligns with the current HA snapshot.
          qc.invalidateQueries({ queryKey: ["ha", "states"] });
          return;
        }

        if (
          msg.type === "event" &&
          msg.event?.event_type === "state_changed"
        ) {
          const newState = msg.event.data?.new_state;
          if (!newState) return;
          qc.setQueryData<HAState[] | undefined>(["ha", "states"], (prev) => {
            if (!prev) return prev;
            const idx = prev.findIndex((s) => s.entity_id === newState.entity_id);
            if (idx === -1) return [...prev, newState];
            const copy = prev.slice();
            copy[idx] = newState;
            return copy;
          });
        }
      });

      const scheduleReconnect = () => {
        if (closed || reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 2000);
      };

      ws.addEventListener("close", scheduleReconnect);
      ws.addEventListener("error", () => {
        try { ws.close(); } catch { /* noop */ }
      });
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch { /* noop */ }
    };
  }, [qc]);
}
