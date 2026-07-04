import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, User, Loader2 } from "lucide-react";
import { login, getGateStatus } from "@/lib/gate.functions";
import primewaveLogo from "@/assets/primewave-logo.png.asset.json";
import littleCaesarsLogo from "@/assets/little-caesars-logo.png.asset.json";

type Search = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  loader: async () => {
    const status = await getGateStatus();
    return status;
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const search = useSearch({ from: "/login" });
  const loginFn = useServerFn(login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (v: { username: string; password: string }) => loginFn({ data: v }),
    onSuccess: async (res) => {
      if (!res.ok) {
        setError("Invalid credentials");
        return;
      }
      await router.invalidate();
      router.navigate({ to: search.redirect ?? "/" });
    },
    onError: () => setError("Something went wrong. Try again."),
  });

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <img
            src={littleCaesarsLogo.url}
            alt="Little Caesars"
            className="h-16 w-auto object-contain"
          />
        </div>

        <div className="rounded-3xl border border-border bg-gradient-card shadow-soft p-8">
          <div className="text-center mb-6">
            <h1 className="font-display text-3xl tracking-wider text-gradient-brand">
              COMMAND DECK
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Restricted access · v2
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              mutation.mutate({ username, password });
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Username
              </span>
              <div className="mt-1 relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-11 rounded-xl bg-input border border-border pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Password
              </span>
              <div className="mt-1 relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 rounded-xl bg-input border border-border pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
                  required
                />
              </div>
            </label>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full h-11 rounded-xl bg-gradient-brand text-primary-foreground font-semibold text-sm uppercase tracking-wider shadow-glow hover:opacity-95 disabled:opacity-60 flex items-center justify-center gap-2 transition"
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Enter
            </button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <span>Powered by</span>
          <img src={primewaveLogo.url} alt="Primewave" className="h-4 w-auto" />
        </div>
      </div>
    </div>
  );
}
