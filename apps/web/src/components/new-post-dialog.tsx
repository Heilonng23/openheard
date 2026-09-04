import { Button } from "@openheard/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@openheard/ui/components/dialog";
import { Input } from "@openheard/ui/components/input";
import { Textarea } from "@openheard/ui/components/textarea";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { createPost } from "@/functions/posts";
import { cn } from "@openheard/ui/lib/utils";

type Board = { id: string; name: string };
type Tag = { id: string; name: string };

export function NewPostDialog({
  open,
  onOpenChange,
  boards,
  tags,
  defaultBoard,
  signedIn,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boards: Board[];
  tags: Tag[];
  defaultBoard?: string;
  signedIn: boolean;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [boardId, setBoardId] = useState(defaultBoard ?? boards[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!signedIn) {
      toast("Sign in to post", { action: { label: "Sign in", onClick: () => navigate({ to: "/login" }) } });
      return;
    }
    setBusy(true);
    try {
      const { id } = await createPost({ data: { boardId: boardId || boards[0]!.id, title, body, tags: picked } });
      onOpenChange(false);
      setTitle("");
      setBody("");
      setPicked([]);
      toast.success("Posted. You are the first vote.");
      navigate({ to: "/p/$id", params: { id: String(id) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New post</DialogTitle>
          <DialogDescription>One idea per post. Say what you are trying to do, not just what you want.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            autoFocus
            placeholder="Short, specific title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            className="h-10 text-[15px] font-medium"
          />
          <Textarea
            placeholder="What would this let you do? Any workaround you use today?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-32 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Board</span>
            <div className="flex gap-1 rounded-md border bg-card p-0.5">
              {boards.map((b) => (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => setBoardId(b.id)}
                  className={cn("rounded-sm px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors", boardId === b.id && "bg-accent text-foreground")}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
          {tags.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Tags</span>
              {tags.map((t) => {
                const on = picked.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t.id) : p.length < 5 ? [...p, t.id] : p))}
                    className={cn("h-6 rounded-[5px] border bg-secondary px-2 text-xs text-muted-foreground transition-colors hover:text-foreground", on && "border-foreground/40 bg-accent text-foreground")}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || title.trim().length < 4}>
              {busy ? "Posting…" : "Post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
