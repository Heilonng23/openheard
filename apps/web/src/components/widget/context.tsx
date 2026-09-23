import { createContext, useContext, useEffect, useState } from "react";

import type { SessionUser } from "@/lib/session";

export type WidgetTab = "feedback" | "roadmap" | "changelog";
export type FeedbackView = { kind: "list" } | { kind: "post"; id: number } | { kind: "new" };

export type WidgetCtx = {
  me: SessionUser | null;
  headers: Record<string, string> | undefined;
  // Runs `then` once the visitor is signed in, asking them first if needed.
  requireSignIn: (then?: () => void) => void;
  signOut: () => void;
  openPost: (id: number) => void;
  compose: () => void;
  back: () => void;
};

export const WidgetContext = createContext<WidgetCtx | null>(null);

export function useWidget() {
  const ctx = useContext(WidgetContext);
  if (!ctx) throw new Error("useWidget outside the widget");
  return ctx;
}

// Client-only fetch with loading and error state. The widget's data depends on
// a token that only exists in the browser, so nothing here runs on the server.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => !off && setState({ data, loading: false }),
      (err: unknown) => !off && setState({ error: err instanceof Error ? err.message : "Could not load", loading: false }),
    );
    return () => {
      off = true;
    };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
