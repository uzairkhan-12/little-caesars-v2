type TelemetryErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type TelemetryEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: TelemetryErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    // keep the existing global to avoid breaking external integrations
    __lovableEvents?: TelemetryEvents;
  }
}

export function reportTelemetryError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}

// Backwards-compatible export name
export { reportTelemetryError as reportLovableError };
