import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, Outlet, createFileRoute, redirect, useLoaderData, useLocation } from "@tanstack/react-router";

import { Panel } from "@/components/admin/panel";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { SETTINGS_NAV } from "@/lib/admin-nav";
import { DEMO_HIDDEN_SETTINGS, isDemo } from "@/lib/demo";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/dashboard/settings")({
  // Locked demo pages never mount, so their loaders never call a server
  // function that would throw.
  loader: async ({ parentMatchPromise, location }) => {
    const parent = await parentMatchPromise;
    if (!parent.loaderData?.demo) return;
    if (DEMO_HIDDEN_SETTINGS.some((slug) => location.pathname === `/dashboard/settings/${slug}`)) {
      throw redirect({ to: "/dashboard/settings/general" });
    }
  },
  component: SettingsLayout,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} retry="/dashboard/settings/general" />,
  pendingComponent: DashboardPanelSkeleton,
});

function SettingsLayout() {
  const { pathname } = useLocation();
  const root = useLoaderData({ from: "__root__" });
  // The demo hands admin to anyone, so the settings that spend money, show
  // member emails or outlive the nightly reset are not there at all.
  const locked = isDemo(root.workspace) ? (DEMO_HIDDEN_SETTINGS as readonly string[]) : [];
  const groups = SETTINGS_NAV.map((g) => ({ group: g.group, items: g.items.filter(([slug]) => !locked.includes(slug)) })).filter((g) => g.items.length > 0);
  const onLocked = locked.some((slug) => pathname === `/dashboard/settings/${slug}`);
  return (
    <Panel title="Settings" className="flex flex-col md:flex-row">
      <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b px-3 py-2 md:w-[220px] md:flex-col md:overflow-x-visible md:border-r md:border-b-0 md:pt-3 md:pb-4">
        <Link to="/dashboard" className="hidden h-[30px] items-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-accent/60 md:flex">
          <ArrowLeftIcon className="size-[13px] text-faint" /> Settings
        </Link>
        {groups.map((g) => (
          <div key={g.group} className="flex flex-row gap-0.5 md:flex-col md:pt-3.5">
            <div className="hidden px-2 pb-1.5 font-mono text-[11px] tracking-[0.06em] text-faint uppercase md:block">{g.group}</div>
            {g.items.map(([slug, label]) => {
              const to = `/dashboard/settings/${slug}`;
              const on = pathname === to;
              return (
                <Link key={slug} to={to} preload="viewport" className={cn("flex h-7 items-center whitespace-nowrap rounded-md px-2 text-[13px]", on ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto px-4 pt-5 pb-6 md:px-8 md:pt-7 md:pb-8">
        {/* The widget page keeps its live preview beside the form. */}
        <div className={pathname === "/dashboard/settings/widget" ? "max-w-[1400px]" : "max-w-[920px]"}>
          {onLocked ? (
            <p className="text-[13px] text-muted-foreground">Not available in the demo workspace.</p>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </Panel>
  );
}

export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 pb-7">
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-[13px] text-muted-foreground">{sub}</p>
    </div>
  );
}
