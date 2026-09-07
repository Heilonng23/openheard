import { CaretUpIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BURST_EASE, SPARKS } from "@/components/interior/like-burst";
import { useValueFlash } from "@/components/interior/value-flash";
import { toggleAnonVote, toggleVote } from "@/functions/posts";
import { getAnonToken, getAnonVotes, setAnonVoted } from "@/lib/anon-vote";
import { openSignIn } from "@/lib/pending-action";
import { useOptimisticVote } from "@/lib/use-optimistic-vote";
import { cn } from "@openheard/ui/lib/utils";

const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const FLIP = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;
const FLASH_SETTLE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const FLASH_LIFT = { type: "spring", stiffness: 380, damping: 26, mass: 0.7 } as const;
const FLASH_CLEAR = { duration: 0.16, ease: [0.4, 0, 1, 1] } as const;
const FLASH_CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

export function VoteButton({
  postId,
  count,
  voted,
  signedIn,
  anonymousVoting = false,
  size = "md",
  className,
}: {
  postId: number;
  count: number;
  voted: boolean;
  signedIn: boolean;
  anonymousVoting?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();

  const [anonVoted, setAnonVotedState] = useState(false);
  useEffect(() => {
    if (!signedIn && anonymousVoting) {
      setAnonVotedState(getAnonVotes().has(postId));
    }
  }, [signedIn, anonymousVoting, postId]);

  const effectiveVoted = signedIn ? voted : anonymousVoting ? anonVoted : false;

  const like = useOptimisticVote({
    initialVoted: effectiveVoted,
    initialCount: count,
    onCommit: async () => {
      if (signedIn) {
        await toggleVote({ data: { postId } });
      } else {
        const token = getAnonToken();
        const result = await toggleAnonVote({ data: { postId, anonToken: token } });
        setAnonVoted(postId, result.voted);
        setAnonVotedState(result.voted);
      }
      router.invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not vote"),
  });

  const flash = useValueFlash(like.count, { hold: 600 });

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn && !anonymousVoting) {
      openSignIn({ type: "vote", postId });
      return;
    }
    like.toggle();
  }

  const on = like.voted;
  const low = fmt(like.base);
  const high = fmt(like.base + 1);
  const widest = high.length >= low.length ? high : low;
  const shown = fmt(like.count);

  const countCell = (cls: string) => (
    <motion.span
      aria-hidden
      initial={false}
      animate={{ scale: reduced ? 1 : flash.flashing ? 1.05 : 1 }}
      transition={reduced ? INSTANT : flash.flashing ? FLASH_LIFT : FLASH_SETTLE}
      className={cn("relative grid overflow-hidden font-mono leading-none font-semibold tabular-nums", cls)}
    >
      {flash.flashing && flash.direction ? (
        <motion.span
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduced ? INSTANT : FLASH_CELL}
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[4px]",
            on ? "bg-link/12" : "bg-muted-foreground/12",
          )}
        />
      ) : flash.direction ? (
        <motion.span
          aria-hidden
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={reduced ? INSTANT : FLASH_CLEAR}
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[4px]",
            on ? "bg-link/12" : "bg-muted-foreground/12",
          )}
        />
      ) : null}
      <span className="invisible col-start-1 row-start-1">{widest}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={shown}
          className="col-start-1 row-start-1 justify-self-center"
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -8 }}
          transition={reduced ? INSTANT : FLIP}
        >
          {shown}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );

  const sparks =
    !reduced && like.burst > 0 ? (
      <span key={like.burst} className="pointer-events-none absolute top-1/2 left-1/2 block size-0">
        {SPARKS.map((s, i) => (
          <motion.span
            key={i}
            className="absolute block rounded-[1.5px] bg-link"
            style={{ width: s.size, height: s.size, marginLeft: -s.size / 2, marginTop: -s.size / 2 }}
            initial={{ x: 0, y: 0, scale: 0.6, opacity: 0.9 }}
            animate={{ x: s.x, y: s.y, scale: 1, opacity: 0 }}
            transition={{ duration: 0.44, delay: s.delay, ease: BURST_EASE }}
          />
        ))}
      </span>
    ) : null;

  if (size === "sm") {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        aria-busy={like.pending}
        data-vote
        whileTap={reduced ? undefined : { scale: 0.95 }}
        transition={CELL}
        style={{ touchAction: "manipulation" }}
        className={cn(
          "relative inline-flex h-6 shrink-0 items-center gap-1 overflow-visible rounded-md border px-1.5 pr-2 font-mono text-[12px] transition-colors duration-150 before:absolute before:-inset-[10px] before:content-['']",
          on ? "border-link bg-link text-[#0d0d0f]" : "border-input bg-secondary text-foreground hover:border-foreground/30",
          className,
        )}
      >
        <CaretUpIcon weight="bold" className="size-[10px]" />
        {countCell("")}
      </motion.button>
    );
  }

  const lg = size === "lg";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-busy={like.pending}
      aria-label={on ? "Remove vote" : "Vote"}
      data-vote
      whileTap={reduced ? undefined : { scale: 0.96 }}
      animate={reduced ? undefined : { scale: 1 }}
      transition={CELL}
      style={{ touchAction: "manipulation" }}
      className={cn(
        "relative flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border select-none transition-[background-color,border-color,box-shadow,color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none motion-reduce:transition-none",
        lg ? "h-16 w-14 rounded-xl" : "h-14 w-12",
        on
          ? "border-link bg-link text-[#0d0d0f] shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_2px_10px_rgba(110,139,255,.28)]"
          : "border-border bg-card text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.03)] hover:border-input hover:text-foreground",
        className,
      )}
    >
      <motion.span initial={false} animate={{ y: on ? -1 : 0 }} transition={reduced ? INSTANT : CELL} className="relative flex">
        <CaretUpIcon weight="bold" className={lg ? "size-[15px]" : "size-3.5"} />
        {sparks}
      </motion.span>
      {countCell(cn(lg ? "text-sm" : "text-[13px]", on ? "text-[#0d0d0f]" : "text-foreground"))}
      <span role="status" aria-live="polite" className="sr-only">
        {`${shown} votes, ${on ? "voted" : "not voted"}`}
      </span>
    </motion.button>
  );
}
