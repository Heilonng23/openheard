import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { toast } from "sonner";

import { WorkspaceForm } from "@/components/workspace-form";
import { createWorkspace } from "@/functions/admin";
import { getUser } from "@/functions/get-user";
import { workspaceUrl } from "@/lib/workspace-url";

export const Route = createFileRoute("/new")({
  beforeLoad: async () => {
    if (!(await getUser())) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "New workspace · openheard" }] }),
  component: NewWorkspace,
});

function NewWorkspace() {
  const root = useLoaderData({ from: "__root__" });
  const rootDomain = root.rootDomain;
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <WorkspaceForm
        mode="create"
        domainSuffix={rootDomain ?? "openheard.com"}
        onSubmit={async (v) => {
          try {
            const { id } = await createWorkspace({ data: { name: v.name, slug: v.slug, website: v.website || undefined, heardAboutUs: v.heardAboutUs || undefined } });
            // Straight to the new board. It is ready to use as it is.
            window.location.href = workspaceUrl(id, rootDomain, "/");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not create workspace");
          }
        }}
      />
    </main>
  );
}
