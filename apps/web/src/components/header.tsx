import { Link } from "@tanstack/react-router";

import Logo from "./logo";
import UserMenu from "./user-menu";

const links = [
  { to: "/", label: "Board" },
  { to: "/dashboard", label: "Roadmap" },
] as const;

export default function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-7">
      <div className="flex items-center gap-7">
        <Link to="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
          <Logo />
          openheard
        </Link>
        <nav className="flex gap-1">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="rounded-sm px-2.5 py-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <UserMenu />
    </header>
  );
}
