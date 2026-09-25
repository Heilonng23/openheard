import { ArrowLeftIcon, ArrowsMergeIcon, PaperclipIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, notFound, useLoaderData, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openSignIn } from "@/lib/pending-action";

import { Button } from "@openheard/ui/components/button";
import { CopyButton } from "@openheard/ui/components/interior/copy-button";
import { AttachButton, AttachmentGallery, DraftError, DraftTray, DropOverlay, useImageDrafts } from "@/components/attachments";
import { Avatar, StatusChip, TeamBadge } from "@/components/bits";
import { SkeletonSwap } from "@/components/interior/skeleton-swap";
import { RailLabel, Shell } from "@/components/shell";
import { ErrorState, PostSkeleton } from "@/components/states";
import { VoteButton } from "@/components/vote-button";
import { addComment, getPost, mergePosts, setEta } from "@/functions/posts";
import type { AttachmentView } from "@/lib/attachments";
import { isDemo } from "@/lib/demo";
import { findStatus, roadmapStatuses, useStatuses } from "@/lib/status";
import { ago, fullDate, since } from "@/lib/time";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/p/$id")({
  loader: async ({ params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) throw notFound();
    const post = await getPost({ data: { id } });
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? loaderData.title : "Post" },
      ...(loaderData
        ? [
            { property: "og:title", content: loaderData.title },
            { property: "og:description", content: loaderData.body ? loaderData.body.slice(0, 200) : `${loaderData.voteCount} votes` },
            { property: "og:type", content: "article" },
            { name: "twitter:card", content: "summary" },
            { name: "twitter:title", content: loaderData.title },
            { name: "twitter:description", content: loaderData.body ? loaderData.body.slice(0, 200) : `${loaderData.voteCount} votes` },
          ]
        : []),
    ],
  }),
  component: PostPage,
  errorComponent: ({ error }) => <ErrorState message={(error as Error)?.message} />,
  pendingComponent: PostSkeleton,
});

type OptimisticComment = {
  id: number;
  kind: "comment";
  body: string;
  author: { name: string; image?: string | null; role?: string };
  at: string;
  internal?: boolean;
  commentId: number;
  attachments: AttachmentView[];
  reactions: [];
  type?: undefined;
  to?: undefined;
  note?: undefined;
};

function PostPage() {
  const p = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const admin = root.user?.role === "admin";
  const [reply, setReply] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [pendingComments, setPendingComments] = useState<OptimisticComment[]>([]);
  const images = useImageDrafts({
    blocked: isDemo(root.workspace) ? "Image uploads are off in the demo." : null,
    onBlocked: root.user ? undefined : () => openSignIn({ type: "comment", postId: p.id, body: reply.trim() }),
  });
  useEffect(() => setReady(true), []);

  const shownId = useRef(p.id);
  shownId.current = p.id;
  const prevTimeline = useRef(p.timeline);
  if (p.timeline !== prevTimeline.current) {
    prevTimeline.current = p.timeline;
    setPendingComments([]);
  }

  function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!root.user) {
      openSignIn({ type: "comment", postId: p.id, body: reply.trim() || "" });
      return;
    }
    if (images.uploading) {
      toast("Images are still uploading");
      return;
    }
    if (!reply.trim() && !images.ids.length) return;
    const body = reply.trim();
    const attachments = images.ids;
    const saved = images.drafts;
    const tempId = -Date.now();
    const optimistic: OptimisticComment = {
      id: tempId,
      kind: "comment",
      body,
      author: { name: root.user.name, image: root.user.image, role: root.user.role },
      at: new Date().toISOString(),
      commentId: tempId,
      attachments: images.views,
      reactions: [],
    };
    setPendingComments((prev) => [...prev, optimistic]);
    setReply("");
    setExpanded(false);
    images.reset();

    addComment({ data: { postId: p.id, body, attachments } })
      .then(() => router.invalidate())
      .catch((err) => {
        setPendingComments((prev) => prev.filter((c) => c.id !== tempId));
        // Give the reply back so nothing typed or attached is lost, unless
        // the page has moved on to another post.
        if (shownId.current === p.id) {
          setReply((r) => r || body);
          images.restore(saved);
        }
        toast.error(err instanceof Error ? err.message : "Could not comment");
      });
  }

  const mergedTimeline = [...p.timeline, ...pendingComments];
  const comments = mergedTimeline.filter((t) => t.kind === "comment").length;
  const statuses = useStatuses();
  const timeline = roadmapStatuses(statuses);
  const current = findStatus(statuses, p.status);
  const stepIndex = timeline.findIndex((s) => s.key === p.status);

  const rail = (
    <>
      <Button full arrow size="lg" onClick={() => router.navigate({ to: "/" })}>
        Post idea
      </Button>
      <section>
        <RailLabel>Voters</RailLabel>
        <div className="flex items-center px-2.5">
          {p.votes.map((v, i) => (
            <Avatar key={v.user.id} name={v.user.name} image={v.user.image} size={26} className={cn("ring-2 ring-background", i > 0 && "-ml-1.5")} />
          ))}
          {p.voteCount > p.votes.length ? <span className="ml-2.5 text-xs text-muted-foreground">+{p.voteCount - p.votes.length}</span> : null}
          {p.voteCount === 0 ? <span className="text-xs text-faint">No votes yet</span> : null}
        </div>
      </section>
      <section>
        <RailLabel>Details</RailLabel>
        <dl className="flex flex-col">
          {[
            ["Status", current.label],
            ["Board", p.board.name],
            ["Created", fullDate(p.createdAt)],
            ["Updated", since(p.updatedAt)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-2.5 py-1.5 text-[13px]">
              <dt className="text-faint">{k}</dt>
              <dd className="text-muted-foreground">{v}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between px-2.5 py-1.5 text-[13px]">
            <dt className="text-faint">ETA</dt>
            <dd className="text-muted-foreground">{admin ? <EtaEditor postId={p.id} value={p.eta} /> : (p.eta ?? "not set")}</dd>
          </div>
        </dl>
      </section>
      <div className="px-2.5">
        <CopyButton value={typeof window !== "undefined" ? window.location.href : ""} label="Copy link" copiedLabel="Copied!" />
      </div>
      {admin && p.similar.length ? (
        <section>
          <RailLabel>Also asked for</RailLabel>
          <div className="flex flex-col gap-1 px-2.5 text-[13px]">
            {p.similar.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <Link to="/p/$id" params={{ id: String(s.id) }} className="truncate text-muted-foreground hover:text-foreground">
                  {s.title}
                </Link>
                <button
                  type="button"
                  title="Merge into this post"
                  onClick={() =>
                    mergePosts({ data: { from: s.id, into: p.id } })
                      .then(() => router.invalidate())
                      .then(() => toast.success("Merged"))
                      .catch((e) => toast.error(e.message))
                  }
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-faint hover:bg-accent hover:text-foreground"
                >
                  <ArrowsMergeIcon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );

  return (
    <SkeletonSwap ready={ready} skeleton={<PostSkeleton />}>
    <Shell rail={rail}>
      <div className="flex items-center justify-between">
        <Link to="/" search={{ board: p.boardId }} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5 text-faint" /> {p.board.name}
        </Link>
        {admin ? (
          <Link to="/dashboard/inbox" search={{ status: p.status, post: p.id }} className="text-xs text-faint hover:text-foreground">
            Manage in dashboard →
          </Link>
        ) : null}
      </div>

      {p.mergedInto ? (
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <ArrowsMergeIcon className="size-4 text-muted-foreground" />
          <span>This post was merged into</span>
          <Link to="/p/$id" params={{ id: String(p.mergedInto.id) }} className="font-semibold text-link hover:underline">
            {p.mergedInto.title}
          </Link>
        </div>
      ) : null}

      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <h1 className="text-2xl font-semibold leading-[1.25] tracking-[-0.02em]">{p.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <StatusChip status={p.status} />
            <span className="text-faint">{p.board.name}</span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Avatar name={p.author?.name ?? "?"} image={p.author?.image} size={18} />
              {p.author?.name ?? "someone"}
              <span className="text-faint">· {since(p.createdAt)}</span>
            </span>
          </div>
        </div>
        <VoteButton postId={p.id} count={p.voteCount} voted={p.voted} signedIn={!!root.user} anonymousVoting={root.workspace?.anonymousVoting} size="lg" />
      </div>

      {p.body ? <div className="max-w-[640px] whitespace-pre-wrap text-[14px] leading-[1.65] text-muted-foreground">{p.body}</div> : null}
      <AttachmentGallery items={p.attachments} className="max-w-[640px]" />

      {stepIndex >= 0 ? (
        <ol className="flex flex-col items-start gap-2.5 pt-2 sm:flex-row sm:items-center sm:gap-0">
          {timeline.map((meta, i) => {
            const reached = i <= stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <li key={meta.key} className={cn("flex items-center", i < timeline.length - 1 && "sm:flex-1")}>
                <span className="flex items-center gap-2">
                  <span
                    className={cn("rounded-full transition-all", isCurrent ? "size-2.5" : "size-2", !reached && "border-[1.5px] border-input")}
                    style={reached ? { background: meta.color, boxShadow: isCurrent ? `0 0 8px ${meta.color}` : undefined } : undefined}
                  />
                  <span className={cn("text-xs whitespace-nowrap", isCurrent ? "font-semibold text-foreground" : reached ? "text-muted-foreground" : "text-faint")}>{meta.label}</span>
                </span>
                {i < timeline.length - 1 ? <span className={cn("mx-3 hidden h-px flex-1 sm:block", !(reached && i < stepIndex) && "bg-border")} style={reached && i < stepIndex ? { background: meta.color, opacity: 0.5 } : undefined} /> : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <section className="flex flex-col gap-5 border-t pt-5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          Comments <span className="text-xs font-normal text-faint tabular-nums">{comments}</span>
        </h2>

        <form onSubmit={submitReply} onPaste={images.onPaste} {...images.dropProps} className="relative flex flex-col gap-3 rounded-lg border bg-card px-3.5 py-3 transition-colors focus-within:border-input">
          <DropOverlay drafts={images} />
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onFocus={() => {
              if (!root.user) {
                openSignIn({ type: "comment", postId: p.id, body: "" });
                return;
              }
              setExpanded(true);
            }}
            placeholder={root.user ? "Add a comment" : "Sign in to comment"}
            aria-label="Add a comment"
            rows={1}
            className={cn("w-full resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none transition-[height] duration-150 ease-out placeholder:text-faint motion-reduce:transition-none", expanded || reply || images.drafts.length ? "h-[76px]" : "h-[24px]")}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitReply(e);
            }}
          />
          <DraftTray drafts={images} />
          <DraftError drafts={images} />
          <div className="flex items-center justify-between">
            <AttachButton drafts={images} className="-ml-1.5 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-faint outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring">
              <PaperclipIcon className="size-3.5" /> Attach
            </AttachButton>
            <Button variant="secondary" size="sm" type="submit" disabled={(reply.trim().length === 0 && images.ids.length === 0) || images.uploading}>
              Comment
            </Button>
          </div>
        </form>

        {mergedTimeline.length === 0 ? <p className="text-sm text-faint">No comments yet. Be the first, it helps the team prioritise.</p> : null}
        <div className="flex flex-col gap-5">
          {mergedTimeline.map((item) => {
            const team = item.kind === "activity" || (item.author as { role?: string } | null)?.role === "admin";
            const isPending = pendingComments.some((c) => c.id === item.id);
            return (
              <div key={item.id} className={cn("flex items-start gap-3", isPending && "opacity-60")}>
                <Avatar name={item.author?.name ?? "?"} image={(item.author as { image?: string | null })?.image} size={28} className={cn(team && "ring-1 ring-link/50")} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold">{item.author?.name ?? "someone"}</span>
                    {team ? <TeamBadge /> : null}
                    <span className="text-xs text-faint">{ago(item.at)}</span>
                  </div>
                  {item.kind === "comment" ? (
                    <>
                      {item.body ? <div className="whitespace-pre-wrap text-sm leading-[1.55] text-muted-foreground">{item.body}</div> : null}
                      <AttachmentGallery items={item.attachments} size="sm" className="mt-1" />
                    </>
                  ) : (
                    <div className="text-sm leading-[1.55] text-muted-foreground">
                      {item.type === "status" && item.to ? (
                        <span className="inline-flex items-center gap-2">
                          moved to <StatusChip status={item.to} showOpen />
                        </span>
                      ) : null}
                      {item.note ? <div className={cn(item.type === "status" && item.to && "mt-1")}>{item.note}</div> : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </Shell>
    </SkeletonSwap>
  );
}

function EtaEditor({ postId, value }: { postId: number; value: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(value ?? "");
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value ?? "") && setEta({ data: { postId, eta: v } }).then(() => router.invalidate())}
      placeholder="not set"
      aria-label="ETA"
      className="-mx-1 w-24 rounded-sm border border-transparent bg-transparent px-1 text-right text-[13px] outline-none placeholder:text-faint hover:border-input focus:border-ring"
    />
  );
}
