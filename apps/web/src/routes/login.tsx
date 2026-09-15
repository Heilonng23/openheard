import { createFileRoute, redirect, useLoaderData, useRouter } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth-form";
import Logo from "@/components/logo";
import { myWorkspaces } from "@/functions/admin";
import { getUser } from "@/functions/get-user";
import { getWorkspace } from "@/functions/workspace";
import { getWorkspaceMemberCount } from "@/functions/invites";
import { workspaceUrl } from "@/lib/workspace-url";

type Search = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const [user, root] = await Promise.all([getUser(), getWorkspace()]);
    if (!user) return;
    if ((search as Search).redirect) throw redirect({ to: (search as Search).redirect! });
    if (!root.marketing) throw redirect({ to: "/" });
    const own = (await myWorkspaces()).filter((w) => w.id !== "default");
    if (own.length > 0) throw redirect({ href: workspaceUrl(own[own.length - 1]!.id, root.rootDomain, "/dashboard") });
    throw redirect({ to: "/new" });
  },
  loader: () => getWorkspaceMemberCount(),
  head: () => ({ meta: [{ title: "Sign in · feedback" }] }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const memberCount = Route.useLoaderData();

  const wsName = root.workspace?.name ?? "openheard";
  const hasGoogle = root.googleSignIn;
  const callbackURL = search.redirect ?? (root.marketing ? "/new" : "/");

  async function afterAuth() {
    await router.invalidate();
    if (search.redirect) {
      router.navigate({ to: search.redirect });
      return;
    }
    if (!root.marketing) {
      router.navigate({ to: "/" });
      return;
    }
    try {
      const workspaces = await myWorkspaces();
      const own = workspaces.filter((w) => w.id !== "default");
      const latest = own[own.length - 1];
      if (latest) {
        const url = workspaceUrl(latest.id, root.rootDomain, "/dashboard");
        try {
          const dest = new URL(url, window.location.origin);
          if (dest.origin === window.location.origin) {
            router.navigate({ to: dest.pathname });
          } else {
            window.location.href = url;
          }
        } catch {
          window.location.href = url;
        }
        return;
      }
      router.navigate({ to: "/new" });
    } catch {
      router.navigate({ to: "/new" });
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <Logo size={32} />
        <AuthForm
          wsName={wsName}
          hasGoogle={hasGoogle}
          callbackURL={callbackURL}
          onSuccess={afterAuth}
          showFirstAccountHint={memberCount === 0}
        />
      </div>
    </main>
  );
}
