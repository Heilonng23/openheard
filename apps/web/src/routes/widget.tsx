import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import { ArrowSquareOutIcon, XIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/bits";
import { WidgetContext, useLoad, type FeedbackView, type WidgetCtx, type WidgetTab } from "@/components/widget/context";
import { Composer, FeedbackList, PostDetail } from "@/components/widget/feedback";
import { ChangelogTab, RoadmapTab } from "@/components/widget/tabs";
import { listChangelog } from "@/functions/changelog";
import { getUser } from "@/functions/get-user";
import type { SessionUser } from "@/lib/session";
import { MSG, getWidgetToken, setWidgetToken } from "@/lib/widget-auth";

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

function toParent(msg: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.parent !== window) window.parent.postMessage(msg, "*");
}

function Widget() {
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const ws = root.workspace;
  const tabs = useMemo(() => TABS.filter((t) => (t === "roadmap" ? ws.showRoadmap : t === "changelog" ? ws.showChangelog : true)), [ws.showRoadmap, ws.showChangelog]);
  const [tab, setTab] = useState<WidgetTab>(search.tab && tabs.includes(search.tab) ? search.tab : "feedback");
  const [view, setView] = useState<FeedbackView>({ kind: "list" });
  const [embedded, setEmbedded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Session: a bearer token from the sign-in popup, or a first-party cookie
  // when the host shares our site. `undefined` means not known yet.
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<SessionUser | null | undefined>(undefined);
  const [auth, setAuth] = useState<"idle" | "ask" | "waiting" | "retry">("idle");
  const after = useRef<(() => void) | undefined>(undefined);
  const popup = useRef<Window | null>(null);
  const headers = useMemo(() => (token ? { authorization: `Bearer ${token}` } : undefined), [token]);

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
    getUser({ headers }).then(
      (u) => {
        if (off) return;
        // A token the server no longer accepts is dead weight.
        if (!u && token) {
          setWidgetToken(null);
          setToken(null);
        }
        setMe(u);
      },
      () => !off && setMe(null),
    );
    return () => {
      off = true;
    };
  }, [token, headers]);

  // The popup hands over the session with a same-origin postMessage.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin === window.location.origin && e.data?.type === MSG.session && typeof e.data.token === "string") {
        setWidgetToken(e.data.token);
        setToken(e.data.token);
        setAuth("idle");
        popup.current = null;
        const then = after.current;
        after.current = undefined;
        if (then) setTimeout(then, 0);
        return;
      }
      if (e.source === window.parent && e.data?.type === MSG.open && tabs.includes(e.data.tab)) {
        setTab(e.data.tab);
        setView({ kind: "list" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [tabs]);

  // Noticing a closed popup is the only way to know sign-in was abandoned.
  useEffect(() => {
    if (auth !== "waiting") return;
    const t = setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
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
    popup.current = window.open("/widget/connect", "openheard-sign-in", `popup,width=${w},height=${h},left=${left},top=${top}`);
    setAuth(popup.current ? "waiting" : "retry");
  }, []);

  const changelog = useLoad(() => listChangelog({ headers }).then((all) => all.filter((e) => e.publishedAt)), [me?.id]);
  const latest = changelog.data?.[0]?.publishedAt ? new Date(changelog.data[0].publishedAt).getTime() : 0;
  // "New" marks stay put for this visit; the loader clears its badge now.
  const [seenAt] = useState(() => search.seen ?? 0);
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
      setWidgetToken(null);
      setToken(null);
    },
    openPost: (id) => {
      setTab("feedback");
      setView({ kind: "post", id });
    },
    compose: () => {
      setTab("feedback");
      setView({ kind: "new" });
    },
    back: () => setView({ kind: "list" }),
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (auth !== "idle") setAuth("idle");
      else if (tab === "feedback" && view.kind !== "list") setView({ kind: "list" });
      else toParent({ type: MSG.close });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auth, tab, view]);

  return (
    <WidgetContext.Provider value={ctx}>
      <div className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-[52px] shrink-0 items-center gap-2.5 pr-2.5 pl-4">
          <Avatar name={ws.name} image={ws.logoUrl} size={22} className="rounded-md" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em]">{ws.name}</span>
          <a href="/" target="_blank" rel="noopener" title="Open the board" className="inline-flex size-8 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent hover:text-foreground">
            <ArrowSquareOutIcon className="size-[15px]" />
          </a>
          {embedded ? (
            <button type="button" onClick={() => toParent({ type: MSG.close })} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent hover:text-foreground">
              <XIcon className="size-[15px]" />
            </button>
          ) : null}
        </header>

        {tabs.length > 1 ? (
          <nav className="flex h-10 shrink-0 items-center gap-5 border-b px-4 font-mono text-[12px]" aria-label="Sections">
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
                  "relative inline-flex h-full items-center gap-1.5 outline-none focus-visible:text-foreground",
                  tab === t ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === t ? <span className="size-[5px] rounded-full bg-link" /> : null}
                {t}
                {t === "changelog" && unseen ? <span className="size-1.5 rounded-full bg-link" aria-label="new updates" /> : null}
              </button>
            ))}
          </nav>
        ) : (
          <div className="shrink-0 border-b" />
        )}

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          {tab === "feedback" ? (
            view.kind === "post" ? (
              <PostDetail id={view.id} />
            ) : view.kind === "new" ? (
              <Composer />
            ) : (
              <FeedbackList />
            )
          ) : tab === "roadmap" ? (
            <RoadmapTab />
          ) : (
            <ChangelogTab entries={changelog.data} error={changelog.error} retry={changelog.reload} seenAt={seenAt} />
          )}
        </div>

        <footer className="flex h-10 shrink-0 items-center justify-between gap-3 border-t px-4 text-xs text-faint">
          {ws.poweredBy ? (
            <a href="https://openheard.com" target="_blank" rel="noopener" className="hover:text-muted-foreground">
              powered by <span className="font-semibold">openheard</span>
            </a>
          ) : (
            <span />
          )}
          {me === undefined ? null : me ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{me.name}</span>
              {token ? (
                <button type="button" onClick={ctx.signOut} className="shrink-0 hover:text-foreground">
                  Sign out
                </button>
              ) : null}
            </span>
          ) : (
            <button type="button" onClick={() => ctx.requireSignIn()} className="hover:text-foreground">
              Sign in
            </button>
          )}
        </footer>

        {auth !== "idle" ? <SignInSheet state={auth} wsName={ws.name} onContinue={openPopup} onCancel={() => setAuth("idle")} /> : null}
      </div>
    </WidgetContext.Provider>
  );
}

function SignInSheet({ state, wsName, onContinue, onCancel }: { state: "ask" | "waiting" | "retry"; wsName: string; onContinue: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50 animate-in fade-in-0 duration-150 motion-reduce:animate-none" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-sign-in"
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-4 rounded-t-xl border-t border-input bg-card px-5 pt-5 pb-6 animate-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none"
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
      </div>
    </div>
  );
}
