import { Button } from "@openheard/ui/components/button";
import { ArrowLeftIcon, ArrowSquareOutIcon, CheckCircleIcon, CircleDashedIcon, ImageIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/admin/panel";
import { Avatar } from "@/components/bits";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { deleteChangelog, listChangelog, saveChangelog } from "@/functions/changelog";
import { searchPosts } from "@/functions/posts";
import { ago, fullDate } from "@/lib/time";
import { cn } from "@openheard/ui/lib/utils";

type Entry = Awaited<ReturnType<typeof listChangelog>>[number];
type Search = { entry?: number | "new" };

export const Route = createFileRoute("/dashboard/changelog")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    entry: s.entry === "new" ? "new" : typeof s.entry === "number" ? s.entry : typeof s.entry === "string" && /^\d+$/.test(s.entry) ? Number(s.entry) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: () => listChangelog(),
  head: () => ({ meta: [{ title: "Changelog · openheard" }] }),
  component: ChangelogPage,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} retry="/dashboard/changelog" />,
  pendingComponent: DashboardPanelSkeleton,
});

// A plain list, and a document-style editor when you open an entry.
function ChangelogPage() {
  const entries = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/changelog" });
  const root = useLoaderData({ from: "__root__" });
  const open = search.entry === "new" ? "new" : entries.find((e) => e.id === search.entry);

  if (open) {
    return <Editor key={open === "new" ? "new" : open.id} entry={open === "new" ? null : open} onClose={() => navigate({ search: {} })} />;
  }

  return (
    <Panel
      title="Changelog"
      actions={
        <Button size="sm" arrow onClick={() => navigate({ search: { entry: "new" } })}>
          New entry
        </Button>
      }
    >
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
          <p className="text-[15px] font-semibold">Nothing shipped yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Write the first entry when you release something. Linked posts move to Shipped and their voters hear about it.</p>
          <Button size="sm" arrow className="mt-2" onClick={() => navigate({ search: { entry: "new" } })}>
            New entry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col">
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => navigate({ search: { entry: e.id } })}
              className="flex h-13 shrink-0 items-center gap-3.5 border-b px-5 text-left hover:bg-card/60"
            >
              {e.publishedAt ? <CheckCircleIcon weight="fill" className="size-5 shrink-0 text-status-shipped" /> : <CircleDashedIcon className="size-5 shrink-0 text-status-planned" />}
              <span className="min-w-0 truncate text-[16px] font-medium">{e.title}</span>
              {e.version ? <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 font-mono text-[12px] text-muted-foreground">{e.version}</span> : null}
              {!e.publishedAt ? <span className="shrink-0 rounded-md bg-status-planned/15 px-2 py-0.5 text-[12px] font-medium text-status-planned">Draft</span> : null}
              {e.posts.length ? (
                <span className="shrink-0 text-[12px] text-faint">
                  {e.posts.length} {e.posts.length === 1 ? "post" : "posts"}
                </span>
              ) : null}
              <span className="flex-1" />
              <span className="text-[12px] text-faint tabular-nums" title={fullDate(e.publishedAt ?? e.createdAt)}>
                {ago(e.publishedAt ?? e.createdAt)}
              </span>
              <Avatar name={root.user?.name ?? "?"} image={root.user?.image} size={24} />
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Editor({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [version, setVersion] = useState(entry?.version ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [posts, setPosts] = useState<{ id: number; title: string }[]>(entry?.posts ?? []);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: number; title: string }[]>([]);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const published = !!entry?.publishedAt;
  const dirty = title !== (entry?.title ?? "") || version !== (entry?.version ?? "") || body !== (entry?.body ?? "") || posts.map((p) => p.id).join() !== (entry?.posts ?? []).map((p) => p.id).join();

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => searchPosts({ data: { q } }).then((r) => setResults(r.filter((x) => !posts.some((p) => p.id === x.id)))), 150);
    return () => clearTimeout(t);
  }, [q, posts]);

  async function save(publish: boolean) {
    if (title.trim().length < 3) return toast("Give it a title first");
    setBusy(true);
    try {
      const { id } = await saveChangelog({ data: { id: entry?.id, title, version, body, postIds: posts.map((p) => p.id), publish } });
      await router.invalidate();
      toast.success(publish ? (published ? "Saved" : "Published. Linked posts are now Shipped.") : published ? "Unpublished" : "Draft saved");
      if (!entry && id) router.navigate({ to: "/dashboard/changelog", search: { entry: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || !confirm(`Delete "${entry.title}"?`)) return;
    await deleteChangelog({ data: { id: entry.id } });
    await router.invalidate();
    onClose();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col py-3 pr-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background animate-in fade-in-0 duration-150 motion-reduce:animate-none">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b pr-3 pl-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Back">
              <ArrowLeftIcon className="size-4" />
            </button>
            <span className="text-[15px] font-semibold">{entry ? entry.title : "New entry"}</span>
            <span className={cn("ml-1 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium", published ? "bg-status-shipped/15 text-status-shipped" : "bg-status-planned/15 text-status-planned")}>
              {published ? `Published ${ago(entry!.publishedAt!)} ago` : "Draft"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {entry ? (
              <Button size="sm" variant="ghost" onClick={remove} title="Delete">
                <TrashIcon className="size-3.5" />
              </Button>
            ) : null}
            {published ? (
              <a href="/changelog" target="_blank" rel="noreferrer" className="inline-flex h-[30px] items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <ArrowSquareOutIcon className="size-3.5" /> View
              </a>
            ) : null}
            {published ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => save(false)}>
                Unpublish
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={busy || !dirty} onClick={() => save(false)}>
                Save draft
              </Button>
            )}
            <Button size="sm" arrow disabled={busy || (published && !dirty)} onClick={() => save(true)}>
              {published ? "Save" : "Publish"}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-6 py-10">
            <div className="flex items-center gap-2">
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="v1.0"
                className="h-7 w-24 rounded-md border border-transparent bg-transparent px-2 font-mono text-[12px] text-muted-foreground outline-none placeholder:text-faint hover:border-input focus:border-ring/60"
              />
              <button type="button" onClick={() => toast("Covers land with image support")} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-faint hover:bg-accent hover:text-foreground">
                <ImageIcon className="size-3.5" /> Add cover
              </button>
            </div>
            <input
              autoFocus={!entry}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  bodyRef.current?.focus();
                }
              }}
              placeholder="What shipped?"
              className="w-full bg-transparent text-[32px] font-semibold tracking-[-0.02em] outline-none placeholder:text-faint"
            />
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Start writing. What changed, why it matters, what to do about it."
              className="min-h-[280px] w-full resize-none bg-transparent text-[16px] leading-[1.65] text-foreground/90 outline-none placeholder:text-faint"
            />

            <div className="flex flex-col gap-3 border-t pt-6">
              <div className="text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">Ships these posts</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {posts.map((p) => (
                  <span key={p.id} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-input pr-1.5 pl-2.5 text-[13px] text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-status-shipped" />
                    {p.title}
                    <button type="button" onClick={() => setPosts((ps) => ps.filter((x) => x.id !== p.id))} className="inline-flex size-5 items-center justify-center rounded-full text-faint hover:bg-accent hover:text-foreground" title="Remove">
                      <XIcon className="size-2.5" />
                    </button>
                  </span>
                ))}
                {linking ? (
                  <div className="relative">
                    <input
                      autoFocus
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onBlur={() => setTimeout(() => setLinking(false), 150)}
                      onKeyDown={(e) => e.key === "Escape" && setLinking(false)}
                      placeholder="Search posts"
                      className="h-7 w-56 rounded-full border border-input bg-card px-3 text-[13px] outline-none placeholder:text-faint focus:border-ring/60"
                    />
                    {results.length ? (
                      <div className="absolute top-8 left-0 z-10 flex w-80 flex-col overflow-hidden rounded-lg border bg-popover shadow-md animate-in fade-in-0 zoom-in-95 duration-100">
                        {results.slice(0, 6).map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setPosts((ps) => [...ps, r]);
                              setQ("");
                              setLinking(false);
                            }}
                            className="truncate px-3 py-2 text-left text-[13px] hover:bg-accent"
                          >
                            {r.title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button type="button" onClick={() => setLinking(true)} className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-input px-2.5 text-[13px] text-faint hover:border-foreground/40 hover:text-foreground">
                    <PlusIcon className="size-3" /> Link a post
                  </button>
                )}
              </div>
              <p className="text-[12px] text-faint">Publishing moves linked posts to Shipped and, once email is on, tells their voters.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
