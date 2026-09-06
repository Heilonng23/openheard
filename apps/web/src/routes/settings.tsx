import { createFileRoute, redirect } from "@tanstack/react-router";

// The old public-side settings page. Everything lives in the dashboard now.
export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/general" });
  },
});
