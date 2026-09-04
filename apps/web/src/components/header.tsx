import { BellIcon, GearSixIcon } from "@phosphor-icons/react";
import { Link, useLoaderData } from "@tanstack/react-router";

import Logo from "./logo";
import UserMenu from "./user-menu";

const links = [
  { to: "/", label: "Board" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/changelog", label: "Changelog" },
] as const;

export default function Header() {
  const data = useLoaderData({ from: "__root__" });
  const admin = data?.user?.role === "admin";
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 md:px-7">
      <div className="flex items-center gap-3 md:gap-7">
        <Link to="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
          <Logo />
          <span className="hidden sm:inline">openheard</span>
          {data?.workspace.name && data.workspace.name !== "openheard" ? (
            <span className="hidden font-normal text-muted-foreground sm:inline">/ {data.workspace.name}</span>
          ) : null}
        </Link>
        <nav className="flex gap-0.5">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="rounded-sm px-2 py-1.5 text-[13px] font-medium text-muted-foreground md:px-2.5 md:text-[13.5px] transition-colors duration-150 hover:bg-accent hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        {admin ? (
          <>
            <span className="hidden h-6 items-center gap-1.5 rounded-full border border-dashed border-input px-2 font-mono text-[11px] text-muted-foreground sm:inline-flex">
              <span className="size-[7px] rounded-full bg-link" />
              admin
            </span>
            <Link to="/settings" className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <GearSixIcon className="size-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </>
        ) : null}
        {data?.user ? (
          <span className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Notifications">
            <BellIcon className="size-4" />
          </span>
        ) : null}
        <UserMenu />
      </div>
    </header>
  );
}
