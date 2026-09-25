import { Button } from "@openheard/ui/components/button";
import { Skeleton } from "@openheard/ui/components/skeleton";
import { cn } from "@openheard/ui/lib/utils";
import { ArrowLeftIcon, ArrowSquareOutIcon, ChatCircleIcon, LightningIcon, MagnifyingGlassIcon, PushPinIcon } from "@phosphor-icons/react";
import { useLoaderData } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Avatar, StatusChip } from "@/components/bits";
import { VoteButton } from "@/components/vote-button";
import { createPost, getPost, listPosts, searchPosts } from "@/functions/posts";
import { findStatus } from "@/lib/status";
import { MSG } from "@/lib/widget-auth";
import { ago } from "@/lib/time";

import { rowKeyDown, toParent, useLoad, useWidget, type SentPost } from "./context";

// Status as the widget shows it: dot plus lowercase mono label in the status colour.
export function MonoStatus({ status }: { status: string }) {
  const root = useLoaderData({ from: "__root__" });
  const s = findStatus(root.statuses, status);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs lowercase" style={{ color: s.color }}>
      <span className="size-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function FeedbackList() {
  const root = useLoaderData({ from: "__root__" });
  const { me, headers, requireSignIn, openPost, compose } = useWidget();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading, error, reload } = useLoad(() => listPosts({ data: { sort: "trending", q: query || undefined, limit: 50 }, headers }), [query, me?.id]);

  return (
    <div className="flex flex-col pb-2">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3.5 pb-2">
        <label className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-2.5 text-faint transition-colors focus-within:border-ring/60">
          <MagnifyingGlassIcon className="size-[14px] shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ideas"
            aria-label="Search ideas"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint"
          />
        </label>
        <Button arrow onClick={() => requireSignIn(compose)}>
          Post idea
        </Button>
      </div>

      {error ? (
        <Failed message={error} retry={reload} />
      ) : loading && !data ? (
        <RowsSkeleton />
      ) : data && data.posts.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-8 py-16 text-center">
          <p className="text-[14px] font-semibold">{query ? "Nothing matches" : "No ideas yet"}</p>
          <p className="text-[13px] text-muted-foreground">{query ? "Post it, and others can vote on it." : "Be the first to say what would make this better."}</p>
        </div>
      ) : (
        <ol role="list" className="mx-2 flex flex-col">
          {data?.posts.map((p) => (
            <li key={p.id} className="border-b border-white/6 last:border-b-0">
              <div
                role="button"
                tabIndex={0}
                onClick={() => openPost(p.id)}
                onKeyDown={rowKeyDown(() => openPost(p.id))}
                className="group/row flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-3.5 outline-none hover:bg-card focus-visible:bg-card"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start gap-1.5">
                    {p.pinned ? <PushPinIcon weight="fill" className="mt-[3px] size-3 shrink-0 text-faint" /> : null}
                    <h3 className="line-clamp-2 text-[14px]/5 font-semibold tracking-[-0.01em]">{p.title}</h3>
                  </div>
                  {p.excerpt ? <p className="truncate text-[13px]/5 text-muted-foreground">{p.excerpt}</p> : null}
                  <div className="flex items-center gap-3.5 pt-0.5">
                    <MonoStatus status={p.status} />
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-faint">
                      <ChatCircleIcon className="size-[13px]" />
                      {p.commentCount}
                    </span>
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
          ))}
        </ol>
      )}
    </div>
  );
}

export function PostDetail({ id }: { id: number }) {
  const root = useLoaderData({ from: "__root__" });
  const { me, headers, requireSignIn, back } = useWidget();
  const { data: post, loading, error, reload } = useLoad(() => getPost({ data: { id }, headers }), [id, me?.id]);
  const comments = post ? post.timeline.flatMap((t) => (t.kind === "comment" && !t.internal ? [t] : [])) : [];

  return (
    <div className="flex flex-col">
      <BackBar onBack={back} right={<a href={`/p/${id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">Open on the board <ArrowSquareOutIcon className="size-3" /></a>} />
      {error ? (
        <Failed message={error} retry={reload} />
      ) : loading && !post ? (
        <div className="flex flex-col gap-3 px-5 py-5">
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ) : !post ? (
        <div className="px-8 py-16 text-center text-[13px] text-muted-foreground">This idea is not public yet.</div>
      ) : (
        <>
          <article className="flex flex-col gap-3 px-5 pt-4 pb-6">
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
            <span className="px-5 pt-4 pb-1 font-mono text-[11px] tracking-[0.06em] text-faint uppercase">
              {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </span>
            {comments.length === 0 ? (
              <p className="px-5 pt-1 pb-5 text-[13px] text-muted-foreground">No comments yet.</p>
            ) : (
              <ol role="list" className="flex flex-col pb-2">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5 px-5 py-3">
                    <Avatar name={c.author?.name ?? "?"} image={c.author?.image} size={22} className="mt-0.5" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-xs">
                        <span className="font-semibold text-foreground">{c.author?.name ?? "someone"}</span>
                        <span className="text-faint"> · {ago(c.at)}</span>
                      </span>
                      <p className="text-[13px]/[1.55] whitespace-pre-wrap text-muted-foreground">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <a href={`/p/${id}`} target="_blank" rel="noopener" className="mx-5 mb-5 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-input text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
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
  const { me, headers, back, openPost, sent } = useWidget();
  const boards = root.boards;
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [failed, setFailed] = useState("");
  const [similar, setSimilar] = useState<Awaited<ReturnType<typeof searchPosts>>>([]);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const membersOnly = root.workspace.whoCanPost === "members" && me?.role === "guest";

  // Focus once the view transition has settled, never inside a moving panel.
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 260);
    return () => clearTimeout(t);
  }, [failed]);

  useEffect(() => {
    const q = title.trim();
    if (q.length < 6) return setSimilar([]);
    const t = setTimeout(() => searchPosts({ data: { q }, headers }).then(setSimilar).catch(() => setSimilar([])), 200);
    return () => clearTimeout(t);
  }, [title, headers]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (title.trim().length < 4) return setHint("Give it a title of a few words.");
    setBusy(true);
    setHint("");
    toParent({ type: MSG.busy, busy: true });
    try {
      const res = await createPost({ data: { boardId, title: title.trim(), body, tags: [] }, headers });
      const status = res.pending ? (root.statuses.find((s) => s.kind === "review")?.key ?? "review") : (root.statuses.find((s) => s.kind === "open")?.key ?? "open");
      sent({ id: res.id, title: title.trim(), status, pending: res.pending });
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "Something went wrong on our side.");
    } finally {
      setBusy(false);
      toParent({ type: MSG.busy, busy: false });
    }
  }

  if (membersOnly) {
    return (
      <div className="flex flex-col">
        <BackBar onBack={back} />
        <p className="px-8 py-16 text-center text-[13px] text-muted-foreground">Only team members can post on this board. You can still vote.</p>
      </div>
    );
  }

  // The error replaces the form but keeps what was typed for the retry.
  if (failed) {
    return (
      <div className="flex flex-col">
        <BackBar onBack={back} />
        <div className="flex flex-col items-center gap-1.5 px-8 py-16 text-center">
          <p className="text-[14px] font-semibold">Your idea was not posted</p>
          <p className="text-[13px] text-muted-foreground">{failed}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setFailed("")}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <BackBar onBack={back} />
      {boards.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 px-5 pt-4" role="radiogroup" aria-label="Board">
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
      <div className="flex flex-col gap-2 px-5 pt-4">
        <input
          ref={titleRef}
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
          aria-label="Title"
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
          aria-label="Details"
          className="w-full resize-none bg-transparent text-[14px]/[1.55] text-muted-foreground outline-none placeholder:text-faint"
        />
      </div>
      {similar.length ? (
        <div className="flex flex-col gap-1 px-5 pb-2">
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
      {hint ? <p role="alert" className="px-5 pt-1 text-[13px] text-red-400">{hint}</p> : null}
      <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-5">
        <span className="truncate text-xs text-faint">Posting as {me?.name ?? "you"}</span>
        <Button type="submit" arrow disabled={busy}>
          {busy ? "Posting…" : "Post idea"}
        </Button>
      </div>
    </form>
  );
}

const SPRINKLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? 34 : 26 + (i % 4) * 2;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, accent: i % 2 === 1 };
});

export function Sent({ post }: { post: SentPost }) {
  const root = useLoaderData({ from: "__root__" });
  const { me, headers, back, openPost, requireSignIn } = useWidget();
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <div className="relative grid size-12 place-items-center">
        {!reduced
          ? SPRINKLES.map((s, i) => (
              <motion.span
                key={i}
                aria-hidden
                className={cn("absolute size-1.5 rounded-full", s.accent ? "bg-link" : "bg-status-shipped")}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                animate={{ x: s.x, y: s.y, opacity: [0, 1, 1, 0.9], scale: 1 }}
                transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              />
            ))
          : null}
        <motion.span
          className="grid size-12 place-items-center rounded-full bg-status-shipped text-[#0d0d0f]"
          initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 500, damping: 22 }}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }} />
          </svg>
        </motion.span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{post.pending ? "Idea sent" : "Idea posted"}</h2>
        <p className="max-w-[280px] text-[13px]/5 text-muted-foreground">
          {post.pending ? "The team reviews new ideas before they show up on the board." : "Your vote is already on it. Others can find it and add theirs."}
        </p>
      </div>
      <div className="flex w-full items-center gap-3 rounded-xl border bg-card py-3 pr-3 pl-4 text-left">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-[14px]/5 font-semibold">{post.title}</span>
          <MonoStatus status={post.status} />
        </div>
        <VoteButton postId={post.id} count={1} voted signedIn={!!me} anonymousVoting={root.workspace.anonymousVoting} headers={headers} onSignIn={() => requireSignIn()} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={back}>
          Back to ideas
        </Button>
        <Button onClick={() => openPost(post.id)}>View post</Button>
      </div>
    </div>
  );
}

export function BackBar({ onBack, right }: { onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3 pr-5">
      <button type="button" onClick={onBack} className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
        <ArrowLeftIcon className="size-3.5" /> Back to ideas
      </button>
      {right}
    </div>
  );
}

export function RowsSkeleton() {
  return (
    <div className="mx-2 flex flex-col">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
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
    <div className="flex flex-col items-center gap-1.5 px-8 py-16 text-center">
      <p className="text-[14px] font-semibold">Could not load this</p>
      <p className="text-[13px] text-muted-foreground">{message}</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
