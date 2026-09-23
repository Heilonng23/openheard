// The widget lives in an iframe on someone else's site, where browsers do not
// send our session cookie. After signing in through a first-party popup it
// keeps the signed session token here and sends it as a bearer header.
// Storage in a third-party iframe is partitioned per embedding site, so the
// token never leaks into the board itself.

const KEY = "oh_widget_session";

export function getWidgetToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setWidgetToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the widget falls back to cookies or anonymous use.
  }
}

// Spread into any server function call made from the widget.
export function widgetHeaders(): { headers?: Record<string, string> } {
  const token = getWidgetToken();
  return token ? { headers: { authorization: `Bearer ${token}` } } : {};
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
