import type { ReactNode } from "react";
import { Sidebar, MobileNav } from "./Sidebar";

export function Shell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MobileNav />
      <main className="lg:pl-64 pb-24 lg:pb-8">
        <header className="px-6 lg:px-10 pt-8 pb-6">
          {title && (
            <h1 className="font-display text-4xl lg:text-5xl tracking-wider">
              <span className="text-gradient-brand">{title}</span>
            </h1>
          )}
          {subtitle && <p className="mt-2 text-muted-foreground text-sm">{subtitle}</p>}
        </header>
        <div className="px-6 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
