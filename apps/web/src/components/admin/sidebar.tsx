import type { Icon } from "@phosphor-icons/react";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircleHalfIcon,
  CircleIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  MegaphoneIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  SpinnerGapIcon,
  SquaresFourIcon,
  TagIcon,
  TrayIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Link, useLoaderData, useLocation, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import Logo from "@/components/logo";
import { authClient } from "@/lib/auth-client";
import { myWorkspaces } from "@/functions/admin";
import { workspaceUrl } from "@/lib/workspace-url";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { Collapsible } from "@/components/collapsible";
import { KIND_ICON, useStatuses } from "@/lib/status";
import { cn } from "@openheard/ui/lib/utils";

const GLYPH: Record<(typeof KIND_ICON)[keyof typeof KIND_ICON], Icon> = {
  "circle-dashed": CircleDashedIcon,
  circle: CircleIcon,
  "circle-half": CircleHalfIcon,
  "spinner-gap": SpinnerGapIcon,
  "check-circle": CheckCircleIcon,
  "x-circle": XCircleIcon,
};

// Workspace name with a menu to hop to any other workspace you belong to.
function WorkspaceSwitcher() {
  const root = useLoaderData({ from: "__root__" });
  const [list, setList] = useState<{ id: string; name: string; role: string }[] | null>(null);
  return (
    <DropdownMenu onOpenChange={(o) => o && list === null && myWorkspaces().then(setList)}>
      <DropdownMenuTrigger className="group/ws flex h-7 items-center gap-2 rounded-md pr-1.5 pl-0.5 text-sm font-semibold outline-none hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring">
        <Logo size={22} />
        <span className="truncate text-[15px]">{root.workspace.name}</span>
        <CaretDownIcon className="size-2.5 text-faint opacity-0 group-hover/ws:opacity-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {(list ?? [{ id: root.workspace.id, name: root.workspace.name, role: "admin" }]).map((w) => (
          <DropdownMenuItem key={w.id} disabled={w.id === root.workspace.id} onClick={() => (window.location.href = workspaceUrl(w.id, root.rootDomain, "/dashboard"))}>
            <span className="flex-1 truncate">{w.name}</span>
            <span className="text-xs text-faint capitalize">{w.role}</span>
          </DropdownMenuItem>
        ))}
        {root.rootDomain ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to="/new" />}>
              <PlusIcon className="size-3.5" /> New workspace
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// 240px sidebar from the size guide: 16px edges, 30px items 4px apart,
// group labels 16 above and 8 below.
export function AdminSidebar({ onNewPost, onCollapse }: { onNewPost?: () => void; onCollapse?: () => void }) {
  const root = useLoaderData({ from: "__root__" });
  const { pathname, search } = useLocation();
  const statuses = useStatuses();
  const status = (search as { status?: string }).status ?? "";
  const inInbox = pathname.startsWith("/dashboard/inbox");

  return (
    <aside className="flex h-full w-60 flex-col px-4 pt-3.5 pb-4">
      <div className="flex items-center justify-between px-1">
        <WorkspaceSwitcher />
        <button type="button" onClick={onCollapse} className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground" title="Collapse sidebar">
          <SidebarSimpleIcon className="size-[15px]" />
        </button>
      </div>

      <Group>
        <Item to="/dashboard/inbox" active={inInbox && !(search as { status?: string }).status} icon={TrayIcon} label="Posts" count={root.total} />
        <Item to="/dashboard/roadmap" icon={MapTrifoldIcon} label="Roadmap" />
        <Item to="/dashboard/changelog" icon={MegaphoneIcon} label="Changelog" />
        <Item icon={PlusIcon} label="New post" onClick={onNewPost} />
        <Item icon={MagnifyingGlassIcon} label="Search" onClick={() => document.querySelector<HTMLInputElement>("[data-admin-search]")?.focus()} />
      </Group>

      <Group label="Statuses">
        {statuses.map((s) => {
          const G = GLYPH[KIND_ICON[s.kind]];
          const filled = s.kind === "done" || s.kind === "closed";
          return (
            <Item
              key={s.key}
              to="/dashboard/inbox"
              search={{ status: s.key }}
              active={inInbox && status === s.key}
              icon={G}
              iconColor={s.color}
              weight={filled ? "fill" : "regular"}
              label={s.label}
              count={root.statusCounts[s.key] ?? 0}
            />
          );
        })}
      </Group>

      <Group label="Quick filters">
        <Expand icon={SquaresFourIcon} label="Boards">
          {root.boards.map((b) => (
            <Item key={b.id} to="/dashboard/inbox" search={{ status, board: b.id }} active={inInbox && (search as { board?: string }).board === b.id} label={b.name} count={b.count} sub />
          ))}
        </Expand>
        <Expand icon={TagIcon} label="Tags">
          {root.tags.length === 0 ? <div className="px-2 py-1 pl-[38px] text-xs text-faint">No tags yet</div> : null}
          {root.tags.map((t) => (
            <Item key={t.id} to="/dashboard/inbox" search={{ status, tag: t.id }} active={inInbox && (search as { tag?: string }).tag === t.id} label={t.name} sub />
          ))}
        </Expand>
      </Group>

      <div className="flex-1" />

      <AccountMenu>
        <Item to="/" icon={ArrowSquareOutIcon} label="Public board" />
        <Item to="/dashboard/settings/general" icon={GearSixIcon} label="Settings" />
      </AccountMenu>
    </aside>
  );
}

function AccountMenu({ children }: { children: ReactNode }) {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  return (
    <div className="flex flex-col gap-0.5 border-t pt-3">
      {children}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-9 w-full items-center gap-2 rounded-md px-2 outline-none hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring">
          <span className="size-[22px] rounded-full border border-input bg-accent" />
          <span className="flex-1 truncate text-left text-[13px]">{root.user?.name}</span>
          <CaretDownIcon className="size-3 text-faint" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-48">
          <DropdownMenuItem
            onClick={() =>
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => router.invalidate().then(() => router.navigate({ to: "/login" })),
                },
              })
            }
          >
            <SignOutIcon className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-1 pt-4">
      {label ? (
        <button type="button" onClick={() => setOpen((o) => !o)} className="group/g flex items-center justify-between px-2 pb-1 text-[13px] text-faint hover:text-muted-foreground">
          {label}
          <CaretDownIcon className={cn("size-2.5 opacity-0 transition-transform group-hover/g:opacity-100", !open && "-rotate-90 opacity-100")} />
        </button>
      ) : null}
      <Collapsible open={open}>
        <div className="flex flex-col gap-1">{children}</div>
      </Collapsible>
    </div>
  );
}

// A row that opens into a nested list (boards, tags), indented 14px like the size guide.
function Expand({ icon: I, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground">
        <I className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <CaretRightIcon className={cn("size-[11px] text-faint transition-transform", open && "rotate-90")} />
      </button>
      <Collapsible open={open}>
        <div className="flex flex-col gap-1">{children}</div>
      </Collapsible>
    </div>
  );
}

function Item({
  to,
  search,
  exact,
  active,
  icon: I,
  iconClassName,
  iconColor,
  weight,
  label,
  count,
  trailing,
  onClick,
  sub,
}: {
  to?: string;
  search?: Record<string, string>;
  exact?: boolean;
  active?: boolean;
  icon?: Icon;
  iconClassName?: string;
  iconColor?: string;
  weight?: "fill" | "regular";
  label: string;
  count?: number;
  trailing?: ReactNode;
  onClick?: () => void;
  sub?: boolean;
}) {
  const { pathname } = useLocation();
  const on = active ?? (to ? (exact ? pathname === to : pathname.startsWith(to) && to !== "/") : false);
  const cls = cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium active:scale-[0.99]", sub && "h-[30px] pl-[38px]", on ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground");
  const icon = I ? <I weight={weight} style={iconColor ? { color: iconColor } : undefined} className={cn("size-4 shrink-0", !iconColor && (iconClassName ?? (on ? "text-foreground" : "text-muted-foreground")))} /> : null;
  const inner = (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count !== undefined ? <span className="text-[13px] text-faint tabular-nums">{count}</span> : trailing}
    </>
  );
  if (to) {
    return (
      <Link to={to} search={search} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

// 56px rail: same destinations as the full sidebar, icons only, titles on hover.
export function AdminRail({ onExpand, onNewPost }: { onExpand?: () => void; onNewPost?: () => void }) {
  const { pathname, search } = useLocation();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const statuses = useStatuses();
  const status = (search as { status?: string }).status ?? "";
  const inInbox = pathname.startsWith("/dashboard/inbox");
  const cls = (on: boolean) => cn("inline-flex size-9 items-center justify-center rounded-lg active:scale-95", on ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground");
  return (
    <aside className="flex h-full w-14 flex-col items-center gap-1 overflow-y-auto py-3.5 [scrollbar-width:none]">
      <button type="button" onClick={onExpand} title="Expand sidebar" className="group/logo mb-2.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-accent/60">
        <span className="group-hover/logo:hidden">
          <Logo size={26} />
        </span>
        <SidebarSimpleIcon className="hidden size-[17px] text-muted-foreground group-hover/logo:block" />
      </button>
      <Link to="/dashboard/inbox" title="Posts" className={cls(inInbox && !status)}>
        <TrayIcon className="size-[17px]" />
      </Link>
      <Link to="/dashboard/roadmap" title="Roadmap" className={cls(pathname.startsWith("/dashboard/roadmap"))}>
        <MapTrifoldIcon className="size-[17px]" />
      </Link>
      <Link to="/dashboard/changelog" title="Changelog" className={cls(pathname.startsWith("/dashboard/changelog"))}>
        <MegaphoneIcon className="size-[17px]" />
      </Link>
      <button type="button" onClick={onNewPost} title="New post" className={cls(false)}>
        <PlusIcon className="size-[17px]" />
      </button>
      <button type="button" onClick={() => document.querySelector<HTMLInputElement>("[data-admin-search]")?.focus()} title="Search" className={cls(false)}>
        <MagnifyingGlassIcon className="size-[17px]" />
      </button>
      <span className="my-1.5 h-px w-6 shrink-0 bg-border" />
      {statuses.map((s) => {
        const G = GLYPH[KIND_ICON[s.kind]];
        const filled = s.kind === "done" || s.kind === "closed";
        const count = root.statusCounts[s.key] ?? 0;
        return (
          <Link key={s.key} to="/dashboard/inbox" search={{ status: s.key }} title={`${s.label} · ${count}`} className={cn(cls(inInbox && status === s.key), "relative shrink-0")}>
            <G weight={filled ? "fill" : "regular"} className="size-[17px]" style={{ color: s.color }} />
            {count ? <span className="absolute top-1 right-1 font-mono text-[9px] leading-none text-faint tabular-nums">{count}</span> : null}
          </Link>
        );
      })}
      <div className="flex-1" />
      <Link to="/" title="Public board" className={cls(false)}>
        <ArrowSquareOutIcon className="size-[17px]" />
      </Link>
      <Link to="/dashboard/settings/general" title="Settings" className={cls(pathname.startsWith("/dashboard/settings"))}>
        <GearSixIcon className="size-[17px]" />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className="mt-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-input bg-accent outline-none focus-visible:ring-1 focus-visible:ring-ring" title={root.user?.name} />
        <DropdownMenuContent align="start" side="right" className="min-w-40">
          <DropdownMenuItem
            onClick={() =>
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => router.invalidate().then(() => router.navigate({ to: "/login" })),
                },
              })
            }
          >
            <SignOutIcon className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}
