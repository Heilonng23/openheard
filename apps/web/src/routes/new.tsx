import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { toast } from "sonner";

import Logo from "@/components/logo";
import { WorkspaceForm } from "@/components/workspace-form";
import { createWorkspace } from "@/functions/admin";
import { getUser } from "@/functions/get-user";
import { workspaceUrl } from "@/lib/workspace-url";

export const Route = createFileRoute("/new")({
  // An unknown workspace address links here with its name filled in.
  validateSearch: (s: Record<string, unknown>): { slug?: string } => (typeof s.slug === "string" ? { slug: s.slug } : {}),
  beforeLoad: async () => {
    if (!(await getUser())) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "New workspace · openheard" }] }),
  component: NewWorkspace,
});

function NewWorkspace() {
  const root = useLoaderData({ from: "__root__" });
  const { slug } = Route.useSearch();
  const rootDomain = root.rootDomain;
  const ownWorkspaces = (root as { ownWorkspaces?: { id: string }[] }).ownWorkspaces;
  const hasExistingWorkspace = !!ownWorkspaces && ownWorkspaces.length > 0;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-16">
      <a href="/" aria-label="openheard home">
        <Logo size={32} />
      </a>
      <WorkspaceForm
        mode="create"
        domainSuffix={rootDomain ?? "openheard.com"}
        initialSlug={slug}
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
