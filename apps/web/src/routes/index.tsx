import type { Status } from "@openheard/db/schema/feedback";
import { STATUSES } from "@openheard/db/schema/feedback";
import { Button } from "@openheard/ui/components/button";
import { ChatCircleIcon, MagnifyingGlassIcon, PlusIcon, PushPinIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useLoaderData, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Kbd, StatusPill, TagChip } from "@/components/bits";
import { NewPostDialog } from "@/components/new-post-dialog";
import { VoteButton } from "@/components/vote-button";
import { listPosts } from "@/functions/posts";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { ago } from "@/lib/time";
import { useKeyNav } from "@/lib/use-key-nav";
import { cn } from "@openheard/ui/lib/utils";

type Search = { board?: string; status?: Status; tag?: string; q?: string; sort?: "trending" | "top" | "new" };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    board: typeof s.board === "string" ? s.board : undefined,
    status: STATUSES.includes(s.status as Status) ? (s.status as Status) : undefined,
    tag: typeof s.tag === "string" ? s.tag : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    sort: s.sort === "top" || s.sort === "new" ? s.sort : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listPosts({ data: { ...deps, sort: deps.sort ?? "trending", limit: 30 } }),
  component: BoardPage,
});

function BoardPage() {
  const { posts, total } = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const searchRef = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState(false);
  const [q, setQ] = useState(search.q ?? "");

  const [focused, setFocused] = useKeyNav(posts.length, {
    open: (i) => navigate({ to: "/p/$id", params: { id: String(posts[i]!.id) } }),
    vote: (i) => document.querySelector<HTMLButtonElement>(`[data-row-index="${i}"] [data-vote]`)?.click(),
    search: () => searchRef.current?.focus(),
    create: () => setComposing(true),
  });

  const set = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch }) });
  const sort = search.sort ?? "trending";
  const signedIn = !!root.user;

  return (
    <div className="grid flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-6 border-r px-4 py-6 md:flex">
        <div className="flex flex-col gap-0.5">
          <div className="px-2 pb-1.5 font-mono text-[11px] text-muted-foreground">Boards</div>
          <SideItem active={!search.board} onClick={() => set({ board: undefined })} label="All posts" count={root.total} />
          {root.boards.map((b) => (
            <SideItem key={b.id} active={search.board === b.id} onClick={() => set({ board: b.id })} label={b.name} count={b.count} />
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="px-2 pb-1.5 font-mono text-[11px] text-muted-foreground">Status</div>
          {STATUS_ORDER.filter((s) => s !== "open" || root.statusCounts.open).map((s) => (
            <SideItem
              key={s}
              active={search.status === s}
              onClick={() => set({ status: search.status === s ? undefined : s })}
              label={
                <span className="flex items-center gap-2.5">
                  <span className={cn("size-[7px] rounded-full", STATUS_META[s].dot)} />
                  {STATUS_META[s].label}
                </span>
              }
              count={root.statusCounts[s] ?? 0}
            />
          ))}
        </div>
        {root.tags.length ? (
          <div className="flex flex-col gap-1.5">
            <div className="px-2 pb-0.5 font-mono text-[11px] text-muted-foreground">Tags</div>
            <div className="flex flex-wrap gap-1 px-2">
              {root.tags.map((t) => (
                <button key={t.id} type="button" onClick={() => set({ tag: search.tag === t.id ? undefined : t.id })}>
                  <TagChip active={search.tag === t.id} className="cursor-pointer hover:text-foreground">
                    {t.name}
                  </TagChip>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-auto flex flex-col gap-2 px-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> move
          </div>
          <div className="flex items-center gap-2">
            <Kbd>v</Kbd> vote
          </div>
          <div className="flex items-center gap-2">
            <Kbd>c</Kbd> new post
          </div>
        </div>
      </aside>

      <main className="mx-auto flex w-full max-w-[900px] flex-col gap-4 px-5 py-7 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[26px] font-semibold leading-tight">What should we build next?</h1>
            <p className="text-muted-foreground">{root.workspace.tagline}</p>
          </div>
          <Button onClick={() => setComposing(true)}>
            <PlusIcon weight="bold" className="size-3.5" />
            New post
          </Button>
        </div>

        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 md:hidden [scrollbar-width:none]">
          <Chip active={!search.board && !search.status} onClick={() => navigate({ search: {} })}>
            All
          </Chip>
          {root.boards.map((b) => (
            <Chip key={b.id} active={search.board === b.id} onClick={() => set({ board: search.board === b.id ? undefined : b.id })}>
              {b.name}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-border" />
          {STATUS_ORDER.filter((s) => (root.statusCounts[s] ?? 0) > 0).map((s) => (
            <Chip key={s} active={search.status === s} onClick={() => set({ status: search.status === s ? undefined : s })}>
              <span className={cn("size-[7px] rounded-full", STATUS_META[s].dot)} />
              {STATUS_META[s].label}
            </Chip>
          ))}
        </div>

        <div className="flex gap-2.5">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              set({ q: q || undefined });
            }}
          >
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => q !== (search.q ?? "") && set({ q: q || undefined })}
              placeholder="Search posts"
              className="h-9 w-full rounded-md border bg-card pr-10 pl-9 text-[13.5px] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/50"
            />
            <Kbd className="absolute top-1/2 right-2.5 -translate-y-1/2">/</Kbd>
          </form>
          <div className="flex gap-0.5 rounded-md border bg-card p-[3px]">
            {(["trending", "top", "new"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ sort: s === "trending" ? undefined : s })}
                className={cn("rounded-[5px] px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground transition-colors", sort === s && "bg-accent text-foreground")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {posts.length === 0 ? (
          <EmptyBoard filtered={!!(search.q || search.status || search.tag || search.board)} onNew={() => setComposing(true)} onClear={() => navigate({ search: {} })} />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {posts.map((p, i) => (
              <Link
                key={p.id}
                to="/p/$id"
                params={{ id: String(p.id) }}
                data-row-index={i}
                onMouseEnter={() => setFocused(i)}
                className={cn(
                  "flex gap-3.5 border-b px-4 py-3.5 transition-colors duration-150 last:border-b-0 hover:bg-accent/40",
                  focused === i && "bg-accent/40",
                )}
              >
                <VoteButton postId={p.id} count={p.voteCount} voted={p.voted} signedIn={signedIn} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {p.pinned ? <PushPinIcon weight="fill" className="size-3.5 text-muted-foreground" /> : null}
                    <span className="text-[14.5px] font-semibold leading-snug">{p.title}</span>
                    {p.status !== "open" ? <StatusPill status={p.status} /> : null}
                  </div>
                  {p.excerpt ? <p className="text-[13.5px] leading-relaxed text-muted-foreground">{p.excerpt}</p> : null}
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <ChatCircleIcon className="size-3.5" /> {p.commentCount}
                    </span>
                    {p.tags.length ? (
                      <span className="flex gap-1.5">
                        {p.tags.map((t) => (
                          <TagChip key={t.id}>{t.name}</TagChip>
                        ))}
                      </span>
                    ) : null}
                    <span className="ml-auto truncate">
                      {p.author?.name ?? "someone"} · {ago(p.createdAt)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
            <div className="flex justify-center px-4 py-3 text-xs text-muted-foreground">
              Showing {posts.length} of {total}
            </div>
          </div>
        )}
      </main>

      <NewPostDialog open={composing} onOpenChange={setComposing} boards={root.boards} tags={root.tags} defaultBoard={search.board} signedIn={signedIn} />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors",
        active && "border-foreground/40 bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SideItem({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: React.ReactNode; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-md px-2.5 py-[7px] text-left text-[13.5px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
        active && "bg-secondary font-medium text-foreground",
      )}
    >
      <span>{label}</span>
      <span className="font-mono text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function EmptyBoard({ filtered, onNew, onClear }: { filtered: boolean; onNew: () => void; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-16 text-center">
      <p className="text-[15px] font-medium">{filtered ? "Nothing matches" : "No posts yet"}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtered ? "Try a different filter, or post the thing you were looking for." : "The first post sets the tone. Say what you wish the product did."}
      </p>
      <div className="mt-2 flex gap-2">
        {filtered ? (
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
        <Button onClick={onNew}>
          <PlusIcon weight="bold" className="size-3.5" />
          New post
        </Button>
      </div>
    </div>
  );
}
