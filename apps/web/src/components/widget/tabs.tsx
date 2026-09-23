import { Skeleton } from "@openheard/ui/components/skeleton";
import { useLoaderData } from "@tanstack/react-router";

import { VoteButton } from "@/components/vote-button";
import { getRoadmap } from "@/functions/posts";
import type { listChangelog } from "@/functions/changelog";
import { roadmapStatuses } from "@/lib/status";

import { useLoad, useWidget } from "./context";
import { Failed } from "./feedback";

export function RoadmapTab() {
  const root = useLoaderData({ from: "__root__" });
  const { me, headers, requireSignIn, openPost } = useWidget();
  const { data: posts, loading, error, reload } = useLoad(() => getRoadmap({ data: {}, headers }), [me?.id]);
  const columns = roadmapStatuses(root.statuses).filter((s) => s.kind !== "review");
  const boardName = (id: string) => (root.boards.length > 1 ? root.boards.find((b) => b.id === id)?.name ?? "" : "");

  if (error) return <Failed message={error} retry={reload} />;
  if (loading && !posts) return <ListSkeleton />;

  return (
    <div className="flex flex-col gap-2 pb-4">
      {columns.map((meta) => {
        const items = (posts ?? []).filter((p) => p.status === meta.key);
        return (
          <section key={meta.key} className="flex flex-col">
            <header className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b bg-background px-4 text-[13px] font-semibold">
              <span className="size-2 rounded-full" style={{ background: meta.color }} />
              {meta.label}
              <span className="ml-auto font-mono text-xs font-normal text-faint">{items.length}</span>
            </header>
            {items.length === 0 ? <p className="px-4 py-3.5 text-xs text-faint">Nothing here yet</p> : null}
            <ol role="list" className="divide-y divide-white/6">
              {items.map((p) => (
                <li key={p.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openPost(p.id)}
                    onKeyDown={(e) => e.key === "Enter" && openPost(p.id)}
                    className="group/card flex cursor-pointer items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-card focus-visible:bg-card"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="line-clamp-2 text-[13px]/5 font-semibold text-foreground/90 group-hover/card:text-foreground">{p.title}</span>
                      {boardName(p.boardId) || p.eta ? (
                        <span className="text-[12px] text-faint">
                          {boardName(p.boardId)}
                          {p.eta ? <span className="font-mono">{boardName(p.boardId) ? " · " : ""}{p.eta}</span> : null}
                        </span>
                      ) : null}
                    </div>
                    <VoteButton
                      postId={p.id}
                      count={p.voteCount}
                      voted={p.voted}
                      signedIn={!!me}
                      anonymousVoting={root.workspace.anonymousVoting}
                      headers={headers}
                      onSignIn={() => requireSignIn()}
                      size="sm"
                    />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export type ChangelogEntry = Awaited<ReturnType<typeof listChangelog>>[number];

function shortDate(d: Date | string | number) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

export function ChangelogTab({ entries, error, retry, seenAt }: { entries?: ChangelogEntry[]; error?: string; retry: () => void; seenAt: number }) {
  const { openPost } = useWidget();
  if (error) return <Failed message={error} retry={retry} />;
  if (!entries) return <ListSkeleton />;
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
        <p className="text-[14px] font-semibold">Nothing shipped yet</p>
        <p className="text-[13px] text-muted-foreground">Updates land here when the team releases something.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col divide-y">
      {entries.map((e) => {
        const at = new Date(e.publishedAt ?? e.createdAt).getTime();
        const fresh = at > seenAt;
        return (
          <article key={e.id} className="flex flex-col gap-2.5 px-4 py-5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] tracking-[0.04em] text-faint">{shortDate(at)}</span>
              {e.version ? <span className="inline-flex h-5 items-center rounded-md border border-input bg-secondary px-1.5 font-mono text-[11px] text-foreground">{e.version}</span> : null}
              {fresh ? <span className="inline-flex h-5 items-center rounded-full bg-link/12 px-2 font-mono text-[11px] font-semibold text-link">new</span> : null}
            </div>
            <h3 className="text-[15px]/5 font-semibold tracking-[-0.015em]">{e.title}</h3>
            {e.body ? <p className="text-[13px]/[1.6] whitespace-pre-wrap text-muted-foreground">{e.body}</p> : null}
            {e.posts.length ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="mr-1 font-mono text-[11px] tracking-[0.06em] text-faint uppercase">Shipped from</span>
                {e.posts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openPost(p.id)}
                    className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-input pr-2.5 pl-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-status-shipped" />
                    <span className="truncate">{p.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
