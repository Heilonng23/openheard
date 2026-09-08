import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { toast } from "sonner";

import Logo from "@/components/logo";
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
  const ownWorkspaces = (root as { ownWorkspaces?: { id: string }[] }).ownWorkspaces;
  const hasExistingWorkspace = !!ownWorkspaces && ownWorkspaces.length > 0;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-16">
      <a href="/" aria-label="openheard home">
        <Logo size={40} />
      </a>
      <WorkspaceForm
        mode="create"
        domainSuffix={rootDomain ?? "openheard.com"}
        showHeardAbout={!hasExistingWorkspace}
        onSubmit={async (v) => {
          try {
            const { id } = await createWorkspace({ data: { name: v.name, slug: v.slug, website: v.website || undefined, heardAboutUs: v.heardAboutUs || undefined } });
            window.location.href = workspaceUrl(id, rootDomain, "/dashboard");
            await new Promise(() => {});
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not create workspace");
          }
        }}
      />
    </main>
  );
}
