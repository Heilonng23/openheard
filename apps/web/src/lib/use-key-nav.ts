import { useCallback, useEffect, useRef, useState } from "react";

// j/k move, enter opens, v votes, / searches, c creates. Ignored while typing.
// The focused index lives in a ref as well as state so that rapid key presses
// never read a stale closure.
export function useKeyNav(count: number, handlers: { open: (i: number) => void; vote: (i: number) => void; search: () => void; create: () => void }) {
  const [focused, setFocusedState] = useState(-1);
  const focusedRef = useRef(-1);
  const h = useRef(handlers);
  h.current = handlers;

  const setFocused = useCallback((next: number | ((i: number) => number)) => {
    const value = typeof next === "function" ? next(focusedRef.current) : next;
    focusedRef.current = value;
    setFocusedState(value);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = focusedRef.current;
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setFocused(Math.min(count - 1, i + 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setFocused(Math.max(0, i - 1));
          break;
        case "Enter":
          if (i >= 0) h.current.open(i);
          break;
        case "v":
          e.preventDefault();
          if (i >= 0) h.current.vote(i);
          break;
        case "/":
          e.preventDefault();
          h.current.search();
          break;
        case "c":
          e.preventDefault();
          h.current.create();
          break;
        case "Escape":
          setFocused(-1);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, setFocused]);

  useEffect(() => {
    if (focused < 0) return;
    document.querySelector<HTMLElement>(`[data-row-index="${focused}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  return [focused, setFocused] as const;
}
