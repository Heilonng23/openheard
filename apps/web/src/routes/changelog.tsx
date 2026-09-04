import { Button } from "@openheard/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@openheard/ui/components/dialog";
import { Input } from "@openheard/ui/components/input";
import { Textarea } from "@openheard/ui/components/textarea";
import { CheckIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Mono, StatusPill } from "@/components/bits";
import { deleteChangelog, listChangelog, saveChangelog } from "@/functions/changelog";
import { searchPosts } from "@/functions/posts";
import { longDate } from "@/lib/time";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/changelog")({
  loader: () => listChangelog(),
  head: () => ({ meta: [{ title: "Changelog · feedback" }] }),
  component: ChangelogPage,
});

type Entry = Awaited<ReturnType<typeof listChangelog>>[number];

function ChangelogPage() {
  const entries = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const admin = root.user?.role === "admin";
  const [editing, setEditing] = useState<Entry | null | "new">(null);

  return (
    <main className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col gap-7 px-5 pt-9 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold leading-tight">Changelog</h1>
          <p className="text-muted-foreground">Every release, with the posts it closed.</p>
        </div>
        {admin ? (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <PlusIcon weight="bold" className="size-3" /> New entry
          </Button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-16 text-center">
          <p className="text-[15px] font-medium">Nothing shipped yet</p>
          <p className="mt-1 text-sm text-muted-foreground">{admin ? "Write the first entry when you release something." : "Check back after the next release."}</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {entries.map((e) => (
            <article key={e.id} className="grid grid-cols-1 gap-3 border-t py-8 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
              <div className="flex flex-col gap-1.5 md:sticky md:top-5 md:self-start">
                <div className="text-[22px] font-semibold leading-none">{longDate(e.publishedAt ?? e.createdAt)}</div>
                {e.version ? <Mono>{e.version}</Mono> : null}
                {!e.publishedAt ? <span className="w-max rounded-full border border-dashed px-2 py-0.5 font-mono text-[11px] text-muted-foreground">draft</span> : null}
              </div>
              <div className="flex max-w-[600px] flex-col gap-3">
                <div className="flex items-center gap-2">
                  <StatusPill status="done" />
                  {e.posts.length ? <span className="inline-flex h-[22px] items-center rounded-full border bg-secondary px-2 text-xs text-muted-foreground">{e.posts.length} {e.posts.length === 1 ? "post" : "posts"}</span> : null}
                  {admin ? (
                    <span className="ml-auto flex gap-1">
                      <Button variant="ghost" size="xs" onClick={() => setEditing(e)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Delete"
                        onClick={() => confirm("Delete this entry?") && deleteChangelog({ data: { id: e.id } }).then(() => router.invalidate())}
                      >
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </span>
                  ) : null}
                </div>
                <h2 className="text-[22px] font-semibold leading-[1.25]">{e.title}</h2>
                {e.body ? <div className="whitespace-pre-wrap text-[15px] leading-[1.65] text-muted-foreground">{e.body}</div> : null}
                {e.posts.length ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    {e.posts.map((p) => (
                      <Link key={p.id} to="/p/$id" params={{ id: String(p.id) }} className="flex items-center gap-2 text-[13px] text-foreground hover:text-link">
                        <CheckIcon weight="bold" className="size-3.5 text-status-shipped" />
                        {p.title}
                        <Mono>{p.voteCount} votes</Mono>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {admin ? <EntryDialog entry={editing} onClose={() => setEditing(null)} /> : null}
    </main>
  );
}

function EntryDialog({ entry, onClose }: { entry: Entry | null | "new"; onClose: () => void }) {
  const router = useRouter();
  const e = entry === "new" ? null : entry;
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [body, setBody] = useState("");
  const [posts, setPosts] = useState<{ id: number; title: string }[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: number; title: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(e?.title ?? "");
    setVersion(e?.version ?? "");
    setBody(e?.body ?? "");
    setPosts(e?.posts ?? []);
    setQ("");
  }, [entry]);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => searchPosts({ data: { q } }).then(setResults), 150);
    return () => clearTimeout(t);
  }, [q]);

  async function save(publish: boolean) {
    setBusy(true);
    try {
      await saveChangelog({ data: { id: e?.id, title, version, body, postIds: posts.map((p) => p.id), publish } });
      await router.invalidate();
      onClose();
      toast.success(publish ? "Published. Linked posts are marked shipped." : "Saved as draft");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{e ? "Edit entry" : "New changelog entry"}</DialogTitle>
          <DialogDescription>Publishing marks every linked post as shipped and notifies its voters.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
          <Input placeholder="What shipped" value={title} onChange={(ev) => setTitle(ev.target.value)} className="h-10 text-[15px] font-medium" />
          <Input placeholder="v0.4.0" value={version} onChange={(ev) => setVersion(ev.target.value)} className="h-10 font-mono" />
        </div>
        <Textarea placeholder="Why it matters, in a few sentences. Markdown-ish plain text." value={body} onChange={(ev) => setBody(ev.target.value)} className="min-h-36" />
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Posts this closes</span>
          <div className="flex flex-wrap gap-1.5">
            {posts.map((p) => (
              <button key={p.id} type="button" onClick={() => setPosts((ps) => ps.filter((x) => x.id !== p.id))} className="inline-flex h-6 items-center gap-1 rounded-[5px] border bg-accent px-2 text-xs" title="Remove">
                {p.title} <span className="text-muted-foreground">×</span>
              </button>
            ))}
          </div>
          <Input placeholder="Search posts to link" value={q} onChange={(ev) => setQ(ev.target.value)} />
          {results.length ? (
            <div className="flex max-h-40 flex-col overflow-auto rounded-md border">
              {results
                .filter((r) => !posts.some((p) => p.id === r.id))
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setPosts((ps) => [...ps, r]);
                      setQ("");
                    }}
                    className={cn("border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent")}
                  >
                    {r.title}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" disabled={busy || title.trim().length < 3} onClick={() => save(false)}>
            Save draft
          </Button>
          <Button disabled={busy || title.trim().length < 3} onClick={() => save(true)}>
            Publish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
