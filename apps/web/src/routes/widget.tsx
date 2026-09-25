import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import { ArrowsOutSimpleIcon, XIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WidgetContext, toParent, useLoad, type FeedbackView, type WidgetCtx, type WidgetTab } from "@/components/widget/context";
import { Composer, FeedbackList, PostDetail, Sent } from "@/components/widget/feedback";
import { ChangelogTab, RoadmapTab } from "@/components/widget/tabs";
import { listChangelog } from "@/functions/changelog";
import { disconnectWidget, widgetUser } from "@/functions/widget";
import type { SessionUser } from "@/lib/session";
import { MSG, getWidgetToken, newNonce, sessionFromMessage, setWidgetToken, widgetTokenHeaders, type SignInFlow } from "@/lib/widget-auth";

type Search = { tab?: WidgetTab; seen?: number; accent?: string };

const TABS: WidgetTab[] = ["feedback", "roadmap", "changelog"];
const HEX = /^#[0-9a-f]{3,8}$/i;

// The panel the embed script opens in an iframe on the host site. It is the
// only route that may be framed (see server.ts).
export const Route = createFileRoute("/widget")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: TABS.includes(s.tab as WidgetTab) ? (s.tab as WidgetTab) : undefined,
    seen: Number(s.seen) > 0 ? Number(s.seen) : undefined,
    accent: typeof s.accent === "string" && HEX.test(s.accent) ? s.accent : undefined,
  }),
  head: ({ matches }) => {
    const root = matches[0]?.loaderData as { workspace?: { name: string } } | undefined;
    return { meta: [{ title: root?.workspace ? `${root.workspace.name} · feedback` : "Feedback" }, { name: "robots", content: "noindex" }] };
  },
  component: Widget,
});

// Switching tabs or views: the old one lifts away blurred, the new one settles in.
const VIEW = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.24, ease: "easeOut" } },
  exit: { opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.16, ease: "easeIn" } },
} as const;

function Widget() {
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const ws = root.workspace;
  const tabs = useMemo(() => TABS.filter((t) => (t === "roadmap" ? ws.showRoadmap : t === "changelog" ? ws.showChangelog : true)), [ws.showRoadmap, ws.showChangelog]);
  const [tab, setTab] = useState<WidgetTab>(search.tab && tabs.includes(search.tab) ? search.tab : "feedback");
  const [view, setView] = useState<FeedbackView>({ kind: "list" });
  const [embedded, setEmbedded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // Bumped each time the loader opens the panel, to replay the entrance.
  const [opened, setOpened] = useState(0);
  const entrance = useAnimationControls();
  useEffect(() => {
    if (!opened || reduced) return;
    // The shell leads, the content follows.
    entrance.set({ opacity: 0, x: 40, scale: 0.97, filter: "blur(2px)" });
    void entrance.start({ opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.22, delay: 0.08, ease: [0.22, 1, 0.36, 1] } });
  }, [opened, reduced, entrance]);

  // Session: a widget token from the sign-in popup, or a first-party cookie
  // when the host shares our site. `undefined` means not known yet.
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const [me, setMe] = useState<SessionUser | null | undefined>(undefined);
  const [auth, setAuth] = useState<"idle" | "ask" | "waiting" | "retry">("idle");
  const after = useRef<(() => void) | undefined>(undefined);
  // The sign-in attempt in flight: the popup it opened and its nonce.
  const flow = useRef<SignInFlow>({ popup: null, nonce: null });
  const headers = useMemo(() => widgetTokenHeaders(token), [token]);

  const storeToken = useCallback((next: string | null) => {
    setWidgetToken(next);
    setToken(next);
  }, []);

  // Drops the attempt in flight, so a popup that finishes later is ignored.
  const cancelSignIn = useCallback(() => {
    const p = flow.current.popup;
    flow.current = { popup: null, nonce: null };
    after.current = undefined;
    if (p && !p.closed) p.close();
    setAuth("idle");
  }, []);

  useEffect(() => {
    setEmbedded(window.parent !== window);
    setToken(getWidgetToken());
    toParent({ type: MSG.ready });
    if (search.accent) {
      document.documentElement.style.setProperty("--link", search.accent);
      document.documentElement.style.setProperty("--ring", search.accent);
    }
  }, [search.accent]);

  useEffect(() => {
    let off = false;
    widgetUser({ headers }).then(
      (u) => {
        if (off) return;
        // An expired or revoked token is dead weight.
        if (!u && token) storeToken(null);
        setMe(u);
      },
      () => !off && setMe(null),
    );
    return () => {
      off = true;
    };
  }, [token, headers, storeToken]);

  // The popup hands over a widget token with a same-origin postMessage. Only
  // the popup this panel opened, for the attempt still in flight, counts.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const next = sessionFromMessage(e, flow.current, window.location.origin);
      if (next) {
        flow.current = { popup: null, nonce: null };
        // Each sign-in rotates the token; the one it replaces is revoked.
        const old = tokenRef.current;
        if (old && old !== next) void disconnectWidget({ headers: widgetTokenHeaders(old) }).catch(() => {});
        storeToken(next);
        setAuth("idle");
        const then = after.current;
        after.current = undefined;
        if (then) setTimeout(then, 0);
        return;
      }
      if (e.source === window.parent && e.data?.type === MSG.open) {
        if (tabs.includes(e.data.tab)) {
          setTab(e.data.tab);
          setView({ kind: "list" });
        }
        if (e.data.fresh) setOpened((n) => n + 1);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [tabs, storeToken]);

  // Noticing a closed popup is the only way to know sign-in was abandoned.
  useEffect(() => {
    if (auth !== "waiting") return;
    const t = setInterval(() => {
      if (flow.current.popup?.closed) {
        flow.current = { popup: null, nonce: null };
        setAuth("retry");
      }
    }, 500);
    return () => clearInterval(t);
  }, [auth]);

  const openPopup = useCallback(() => {
    const w = 440;
    const h = 620;
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
    const nonce = newNonce();
    const p = window.open(`/widget/connect?nonce=${nonce}`, "openheard-sign-in", `popup,width=${w},height=${h},left=${left},top=${top}`);
    flow.current = { popup: p, nonce: p ? nonce : null };
    setAuth(p ? "waiting" : "retry");
  }, []);

  const changelog = useLoad(() => listChangelog({ headers }).then((all) => all.filter((e) => e.publishedAt)), [me?.id]);
  const latest = changelog.data?.[0]?.publishedAt ? new Date(changelog.data[0].publishedAt).getTime() : 0;
  // "New" marks stay put for this visit; the loader clears its badge now.
  // Never opened before: only the last 30 days count as new, as on the launcher.
  const [seenAt] = useState(() => search.seen ?? Date.now() - 30 * 86_400_000);
  const unseen = latest > seenAt && tab !== "changelog";

  useEffect(() => {
    if (tab === "changelog" && changelog.data) toParent({ type: MSG.seen, at: latest || Date.now() });
  }, [tab, changelog.data, latest]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [tab, view]);

  const ctx: WidgetCtx = {
    me: me ?? null,
    headers,
    requireSignIn: (then) => {
      if (me) return then?.();
      after.current = then;
      setAuth("ask");
    },
    signOut: () => {
      if (token) void disconnectWidget({ headers }).catch(() => {});
      storeToken(null);
    },
    openPost: (id) => {
      setTab("feedback");
      setView({ kind: "post", id });
    },
    compose: () => {
      setTab("feedback");
      setView({ kind: "new" });
    },
    sent: (post) => {
      setTab("feedback");
      setView({ kind: "sent", post });
    },
    back: () => setView({ kind: "list" }),
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (auth !== "idle") cancelSignIn();
      else if (tab === "feedback" && view.kind !== "list") setView({ kind: "list" });
      else toParent({ type: MSG.close });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auth, tab, view, cancelSignIn]);

  const viewKey = tab === "feedback" ? `feedback:${view.kind}:${view.kind === "post" ? view.id : ""}` : tab;
  const fade = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : VIEW;

  return (
    <WidgetContext.Provider value={ctx}>
      <motion.div
        animate={entrance}
        className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground"
      >
        <header className="flex h-14 shrink-0 items-center gap-2.5 pr-3 pl-4">
          {ws.logoUrl ? (
            <img src={ws.logoUrl} alt="" className="size-[26px] rounded-lg border object-cover" />
          ) : (
            <span aria-hidden className="grid size-[26px] place-items-center rounded-lg border bg-card text-[13px] font-semibold lowercase">
              {ws.name.slice(0, 1)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{ws.name} feedback</span>
          <a href="/" target="_blank" rel="noopener" title="Open the full board" aria-label="Open the full board" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ArrowsOutSimpleIcon className="size-4" />
          </a>
          {embedded ? (
            <button type="button" onClick={() => toParent({ type: MSG.close })} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <XIcon className="size-4" />
            </button>
          ) : null}
        </header>

        {tabs.length > 1 ? (
          <nav className="flex h-11 shrink-0 items-stretch border-b px-2 font-mono text-[13px]" aria-label="Sections">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  if (t === "feedback") setView({ kind: "list" });
                }}
                aria-current={tab === t ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-2 px-3 outline-none focus-visible:text-foreground",
                  tab === t ? "text-foreground" : "text-faint hover:text-muted-foreground",
                )}
              >
                {t}
                {t === "changelog" && unseen ? (
                  <>
                    <span aria-hidden className="size-1.5 rounded-full bg-link" />
                    <span className="sr-only">, new updates</span>
                  </>
                ) : null}
                {tab === t ? <motion.span layoutId="widget-tab" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} className="absolute inset-x-0 -bottom-px h-[1.5px] bg-foreground" /> : null}
              </button>
            ))}
          </nav>
        ) : (
          <div className="shrink-0 border-b" />
        )}

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={viewKey} {...fade} className="flex min-h-full flex-col">
              {tab === "feedback" ? (
                view.kind === "post" ? (
                  <PostDetail id={view.id} />
                ) : view.kind === "new" ? (
                  <Composer />
                ) : view.kind === "sent" ? (
                  <Sent post={view.post} />
                ) : (
                  <FeedbackList />
                )
              ) : tab === "roadmap" ? (
                <RoadmapTab />
              ) : (
                <ChangelogTab entries={changelog.data} error={changelog.error} retry={changelog.reload} seenAt={seenAt} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {ws.poweredBy || token ? (
          <footer className="relative flex h-11 shrink-0 items-center justify-center border-t px-4 font-mono text-xs text-faint">
            {ws.poweredBy ? (
              <a href="https://openheard.com" target="_blank" rel="noopener" className="transition-colors hover:text-muted-foreground">
                powered by <span className="text-foreground">openheard</span>
              </a>
            ) : null}
            {token && me ? (
              <button type="button" onClick={ctx.signOut} title={`Signed in as ${me.name}`} className="absolute right-4 transition-colors hover:text-foreground">
                sign out
              </button>
            ) : null}
          </footer>
        ) : null}

        <AnimatePresence>{auth !== "idle" ? <SignInSheet key="sign-in" state={auth} wsName={ws.name} onContinue={openPopup} onCancel={cancelSignIn} /> : null}</AnimatePresence>
      </motion.div>
    </WidgetContext.Provider>
  );
}

function SignInSheet({ state, wsName, onContinue, onCancel }: { state: "ask" | "waiting" | "retry"; wsName: string; onContinue: () => void; onCancel: () => void }) {
  // A modal sheet: focus moves in, Tab stays inside, and focus goes back to
  // whatever asked for sign-in once it closes.
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = () => [...(sheet.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    buttons()[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const all = buttons();
      const first = all[0];
      const last = all[all.length - 1];
      if (!first || !last) return;
      const inside = sheet.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: 24 }}
        animate={{ y: 0 }}
        exit={{ y: 24 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-sign-in"
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-4 rounded-t-xl border-t border-input bg-card px-5 pt-5 pb-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="widget-sign-in" className="text-[16px] font-semibold tracking-[-0.02em]">
            {state === "waiting" ? "Finish in the new window" : `Sign in to ${wsName}`}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {state === "waiting"
              ? "Sign in there and this panel picks it up on its own."
              : state === "retry"
                ? "Signed in already, or the window was blocked? Continue and it takes a second."
                : "Vote and post as yourself. Sign-in opens in a small window, so your password never touches this page."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button arrow full size="lg" variant={state === "waiting" ? "secondary" : "primary"} onClick={onContinue}>
            {state === "waiting" ? "Open the window again" : "Continue"}
          </Button>
        </div>
        <button type="button" onClick={onCancel} className="self-center text-xs text-faint hover:text-foreground">
          Not now
        </button>
      </motion.div>
    </motion.div>
  );
}
