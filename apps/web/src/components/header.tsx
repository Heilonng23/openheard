import { ListIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Link, useLoaderData, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Kbd } from "./bits";
import Logo from "./logo";
import UserMenu from "./user-menu";
import { cn } from "@openheard/ui/lib/utils";

const links = [
  { to: "/", label: "Board" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/changelog", label: "Changelog" },
  { to: "/help", label: "Help" },
] as const;

export default function Header() {
  const data = useLoaderData({ from: "__root__" });
  const { pathname } = useLocation();
  const current = pathname.startsWith("/roadmap") ? "/roadmap" : pathname.startsWith("/changelog") ? "/changelog" : pathname.startsWith("/help") ? "/help" : "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setMobileSearch(false);
  }, [pathname]);

  // Help appears once the team has published at least one article.
  const visibleLinks = links.filter(({ to }) =>
    to === "/roadmap" ? data?.workspace.showRoadmap !== false : to === "/changelog" ? data?.workspace.showChangelog !== false : to === "/help" ? (data?.helpArticles ?? 0) > 0 : true,
  );

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 w-full max-w-[1072px] items-center justify-between px-4 md:px-8">
        {mobileSearch ? (
          <MobileSearchBar onClose={() => setMobileSearch(false)} />
        ) : (
          <>
            <div className="flex h-full items-center gap-3 md:gap-4">
              <Link to="/" className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.01em] text-foreground">
                {data?.workspace.logoUrl ? <img src={data.workspace.logoUrl} alt="" className="size-6 rounded-md object-cover" /> : <Logo />}
                <span className="hidden sm:inline">{data?.workspace.name ?? "openheard"}</span>
              </Link>
              <span className="hidden h-4 w-px bg-input lg:block" aria-hidden />
              <nav className="hidden h-full items-center gap-0.5 lg:flex">
                {visibleLinks.map(({ to, label }) => {
                  const active = current === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={cn(
                        "group/nav inline-flex h-8 cursor-pointer items-center gap-[7px] rounded-md px-2.5 text-[13px] font-medium select-none transition-colors duration-150 hover:bg-accent/60",
                        active ? "text-foreground" : "text-faint hover:text-muted-foreground",
                      )}
                    >
                      <span className={cn("size-[5px] rounded-full transition-colors duration-200", active ? "bg-link" : "bg-transparent group-hover/nav:bg-input")} />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileSearch(true)}
                className="inline-flex size-10 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground md:hidden"
                aria-label="Search"
              >
                <MagnifyingGlassIcon className="size-[18px]" />
              </button>
              <Search />
              <UserMenu />
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="inline-flex size-10 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground lg:hidden"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
              >
                {menuOpen ? <XIcon className="size-[18px]" /> : <ListIcon className="size-[18px]" />}
              </button>
            </div>
          </>
        )}
      </div>
      {menuOpen && !mobileSearch ? (
        <nav className="border-t bg-background lg:hidden">
          <div className="mx-auto flex max-w-[1072px] flex-col px-4 py-2 md:px-8">
            {visibleLinks.map(({ to, label }) => {
              const active = current === to;
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex h-11 items-center gap-[7px] rounded-md px-2.5 text-[14px] font-medium transition-colors duration-150",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("size-[5px] rounded-full", active ? "bg-link" : "bg-transparent")} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function MobileSearchBar({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <form
      className="flex w-full items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ to: "/", search: q ? { q } : {} });
        onClose();
      }}
    >
      <MagnifyingGlassIcon className="size-4 shrink-0 text-faint" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        placeholder="Search posts"
        className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-faint"
      />
      <button type="button" onClick={onClose} className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground">
        <XIcon className="size-4" />
      </button>
    </form>
  );
}

function Search() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (pathname.startsWith("/login")) return null;

  return (
    <form
      className="relative hidden md:block"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ to: "/", search: q ? { q } : {} });
      }}
    >
      <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-[14px] -translate-y-1/2 text-faint" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLInputElement).blur()}
        placeholder="Search posts"
        className="h-8 w-[220px] rounded-lg border bg-card pr-9 pl-8 text-[13px] text-foreground outline-none transition-colors placeholder:text-faint focus:border-ring/60 focus:ring-1 focus:ring-ring/40"
      />
      <Kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
    </form>
  );
}
