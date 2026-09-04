import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const user = await getUser();
    if (user?.role !== "admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Settings · feedback" }] }),
  component: () => (
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <h1 className="text-[22px] font-semibold">Settings</h1>
      <p className="mt-1 text-muted-foreground">Workspace name, boards, tags, theme and the powered-by footer land here next.</p>
    </main>
  ),
});
