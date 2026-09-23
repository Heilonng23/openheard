import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@openheard/ui/lib/utils";
import type { TocItem } from "@/lib/help";

import { AskOnBoard, HelpIcon, HelpLabel } from "./bits";

export type NavCollection = { slug: string; title: string; icon: string | null; articles: { slug: string; title: string }[] };

// Article and collection pages: collection nav on the left, the page in the
// middle, a rail on the right. Below lg the rail drops under the page and the
// nav becomes a select above it.
export function HelpLayout({ nav, rail, mobileNav, children }: { nav: ReactNode; rail: ReactNode; mobileNav?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-[1072px] flex-1 grid-cols-1 gap-10 px-4 pt-8 pb-12 md:px-8 md:pt-12 lg:grid-cols-[200px_minmax(0,1fr)_200px] lg:gap-12">
      <nav aria-label="Help collections" className="hidden lg:block">
        <div className="sticky top-24 flex max-h-[calc(100dvh-7rem)] flex-col overflow-y-auto [scrollbar-width:none]">{nav}</div>
      </nav>
      <main className="flex min-w-0 flex-col">
        {mobileNav ? <div className="mb-6 lg:hidden">{mobileNav}</div> : null}
        {children}
      </main>
      <aside className="flex flex-col gap-8 lg:block">
        <div className="flex flex-col gap-8 lg:sticky lg:top-24">{rail}</div>
      </aside>
    </div>
  );
}

// The current collection with its articles, then every other collection.
export function CollectionNav({ nav, collection, article }: { nav: NavCollection[]; collection: string | null; article?: string }) {
  const current = nav.find((c) => c.slug === collection);
  const others = nav.filter((c) => c.slug !== collection);
  return (
    <>
      {current ? (
        <>
          <Link to="/help/collections/$slug" params={{ slug: current.slug }} className="flex items-center gap-2 px-0 pb-3 text-[15px] font-semibold tracking-[-0.01em] hover:text-foreground">
            <HelpIcon name={current.icon} className="size-4 text-muted-foreground" />
            {current.title}
          </Link>
          <ul className="flex flex-col gap-0.5">
            {current.articles.map((a) => (
              <li key={a.slug}>
                <Link
                  to="/help/$slug"
                  params={{ slug: a.slug }}
                  aria-current={a.slug === article ? "page" : undefined}
                  className={cn(
                    "flex min-h-8 items-center rounded-lg px-2.5 py-1.5 text-[14px] leading-[1.35]",
                    a.slug === article ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {others.length ? (
        <>
          <HelpLabel className={cn("px-2.5 pb-2", current ? "pt-7" : "")}>{current ? "Collections" : "Browse"}</HelpLabel>
          <ul className="flex flex-col gap-0.5">
            {others.map((c) => (
              <li key={c.slug}>
                <Link to="/help/collections/$slug" params={{ slug: c.slug }} className="flex min-h-8 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[14px] text-muted-foreground hover:bg-accent/50 hover:text-foreground">
                  <HelpIcon name={c.icon} className="size-3.5 shrink-0 text-faint" />
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

// Below lg: one select that jumps to any article or collection.
export function MobileNav({ nav, value }: { nav: NavCollection[]; value: string }) {
  const navigate = useNavigate();
  return (
    <label className="relative block">
      <span className="sr-only">Jump to an article</span>
      <select
        value={value}
        onChange={(e) => {
          const [kind, slug] = e.target.value.split(":");
          if (kind === "c") navigate({ to: "/help/collections/$slug", params: { slug: slug! } });
          else if (kind === "a") navigate({ to: "/help/$slug", params: { slug: slug! } });
          else navigate({ to: "/help" });
        }}
        className="h-10 w-full appearance-none rounded-lg border border-input bg-card pr-9 pl-3 text-[14px] text-foreground outline-none focus:border-ring/60"
      >
        <option value="home">All collections</option>
        {nav.map((c) => (
          <optgroup key={c.slug} label={c.title}>
            <option value={`c:${c.slug}`}>{c.title}: overview</option>
            {c.articles.map((a) => (
              <option key={a.slug} value={`a:${a.slug}`}>
                {a.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-faint" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m3 4.5 3 3 3-3" />
      </svg>
    </label>
  );
}

// "On this page", with the heading in view marked as you scroll.
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    if (!items.length) return;
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    function update() {
      // The last heading above the top quarter of the screen is the one being read.
      const line = window.innerHeight * 0.25;
      let current = els[0]?.id;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = els[els.length - 1]?.id;
      setActive(current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  if (items.length < 2) return null;
  return (
    <div className="hidden lg:block">
      <HelpLabel className="pb-3 pl-4">On this page</HelpLabel>
      <ul className="flex flex-col border-l">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(i.id);
                if (!el) return;
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
                history.replaceState(null, "", `#${i.id}`);
                setActive(i.id);
              }}
              className={cn(
                "relative -ml-px block py-1.5 text-[14px] leading-[1.4] transition-colors duration-150",
                i.level === 3 ? "pl-7" : "pl-4",
                active === i.id ? "text-foreground before:absolute before:inset-y-1 before:left-0 before:w-[1.5px] before:rounded-full before:bg-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StillStuck() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <p className="text-[14px] font-semibold">Still stuck?</p>
      <p className="text-[13px] leading-[1.55] text-muted-foreground">Post it on the board. The team answers there.</p>
      <div className="pt-2">
        <AskOnBoard full />
      </div>
    </div>
  );
}
