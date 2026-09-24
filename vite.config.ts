// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

const SERVER_FN_FILES = [
  "src/lib/lc.functions.ts",
  "src/lib/ha.functions.ts",
  "src/lib/energy-reports.functions.ts",
  "src/lib/gate.functions.ts",
];

/** Register createServerFn IDs at Vite boot so /_serverFn calls don't 500 on a cold start. */
function warmupServerFns(): Plugin {
  return {
    name: "warmup-tanstack-server-fns",
    apply: "serve",
    configureServer(server) {
      const warmup = async () => {
        const env = server.environments.ssr;
        if (!env) return;
        for (const rel of SERVER_FN_FILES) {
          const abs = path.resolve(server.config.root, rel);
          await env.transformRequest(`${abs}?tss-serverfn-split`).catch(() => {});
          await env.transformRequest(abs).catch(() => {});
        }
      };
      void warmup();
      server.httpServer?.once("listening", () => {
        void warmup();
      });
    },
  };
}

export default defineConfig({
  // Self-hosted Proxmox LXC uses Node + SQLite. Do not leave Nitro on the
  // Lovable default (cloudflare-module) — node:sqlite will not run there.
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [warmupServerFns()],
  vite: {
    server: {
      // The app is self-hosted (Proxmox) behind a cloudflared tunnel, so the
      // Host header on incoming requests is the public domain below rather
      // than localhost — Vite's dev-server host check (DNS-rebinding
      // protection) needs it allow-listed explicitly or every request 404s
      // with "Blocked request. This host is not allowed."
      allowedHosts: ["little-caesars.primewave2.tech"],
      headers: { "Cache-Control": "no-store" },
      warmup: {
        ssrFiles: SERVER_FN_FILES.map((file) => `./${file}`),
      },
      // When opened through the HTTPS tunnel, the Vite client must use wss:443.
      // Leave unset locally so localhost HMR keeps working.
      ...(process.env.VITE_TUNNEL_HMR === "1"
        ? {
            ws: {
              protocol: "wss" as const,
              host: "little-caesars.primewave2.tech",
              clientPort: 443,
            },
          }
        : {}),
    },
  },
});
