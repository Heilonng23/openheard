import { createFileRoute, redirect, useLoaderData, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { WorkspaceForm } from "@/components/workspace-form";
import { prefillWorkspaceBrand } from "@/functions/brand";
import { saveWorkspace } from "@/functions/settings";
import { getWorkspace } from "@/functions/workspace";
import { isAdmin } from "@/lib/session";

// First run on a self-hosted install: the default workspace exists but has
// no name yet. Same form as /new, without the subdomain.
export const Route = createFileRoute("/welcome")({
  beforeLoad: async () => {
    const root = await getWorkspace();
    if (root.marketing) throw redirect({ to: "/new" });
    if (!isAdmin(root.user)) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Welcome · openheard" }] }),
  component: Welcome,
});

function Welcome() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <WorkspaceForm
        mode="setup"
        domainSuffix={root.rootDomain ?? "openheard.com"}
        initialName={ws.name === "openheard" ? "" : ws.name}
        initialWebsite={ws.website ?? ""}
        onSubmit={async (v) => {
          try {
            await saveWorkspace({
              data: {
                name: v.name,
                tagline: ws.tagline,
                theme: ws.theme === "light" ? "light" : "dark",
                poweredBy: ws.poweredBy,
                requireApproval: ws.requireApproval,
                accent: ws.accent ?? null,
                website: v.website || null,
                heardAboutUs: v.heardAboutUs || null,
              },
            });
            // Picks up the site's colours and logo; the board is usable before it lands.
            if (v.website) void prefillWorkspaceBrand({ data: { website: v.website } }).then(() => router.invalidate()).catch(() => {});
            await router.invalidate();
            await router.navigate({ to: "/" });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save");
          }
        }}
      />
    </main>
  );
}
