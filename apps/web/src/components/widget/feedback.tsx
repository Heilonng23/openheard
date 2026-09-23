import { Button } from "@openheard/ui/components/button";
import { Skeleton } from "@openheard/ui/components/skeleton";
import { cn } from "@openheard/ui/lib/utils";
import { ArrowLeftIcon, ArrowSquareOutIcon, ChatCircleIcon, LightningIcon, PushPinIcon } from "@phosphor-icons/react";
import { useLoaderData } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Avatar, StatusChip, StatusLabel } from "@/components/bits";
import { VoteButton } from "@/components/vote-button";
import { createPost, getPost, listPosts, searchPosts } from "@/functions/posts";
import { findStatus } from "@/lib/status";
import { ago } from "@/lib/time";

import { useLoad, useWidget } from "./context";

type Sort = "trending" | "top" | "new";

export function FeedbackList() {
  const root = useLoaderData({ from: "__root__" });
  const { me, headers, requireSignIn, openPost, compose } = useWidget();
  const [sort, setSort] = useState<Sort>("trending");
  const { data, loading, error, reload } = useLoad(() => listPosts({ data: { sort, limit: 50 }, headers }), [sort, me?.id]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
        <div className="flex items-center gap-3.5">
          {(["trending", "top", "new"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={cn("rounded-sm text-[13px] capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring/60", sort === s ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {s}
            </button>
          ))}
        </div>
        <Button size="sm" arrow onClick={() => requireSignIn(compose)}>
          Post idea
        </Button>
      </div>

      {error ? (
        <Failed message={error} retry={reload} />
      ) : loading && !data ? (
        <RowsSkeleton />
      ) : data && data.posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <p className="text-[14px] font-semibold">No posts yet</p>
          <p className="text-[13px] text-muted-foreground">Be the first to say what would make this better.</p>
        </div>
      ) : (
        <ol role="list" className="divide-y divide-white/6">
          {data?.posts.map((p) => {
            const st = findStatus(root.statuses, p.status);
            return (
              <li key={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openPost(p.id)}
                  onKeyDown={(e) => e.key === "Enter" && openPost(p.id)}
                  className="group/row flex cursor-pointer items-start gap-4 px-4 py-4 outline-none transition-colors hover:bg-card focus-visible:bg-card"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-start gap-1.5">
                      {p.pinned ? <PushPinIcon weight="fill" className="mt-[3px] size-3 shrink-0 text-muted-foreground" /> : null}
                      <h3 className="line-clamp-2 text-[14px]/5 font-semibold tracking-[-0.01em] text-foreground/90 group-hover/row:text-foreground">{p.title}</h3>
                    </div>
                    {p.excerpt ? <p className="line-clamp-2 text-[13px]/5 text-muted-foreground">{p.excerpt}</p> : null}
                    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                      {st.kind !== "open" ? <StatusLabel status={p.status} /> : null}
                      <span className="inline-flex items-center gap-1.5">
                        <ChatCircleIcon className="size-[13px] shrink-0 text-faint" />
                        <span className="font-mono tabular-nums">{p.commentCount}</span>
                      </span>
                      <span className="text-faint">{ago(p.createdAt)}</span>
                    </div>
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
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function PostDetail({ id }: { id: number }) {
  const root = useLoaderData({ from: "__root__" });
  const { me, headers, requireSignIn, back } = useWidget();
  const { data: post, loading, error, reload } = useLoad(() => getPost({ data: { id }, headers }), [id, me?.id]);
  const comments = post ? post.timeline.filter((t) => t.kind === "comment" && !t.internal) : [];

  return (
    <div className="flex flex-col">
      <BackBar label="All posts" onBack={back} right={<a href={`/p/${id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">Open on the board <ArrowSquareOutIcon className="size-3" /></a>} />
      {error ? (
        <Failed message={error} retry={reload} />
      ) : loading && !post ? (
        <div className="flex flex-col gap-3 px-4 py-5">
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ) : !post ? (
        <div className="px-8 py-16 text-center text-[13px] text-muted-foreground">This post is not public yet.</div>
      ) : (
        <>
          <article className="flex flex-col gap-3 px-4 pt-5 pb-6">
            <div className="flex items-start gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <h2 className="text-[18px]/6 font-semibold tracking-[-0.02em] text-pretty">{post.title}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                  <StatusChip status={post.status} />
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar name={post.author?.name ?? "?"} image={post.author?.image} size={16} />
                    {post.author?.name ?? "someone"} · {ago(post.createdAt)}
                  </span>
                </div>
              </div>
              <VoteButton
                postId={post.id}
                count={post.voteCount}
                voted={post.voted}
                signedIn={!!me}
                anonymousVoting={root.workspace.anonymousVoting}
                headers={headers}
                onSignIn={() => requireSignIn()}
              />
            </div>
            {post.body ? <p className="text-[14px]/[1.6] whitespace-pre-wrap text-muted-foreground">{post.body}</p> : null}
          </article>
          <section className="flex flex-col border-t">
            <div className="flex items-center justify-between px-4 pt-4 pb-1">
              <span className="font-mono text-[11px] tracking-[0.06em] text-faint uppercase">
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
              </span>
            </div>
            {comments.length === 0 ? (
              <p className="px-4 pt-1 pb-6 text-[13px] text-muted-foreground">No comments yet.</p>
            ) : (
              <ol role="list" className="flex flex-col">
                {comments.map((c) =>
                  c.kind === "comment" ? (
                    <li key={c.id} className="flex gap-2.5 px-4 py-3">
                      <Avatar name={c.author?.name ?? "?"} image={c.author?.image} size={22} className="mt-0.5" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-xs">
                          <span className="font-semibold text-foreground">{c.author?.name ?? "someone"}</span>
                          <span className="text-faint"> · {ago(c.at)}</span>
                        </span>
                        <p className="text-[13px]/[1.55] whitespace-pre-wrap text-muted-foreground">{c.body}</p>
                      </div>
                    </li>
                  ) : null,
                )}
              </ol>
            )}
            <a href={`/p/${id}`} target="_blank" rel="noopener" className="mx-4 mb-5 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-input text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
              Join the discussion on the board <ArrowSquareOutIcon className="size-3" />
            </a>
          </section>
        </>
      )}
    </div>
  );
}

export function Composer() {
  const root = useLoaderData({ from: "__root__" });
  const { me, headers, back, openPost } = useWidget();
  const boards = root.boards;
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [similar, setSimilar] = useState<Awaited<ReturnType<typeof searchPosts>>>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const membersOnly = root.workspace.whoCanPost === "members" && (!me || me.role === "guest");

  useEffect(() => {
    const q = title.trim();
    if (q.length < 6) return setSimilar([]);
    const t = setTimeout(() => searchPosts({ data: { q }, headers }).then(setSimilar).catch(() => setSimilar([])), 200);
    return () => clearTimeout(t);
  }, [title, headers]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (title.trim().length < 4) return setError("Give it a title of a few words.");
    setBusy(true);
    setError("");
    try {
      const res = await createPost({ data: { boardId, title: title.trim(), body, tags: [] }, headers });
      if (res.pending) setPending(true);
      else openPost(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="flex flex-col">
        <BackBar label="All posts" onBack={back} />
        <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <p className="text-[14px] font-semibold">Thanks, it is in</p>
          <p className="text-[13px] text-muted-foreground">The team reviews new posts before they show up on the board.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={back}>
            Back to posts
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <BackBar label="All posts" onBack={back} />
      {membersOnly ? (
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">Only team members can post on this board. You can still vote.</p>
      ) : (
        <>
          {boards.length > 1 ? (
            <div className="flex flex-wrap gap-1.5 px-4 pt-4" role="radiogroup" aria-label="Board">
              {boards.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={boardId === b.id}
                  onClick={() => setBoardId(b.id)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                    boardId === b.id ? "border-input bg-secondary font-semibold text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {boardId === b.id ? <span className="size-1.5 rounded-full bg-link" /> : null}
                  {b.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-col gap-2 px-4 pt-4">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  bodyRef.current?.focus();
                }
              }}
              maxLength={140}
              placeholder="What would make this better?"
              aria-label="Post title"
              className="w-full bg-transparent text-[18px] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-faint"
            />
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
              rows={5}
              maxLength={5000}
              placeholder="What are you trying to do? Any workaround you use today?"
              aria-label="Post details"
              className="w-full resize-none bg-transparent text-[14px]/[1.55] text-muted-foreground outline-none placeholder:text-faint"
            />
          </div>
          {similar.length ? (
            <div className="flex flex-col gap-1 px-4 pb-2">
              <div className="flex items-center gap-1.5 pt-1 pb-1.5 font-mono text-[11px] tracking-[0.06em] text-faint uppercase">
                <LightningIcon weight="fill" className="size-3 text-status-planned" /> Looks similar · vote instead?
              </div>
              {similar.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openPost(s.id)}
                  className="flex min-h-10 items-center gap-2.5 rounded-lg bg-secondary px-2 py-2 text-left text-[13px] transition-colors hover:bg-accent"
                >
                  <span className="inline-flex h-[22px] shrink-0 items-center rounded-md border border-input px-1.5 font-mono text-[11px] text-muted-foreground">{s.voteCount}</span>
                  <span className="flex-1 truncate">{s.title}</span>
                </button>
              ))}
            </div>
          ) : null}
          {error ? <p role="alert" className="px-4 pt-1 text-[13px] text-red-400">{error}</p> : null}
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-5">
            <span className="text-xs text-faint">Posting as {me?.name ?? "you"}</span>
            <Button type="submit" arrow disabled={busy}>
              {busy ? "Posting…" : "Post idea"}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

export function BackBar({ label, onBack, right }: { label: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background px-2.5 pr-4">
      <button type="button" onClick={onBack} className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
        <ArrowLeftIcon className="size-3.5" /> {label}
      </button>
      {right}
    </div>
  );
}

export function RowsSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-start gap-4 px-4 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-14 w-12 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function Failed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
      <p className="text-[14px] font-semibold">Could not load this</p>
      <p className="text-[13px] text-muted-foreground">{message}</p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
