import { createServerFn } from "@tanstack/react-start";

function haFetch(path: string, init?: RequestInit) {
  const url = process.env.HOME_ASSISTANT_URL;
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!url || !token) throw new Error("Home Assistant is not configured");
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export type HAState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & { friendly_name?: string };
  last_changed: string;
  last_updated: string;
};

export const getStates = createServerFn({ method: "GET" }).handler(async () => {
  const res = await haFetch("/api/states");
  if (!res.ok) throw new Error(`HA states failed: ${res.status}`);
  const data = (await res.json()) as HAState[];
  return data;
});

export const callService = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { domain: string; service: string; entity_id?: string; data?: Record<string, unknown> }) => d,
  )
  .handler(async ({ data }) => {
    const body = { ...(data.data ?? {}), ...(data.entity_id ? { entity_id: data.entity_id } : {}) };
    const res = await haFetch(`/api/services/${data.domain}/${data.service}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Service call failed: ${res.status}`);
    return { ok: true };
  });

export const getHistory = createServerFn({ method: "GET" })
  .inputValidator((d: { entity_id: string; hours?: number }) => d)
  .handler(async ({ data }) => {
    const hours = data.hours ?? 24;
    const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const res = await haFetch(
      `/api/history/period/${start}?filter_entity_id=${encodeURIComponent(data.entity_id)}&minimal_response`,
    );
    if (!res.ok) return [] as Array<{ state: string; last_changed: string }>;
    const raw = (await res.json()) as Array<Array<{ state: string; last_changed: string }>>;
    return raw[0] ?? [];
  });
