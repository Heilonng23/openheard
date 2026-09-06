import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";

import { Panel } from "@/components/admin/panel";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { SETTINGS_NAV } from "@/lib/admin-nav";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsLayout,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} retry="/dashboard/settings/general" />,
  pendingComponent: DashboardPanelSkeleton,
});

function SettingsLayout() {
  const { pathname } = useLocation();
  return (
    <Panel title="Settings" className="flex">
      <nav className="flex w-[220px] shrink-0 flex-col border-r px-3 pt-3 pb-4">
        <Link to="/dashboard" className="flex h-[30px] items-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-accent/60">
          <ArrowLeftIcon className="size-[13px] text-faint" /> Settings
        </Link>
        {SETTINGS_NAV.map((g) => (
          <div key={g.group} className="flex flex-col gap-0.5 pt-3.5">
            <div className="px-2 pb-1.5 font-mono text-[11px] tracking-[0.06em] text-faint uppercase">{g.group}</div>
            {g.items.map(([slug, label]) => {
              const to = `/dashboard/settings/${slug}`;
              const on = pathname === to;
              return (
                <Link key={slug} to={to} className={cn("flex h-7 items-center rounded-md px-2 text-[13px]", on ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto px-8 pt-7 pb-8">
        <div className="max-w-[920px]">
          <Outlet />
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
