import { ListIcon } from "@phosphor-icons/react";
import { Outlet, createFileRoute, redirect, useLoaderData, useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AdminRail, AdminSidebar } from "@/components/admin/sidebar";
import { NewPostDialog } from "@/components/new-post-dialog";
import { DashboardErrorState, DashboardShellSkeleton } from "@/components/states";
import { DemoBanner } from "@/components/demo-banner";
import { isDemo } from "@/lib/demo";

export const Route = createFileRoute("/dashboard")({
  loader: async ({ parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    if (parent.loaderData?.user?.role !== "admin") throw redirect({ to: "/login" });
    return { demo: isDemo(parent.loaderData?.workspace) };
  },
  component: AdminLayout,
  pendingComponent: DashboardShellSkeleton,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} />,
});

// Full sidebar everywhere except settings, where it collapses to the rail so
// the settings nav is the only full-width sidebar on screen.
function AdminLayout() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  useEffect(() => {
    const siblings = [
      { to: "/dashboard/inbox" },
      { to: "/dashboard/roadmap" },
      { to: "/dashboard/changelog" },
      { to: "/dashboard/help" },
      { to: "/dashboard/settings/general" },
    ];
    for (const s of siblings) router.preloadRoute(s as unknown as Parameters<typeof router.preloadRoute>[0]);
  }, [router]);
  const [composing, setComposing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openCompose = useCallback(() => setComposing(true), []);
  useEffect(() => {
    window.addEventListener("oh:compose", openCompose);
    return () => window.removeEventListener("oh:compose", openCompose);
  }, [openCompose]);
  const { pathname } = useLocation();
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    setNavOpen(localStorage.getItem("oh:sidebar") === "full");
  }, []);
  const toggleNav = () =>
    setNavOpen((o) => {
      localStorage.setItem("oh:sidebar", o ? "rail" : "full");
      return !o;
    });
  return (
    <div className="flex h-dvh overflow-hidden bg-[#0a0a0b] text-foreground">
      {/* Desktop: icon rail always, filter column on Posts when open */}
      <aside className="hidden h-full shrink-0 md:flex" data-admin-sidebar>
        {navOpen ? <AdminSidebar onNewPost={() => setComposing(true)} onCollapse={toggleNav} /> : <AdminRail onExpand={toggleNav} onNewPost={() => setComposing(true)} />}
      </aside>
      {/* Mobile sidebar sheet */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-60 bg-[#0a0a0b] shadow-lg animate-in slide-in-from-left duration-200">
            <AdminSidebar onNewPost={() => { setComposing(true); setMobileOpen(false); }} onCollapse={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}
      {/* Mobile hamburger — shown only when sidebar is hidden */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 inline-flex size-9 items-center justify-center rounded-lg bg-[#0a0a0b] text-muted-foreground md:hidden"
        aria-label="Open menu"
      >
        <ListIcon className="size-5" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo(root.workspace) ? <DemoBanner /> : null}
        <Outlet />
      </div>
      <NewPostDialog open={composing} onOpenChange={setComposing} boards={root.boards} signedIn={!!root.user} />
    </div>
  );
}
