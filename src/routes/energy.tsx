import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/energy")({
  beforeLoad: () => {
    throw redirect({ to: "/reports" });
  },
  component: () => null,
});
