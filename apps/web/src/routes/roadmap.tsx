import { ChatCircleIcon, CaretUpIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useLoaderData, useNavigate } from "@tanstack/react-router";

import { TagChip } from "@/components/bits";
import { getRoadmap } from "@/functions/posts";
import { ROADMAP_COLUMNS, STATUS_META } from "@/lib/status";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/roadmap")({
  validateSearch: (s: Record<string, unknown>) => ({ board: typeof s.board === "string" ? s.board : undefined }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getRoadmap({ data: deps }),
  head: () => ({ meta: [{ title: "Roadmap · feedback" }] }),
  component: RoadmapPage,
});

function RoadmapPage() {
  const posts = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/roadmap" });

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 py-7 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold leading-tight">Roadmap</h1>
          <p className="text-muted-foreground">Where things stand. Cards move here straight from the board when a status changes.</p>
        </div>
        <div className="flex gap-0.5 rounded-md border bg-card p-[3px]">
          <button
            type="button"
            onClick={() => navigate({ search: { board: undefined } })}
            className={cn("rounded-[5px] px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors", !search.board && "bg-accent text-foreground")}
          >
            All boards
          </button>
          {root.boards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => navigate({ search: { board: b.id } })}
              className={cn("rounded-[5px] px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors", search.board === b.id && "bg-accent text-foreground")}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ROADMAP_COLUMNS.map((status) => {
          const items = posts.filter((p) => p.status === status);
          return (
            <div key={status} className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-center gap-2 px-1 pb-1 text-[13.5px] font-semibold">
                <span className={cn("size-[7px] rounded-full", STATUS_META[status].dot)} />
                {STATUS_META[status].label}
                <span className="font-mono text-xs font-normal text-muted-foreground">{items.length}</span>
              </div>
              {items.length === 0 ? <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">Nothing here yet</div> : null}
              {items.map((p) => (
                <Link
                  key={p.id}
                  to="/p/$id"
                  params={{ id: String(p.id) }}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-3.5 transition-colors duration-150 hover:bg-accent/40"
                >
                  <div className="text-sm font-semibold leading-snug">{p.title}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CaretUpIcon weight="bold" className="size-3" /> {p.voteCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ChatCircleIcon className="size-3" /> {p.commentCount}
                    </span>
                    {p.eta ? <span className="font-mono">{p.eta}</span> : null}
                    {p.tags[0] ? <TagChip className="ml-auto">{p.tags[0].name}</TagChip> : null}
                  </div>
                  {status === "progress" ? (
                    <div className="h-[3px] overflow-hidden rounded-sm bg-accent">
                      <div className="h-full bg-status-progress" style={{ width: `${progressFor(p.statusChangedAt)}%` }} />
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}

// A gentle guess at how far along "in progress" is: time since it started,
// capped so it never claims to be done.
function progressFor(since: Date | string | number) {
  const days = (Date.now() - new Date(since).getTime()) / 86_400_000;
  return Math.min(85, Math.max(12, Math.round(days * 6)));
}
