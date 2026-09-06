import { Outlet, createFileRoute, redirect, useLoaderData, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminRail, AdminSidebar } from "@/components/admin/sidebar";
import { NewPostDialog } from "@/components/new-post-dialog";
import { getUser } from "@/functions/get-user";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const user = await getUser();
    if (user?.role !== "admin") throw redirect({ to: "/login" });
  },
  component: AdminLayout,
});

// Full sidebar everywhere except settings, where it collapses to the rail so
// the settings nav is the only full-width sidebar on screen.
function AdminLayout() {
  const { pathname, search } = useLocation();
  const root = useLoaderData({ from: "__root__" });
  const [composing, setComposing] = useState(false);
  // Settings and an open post both take the room: the sidebar folds to the
  // rail, and comes back when you leave.
  const inSettings = pathname.startsWith("/dashboard/settings") || (pathname.startsWith("/dashboard/inbox") && !!(search as { post?: number }).post);
  // Entering settings always collapses. Inside settings you can expand for
  // the moment; leaving settings restores whatever you had before.
  const [open, setOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    setOpen(localStorage.getItem("oh:sidebar") !== "rail");
  }, []);
  useEffect(() => {
    if (inSettings) setSettingsOpen(false);
  }, [inSettings]);
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
      <aside
        className="relative shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: collapsed ? 56 : 240 }}
      >
        <div className={cn("absolute inset-y-0 left-0 w-60 transition-opacity duration-150", collapsed ? "pointer-events-none opacity-0" : "opacity-100 delay-75")}>
          <AdminSidebar onNewPost={() => setComposing(true)} onCollapse={toggle} />
        </div>
        <div className={cn("absolute inset-y-0 left-0 w-14 transition-opacity duration-150", collapsed ? "opacity-100 delay-75" : "pointer-events-none opacity-0")}>
          <AdminRail onExpand={toggle} onNewPost={() => setComposing(true)} />
        </div>
      </aside>
      <Outlet />
      <NewPostDialog open={composing} onOpenChange={setComposing} boards={root.boards} signedIn={!!root.user} />
    </div>
  );
}
