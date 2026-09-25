import { ChatCircleIcon, PushPinIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, redirect, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState } from "react";

import { Button } from "@openheard/ui/components/button";
import { Avatar, StatusLabel } from "@/components/bits";
import { NewPostDialog, type OptimisticPost } from "@/components/new-post-dialog";
import { RailItem, RailLabel, Shell } from "@/components/shell";
import { FeedSkeleton } from "@/components/states";
import { VoteButton } from "@/components/vote-button";
import { listPosts } from "@/functions/posts";
import { openSignIn, takeComposerRequest } from "@/lib/pending-action";
import { roadmapStatuses } from "@/lib/status";
import { ago } from "@/lib/time";
import { useKeyNav } from "@/lib/use-key-nav";
import { cn } from "@openheard/ui/lib/utils";

const Landing = lazy(() => import("../components/landing/page").then((m) => ({ default: m.Landing })));

type Search = { board?: string; status?: string; q?: string; sort?: "top" | "new" };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    board: typeof s.board === "string" ? s.board : undefined,
    status: typeof s.status === "string" && s.status ? s.status : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    sort: s.sort === "top" || s.sort === "new" ? s.sort : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    if (parent.loaderData?.marketing) return { posts: [], total: 0, marketing: true as const };
    const data = await listPosts({ data: { ...deps, sort: deps.sort ?? "trending", limit: 30 } });
    if (data.total === 0 && !deps.q && !deps.board && !deps.status) {
      if (parent.loaderData?.user?.role === "admin" && parent.loaderData?.workspace.name === "openheard") throw redirect({ to: "/welcome" });
    }
    return { ...data, marketing: false as const };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.marketing) return {};
    const title = "openheard · the open source Canny alternative";
    const description =
      "Collect feedback, let users vote, ship a public roadmap and changelog. Self-host in one command or use the cloud. Works with Claude, Cursor and any MCP agent.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  component: IndexPage,
  pendingComponent: FeedSkeleton,
});

function IndexPage() {
  const data = Route.useLoaderData();
  if (data.marketing) return <Suspense><Landing /></Suspense>;
  return <BoardPage />;
}

function BoardPage() {
  const { posts, total } = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [optimisticPost, setOptimisticPost] = useState<OptimisticPost | null>(null);

  useEffect(() => {
    const handler = () => {
      takeComposerRequest();
      setComposing(true);
    };
    window.addEventListener("openheard:open-composer", handler);
    // Asked for before this page was listening.
    if (takeComposerRequest()) setComposing(true);
    return () => window.removeEventListener("openheard:open-composer", handler);
  }, []);

  useEffect(() => {
    router.preloadRoute({ to: "/roadmap" } as unknown as Parameters<typeof router.preloadRoute>[0]);
    router.preloadRoute({ to: "/changelog" } as unknown as Parameters<typeof router.preloadRoute>[0]);
    for (const p of posts.slice(0, 10)) {
      router.preloadRoute({ to: "/p/$id", params: { id: String(p.id) } } as unknown as Parameters<typeof router.preloadRoute>[0]);
    }
  }, [router, posts]);

  const [focused, setFocused] = useKeyNav(posts.length, {
    open: (i) => navigate({ to: "/p/$id", params: { id: String(posts[i]!.id) } }),
    vote: (i) => document.querySelector<HTMLButtonElement>(`[data-row-index="${i}"] [data-vote]`)?.click(),
    search: () => document.querySelector<HTMLInputElement>("header input")?.focus(),
    create: tryCompose,
  });

  const set = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch }) });
  const sort = search.sort ?? "trending";
  const signedIn = !!root.user;
  const canPost = signedIn && (root.workspace.whoCanPost !== "members" || root.user?.role !== "guest");
  const filtered = !!(search.q || search.status || search.board);

  function tryCompose() {
    if (!signedIn) {
      openSignIn({ type: "compose" });
      return;
    }
    if (!canPost) return;
    setComposing(true);
  }

  const rail = (
    <>
      <Button full arrow size="lg" onClick={tryCompose}>
        Post idea
      </Button>
      <div className="flex flex-col gap-0.5">
        <RailLabel>Boards</RailLabel>
        <RailItem active={!search.board} to="/" search={{ ...search, board: undefined }} label="All posts" count={root.total} />
        {root.boards.map((b) => (
          <RailItem key={b.id} active={search.board === b.id} to="/" search={{ ...search, board: search.board === b.id ? undefined : b.id }} label={b.name} count={b.count} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <RailLabel>Roadmap</RailLabel>
        {roadmapStatuses(root.statuses)
          .filter((s) => s.kind !== "review")
          .map((s) => (
            <RailItem key={s.key} active={search.status === s.key} to="/" search={{ ...search, status: search.status === s.key ? undefined : s.key }} label={s.label} color={s.color} count={root.statusCounts[s.key] ?? 0} />
          ))}
      </div>
    </>
  );

  return (
    <Shell rail={rail}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-[18px]">
          {(["trending", "top", "new"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set({ sort: s === "trending" ? undefined : s })}
              className={cn("rounded-sm text-[13px] capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring/60", sort === s ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-faint">
          {search.q ? (
            <button type="button" onClick={() => set({ q: undefined })} className="rounded-md border border-dashed border-input px-2 py-0.5 text-muted-foreground hover:text-foreground">
              “{search.q}” ×
            </button>
          ) : null}
          <span>
            {total} {total === 1 ? "post" : "posts"}
          </span>
        </div>
      </div>

      {posts.length === 0 && !optimisticPost ? (
        <EmptyBoard filtered={filtered} onNew={tryCompose} onClear={() => navigate({ search: {} })} />
      ) : (
        <ol role="list" className="divide-y divide-white/6">
          {[...(optimisticPost ? [optimisticPost] : []), ...posts].map((p, i) => {
            const isOptimistic = "_optimistic" in p;
            const st = root.statuses.find((x) => x.key === p.status);
            const showStatus = st && st.kind !== "open";
            return (
              <li key={p.id}>
                <Link
                  to="/p/$id"
                  params={{ id: String(p.id) }}
                  data-row-index={i}
                  data-focused={focused === i || undefined}
                  onMouseEnter={() => setFocused(i)}
                  className={cn("group/row flex items-start gap-6 py-6 first:pt-2", isOptimistic && "opacity-60")}
                >
                  <span className="hidden w-8 shrink-0 pt-1 font-mono text-xs text-faint tabular-nums md:block">{sort === "trending" ? String(i + 1).padStart(2, "0") : ""}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em] text-foreground/90 group-hover/row:text-foreground group-data-focused/row:text-foreground">
                      {p.pinned ? <PushPinIcon weight="fill" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                      <h2 className="min-w-0 truncate">{p.title}</h2>
                    </div>
                    {p.excerpt ? <p className="line-clamp-2 max-w-[68ch] text-sm/6 text-pretty text-muted-foreground">{p.excerpt}</p> : null}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                      {showStatus ? <StatusLabel status={p.status} /> : null}
                      <span className="inline-flex items-center gap-1.5">
                        <ChatCircleIcon className="size-[13px] shrink-0 text-faint" />
                        <span className="font-mono tabular-nums">{p.commentCount}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-faint">
                        <Avatar name={p.author?.name ?? "?"} image={p.author?.image} size={16} />
                        {p.author?.name ?? "someone"}
                        <span>· {ago(p.createdAt)}</span>
                      </span>
                    </div>
                  </div>
                  <VoteButton postId={p.id} count={p.voteCount} voted={p.voted} signedIn={signedIn} anonymousVoting={root.workspace.anonymousVoting} className="group-data-focused/row:border-input" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <NewPostDialog
        open={composing}
        onOpenChange={setComposing}
        boards={root.boards}
        defaultBoard={search.board}
        signedIn={signedIn}
        onOptimisticPost={(p) => {
          if (p && root.user) setOptimisticPost({ ...p, author: { name: root.user.name, image: root.user.image } });
          else setOptimisticPost(p);
        }}
      />
    </Shell>
  );
}

function EmptyBoard({ filtered, onNew, onClear }: { filtered: boolean; onNew: () => void; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <p className="text-[14px] font-semibold">{filtered ? "Nothing matches" : "No posts yet"}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{filtered ? "Try a different filter, or post the thing you were looking for." : "The first post sets the tone. Say what you wish the product did."}</p>
      <div className="mt-2 flex gap-2">
        {filtered ? (
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
        <Button arrow onClick={onNew}>Post idea</Button>
      </div>
    </div>
  );
}
