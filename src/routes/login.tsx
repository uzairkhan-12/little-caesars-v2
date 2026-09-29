import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, User, Loader2 } from "lucide-react";
import { login } from "@/lib/gate.functions";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import littleCaesarsLogo from "@/assets/little-caesars-logo.png?url";
import littleCaesarsLogoDark from "@/components/little-caesars-logo-black-text.png?url";

type Search = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginPage,
});


function LoginPage() {
  const router = useRouter();
  const search = useSearch({ from: "/login" });
  const loginFn = useServerFn(login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  const { theme } = useTheme();

  const mutation = useMutation({
    mutationFn: (v: { username: string; password: string }) => loginFn({ data: v }),
    onSuccess: async (res) => {
      if (!res.ok) {
        setError(t("invalidCredentials"));
        return;
      }
      await router.invalidate();
      router.navigate({ to: search.redirect ?? "/" });
    },
    onError: () => setError(t("loginError")),
  });

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4 relative overflow-hidden">
      <div className="absolute top-4 end-4 z-10">
        <LanguageToggle />
      </div>
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <img
            src={theme === "dark" ? littleCaesarsLogo : littleCaesarsLogoDark}
            alt="Little Caesars"
            className="h-16 w-auto object-contain"
          />
        </div>

        <div className="rounded-3xl border border-border bg-gradient-card shadow-soft p-8">
          <div className="text-center mb-6">
            <h1 className="font-display text-3xl tracking-wider text-gradient-brand">
              {t("commandDeck")}
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {t("restrictedAccess")}
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
                {t("username")}
              </span>
              <div className="mt-1 relative">
                <User className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-11 rounded-xl bg-input border border-border ps-10 pe-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("password")}
              </span>
              <div className="mt-1 relative">
                <Lock className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 rounded-xl bg-input border border-border ps-10 pe-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
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
              {t("enter")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
