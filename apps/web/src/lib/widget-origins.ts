// Which sites may frame the widget. Stored on the workspace as a
// space-separated list of origins; null means any site, so the widget works
// out of the box. The list becomes the /widget page's frame-ancestors.

const ORIGIN = /^https?:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;
export const MAX_EMBED_ORIGINS = 20;

// Accepts one origin per line (or separated by spaces or commas), as someone
// would paste them: `https://app.example.com/`, `https://*.example.com`,
// `http://localhost:3000`. Paths are not origins and are refused.
export function parseEmbedOrigins(input: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    if (!raw) continue;
    const o = raw.toLowerCase().replace(/\/+$/, "");
    if (ORIGIN.test(o)) {
      if (!origins.includes(o)) origins.push(o);
    } else invalid.push(raw);
  }
  return { origins, invalid };
}

// The CSP for /widget. `'self'` keeps the preview in Settings working.
export function frameAncestors(stored: string | null | undefined): string {
  const { origins } = parseEmbedOrigins(stored ?? "");
  if (!origins.length) return "frame-ancestors *";
  return `frame-ancestors 'self' ${origins.slice(0, MAX_EMBED_ORIGINS).join(" ")}`;
}
