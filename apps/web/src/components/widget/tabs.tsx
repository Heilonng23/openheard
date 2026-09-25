import { Skeleton } from "@openheard/ui/components/skeleton";
import { cn } from "@openheard/ui/lib/utils";
import { useLoaderData } from "@tanstack/react-router";
import { useState } from "react";

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
    <div className="flex flex-col gap-1 pt-1 pb-3">
      {columns.map((meta) => {
        const items = (posts ?? []).filter((p) => p.status === meta.key);
        return (
          <section key={meta.key} className="flex flex-col">
            <header className="flex h-10 items-center gap-2 px-5 pt-2 font-mono text-xs lowercase" style={{ color: meta.color }}>
              <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
              {meta.label}
              <span className="ml-auto text-faint">{items.length}</span>
            </header>
            {items.length === 0 ? <p className="px-5 pb-3 text-xs text-faint">Nothing here yet</p> : null}
            <ol role="list" className="mx-2 flex flex-col">
              {items.map((p) => (
                <li key={p.id} className="border-b border-foreground/6 last:border-b-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openPost(p.id)}
                    onKeyDown={(e) => e.key === "Enter" && openPost(p.id)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-3 outline-none hover:bg-card focus-visible:bg-card"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="line-clamp-2 text-[14px]/5 font-semibold tracking-[-0.01em]">{p.title}</span>
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
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toLowerCase();
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
    <ol role="list" className="mx-2 flex flex-col py-1">
      {entries.map((e) => (
        <ChangelogRow key={e.id} entry={e} fresh={new Date(e.publishedAt ?? e.createdAt).getTime() > seenAt} onPost={openPost} />
      ))}
    </ol>
  );
}

function ChangelogRow({ entry: e, fresh, onPost }: { entry: ChangelogEntry; fresh: boolean; onPost: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const long = e.body.length > 160 || e.posts.length > 0;
  return (
    <li className="border-b border-foreground/6 last:border-b-0">
      <div
        role={long ? "button" : undefined}
        tabIndex={long ? 0 : undefined}
        aria-expanded={long ? open : undefined}
        onClick={() => long && setOpen((o) => !o)}
        onKeyDown={(ev) => long && ev.key === "Enter" && setOpen((o) => !o)}
        className={cn("flex flex-col gap-1.5 rounded-xl px-2.5 py-3.5 outline-none", long && "cursor-pointer hover:bg-card focus-visible:bg-card")}
      >
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-faint">{shortDate(e.publishedAt ?? e.createdAt)}</span>
          {e.version ? <span className="text-muted-foreground">{e.version}</span> : null}
          {fresh ? (
            <span className="inline-flex items-center gap-1.5 text-link">
              <span className="size-1.5 rounded-full bg-link" />
              new
            </span>
          ) : null}
        </div>
        <h3 className="text-[14px]/5 font-semibold tracking-[-0.01em]">{e.title}</h3>
        {e.body ? <p className={cn("text-[13px]/5 whitespace-pre-wrap text-muted-foreground", !open && "line-clamp-2")}>{e.body}</p> : null}
        {open && e.posts.length ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
            <span className="mr-1 font-mono text-[11px] tracking-[0.06em] text-faint uppercase">Shipped from</span>
            {e.posts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onPost(p.id);
                }}
                className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-input pr-2.5 pl-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-status-shipped" />
                <span className="truncate">{p.title}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-5 py-5">
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
