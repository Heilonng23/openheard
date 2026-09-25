import { ArrowRightIcon, FileTextIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useLoaderData, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Kbd } from "@/components/bits";
import { AskOnBoard, HelpIconBox, HelpLabel } from "@/components/help/bits";
import { ErrorState, HelpHomeSkeleton } from "@/components/states";
import { getHelpCenter, searchHelp } from "@/functions/help";
import { cn } from "@openheard/ui/lib/utils";

type Search = { q?: string };
type Hit = Awaited<ReturnType<typeof searchHelp>>[number];

export const Route = createFileRoute("/help/")({
  validateSearch: (s: Record<string, unknown>): Search => ({ q: typeof s.q === "string" && s.q ? s.q.slice(0, 120) : undefined }),
  // Typing a search updates ?q= but must not refetch the whole help center.
  loaderDeps: () => ({}),
  loader: () => getHelpCenter(),
  head: ({ match }) => {
    const title = "Help center";
    const description = "Guides and answers from the team.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        ...(match.search.q ? [{ name: "robots", content: "noindex" }] : []),
      ],
    };
  },
  component: HelpHome,
  errorComponent: ({ error }) => <ErrorState message={(error as Error)?.message} retry="/help" />,
  pendingComponent: HelpHomeSkeleton,
});

// Articles shown per collection on the home page before "View all".
const PREVIEW = 4;

function HelpHome() {
  const data = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const { q: initial } = Route.useSearch();
  const [q, setQ] = useState(initial ?? "");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const searchingFor = q.trim();

  useEffect(() => {
    if (!searchingFor) {
      setHits(null);
      setFailed(null);
      return;
    }
    setSearching(true);
    let live = true;
    const t = setTimeout(
      () =>
        searchHelp({ data: { q: searchingFor } })
          .then((r) => {
            if (!live) return;
            setHits(r);
            setFailed(null);
          })
          .catch((err) => {
            if (!live) return;
            // Say so, rather than showing a failed search as no matches.
            setHits([]);
            setFailed(err instanceof Error ? err.message : "Search failed. Try again.");
          })
          .finally(() => live && setSearching(false)),
      120,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [searchingFor]);

  const empty = data.total === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1072px] flex-1 flex-col px-4 md:px-8">
      <section className="mx-auto flex w-full max-w-[560px] flex-col items-center pt-14 pb-12 text-center md:pt-20">
        <HelpLabel className="tracking-[0.14em]">Help center</HelpLabel>
        <h1 className="mt-3 text-[30px] leading-[1.15] font-semibold tracking-[-0.03em] md:text-[36px]">How can we help?</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">Guides and answers from the {root.workspace.name} team.</p>

        <SearchBox value={q} onChange={setQ} hits={hits} disabled={empty} />

        <div className="mt-8 w-full text-left">
          {searchingFor ? (
            <Results q={searchingFor} hits={hits} searching={searching} failed={failed} />
          ) : data.popular.length ? (
            <>
              <HelpLabel className="pb-2 pl-0.5">Popular</HelpLabel>
              <div className="flex flex-col">
                {data.popular.map((a) => (
                  <ArticleRow key={a.slug} slug={a.slug} title={a.title} collection={a.collection} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>

      {empty ? (
        <div className="border-t px-6 py-16 text-center">
          <p className="text-[14px] font-semibold">No articles yet</p>
          <p className="mt-1 text-sm text-muted-foreground">{root.user?.role === "admin" ? "Write the first one from the dashboard." : "The team has not published anything here yet. Ask on the board instead."}</p>
        </div>
      ) : (
        <section className={cn("grid grid-cols-1 border-t md:grid-cols-2", searchingFor && "opacity-60 transition-opacity duration-150")} aria-label="Collections">
          {data.collections.map((c, i) => (
            <div key={c.id} className={cn("flex gap-4 border-b py-7 md:py-8", i % 2 === 0 ? "md:border-r md:pr-10" : "md:pl-10")}>
              <HelpIconBox name={c.icon} />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline justify-between gap-3">
                  <Link to="/help/collections/$slug" params={{ slug: c.slug }} className="text-[16px] font-semibold tracking-[-0.01em] hover:underline hover:decoration-foreground/30 hover:underline-offset-4">
                    {c.title}
                  </Link>
                  <span className="shrink-0 font-mono text-[12px] text-faint">
                    {c.articles.length} {c.articles.length === 1 ? "article" : "articles"}
                  </span>
                </div>
                {c.description ? <p className="mt-0.5 text-[14px] text-muted-foreground">{c.description}</p> : null}
                <ul className="mt-4 flex flex-col">
                  {c.articles.slice(0, PREVIEW).map((a) => (
                    <li key={a.id}>
                      <Link to="/help/$slug" params={{ slug: a.slug }} className="group/a -mx-2 flex h-[30px] items-center justify-between gap-3 rounded-md px-2 text-[15px] text-foreground/90 hover:bg-accent/60 hover:text-foreground">
                        <span className="truncate">{a.title}</span>
                        <ArrowRightIcon className="size-3.5 shrink-0 text-faint transition-transform duration-150 group-hover/a:translate-x-0.5 group-hover/a:text-muted-foreground motion-reduce:transition-none" />
                      </Link>
                    </li>
                  ))}
                </ul>
                {c.articles.length > PREVIEW ? (
                  <Link to="/help/collections/$slug" params={{ slug: c.slug }} className="mt-1.5 self-start text-[14px] text-link hover:underline hover:underline-offset-4">
                    View all {c.articles.length}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          {data.uncategorised.length ? (
            <div className={cn("flex gap-4 border-b py-7 md:py-8", data.collections.length % 2 === 0 ? "md:border-r md:pr-10" : "md:pl-10")}>
              <HelpIconBox name="book" />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[16px] font-semibold tracking-[-0.01em]">More articles</span>
                  <span className="shrink-0 font-mono text-[12px] text-faint">{data.uncategorised.length}</span>
                </div>
                <ul className="mt-4 flex flex-col">
                  {data.uncategorised.map((a) => (
                    <li key={a.id}>
                      <Link to="/help/$slug" params={{ slug: a.slug }} className="group/a -mx-2 flex h-[30px] items-center justify-between gap-3 rounded-md px-2 text-[15px] text-foreground/90 hover:bg-accent/60 hover:text-foreground">
                        <span className="truncate">{a.title}</span>
                        <ArrowRightIcon className="size-3.5 shrink-0 text-faint" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </section>
      )}

      <section className="flex flex-col items-start justify-between gap-4 py-10 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Didn't find it?</h2>
          <p className="mt-0.5 text-[14px] text-muted-foreground">Ask on the board. If others need it too, it becomes a feature.</p>
        </div>
        <AskOnBoard />
      </section>
    </div>
  );
}

// The big search box. `/` and cmd+K focus it; arrows move through results and
// enter opens the highlighted one.
function SearchBox({ value, onChange, hits, disabled }: { value: string; onChange: (v: string) => void; hits: Hit[] | null; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const inUrl = Route.useSearch().q ?? "";
  const navigate = useNavigate();
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    // Capture phase so this wins over the header's own "/" shortcut here.
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        e.stopPropagation();
        ref.current?.focus();
        ref.current?.select();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Keep ?q= in the URL so a search can be shared, without a history entry per keystroke.
  useEffect(() => {
    if (value.trim() === inUrl) return;
    const t = setTimeout(() => navigate({ to: "/help", search: value.trim() ? { q: value.trim() } : {}, replace: true, resetScroll: false }), 300);
    return () => clearTimeout(t);
  }, [value, inUrl, navigate]);

  return (
    <form
      role="search"
      className="relative mt-8 w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const first = hits?.[0];
        if (first) navigate({ to: "/help/$slug", params: { slug: first.slug } });
      }}
    >
      <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-faint" />
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (value) onChange("");
            else e.currentTarget.blur();
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            document.querySelector<HTMLAnchorElement>("[data-help-hit]")?.focus();
          }
        }}
        placeholder="Search articles"
        aria-label="Search help articles"
        autoComplete="off"
        spellCheck={false}
        className="h-12 w-full rounded-xl border border-input bg-card pr-16 pl-11 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-ring/60 focus:ring-1 focus:ring-ring/40 disabled:opacity-60"
      />
      {value ? (
        <button type="button" onClick={() => (onChange(""), ref.current?.focus())} aria-label="Clear search" className="absolute top-1/2 right-3 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground">
          <XIcon className="size-3.5" />
        </button>
      ) : (
        <Kbd className="pointer-events-none absolute top-1/2 right-3 h-6 min-w-7 -translate-y-1/2 rounded-md px-1.5 text-[12px]">{mac ? "⌘K" : "/"}</Kbd>
      )}
    </form>
  );
}

function Results({ q, hits, searching, failed }: { q: string; hits: Hit[] | null; searching: boolean; failed: string | null }) {
  if (failed) {
    return (
      <div className="border-y py-8 text-center" role="alert">
        <p className="text-[14px] font-semibold">Search did not go through</p>
        <p className="mt-1 text-sm text-muted-foreground">{failed}</p>
      </div>
    );
  }
  if (!hits) {
    return (
      <div className="flex flex-col" aria-busy>
        <HelpLabel className="pb-2 pl-0.5">Searching</HelpLabel>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-[52px] items-center border-b">
            <div className="h-3 w-2/3 animate-pulse rounded bg-accent motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    );
  }
  if (!hits.length) {
    return (
      <div className="border-y py-8 text-center" aria-live="polite">
        <p className="text-[14px] font-semibold">Nothing matches “{q}”</p>
        <p className="mt-1 text-sm text-muted-foreground">Try fewer words, or ask on the board below.</p>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col transition-opacity duration-150", searching && "opacity-70")} aria-live="polite">
      <HelpLabel className="pb-2 pl-0.5">
        {hits.length} {hits.length === 1 ? "result" : "results"}
      </HelpLabel>
      {hits.map((h, i) => (
        <Link
          key={h.id}
          to="/help/$slug"
          params={{ slug: h.slug }}
          data-help-hit
          onKeyDown={(e) => {
            const rows = [...document.querySelectorAll<HTMLAnchorElement>("[data-help-hit]")];
            if (e.key === "ArrowDown") (e.preventDefault(), rows[i + 1]?.focus());
            if (e.key === "ArrowUp") (e.preventDefault(), i === 0 ? document.querySelector<HTMLInputElement>("[aria-label='Search help articles']")?.focus() : rows[i - 1]?.focus());
          }}
          className="-mx-2 flex items-start gap-3 rounded-lg border-b border-transparent px-2 py-3 outline-none [&:not(:last-child)]:border-b-border hover:bg-accent/50 focus-visible:bg-accent/60"
        >
          <FileTextIcon className="mt-[3px] size-4 shrink-0 text-faint" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] text-foreground">{h.title}</span>
            {h.excerpt ? <span className="truncate text-[13px] text-muted-foreground">{h.excerpt}</span> : null}
          </span>
          {h.collection ? <span className="mt-[3px] hidden shrink-0 font-mono text-[12px] text-faint lowercase sm:inline">{h.collection.title}</span> : null}
        </Link>
      ))}
    </div>
  );
}

function ArticleRow({ slug, title, collection }: { slug: string; title: string; collection: string | null }) {
  return (
    <Link to="/help/$slug" params={{ slug }} className="group/row flex h-[46px] items-center gap-3 border-b px-0.5 transition-colors hover:border-input">
      <FileTextIcon className="size-4 shrink-0 text-faint group-hover/row:text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[15px] text-foreground/90 group-hover/row:text-foreground">{title}</span>
      {collection ? <span className="shrink-0 font-mono text-[12px] text-faint lowercase">{collection}</span> : null}
    </Link>
  );
}
