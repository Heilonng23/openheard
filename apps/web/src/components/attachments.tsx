import { Dialog, DialogContent, DialogTitle } from "@openheard/ui/components/dialog";
import { cn } from "@openheard/ui/lib/utils";
import { ArrowSquareOutIcon, CaretLeftIcon, CaretRightIcon, ImageIcon, SpinnerGapIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { IMAGE_TYPES, MAX_IMAGES, type AttachmentView, checkImage, tooManyImages } from "@/lib/attachments";

// An image in a composer: previewed from the local file straight away, then
// swapped for the stored one once the upload answers.
export type Draft = { key: string; name: string; preview: string; status: "uploading" | "done"; id?: string; width?: number | null; height?: number | null };

async function upload(file: File): Promise<AttachmentView> {
  const res = await fetch("/api/uploads", { method: "POST", body: file, headers: { "content-type": file.type } });
  const out = (await res.json().catch(() => null)) as { attachment?: AttachmentView; error?: string } | null;
  if (!res.ok || !out?.attachment) throw new Error(out?.error ?? "Upload failed. Try again.");
  return out.attachment;
}

function imagesIn(list: DataTransfer | null): File[] {
  if (!list) return [];
  return Array.from(list.files);
}

// Paste, drop and pick all end up in `add`. `blocked` is the sentence to show
// instead of uploading (signed out, demo), or null when uploads are allowed.
export function useImageDrafts({ blocked, onBlocked }: { blocked?: string | null; onBlocked?: () => void } = {}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const count = useRef(0);
  count.current = drafts.length;

  const add = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      setError(null);
      if (onBlocked) return onBlocked();
      if (blocked) return setError(blocked);
      let room = MAX_IMAGES - count.current;
      for (const file of files) {
        const problem = checkImage(file);
        if (problem) {
          setError(problem);
          continue;
        }
        if (room <= 0) {
          setError(tooManyImages());
          break;
        }
        room--;
        const key = crypto.randomUUID();
        const draft: Draft = { key, name: file.name || "Pasted image", preview: URL.createObjectURL(file), status: "uploading" };
        count.current++;
        setDrafts((d) => [...d, draft]);
        upload(file).then(
          (a) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, status: "done", id: a.id, width: a.width, height: a.height } : x))),
          (err: Error) => {
            setDrafts((d) => d.filter((x) => x.key !== key));
            URL.revokeObjectURL(draft.preview);
            setError(err.message);
          },
        );
      }
    },
    [blocked, onBlocked],
  );

  const remove = useCallback((key: string) => {
    setDrafts((d) => {
      const gone = d.find((x) => x.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return d.filter((x) => x.key !== key);
    });
    setError(null);
  }, []);

  // After publishing. Previews stay alive: the optimistic copy still shows them.
  const reset = useCallback(() => {
    setDrafts([]);
    setError(null);
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = imagesIn(e.clipboardData).filter((f) => f.type.startsWith("image/") || /\.svg$/i.test(f.name));
      if (!files.length) return;
      e.preventDefault();
      add(files);
    },
    [add],
  );

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      add(imagesIn(e.dataTransfer));
    },
  };

  const uploading = drafts.some((d) => d.status === "uploading");
  const ids = drafts.flatMap((d) => (d.status === "done" && d.id ? [d.id] : []));
  // What an optimistic post or comment renders until the real one arrives.
  const views: AttachmentView[] = drafts.map((d) => ({ id: d.id ?? d.key, url: d.preview, contentType: "", width: d.width ?? null, height: d.height ?? null }));
  return { drafts, ids, views, uploading, error, setError, dragging, add, remove, reset, onPaste, dropProps, full: drafts.length >= MAX_IMAGES };
}

export type ImageDrafts = ReturnType<typeof useImageDrafts>;

// A button that opens the file picker. Everything else about it is the caller's.
export function AttachButton({ drafts, className, children, title = "Attach images" }: { drafts: ImageDrafts; className?: string; children: React.ReactNode; title?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" title={title} aria-label={title} disabled={drafts.full} onClick={() => input.current?.click()} className={cn("disabled:pointer-events-none disabled:opacity-40", className)}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          drafts.add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </>
  );
}

// Thumbnails of what is about to be posted, each removable.
export function DraftTray({ drafts, className }: { drafts: ImageDrafts; className?: string }) {
  if (!drafts.drafts.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Attached images">
      {drafts.drafts.map((d) => (
        <li key={d.key} className="group/draft relative h-14 w-[72px] shrink-0 overflow-hidden rounded-md border border-input bg-secondary">
          <img src={d.preview} alt={d.name} className={cn("size-full object-cover transition-opacity duration-150", d.status === "uploading" && "opacity-50")} />
          {d.status === "uploading" ? (
            <span className="absolute inset-0 flex items-center justify-center" aria-label="Uploading">
              <SpinnerGapIcon className="size-4 animate-spin text-foreground motion-reduce:animate-none" />
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => drafts.remove(d.key)}
            aria-label={`Remove ${d.name}`}
            title="Remove"
            className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 ring-1 ring-border transition-opacity group-hover/draft:opacity-100 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <XIcon className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// The inline error for the composer: next to the thing that failed.
export function DraftError({ drafts, className }: { drafts: ImageDrafts; className?: string }) {
  if (!drafts.error) return null;
  return (
    <p role="alert" className={cn("flex items-start gap-1.5 text-xs leading-[1.45] text-destructive", className)}>
      <WarningCircleIcon className="mt-px size-3.5 shrink-0" />
      <span>{drafts.error}</span>
    </p>
  );
}

// Covers the composer while files are dragged over it.
export function DropOverlay({ drafts, className }: { drafts: ImageDrafts; className?: string }) {
  if (!drafts.dragging) return null;
  return (
    <div className={cn("pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[inherit] border border-dashed border-ring bg-background/85 text-[13px] text-foreground", className)}>
      <ImageIcon className="size-4 text-link" /> Drop images to attach
    </div>
  );
}

// Published images under a post or comment. Click one to see it large.
export function AttachmentGallery({ items, className, size = "md" }: { items: AttachmentView[] | undefined; className?: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items?.length) return null;
  const single = items.length === 1;
  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {items.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`View image ${i + 1} of ${items.length}`}
            className={cn(
              "overflow-hidden rounded-lg border bg-secondary outline-none transition-[filter] hover:brightness-110 focus-visible:ring-1 focus-visible:ring-ring",
              single ? (size === "md" ? "max-h-[320px] max-w-full" : "max-h-[220px] max-w-full") : size === "md" ? "size-[120px]" : "size-24",
            )}
          >
            <img
              src={a.url}
              alt=""
              loading="lazy"
              decoding="async"
              width={a.width ?? undefined}
              height={a.height ?? undefined}
              className={cn("block", single ? cn("h-auto w-auto max-w-full object-contain", size === "md" ? "max-h-[318px]" : "max-h-[218px]") : "size-full object-cover")}
            />
          </button>
        ))}
      </div>
      <Lightbox items={items} index={open} onIndex={setOpen} />
    </>
  );
}

function Lightbox({ items, index, onIndex }: { items: AttachmentView[]; index: number | null; onIndex: (i: number | null) => void }) {
  const many = items.length > 1;
  const a = index === null ? null : items[index];
  useEffect(() => {
    if (index === null || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, many, items.length, onIndex]);
  const nav = "absolute top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-muted-foreground ring-1 ring-border hover:text-foreground";
  return (
    <Dialog open={a != null} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent showClose={false} className="w-max max-w-[min(92vw,1200px)] gap-0 overflow-hidden border-input bg-card p-0 sm:max-w-[min(92vw,1200px)]">
        <DialogTitle className="sr-only">Image {index === null ? "" : `${index + 1} of ${items.length}`}</DialogTitle>
        {a ? (
          <div className="relative">
            <img src={a.url} alt="" width={a.width ?? undefined} height={a.height ?? undefined} className="block h-auto max-h-[82vh] w-auto max-w-[min(92vw,1200px)] object-contain" />
            {many ? (
              <>
                <button type="button" aria-label="Previous image" onClick={() => onIndex((index! - 1 + items.length) % items.length)} className={cn(nav, "left-3")}>
                  <CaretLeftIcon className="size-4" />
                </button>
                <button type="button" aria-label="Next image" onClick={() => onIndex((index! + 1) % items.length)} className={cn(nav, "right-3")}>
                  <CaretRightIcon className="size-4" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 border-t bg-background px-3.5 py-2 text-xs text-faint">
          <span className="font-mono tabular-nums">
            {many && index !== null ? `${index + 1} / ${items.length}` : a?.width && a.height ? `${a.width} × ${a.height}` : "image"}
          </span>
          <div className="flex items-center gap-1">
            {a ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring">
                <ArrowSquareOutIcon className="size-3.5" /> Open original
              </a>
            ) : null}
            <button type="button" onClick={() => onIndex(null)} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring">
              <XIcon className="size-3.5" /> Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
