import { Button } from "@openheard/ui/components/button";
import { DownloadSimpleIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead } from "@/components/admin/panel";
import { exportPosts, importPosts } from "@/functions/settings";
import { parseCsv, toImportRows } from "@/lib/csv";
import type { ImportRow } from "@/lib/csv";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/export")({
  head: () => ({ meta: [{ title: "Export · settings" }] }),
  component: Export,
});

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function Export() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const [busy, setBusy] = useState<"json" | "csv" | "import" | null>(null);
  const [preview, setPreview] = useState<ImportRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    const rows = toImportRows(parseCsv(await file.text()));
    if (rows.length === 0) return toast.error("No posts found. Expected a Title column.");
    setPreview(rows);
  }

  async function runImport() {
    if (!preview) return;
    setBusy("import");
    try {
      const { created } = await importPosts({ data: { rows: preview } });
      setPreview(null);
      await router.invalidate();
      toast.success(`Imported ${created} posts`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function run(kind: "json" | "csv") {
    setBusy(kind);
    try {
      const rows = await exportPosts();
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "json") download(`${root.workspace.id}-posts-${stamp}.json`, JSON.stringify(rows, null, 2), "application/json");
      else {
        const head = ["id", "title", "status", "board", "votes", "author", "email", "created", "tags", "body"];
        const lines = rows.map((p) => [p.id, p.title, p.status, p.board, p.votes, p.author?.name, p.author?.email, new Date(p.createdAt).toISOString(), p.tags.join("|"), p.body].map(csvCell).join(","));
        download(`${root.workspace.id}-posts-${stamp}.csv`, [head.join(","), ...lines].join("\n"), "text/csv");
      }
      toast.success(`Exported ${rows.length} posts`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHead title="Import & export" sub="Your data is yours. Bring it in, take it out." />
      <SectionHead title="Posts" />
      <Row label="JSON" help="Every post with body, status, board, tags, votes, author and public comments.">
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run("json")}>
          <DownloadSimpleIcon className="size-3.5" /> {busy === "json" ? "Preparing" : "Download JSON"}
        </Button>
      </Row>
      <Row label="CSV" help="One row per post, for spreadsheets. Comments are not included.">
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run("csv")}>
          <DownloadSimpleIcon className="size-3.5" /> {busy === "csv" ? "Preparing" : "Download CSV"}
        </Button>
      </Row>
      <div className="pt-7">
        <SectionHead title="Import" />
      </div>
      <Row label="From a CSV" help="Exports from other feedback tools work as they are. Votes come over as counts, authors as members they can claim by signing up.">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          <UploadSimpleIcon className="size-3.5" /> Choose CSV
        </Button>
      </Row>
      {preview ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">
              {preview.length} posts ready · {preview.reduce((n, r) => n + r.votes, 0)} votes · {new Set(preview.map((r) => r.authorEmail).filter(Boolean)).size} authors
            </span>
            <span className="text-xs text-faint">{new Set(preview.map((r) => r.board ?? "")).size} boards · {new Set(preview.map((r) => r.status ?? "")).size} statuses</span>
          </div>
          <div className="flex max-h-48 flex-col overflow-auto rounded-md border bg-background">
            {preview.slice(0, 12).map((r, i) => (
              <div key={i} className="flex items-center gap-3 border-b px-3 py-1.5 text-xs last:border-b-0">
                <span className="w-8 text-faint tabular-nums">{r.votes}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="text-faint">{r.status ?? "—"}</span>
                <span className="text-faint">{r.authorName ?? ""}</span>
              </div>
            ))}
            {preview.length > 12 ? <div className="px-3 py-1.5 text-xs text-faint">and {preview.length - 12} more</div> : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button size="sm" arrow disabled={busy !== null} onClick={runImport}>
              {busy === "import" ? "Importing" : `Import ${preview.length} posts`}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
