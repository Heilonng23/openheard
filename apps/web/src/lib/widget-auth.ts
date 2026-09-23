// The widget lives in an iframe on someone else's site, where browsers do not
// send our session cookie. After signing in through a first-party popup it
// holds a widget token (see widget-token.ts): short lived, good for this
// workspace's widget calls only, and never the session itself. It sits in
// sessionStorage, which is per tab and, in a third-party iframe, partitioned
// per embedding site, so it survives a reload but not closing the tab.

const KEY = "oh_widget_token";

// The header the widget sends its token in. Only widgetSessionMiddleware reads it.
export const WIDGET_TOKEN_HEADER = "x-openheard-widget";

export function getWidgetToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setWidgetToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the token lives in memory for this page view only.
  }
}

export function widgetTokenHeaders(token: string | null): Record<string, string> | undefined {
  return token ? { [WIDGET_TOKEN_HEADER]: token } : undefined;
}

// A fresh value per sign-in attempt. The popup echoes it back, so the panel
// can tell its own popup's answer from anything else that posts to it.
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type SignInFlow = { popup: Window | null; nonce: string | null };

// The token in a message, if it is the answer to the sign-in the panel is
// waiting for: same origin, sent by the popup it opened, carrying that
// attempt's nonce. A cancelled attempt has no nonce, so late answers drop.
export function sessionFromMessage(e: Pick<MessageEvent, "origin" | "source" | "data">, flow: SignInFlow, origin: string): string | null {
  if (e.origin !== origin) return null;
  if (!flow.popup || !flow.nonce || e.source !== flow.popup) return null;
  const d = e.data as { type?: unknown; token?: unknown; nonce?: unknown } | null;
  if (!d || d.type !== MSG.session || d.nonce !== flow.nonce || typeof d.token !== "string") return null;
  return d.token;
}

// Messages between the loader on the host page, the widget iframe and the
// sign-in popup. Everything is namespaced so other scripts can ignore it.
export const MSG = {
  session: "openheard:session",
  close: "openheard:close",
  open: "openheard:open",
  seen: "openheard:changelog-seen",
  ready: "openheard:ready",
  busy: "openheard:busy",
} as const;
