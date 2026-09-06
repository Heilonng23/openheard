import { Link, createFileRoute, useLoaderData, useNavigate } from "@tanstack/react-router";

import { ErrorState, RoadmapSkeleton } from "@/components/states";
import { VoteButton } from "@/components/vote-button";
import { getRoadmap } from "@/functions/posts";
import { roadmapStatuses } from "@/lib/status";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/roadmap")({
  validateSearch: (s: Record<string, unknown>) => ({ board: typeof s.board === "string" ? s.board : undefined }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getRoadmap({ data: deps }),
  head: () => ({ meta: [{ title: "Roadmap · feedback" }] }),
  component: RoadmapPage,
  errorComponent: ({ error }) => <ErrorState message={(error as Error)?.message} retry="/roadmap" />,
  pendingComponent: RoadmapSkeleton,
});

function RoadmapPage() {
  const posts = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/roadmap" });
  const boardName = (id: string) => root.boards.find((b) => b.id === id)?.name ?? "";

  return (
    <div className="mx-auto flex w-full max-w-[1072px] flex-1 flex-col gap-6 px-4 pt-7 pb-6 md:px-8 md:pt-10">
      {root.boards.length > 1 ? (
        <div className="flex items-center gap-[18px] text-[13px]">
          <button type="button" onClick={() => navigate({ search: { board: undefined } })} className={cn(!search.board ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
            All boards
          </button>
          {root.boards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => navigate({ search: { board: b.id } })}
              className={cn(search.board === b.id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {b.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-x-7 gap-y-8 md:grid-cols-2 xl:grid-cols-(--cols)" style={{ "--cols": `repeat(${roadmapStatuses(root.statuses).length}, minmax(0, 1fr))` } as React.CSSProperties}>
        {roadmapStatuses(root.statuses).map((meta) => {
          const status = meta.key;
          const items = posts.filter((p) => p.status === status);
          return (
            <section key={status} className="flex min-w-0 flex-col divide-y divide-white/6">
              <header className="flex items-center gap-2 px-1 pb-3 text-[13px] font-semibold">
                <span className="size-2 rounded-full" style={{ background: meta.color }} />
                {meta.label}
                <span className="ml-auto font-mono text-xs font-normal text-faint">{items.length}</span>
              </header>
              {items.length === 0 ? <p className="px-1 py-4 text-xs text-faint">Nothing here yet</p> : null}
              {items.map((p) => (
                <Link
                  key={p.id}
                  to="/p/$id"
                  params={{ id: String(p.id) }}
                  className="group/card flex items-start gap-3 py-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-[13px]/5 font-semibold text-foreground/90 group-hover/card:text-foreground">{p.title}</span>
                    <span className="text-[12px] text-faint">
                      {boardName(p.boardId)}
                      {p.eta ? <span className="font-mono"> · {p.eta}</span> : null}
                    </span>
                    {meta.kind === "progress" ? <Ticks value={progressFor(p.statusChangedAt)} color={meta.color} /> : null}
                  </div>
<VoteButton postId={p.id} count={p.voteCount} voted={p.voted} signedIn={!!root.user} size="sm" />
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// Segmented progress: ten ticks, filled by time since work started, capped so
// it never claims to be done.
function Ticks({ value, color }: { value: number; color: string }) {
  const filled = Math.round(value / 10);
  return (
    <span className="mt-1 flex gap-[3px]" aria-label={`${value}% along`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={cn("h-2.5 w-[3px] rounded-[1px]", i >= filled && "bg-input")} style={i < filled ? { background: color } : undefined} />
      ))}
    </span>
  );
}

function progressFor(since: Date | string | number) {
  const days = (Date.now() - new Date(since).getTime()) / 86_400_000;
  return Math.min(85, Math.max(10, Math.round(days * 6)));
}
