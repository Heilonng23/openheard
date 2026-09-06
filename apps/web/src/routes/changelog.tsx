import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@openheard/ui/components/dialog";
import { Input } from "@openheard/ui/components/input";
import { Textarea } from "@openheard/ui/components/textarea";
import { ArrowRightIcon, RssIcon, TrashIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@openheard/ui/components/button";
import { RailLabel, Shell } from "@/components/shell";
import { ChangelogSkeleton, ErrorState } from "@/components/states";
import { deleteChangelog, listChangelog, saveChangelog } from "@/functions/changelog";
import { searchPosts } from "@/functions/posts";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/changelog")({
  loader: () => listChangelog(),
  head: () => ({
    meta: [
      { title: "Changelog" },
      { property: "og:title", content: "Changelog" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangelogPage,
  errorComponent: ({ error }) => <ErrorState message={(error as Error)?.message} retry="/changelog" />,
  pendingComponent: ChangelogSkeleton,
});

type Entry = Awaited<ReturnType<typeof listChangelog>>[number];

function shortDate(d: Date | string | number) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

function ChangelogPage() {
  const entries = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const admin = root.user?.role === "admin";
  const [editing, setEditing] = useState<Entry | null | "new">(null);
  const published = entries.filter((e) => e.publishedAt).length;

  const rail = (
    <>
      {admin ? (
        <Button full arrow size="lg" onClick={() => setEditing("new")}>
          New entry
        </Button>
      ) : (
        <Button full arrow size="lg" onClick={() => router.navigate({ to: "/" })}>
          Post idea
        </Button>
      )}
      {entries.length > 0 ? (
      <section className="flex flex-col gap-2.5 px-2.5">
        <RailLabel>Get updates</RailLabel>
        <p className="-mt-1 text-[13px] leading-[1.5] text-muted-foreground">One email when something ships. No digest, no marketing.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            toast("Email updates are on the roadmap. RSS works today.");
          }}
          className="flex h-[34px] items-center gap-1.5 rounded-lg border border-input bg-card pr-1 pl-2.5 focus-within:border-ring/60"
        >
          <input type="email" placeholder="you@company.com" aria-label="Email address" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          <button type="submit" className="inline-flex size-[26px] items-center justify-center rounded-md bg-accent text-foreground hover:bg-input" aria-label="Subscribe">
            <ArrowRightIcon weight="bold" className="size-3" />
          </button>
        </form>
        <a href="/changelog.rss" className="inline-flex items-center gap-1.5 text-xs text-faint hover:text-muted-foreground">
          <RssIcon className="size-3.5" /> RSS feed
        </a>
      </section>
      ) : null}
    </>
  );

  return (
    <Shell rail={rail}>
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">What shipped</h1>
        <span className="font-mono text-xs text-faint">
          {published} {published === 1 ? "release" : "releases"}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <p className="text-[14px] font-semibold">Nothing shipped yet</p>
          <p className="mt-1 text-sm text-muted-foreground">{admin ? "Write the first entry when you release something." : "Check back after the next release."}</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {entries.map((e) => (
            <article key={e.id} className="flex flex-col gap-4 border-b py-7 first:pt-2 md:flex-row md:gap-8">
              <div className="flex shrink-0 items-center gap-2.5 md:w-24 md:flex-col md:items-start md:pt-1">
                <span className="font-mono text-[12px] tracking-[0.04em] text-faint">{shortDate(e.publishedAt ?? e.createdAt)}</span>
                {e.version ? <span className="inline-flex h-5 items-center rounded-md border border-input bg-secondary px-1.5 font-mono text-[12px] text-foreground">{e.version}</span> : null}
                {!e.publishedAt ? <span className="inline-flex h-5 items-center rounded-md border border-dashed border-input px-1.5 font-mono text-[11px] text-faint">draft</span> : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-[-0.015em]">{e.title}</h2>
                  {admin ? (
                    <span className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => setEditing(e)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                        Edit
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => confirm("Delete this entry?") && deleteChangelog({ data: { id: e.id } }).then(() => router.invalidate())}
                        className="inline-flex size-6 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground"
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </span>
                  ) : null}
                </div>
                {e.body ? <div className="whitespace-pre-wrap text-[14px] leading-[1.6] text-muted-foreground">{e.body}</div> : null}
                {e.posts.length ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="mr-1 font-mono text-[11px] tracking-[0.06em] text-faint uppercase">Shipped from</span>
                    {e.posts.map((p) => (
                      <Link
                        key={p.id}
                        to="/p/$id"
                        params={{ id: String(p.id) }}
                        className="inline-flex h-[24px] items-center gap-1.5 rounded-full border border-input pr-2.5 pl-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        <span className="size-1.5 rounded-full bg-status-shipped" />
                        {p.title}
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
    </Shell>
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
      <DialogContent className="max-w-2xl rounded-xl border-input bg-card">
        <DialogHeader>
          <DialogTitle>{e ? "Edit entry" : "New changelog entry"}</DialogTitle>
          <DialogDescription>Publishing marks every linked post as shipped and notifies its voters.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
          <Input placeholder="What shipped" value={title} onChange={(ev) => setTitle(ev.target.value)} aria-label="Entry title" className="h-10 text-[14px] font-semibold" />
          <Input placeholder="v0.4.0" value={version} onChange={(ev) => setVersion(ev.target.value)} aria-label="Version" className="h-10 font-mono" />
        </div>
        <Textarea placeholder="Why it matters, in a few sentences." value={body} onChange={(ev) => setBody(ev.target.value)} aria-label="Entry body" className="min-h-36" />
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Posts this closes</span>
          <div className="flex flex-wrap gap-1.5">
            {posts.map((p) => (
              <button key={p.id} type="button" onClick={() => setPosts((ps) => ps.filter((x) => x.id !== p.id))} className="inline-flex h-6 items-center gap-1 rounded-md border bg-accent px-2 text-xs" title="Remove">
                {p.title} <span className="text-muted-foreground">×</span>
              </button>
            ))}
          </div>
          <Input placeholder="Search posts to link" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Search posts to link" />
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
          <Button variant="secondary" disabled={busy || title.trim().length < 3} onClick={() => save(false)}>
            Save draft
          </Button>
          <Button arrow disabled={busy || title.trim().length < 3} onClick={() => save(true)}>
            Publish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
