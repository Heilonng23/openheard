import { CaretUpIcon } from "@phosphor-icons/react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { toggleVote } from "@/functions/posts";
import { cn } from "@openheard/ui/lib/utils";

// The signature interaction. Optimistic: the pill flips and the number ticks
// before the server answers; on failure it snaps back.
export function VoteButton({
  postId,
  count,
  voted,
  signedIn,
  size = "md",
  className,
}: {
  postId: number;
  count: number;
  voted: boolean;
  signedIn: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [state, setState] = useState({ count, voted });
  const [pulse, setPulse] = useState(false);
  const busy = useRef(false);

  useEffect(() => setState({ count, voted }), [count, voted]);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      toast("Sign in to vote", { action: { label: "Sign in", onClick: () => navigate({ to: "/login" }) } });
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const next = { voted: !state.voted, count: state.count + (state.voted ? -1 : 1) };
    setState(next);
    if (next.voted) {
      setPulse(true);
      setTimeout(() => setPulse(false), 220);
    }
    try {
      await toggleVote({ data: { postId } });
      router.invalidate();
    } catch (err) {
      setState({ count, voted });
      toast.error(err instanceof Error ? err.message : "Could not vote");
    } finally {
      busy.current = false;
    }
  }

  const lg = size === "lg";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state.voted}
      aria-label={state.voted ? "Remove vote" : "Vote"}
      data-vote
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-px rounded-[9px] border bg-card text-muted-foreground transition-[transform,background-color,border-color,color] duration-150 ease-out select-none hover:border-input hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]",
        lg ? "h-14 w-[52px]" : "size-11",
        state.voted && "border-primary bg-primary text-primary-foreground hover:border-primary hover:text-primary-foreground",
        pulse && "scale-[1.06]",
        className,
      )}
    >
      <CaretUpIcon weight="bold" className={lg ? "size-4" : "size-3.5"} />
      <span className={cn("font-mono leading-none", lg ? "text-[13px]" : "text-xs", state.voted ? "text-primary-foreground" : "text-foreground")}>{state.count}</span>
    </button>
  );
}
