import { Dialog, DialogContent, DialogTitle } from "@openheard/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { CaretDownIcon, ImageIcon, LightningIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createPost, searchPosts } from "@/functions/posts";
import { findStatus, useStatuses } from "@/lib/status";

import { Button } from "@openheard/ui/components/button";
import { Kbd } from "./bits";

type Board = { id: string; name: string };
type Similar = Awaited<ReturnType<typeof searchPosts>>;

export function NewPostDialog({
  open,
  onOpenChange,
  boards,
  defaultBoard,
  signedIn,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boards: Board[];
  defaultBoard?: string;
  signedIn: boolean;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [boardId, setBoardId] = useState(defaultBoard ?? boards[0]?.id ?? "");
  const [similar, setSimilar] = useState<Similar>([]);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const statuses = useStatuses();
  const board = boards.find((b) => b.id === boardId) ?? boards[0];

  useEffect(() => {
    if (defaultBoard) setBoardId(defaultBoard);
  }, [defaultBoard]);

  // Looks-similar: search while the title is typed, so a duplicate can be
  // voted on instead of posted.
  useEffect(() => {
    const q = title.trim();
    if (q.length < 6) return setSimilar([]);
    const t = setTimeout(() => searchPosts({ data: { q } }).then(setSimilar).catch(() => setSimilar([])), 200);
    return () => clearTimeout(t);
  }, [title]);

  async function submit() {
    if (!signedIn) {
      toast("Sign in to post", { action: { label: "Sign in", onClick: () => navigate({ to: "/login" }) } });
      return;
    }
    if (title.trim().length < 4) return toast("Give it a title first");
    setBusy(true);
    try {
      const result = await createPost({ data: { boardId: board?.id ?? "", title, body, tags: [] } });
      onOpenChange(false);
      setTitle("");
      setBody("");
      toast.success(result.pending ? "Submitted! An admin will review it shortly." : "Posted. You are the first vote.");
      navigate({ to: "/p/$id", params: { id: String(result.id) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border-input bg-card p-0 shadow-[0_24px_64px_rgba(0,0,0,.6)] sm:max-w-[560px]">
        <div className="flex items-center justify-between pt-3.5 pr-3.5 pl-4 sm:pl-5">
          <DialogTitle className="text-[13px] font-semibold text-muted-foreground">New post</DialogTitle>
          <button type="button" onClick={() => onOpenChange(false)} className="inline-flex size-10 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground sm:size-[26px]">
            <XIcon className="size-[13px]" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 px-4 pt-2.5 pb-4 sm:px-5">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                bodyRef.current?.focus();
              }
              onKey(e);
            }}
            maxLength={140}
            placeholder="What would make this better?"
            aria-label="Post title"
            className="w-full bg-transparent text-xl font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-faint"
          />
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKey}
            rows={3}
            placeholder="What are you trying to do? Any workaround you use today?"
            aria-label="Post details"
            className="w-full resize-none bg-transparent text-[14px] leading-[1.55] text-muted-foreground outline-none placeholder:text-faint"
          />
        </div>

        {similar.length ? (
          <div className="flex flex-col gap-1 px-4 pb-3 sm:px-5">
            <div className="flex items-center gap-1.5 pt-1 pb-1.5 font-mono text-[11px] tracking-[0.06em] text-faint uppercase">
              <LightningIcon weight="fill" className="size-3 text-status-planned" /> Looks similar · vote instead?
            </div>
            {similar.slice(0, 3).map((s) => (
              <Link
                key={s.id}
                to="/p/$id"
                params={{ id: String(s.id) }}
                onClick={() => onOpenChange(false)}
                className="flex min-h-11 items-center gap-2.5 rounded-lg bg-secondary px-2 py-2 text-[13px] transition-colors hover:bg-accent"
              >
                <span className="inline-flex h-[22px] items-center gap-1 rounded-md border border-input px-1.5 font-mono text-[11px] text-muted-foreground">
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 7 5 3l3.5 4" />
                  </svg>
                  {s.voteCount}
                </span>
                <span className="flex-1 truncate">{s.title}</span>
                {findStatus(statuses, s.status).kind !== "open" ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-faint">
                    <span className="size-1.5 rounded-full" style={{ background: findStatus(statuses, s.status).color }} />
                    {findStatus(statuses, s.status).label}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 px-4 pb-3 sm:px-5">
          <span className="inline-flex h-11 w-16 items-center justify-center rounded-md border border-input bg-secondary text-faint">
            <ImageIcon className="size-3.5" />
          </span>
          <span className="inline-flex h-11 w-16 items-center justify-center rounded-md border border-dashed border-input text-faint">
            <PlusIcon className="size-3.5" />
          </span>
          <span className="ml-1 text-xs text-faint">Images coming soon. Paste a link for now.</span>
        </div>

        <div className="flex items-center justify-between border-t bg-background px-4 py-3 pr-3 sm:px-5">
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-secondary pr-2 pl-2.5 text-[13px] text-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring">
                <span className="size-1.5 rounded-full bg-link" />
                {board?.name ?? "Board"}
                <CaretDownIcon className="size-2.5 text-faint" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-40">
                {boards.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => setBoardId(b.id)}>
                    {b.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="hidden items-center gap-1.5 text-xs text-faint sm:inline-flex">
              <Kbd>⌘ ↵</Kbd> to post
            </span>
          </div>
          <Button arrow onClick={submit} disabled={busy}>
            {busy ? "Posting" : "Post idea"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
