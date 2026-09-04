import { Button } from "@openheard/ui/components/button";
import { Textarea } from "@openheard/ui/components/textarea";
import { ArrowLeftIcon, ArrowsMergeIcon, BellIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, notFound, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdminStrip } from "@/components/admin-strip";
import { Avatar, Mono, StatusPill, TagChip, TeamBadge } from "@/components/bits";
import { VoteButton } from "@/components/vote-button";
import { addComment, getPost, mergePosts, setEta } from "@/functions/posts";
import { STATUS_META } from "@/lib/status";
import { ago, fullDate } from "@/lib/time";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/p/$id")({
  loader: async ({ params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) throw notFound();
    const post = await getPost({ data: { id } });
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.title} · feedback` : "Post" }] }),
  component: PostPage,
});

function PostPage() {
  const p = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const admin = root.user?.role === "admin";
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!root.user) return toast("Sign in to comment", { action: { label: "Sign in", onClick: () => router.navigate({ to: "/login" }) } });
    setBusy(true);
    try {
      await addComment({ data: { postId: p.id, body: reply } });
      setReply("");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1160px] flex-1 grid-cols-1 gap-10 px-5 py-7 md:px-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <main className="flex flex-col gap-6">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Link to="/" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" /> Board
          </Link>
          <span className="text-border">/</span>
          <Link to="/" search={{ board: p.boardId }} className="text-muted-foreground hover:text-foreground">
            {p.board.name}
          </Link>
        </div>

        {p.mergedInto ? (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
            <ArrowsMergeIcon className="size-4 text-muted-foreground" />
            <span>This post was merged into</span>
            <Link to="/p/$id" params={{ id: String(p.mergedInto.id) }} className="font-medium text-link hover:underline">
              {p.mergedInto.title}
            </Link>
          </div>
        ) : null}

        <div className="flex items-start gap-[18px]">
          <VoteButton postId={p.id} count={p.voteCount} voted={p.voted} signedIn={!!root.user} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusPill status={p.status} />
              {p.tags.map((t) => (
                <TagChip key={t.id}>{t.name}</TagChip>
              ))}
              <Mono className="ml-auto">
                #{p.id} · opened {ago(p.createdAt)} ago
              </Mono>
            </div>
            <h1 className="text-[28px] font-semibold leading-[1.2]">{p.title}</h1>
            {p.body ? <div className="whitespace-pre-wrap text-[15px] leading-[1.65] text-foreground/90">{p.body}</div> : null}
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <Avatar name={p.author?.name ?? "?"} image={p.author?.image} size={22} />
              {p.author?.name ?? "someone"}
            </div>
          </div>
        </div>

        {admin && !p.mergedInto ? <AdminStrip postId={p.id} status={p.status} pinned={p.pinned} voteCount={p.voteCount} tags={p.tags} allTags={root.tags} /> : null}

        <div className="relative ml-[9px] flex flex-col border-l pl-[22px]">
          <form onSubmit={submitReply} className="mb-6 flex flex-col rounded-lg border bg-card p-1">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={root.user ? "Write a reply" : "Sign in to reply"}
              className="min-h-16 border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitReply(e);
              }}
            />
            <div className="flex items-center justify-between border-t px-2 py-1.5">
              <span className="text-xs text-muted-foreground">⌘ enter to send</span>
              <Button size="sm" type="submit" disabled={busy || reply.trim().length === 0}>
                Comment
              </Button>
            </div>
          </form>

          {p.timeline.length === 0 ? <p className="pb-6 text-sm text-muted-foreground">No replies yet. Be the first, it helps the team prioritise.</p> : null}
          {p.timeline.map((item) => (
            <div key={item.id} className="relative flex flex-col gap-1.5 pb-6">
              <span
                className={cn(
                  "absolute top-[7px] -left-[26.5px] size-[7px] rounded-full ring-4 ring-background",
                  item.kind === "activity" && item.type === "status" && item.to ? STATUS_META[item.to as keyof typeof STATUS_META].dot : "bg-input",
                )}
              />
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold">{item.author?.name ?? "someone"}</span>
                {item.kind === "comment" && (item.author as { role?: string } | null)?.role === "admin" ? <TeamBadge /> : null}
                {item.kind === "activity" ? <TeamBadge /> : null}
                <span className="text-muted-foreground">
                  {item.kind === "activity"
                    ? item.type === "status" && item.to
                      ? `moved to ${STATUS_META[item.to as keyof typeof STATUS_META].label}`
                      : item.note
                    : null}
                  {item.kind === "activity" ? " · " : ""}
                  {ago(item.at)} ago
                </span>
              </div>
              {item.kind === "comment" ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{item.body}</div>
              ) : item.type === "status" && item.note ? (
                <div className="text-sm leading-relaxed text-foreground/90">{item.note}</div>
              ) : null}
            </div>
          ))}
        </div>
      </main>

      <aside className="flex flex-col gap-6 lg:pt-9">
        <section className="flex flex-col gap-2.5">
          <Mono>Voters · {p.voteCount}</Mono>
          <div className="flex items-center">
            {p.votes.map((v, i) => (
              <Avatar key={v.user.id} name={v.user.name} image={v.user.image} size={26} className={cn("ring-2 ring-background", i > 0 && "-ml-1.5")} />
            ))}
            {p.voteCount > p.votes.length ? <span className="ml-2.5 text-xs text-muted-foreground">+{p.voteCount - p.votes.length}</span> : null}
          </div>
        </section>

        {admin && p.similar.length ? (
          <section className="flex flex-col gap-2.5">
            <Mono>Also asked for</Mono>
            <div className="flex flex-col gap-2 text-[13px]">
              {p.similar.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <Link to="/p/$id" params={{ id: String(s.id) }} className="truncate text-foreground hover:text-link">
                    {s.title}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Mono>{s.voteCount}</Mono>
                    <button
                      type="button"
                      title="Merge into this post"
                      onClick={() =>
                        mergePosts({ data: { from: s.id, into: p.id } })
                          .then(() => router.invalidate())
                          .then(() => toast.success("Merged"))
                          .catch((e) => toast.error(e.message))
                      }
                      className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <ArrowsMergeIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {p.mergedFrom.length ? (
          <section className="flex flex-col gap-2.5">
            <Mono>Merged here</Mono>
            <div className="flex flex-col gap-1.5 text-[13px]">
              {p.mergedFrom.map((m) => (
                <Link key={m.id} to="/p/$id" params={{ id: String(m.id) }} className="truncate text-muted-foreground hover:text-foreground">
                  {m.title}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-2.5">
          <Mono>Details</Mono>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
            <dt className="text-muted-foreground">Board</dt>
            <dd>{p.board.name}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{STATUS_META[p.status].label}</dd>
            <dt className="text-muted-foreground">ETA</dt>
            <dd>
              {admin ? (
                <EtaEditor postId={p.id} value={p.eta} />
              ) : (
                p.eta ?? <span className="text-muted-foreground">not set</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Opened</dt>
            <dd>{fullDate(p.createdAt)}</dd>
          </dl>
        </section>

        {root.user && p.voted ? (
          <section className="flex flex-col gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <BellIcon className="size-3.5" /> You get an email when the status changes.
            </span>
          </section>
        ) : null}
      </aside>
    </div>
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
      placeholder="e.g. v0.4"
      className="w-24 rounded-sm border border-transparent bg-transparent px-1 -mx-1 text-[13px] outline-none placeholder:text-muted-foreground hover:border-input focus:border-ring"
    />
  );
}
