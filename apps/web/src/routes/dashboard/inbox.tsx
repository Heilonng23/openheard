import { Button } from "@openheard/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import type { Icon } from "@phosphor-icons/react";
import { ArrowSquareOutIcon, ArrowsMergeIcon, CaretDownIcon, CaretUpIcon, ChatCircleIcon, CheckCircleIcon, CheckIcon, CircleDashedIcon, CircleHalfIcon, CircleIcon, FunnelSimpleIcon, GlobeSimpleIcon, LockSimpleIcon, PaperclipIcon, PlusIcon, PushPinIcon, SmileyIcon, SortAscendingIcon, SpinnerGapIcon, XCircleIcon, XIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MergeDialog } from "@/components/merge-dialog";
import { Dialog, DialogContent } from "@openheard/ui/components/dialog";
import { Panel } from "@/components/admin/panel";
import { FilterColumn } from "@/components/admin/sidebar";
import { Avatar, StatusChip, TeamBadge } from "@/components/bits";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { listInbox, setBoard } from "@/functions/admin";
import { AttachButton, AttachmentGallery, DraftError, DraftTray, DropOverlay, useImageDrafts } from "@/components/attachments";
import type { AttachmentView } from "@/lib/attachments";
import { isDemo } from "@/lib/demo";
import { REACTIONS, addComment, getPost, setEta as setEtaFn, setStatus, setTags, togglePin, toggleReaction } from "@/functions/posts";
import { KIND_ICON, findStatus, useStatuses } from "@/lib/status";
import { ago, fullDate, since } from "@/lib/time";
import { cn } from "@openheard/ui/lib/utils";

type Search = { status?: string; sort?: "new" | "top" | "old"; post?: number; board?: string; tag?: string };

export const Route = createFileRoute("/dashboard/inbox")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: typeof s.status === "string" && s.status ? s.status : undefined,
    sort: s.sort === "top" || s.sort === "old" ? s.sort : undefined,
    post: typeof s.post === "number" ? s.post : typeof s.post === "string" && /^\d+$/.test(s.post) ? Number(s.post) : undefined,
    board: typeof s.board === "string" ? s.board : undefined,
    tag: typeof s.tag === "string" ? s.tag : undefined,
  }),
  loaderDeps: ({ search }) => ({ status: search.status, sort: search.sort, board: search.board, tag: search.tag }),
  loader: async ({ deps }) => ({ list: await listInbox({ data: { status: deps.status, sort: deps.sort ?? "new", board: deps.board, tag: deps.tag } }) }),
  head: () => ({ meta: [{ title: "Posts · openheard" }] }),
  component: Inbox,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} retry="/dashboard/inbox" />,
  pendingComponent: DashboardPanelSkeleton,
});

function Inbox() {
  const { list } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/inbox" });
  const root = useLoaderData({ from: "__root__" });
  const statuses = useStatuses();
  const meta = search.status ? findStatus(statuses, search.status) : null;
  const sort = search.sort ?? "new";
  const filtered = !!(search.status || search.board || search.tag);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? list.filter((p) => p.title.toLowerCase().includes(needle) || p.board.name.toLowerCase().includes(needle) || (p.author?.name ?? "").toLowerCase().includes(needle)) : list;
  const openIds = shown.map((p) => p.id);
  const idx = search.post ? openIds.indexOf(search.post) : -1;
  const go = (i: number) => {
    const id = openIds[i];
    if (id !== undefined) navigate({ search: (p) => ({ ...p, post: id }), resetScroll: false, viewTransition: false });
  };
  useEffect(() => {
    if (!search.post) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "j") go(idx + 1);
      else if (e.key === "k") go(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Panel title={meta ? meta.label : "Posts"} className="flex" aside={<FilterColumn />} onSearch={setQ}>
      <div className="flex w-full shrink-0 flex-col overflow-auto scrollbar-thin">
        <div className="flex items-center gap-1.5 px-3 pt-3 pb-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground">
              <SortAscendingIcon className="size-3.5" />
              {sort === "new" ? "Newest" : sort === "top" ? "Most votes" : "Oldest"}
              <CaretDownIcon className="size-2.5 text-faint" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-36">
              {(["new", "top", "old"] as const).map((s) => (
                <DropdownMenuItem key={s} onClick={() => navigate({ search: (p) => ({ ...p, sort: s === "new" ? undefined : s }) })}>
                  {s === "new" ? "Newest" : s === "top" ? "Most votes" : "Oldest"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] outline-none hover:bg-accent hover:text-foreground", filtered ? "text-foreground" : "text-muted-foreground")}>
              <FunnelSimpleIcon className="size-3.5" />
              Filter
              <CaretDownIcon className="size-2.5 text-faint" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[11px] tracking-[0.06em] text-faint uppercase">Status</DropdownMenuLabel>
              {statuses.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => navigate({ search: (p) => ({ ...p, status: p.status === s.key ? undefined : s.key, post: undefined }) })}>
                  <span className="size-[7px] rounded-full" style={{ background: s.color }} />
                  <span className="flex-1">{s.label}</span>
                  {search.status === s.key ? <CheckIcon weight="bold" className="size-3" /> : null}
                </DropdownMenuItem>
              ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[11px] tracking-[0.06em] text-faint uppercase">Board</DropdownMenuLabel>
              {root.boards.map((b) => (
                <DropdownMenuItem key={b.id} onClick={() => navigate({ search: (p) => ({ ...p, board: p.board === b.id ? undefined : b.id, post: undefined }) })}>
                  <span className="flex-1">{b.name}</span>
                  {search.board === b.id ? <CheckIcon weight="bold" className="size-3" /> : null}
                </DropdownMenuItem>
              ))}
              </DropdownMenuGroup>
              {root.tags.length ? (
                <DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] tracking-[0.06em] text-faint uppercase">Tag</DropdownMenuLabel>
                  {root.tags.map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => navigate({ search: (p) => ({ ...p, tag: p.tag === t.id ? undefined : t.id, post: undefined }) })}>
                      <span className="flex-1">{t.name}</span>
                      {search.tag === t.id ? <CheckIcon weight="bold" className="size-3" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex-1" />
          <span className="text-xs text-faint tabular-nums">{shown.length}</span>
        </div>
        {filtered ? (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none">
            {meta ? <Chip color={meta.color} onClear={() => navigate({ search: (p) => ({ ...p, status: undefined, post: undefined }) })}>{meta.label}</Chip> : null}
            {search.board ? <Chip onClear={() => navigate({ search: (p) => ({ ...p, board: undefined, post: undefined }) })}>{root.boards.find((b) => b.id === search.board)?.name ?? search.board}</Chip> : null}
            {search.tag ? <Chip onClear={() => navigate({ search: (p) => ({ ...p, tag: undefined, post: undefined }) })}>{root.tags.find((t) => t.id === search.tag)?.name ?? search.tag}</Chip> : null}
          </div>
        ) : null}
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-sm text-faint">{meta ? `Nothing ${meta.label.toLowerCase()} right now.` : "No posts yet."}</p>
            {!filtered ? (
              <Button variant="secondary" size="sm" onClick={() => window.dispatchEvent(new Event("oh:compose"))}>
                Create the first post
              </Button>
            ) : null}
          </div>
        ) : null}
        {needle && shown.length === 0 ? <p className="px-5 py-10 text-center text-sm text-faint">Nothing matches “{q}”.</p> : null}
        {shown.map((p) => {
          const on = search.post === p.id;
          const st = findStatus(statuses, p.status);
          const G = GLYPH[KIND_ICON[st.kind]];
          const filled = st.kind === "done" || st.kind === "closed";
          return (
            <Link
              key={p.id}
              to="/dashboard/inbox"
              search={{ ...search, post: on ? undefined : p.id }}
              resetScroll={false}
              viewTransition={false}
              className={cn("relative shrink-0 border-t transition-colors duration-100", on ? "bg-accent before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-link" : "hover:bg-accent/50", "flex h-[50px] items-center gap-3.5 px-5")}
            >
              <G weight={filled ? "fill" : "regular"} className="size-[17px] shrink-0" style={{ color: st.color }} aria-label={st.label} />
              <span className="min-w-0 truncate text-[14px] font-medium">
                {p.pinned ? <PushPinIcon weight="fill" className="mr-1.5 inline size-3 text-faint" /> : null}
                {p.title}
              </span>
              <span className="inline-flex h-[24px] shrink-0 items-center gap-1.5 rounded-md bg-secondary px-2 text-[12px] font-medium whitespace-nowrap text-muted-foreground">
                <span className="size-1.5 rounded-full bg-link" />
                {p.board.name}
              </span>
              {p.trending ? <Trending /> : null}
              <span className="flex-1" />
              {p.commentCount ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-faint">
                  <ChatCircleIcon className="size-[13px]" /> {p.commentCount}
                </span>
              ) : null}
              <span className="w-9 text-right text-[12px] text-faint tabular-nums">{ago(p.createdAt)}</span>
              <Avatar name={p.author?.name ?? "?"} image={p.author?.image} size={24} />
              <VoteChip n={p.voteCount} />
            </Link>
          );
        })}
      </div>

      <Dialog modal="trap-focus" open={!!search.post} onOpenChange={(o) => !o && navigate({ search: (p) => ({ ...p, post: undefined }), resetScroll: false, viewTransition: false })}>
        <DialogContent showClose={false} className="h-[min(680px,86vh)] max-w-[1000px] gap-0 overflow-hidden bg-background p-0 sm:rounded-xl">
          {search.post ? <PostDetail id={search.post} onClose={() => navigate({ search: (p) => ({ ...p, post: undefined }), resetScroll: false, viewTransition: false })} nav={{ idx, total: openIds.length, prev: idx > 0 ? () => go(idx - 1) : undefined, next: idx < openIds.length - 1 ? () => go(idx + 1) : undefined }} /> : null}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

type PostData = NonNullable<Awaited<ReturnType<typeof getPost>>>;

const postCache = new Map<number, PostData>();

/** Fetches a post client-side and keeps the previous one on screen while the next loads, so switching never flashes a skeleton. */
type DetailNav = { idx: number; total: number; prev?: () => void; next?: () => void };

function PostDetail({ id, onClose, nav }: { id: number; onClose: () => void; nav: DetailNav }) {
  const router = useRouter();
  const [post, setPost] = useState<PostData | null>(() => postCache.get(id) ?? null);
  const [gen, setGen] = useState(0);
  useEffect(() => router.subscribe("onResolved", () => setGen((g) => g + 1)), [router]);
  useEffect(() => {
    let live = true;
    getPost({ data: { id } }).then((p) => {
      if (!live) return;
      if (p) postCache.set(id, p);
      setPost(p ?? null);
    });
    return () => { live = false; };
  }, [id, gen]);
  if (!post) return <DashboardPanelSkeleton />;
  return <Detail post={post} onClose={onClose} nav={nav} />;
}

const GLYPH: Record<(typeof KIND_ICON)[keyof typeof KIND_ICON], Icon> = {
  "circle-dashed": CircleDashedIcon,
  circle: CircleIcon,
  "circle-half": CircleHalfIcon,
  "spinner-gap": SpinnerGapIcon,
  "check-circle": CheckCircleIcon,
  "x-circle": XCircleIcon,
};

type OptimisticComment = {
  id: number;
  kind: "comment";
  body: string;
  internal: boolean;
  author: { name: string; image?: string | null; role?: string };
  at: string;
  commentId: number;
  attachments: AttachmentView[];
  reactions: [];
  type?: undefined;
  to?: undefined;
  note?: undefined;
};

function Detail({ post: p, onClose, nav }: { post: PostData; onClose: () => void; nav: DetailNav }) {
  const root = useLoaderData({ from: "__root__" });
  const statuses = useStatuses();
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [merging, setMerging] = useState(false);
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [eta, setEta] = useState(p.eta ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [pendingComments, setPendingComments] = useState<OptimisticComment[]>([]);
  const images = useImageDrafts({ blocked: isDemo(root.workspace) ? "Image uploads are off in the demo." : null });

  const prevId = useRef(p.id);
  if (p.id !== prevId.current) {
    prevId.current = p.id;
    setEta(p.eta ?? "");
    setReply("");
    images.reset();
    setMerging(false);
    setOptimisticStatus(null);
  }
  const prevTimeline = useRef(p.timeline);
  if (p.timeline !== prevTimeline.current) {
    prevTimeline.current = p.timeline;
    setPendingComments([]);
  }
  const prevStatus = useRef(p.status);
  if (p.status !== prevStatus.current) {
    prevStatus.current = p.status;
    setOptimisticStatus(null);
  }

  const effectiveStatus = optimisticStatus ?? p.status;
  const current = findStatus(statuses, effectiveStatus);

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    try {
      await fn();
      await router.invalidate();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work");
    }
  }

  function send() {
    if (images.uploading) {
      toast("Images are still uploading");
      return;
    }
    if (!reply.trim() && !images.ids.length) return;
    const body = reply.trim();
    const attachments = images.ids;
    const saved = images.drafts;
    const isInternal = internal;
    const tempId = -Date.now();
    const optimistic: OptimisticComment = {
      id: tempId,
      kind: "comment",
      body,
      internal: isInternal,
      author: { name: root.user!.name, image: root.user!.image, role: root.user!.role },
      at: new Date().toISOString(),
      commentId: tempId,
      attachments: images.views,
      reactions: [],
    };
    setPendingComments((prev) => [...prev, optimistic]);
    setReply("");
    images.reset();

    addComment({ data: { postId: p.id, body, internal: isInternal, attachments } })
      .then(() => router.invalidate())
      .catch((err) => {
        setPendingComments((prev) => prev.filter((c) => c.id !== tempId));
        // Give the reply back so nothing typed or attached is lost, unless
        // the composer has moved on to another post.
        if (prevId.current === p.id) {
          setReply((r) => r || body);
          images.restore(saved);
        }
        toast.error(err instanceof Error ? err.message : "Could not comment");
      });
  }

  function insertEmoji(e: string) {
    const el = box.current;
    const at = el?.selectionStart ?? reply.length;
    setReply(reply.slice(0, at) + e + reply.slice(at));
    el?.focus();
  }

  const mergedTimeline = [...p.timeline, ...pendingComments];
  const comments = mergedTimeline.filter((t) => t.kind === "comment");
  const activity = mergedTimeline.filter((t) => t.kind === "activity");
  const shown = tab === "comments" ? comments : activity;
  const chip = "inline-flex h-8 max-w-[168px] items-center gap-1.5 truncate rounded-md border border-input bg-card pr-2.5 pl-2.5 text-[13px] whitespace-nowrap outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring";
  const G = GLYPH[KIND_ICON[current.kind]];

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden ">
      <div key={p.id} className="flex min-w-0 flex-1 flex-col overflow-hidden animate-in fade-in-0 duration-100 motion-reduce:animate-none">
        <div className="flex h-12 shrink-0 items-center justify-between border-b pr-3 pl-4">
          <div className="flex items-center gap-1.5">
            <IconBtn title="Previous (K)" onClick={nav.prev} disabled={!nav.prev}>
              <CaretUpIcon className="size-[12px]" />
            </IconBtn>
            <IconBtn title="Next (J)" onClick={nav.next} disabled={!nav.next}>
              <CaretDownIcon className="size-[12px]" />
            </IconBtn>
            <span className="ml-1 text-xs text-faint tabular-nums">{nav.idx + 1} of {nav.total}</span>
            <span className="mx-1.5 h-4 w-px bg-border" />
            <span className="text-xs text-faint">{p.board.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <IconBtn title={p.pinned ? "Unpin" : "Pin"} onClick={() => run(() => togglePin({ data: { postId: p.id } }))}>
              <PushPinIcon weight={p.pinned ? "fill" : "regular"} className="size-[14px]" />
            </IconBtn>
            <IconBtn title="Merge into another post" onClick={() => setMerging(true)}>
              <ArrowsMergeIcon className="size-[14px]" />
            </IconBtn>
            <Link to="/p/$id" params={{ id: String(p.id) }} title="Open public page" className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowSquareOutIcon className="size-[14px]" />
            </Link>
            <IconBtn title="Close" onClick={onClose}>
              <XIcon className="size-[14px]" />
            </IconBtn>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto px-6 py-5 scrollbar-thin">
          <h1 className="text-[19px] leading-snug font-semibold tracking-[-0.01em]">{p.title}</h1>
          {p.body ? <div className="max-w-[70ch] whitespace-pre-wrap text-[15px] leading-[1.6] text-muted-foreground">{p.body}</div> : null}
          <AttachmentGallery items={p.attachments} className="max-w-[70ch]" />

          <div onPaste={images.onPaste} {...images.dropProps} className="relative flex flex-col gap-3 rounded-lg border bg-card px-3.5 pt-3 pb-2.5 focus-within:border-input">
            <DropOverlay drafts={images} />
            <textarea
              ref={box}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={1}
              placeholder={internal ? "Internal note, only the team sees this" : "Reply as the team"}
              aria-label={internal ? "Internal note" : "Reply to post"}
              className={cn("w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none transition-[height] duration-150 ease-out placeholder:text-faint motion-reduce:transition-none", reply || images.drafts.length ? "h-[72px]" : "h-[22px] focus:h-[44px]")}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && send()}
            />
            <DraftTray drafts={images} />
            <DraftError drafts={images} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="mr-1 flex gap-0.5 rounded-md bg-secondary p-0.5">
                  {[
                    [false, "Public", GlobeSimpleIcon],
                    [true, "Internal", LockSimpleIcon],
                  ].map(([v, l, I]) => {
                    const Icon = I as typeof GlobeSimpleIcon;
                    return (
                      <button key={String(v)} type="button" onClick={() => setInternal(v as boolean)} className={cn("inline-flex items-center gap-1.5 rounded-md py-1 pr-2 pl-1.5 text-xs", internal === v ? "bg-accent text-foreground" : "text-faint hover:text-muted-foreground")}>
                        <Icon className="size-[11px]" />
                        {l as string}
                      </button>
                    );
                  })}
                </div>
                <EmojiPicker onPick={insertEmoji} />
                <AttachButton drafts={images} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <PaperclipIcon className="size-[14px]" />
                </AttachButton>
              </div>
              <Button size="sm" arrow onClick={send} disabled={(!reply.trim() && !images.ids.length) || images.uploading}>
                {internal ? "Add note" : "Reply"}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4 border-b">
            {(["comments", "activity"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={cn("-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-[13px] capitalize", tab === t ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t}
                <span className="rounded-full bg-secondary px-1.5 font-mono text-[10.5px] text-faint">{t === "comments" ? comments.length : activity.length}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            {shown.length === 0 ? <p className="text-sm text-faint">{tab === "comments" ? "No comments yet." : "No activity yet."}</p> : null}
            {shown.map((item) => {
              const team = item.kind === "activity" || (item.author as { role?: string } | null)?.role === "admin";
              const note = item.kind === "comment" && item.internal;
              const isPending = pendingComments.some((c) => c.id === item.id);
              return (
                <div key={item.id} className={cn("flex items-start gap-2.5", note && "rounded-lg border border-status-planned/20 bg-status-planned/[.07] px-3 py-2.5", isPending && "opacity-60")}>
                  <Avatar name={item.author?.name ?? "?"} image={(item.author as { image?: string | null })?.image} size={24} className={cn(team && "ring-1 ring-link/50")} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-semibold">{item.author?.name ?? "someone"}</span>
                      {team ? <TeamBadge /> : null}
                      {note ? (
                        <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-status-planned/15 px-1.5 text-[11px] font-semibold text-status-planned">
                          <LockSimpleIcon className="size-[9px]" /> internal
                        </span>
                      ) : null}
                      <span className="text-[12px] text-faint">{ago(item.at)}</span>
                    </div>
                    {item.kind === "comment" ? (
                      <>
                        {item.body ? <div className="whitespace-pre-wrap text-[14px] leading-[1.55] text-muted-foreground">{item.body}</div> : null}
                        <AttachmentGallery items={item.attachments} size="sm" />
                        <Reactions commentId={item.commentId} reactions={item.reactions} onToggle={(emoji) => run(() => toggleReaction({ data: { commentId: item.commentId, emoji } }))} />
                      </>
                    ) : (
                      <div className="text-[13px] leading-[1.5] text-muted-foreground">
                        {item.type === "status" && item.to ? (
                          <span className="inline-flex items-center gap-2">
                            moved to <StatusChip status={item.to} />
                          </span>
                        ) : null}
                        {item.note ? <div className="mt-1">{item.note}</div> : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <aside className="flex w-[248px] shrink-0 flex-col gap-4 overflow-auto border-l bg-card px-4 py-4 scrollbar-thin">
          {root.workspace.requireApproval && current.kind === "review" ? (
            <Button
              size="sm"
              arrow
              onClick={() => {
                const open = statuses.find((s) => s.kind === "open");
                if (!open) return;
                setOptimisticStatus(open.key);
                toast.success("Approved");
                setStatus({ data: { postId: p.id, status: open.key } })
                  .then(() => router.invalidate())
                  .catch((err) => {
                    setOptimisticStatus(null);
                    toast.error(err instanceof Error ? err.message : "Approve failed");
                  });
              }}
            >
              Approve
            </Button>
          ) : null}

          <div className="flex flex-col gap-3 text-[13px]">
            <div className="flex h-8 items-center gap-3">
              <span className="w-[60px] shrink-0 text-faint">Votes</span>
              <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input px-2 font-mono text-[12px] tabular-nums">
                <CaretUpIcon weight="bold" className="size-[9px] text-muted-foreground" /> {p.voteCount}
              </span>
              <span className="flex">
                {p.votes.slice(0, 5).map((v, i) => (
                  <Avatar key={v.user.id} name={v.user.name} image={v.user.image} size={20} className={cn("ring-2 ring-background", i > 0 && "-ml-1.5")} />
                ))}
              </span>
            </div>
            <div className="flex h-8 items-center gap-3">
              <span className="w-[60px] shrink-0 text-faint">Status</span>
            <DropdownMenu>
              <DropdownMenuTrigger className={chip}>
                <G className="size-3.5" style={{ color: current.color }} />
                {current.label}
                <CaretDownIcon className="size-2.5 text-faint" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {statuses.map((s) => (
                  <DropdownMenuItem
                    key={s.key}
                    disabled={s.key === effectiveStatus}
                    onClick={() => {
                      setOptimisticStatus(s.key);
                      toast.success(`Moved to ${s.label}`);
                      setStatus({ data: { postId: p.id, status: s.key } })
                        .then(() => router.invalidate())
                        .catch((err) => {
                          setOptimisticStatus(null);
                          toast.error(err instanceof Error ? err.message : "Could not change status");
                        });
                    }}
                  >
                    <span className="size-[7px] rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
            <div className="flex h-8 items-center gap-3">
              <span className="w-[60px] shrink-0 text-faint">Board</span>
            <DropdownMenu>
              <DropdownMenuTrigger className={chip}>
                <span className="size-1.5 rounded-full bg-link" />
                {p.board.name}
                <CaretDownIcon className="size-2.5 text-faint" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {root.boards.map((b) => (
                  <DropdownMenuItem key={b.id} disabled={b.id === p.boardId} onClick={() => run(() => setBoard({ data: { postId: p.id, boardId: b.id } }), "Board changed")}>
                    {b.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
            <div className="flex min-h-8 items-start gap-3">
              <span className="w-[60px] shrink-0 pt-1.5 text-faint">Tags</span>
              <div className="flex flex-wrap items-center gap-1.5">
            {p.tags.map((t) => (
              <span key={t.id} className="inline-flex h-7 items-center rounded-md border border-input px-2 text-[12px] text-muted-foreground">
                {t.name}
              </span>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(chip, "text-faint")} title="Tags">
                <PlusIcon className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {root.tags.length === 0 ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet</div> : null}
                {root.tags.map((t) => {
                  const on = p.tags.some((x) => x.id === t.id);
                  return (
                    <DropdownMenuItem key={t.id} onClick={() => run(() => setTags({ data: { postId: p.id, tags: on ? p.tags.filter((x) => x.id !== t.id).map((x) => x.id) : [...p.tags.map((x) => x.id), t.id] } }))}>
                      <span className={cn("size-1.5 rounded-full", on ? "bg-link" : "bg-input")} />
                      {t.name}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
              </div>
            </div>
            <div className="flex h-8 items-center gap-3">
              <span className="w-[60px] shrink-0 text-faint">ETA</span>
              <input
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                onBlur={() => eta !== (p.eta ?? "") && run(() => setEtaFn({ data: { postId: p.id, eta } }), "ETA saved")}
                placeholder="none"
                aria-label="ETA"
                className="h-6 w-20 rounded-md border border-transparent bg-transparent px-1.5 font-mono text-[12px] text-foreground outline-none placeholder:text-faint hover:border-input focus:border-ring/60"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t pt-4 text-[13px]">
            <div className="flex items-center gap-3">
              <span className="w-[60px] shrink-0 text-faint">Created</span>
              <span title={fullDate(p.createdAt)}>{since(p.createdAt)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-[60px] shrink-0 text-faint">Author</span>
              <span className="inline-flex items-center gap-2">
                <Avatar name={p.author?.name ?? "?"} image={p.author?.image} size={20} />
                {p.author?.name ?? "someone"}
              </span>
            </div>
          </div>
        </aside>
        </div>
      </div>


      <MergeDialog open={merging} onOpenChange={setMerging} postId={p.id} onMerged={() => run(async () => setMerging(false), "Merged")} />
    </div>
  );
}

function VoteChip({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-[52px] shrink-0 items-center justify-center gap-1 rounded-md border border-input font-mono text-[12px] tabular-nums">
      <CaretUpIcon weight="bold" className="size-[9px] text-muted-foreground" /> {n}
    </span>
  );
}

function Trending() {
  return <span className="inline-flex h-5 items-center rounded-md bg-status-shipped/15 px-1.5 font-mono text-[10.5px] font-semibold tracking-[0.04em] text-status-shipped uppercase">Trending</span>;
}

function Reactions({ reactions, onToggle }: { commentId: number; reactions: { emoji: string; count: number; mine: boolean }[]; onToggle: (e: (typeof REACTIONS)[number]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button key={r.emoji} type="button" onClick={() => onToggle(r.emoji as (typeof REACTIONS)[number])} className={cn("inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] animate-in zoom-in-95 fade-in-0 duration-150 active:scale-95 motion-reduce:animate-none", r.mine ? "border-link/50 bg-link/10" : "border-input bg-secondary hover:bg-accent")}>
          {r.emoji} <span className="font-mono text-[11px] text-muted-foreground">{r.count}</span>
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-input text-faint outline-none hover:border-foreground/40 hover:text-foreground" title="React">
          <SmileyIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="flex min-w-0 gap-0.5 p-1">
          {REACTIONS.map((e) => (
            <button key={e} type="button" onClick={() => onToggle(e)} className="inline-flex size-8 items-center justify-center rounded-md text-base hover:bg-accent">
              {e}
            </button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const EMOJI = ["👍", "🙏", "🎉", "❤️", "🔥", "👀", "🚀", "✅", "💡", "🐛", "😅", "🤔", "👋", "✨", "📌", "🙌"];

function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground" title="Emoji">
        <SmileyIcon className="size-[14px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="grid w-[184px] grid-cols-8 gap-0.5 p-1">
        {EMOJI.map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} className="inline-flex size-[21px] items-center justify-center rounded text-[15px] hover:bg-accent">
            {e}
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconBtn({ title, onClick, children, disabled }: { title: string; onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
      {children}
    </button>
  );
}

function Chip({ children, color, onClear }: { children: React.ReactNode; color?: string; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className="inline-flex h-6 items-center gap-1.5 rounded-md border border-input bg-secondary pr-1.5 pl-2 text-xs text-foreground hover:bg-accent">
      {color ? <span className="size-1.5 rounded-full" style={{ background: color }} /> : null}
      {children}
      <XIcon className="size-2.5 text-faint" />
    </button>
  );
}
