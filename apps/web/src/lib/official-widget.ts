// openheard's own feedback board. The marketing site carries its widget so
// visitors can tell us what they want; nothing else ever loads it.
const VITE_ENV = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
export const OFFICIAL_FEEDBACK_BOARD = (VITE_ENV.VITE_OFFICIAL_FEEDBACK_BOARD || "https://feedback.openheard.com").replace(/\/$/, "");

const MARKETING_PATHS = ["/", "/landing", "/privacy", "/terms"];

// The loader URL for this page, or null. Only on the apex of a ROOT_DOMAIN
// that the official board lives under, so a self-hosted install (no
// ROOT_DOMAIN, or its own) never loads our widget.
export function officialWidgetSrc(opts: { marketing: boolean; rootDomain: string | null; pathname: string }, board = OFFICIAL_FEEDBACK_BOARD): string | null {
  if (!opts.marketing || !opts.rootDomain || !MARKETING_PATHS.includes(opts.pathname)) return null;
  let host: string;
  try {
    host = new URL(board).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.endsWith("." + opts.rootDomain.toLowerCase())) return null;
  return `${board}/widget.js`;
}
