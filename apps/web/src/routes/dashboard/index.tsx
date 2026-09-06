import { createFileRoute, redirect } from "@tanstack/react-router";

// The dashboard opens on the feed. Overview is gone; one list, filters on top.
export const Route = createFileRoute("/dashboard/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/inbox" });
  },
});
