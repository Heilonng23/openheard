import { ListIcon } from "@phosphor-icons/react";
import { Outlet, createFileRoute, redirect, useLoaderData, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AdminRail, AdminSidebar } from "@/components/admin/sidebar";
import { NewPostDialog } from "@/components/new-post-dialog";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { getUser } from "@/functions/get-user";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getUser();
    if (user?.role !== "admin") throw redirect({ to: "/login" });
  },
  component: AdminLayout,
  pendingComponent: DashboardPanelSkeleton,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} />,
});

// Full sidebar everywhere except settings, where it collapses to the rail so
// the settings nav is the only full-width sidebar on screen.
function AdminLayout() {
  const { pathname, search } = useLocation();
  const root = useLoaderData({ from: "__root__" });
  const [composing, setComposing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openCompose = useCallback(() => setComposing(true), []);
  useEffect(() => {
    window.addEventListener("oh:compose", openCompose);
    return () => window.removeEventListener("oh:compose", openCompose);
  }, [openCompose]);
  const inSettings = pathname.startsWith("/dashboard/settings") || (pathname.startsWith("/dashboard/inbox") && !!(search as { post?: number }).post);
  const [open, setOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    setOpen(localStorage.getItem("oh:sidebar") !== "rail");
  }, []);
  useEffect(() => {
    if (inSettings) setSettingsOpen(false);
  }, [inSettings]);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  const collapsed = inSettings ? !settingsOpen : !open;
  const toggle = () => {
    if (inSettings) return setSettingsOpen((o) => !o);
    setOpen((o) => {
      localStorage.setItem("oh:sidebar", o ? "rail" : "full");
      return !o;
    });
  };
  return (
    <div className="flex h-dvh overflow-hidden bg-[#0a0a0b] text-foreground">
      {/* Desktop sidebar */}
      <aside
        className="relative hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none md:block"
        style={{ width: collapsed ? 56 : 240 }}
      >
        <div className={cn("absolute inset-y-0 left-0 w-60 transition-opacity duration-150", collapsed ? "pointer-events-none opacity-0" : "opacity-100 delay-75")}>
          <AdminSidebar onNewPost={() => setComposing(true)} onCollapse={toggle} />
        </div>
        <div className={cn("absolute inset-y-0 left-0 w-14 transition-opacity duration-150", collapsed ? "opacity-100 delay-75" : "pointer-events-none opacity-0")}>
          <AdminRail onExpand={toggle} onNewPost={() => setComposing(true)} />
        </div>
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
      <Outlet />
      <NewPostDialog open={composing} onOpenChange={setComposing} boards={root.boards} signedIn={!!root.user} />
    </div>
  );
}
