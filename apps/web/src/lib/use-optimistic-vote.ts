import { useCallback, useEffect, useRef, useState } from "react";

// Adapted from interior.dev's Like Burst (MIT, github.com/ddoemonn/interior).
//
// Every tap flips the UI immediately. Taps inside the `settle` window collapse
// into at most one request, sent with the final intent; a newer intent aborts
// the one in flight. On failure the UI snaps back to the last confirmed truth
// and `onError` only has to explain, not repair.

export type VoteCommit = (voted: boolean, signal: AbortSignal) => Promise<unknown>;

export function useOptimisticVote({
  initialVoted,
  initialCount,
  onCommit,
  onError,
  settle = 400,
}: {
  initialVoted: boolean;
  initialCount: number;
  onCommit: VoteCommit;
  onError?: (error: unknown) => void;
  settle?: number;
}) {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [burst, setBurst] = useState(0);

  const votedNow = useRef(initialVoted);
  const countNow = useRef(initialCount);
  const truth = useRef({ voted: initialVoted, count: initialCount });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const failed = useRef(onError);
  failed.current = onError;

  // Server truth changed underneath us (router revalidated). Only adopt it
  // when nothing is pending, otherwise the count would jump mid-gesture.
  useEffect(() => {
    if (timer.current || inFlight.current) return;
    truth.current = { voted: initialVoted, count: initialCount };
    votedNow.current = initialVoted;
    countNow.current = initialCount;
    setVoted(initialVoted);
    setCount(initialCount);
  }, [initialVoted, initialCount]);

  const flush = useCallback(() => {
    timer.current = null;
    inFlight.current?.abort();
    inFlight.current = null;
    seq.current += 1;

    const intent = votedNow.current;
    if (intent === truth.current.voted) {
      countNow.current = truth.current.count;
      setVoted(truth.current.voted);
      setCount(truth.current.count);
      setPending(false);
      return;
    }

    const target = { voted: intent, count: countNow.current };
    const controller = new AbortController();
    const id = seq.current;
    inFlight.current = controller;
    setPending(true);

    commit.current(intent, controller.signal).then(
      () => {
        if (id !== seq.current) return;
        inFlight.current = null;
        truth.current = target;
        setPending(false);
      },
      (error: unknown) => {
        if (id !== seq.current) return;
        inFlight.current = null;
        votedNow.current = truth.current.voted;
        countNow.current = truth.current.count;
        setVoted(truth.current.voted);
        setCount(truth.current.count);
        setPending(false);
        failed.current?.(error);
      },
    );
  }, []);

  const toggle = useCallback(() => {
    const next = !votedNow.current;
    votedNow.current = next;
    countNow.current += next ? 1 : -1;
    setVoted(next);
    setCount(countNow.current);
    setPending(true);
    if (next) setBurst((b) => b + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, settle);
  }, [flush, settle]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      seq.current += 1;
      inFlight.current?.abort();
      inFlight.current = null;
    },
    [],
  );

  return { voted, count, base: voted ? count - 1 : count, pending, burst, toggle };
}
