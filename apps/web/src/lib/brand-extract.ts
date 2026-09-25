// Reads a brand off a homepage: colours, logo, name, font, light or dark.
// Pure string work on HTML and CSS text, so it runs the same in the Worker
// and in tests against saved pages. Fetching lives in brand-match.ts.
import { type Rgb, isChromatic, isDark, parseColor, readableOnDark, rgbToHsl, toHex } from "./brand-color";

export type PageInfo = {
  url: string;
  siteName: string | null;
  themeColors: string[];
  colorScheme: string | null;
  darkClass: boolean;
  tileColor: string | null;
  inlineCss: string;
  stylesheets: string[];
  logoCandidates: string[];
  fontHints: string[];
};

export type BrandSuggestion = {
  name: string | null;
  // Readable on the dark UI; null when nothing reliable was found.
  accent: string | null;
  // The colour as the site uses it, before lightening for contrast.
  accentOriginal: string | null;
  colors: string[];
  theme: "light" | "dark" | null;
  font: string | null;
  logoCandidates: string[];
};

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const key = m[1].toLowerCase();
    if (!(key in out)) out[key] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const largest = (sizes: string | undefined) => Math.max(0, ...(sizes ?? "").split(/\s+/).map((s) => parseInt(s, 10) || 0));
const isRaster = (url: string) => !/\.(svg|ico)(\?|#|$)/i.test(url) && !url.startsWith("data:");

export function parsePage(html: string, url: string): PageInfo {
  // Scripts can hold anything that looks like a tag; drop them first.
  const doc = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const meta: Record<string, string[]> = {};
  const touch: { href: string; size: number }[] = [];
  const icons: { href: string; size: number }[] = [];
  const stylesheets: string[] = [];
  const logoImgs: string[] = [];
  const fontHints: string[] = [];
  let tileColor: string | null = null;
  let darkClass = false;

  for (const m of doc.matchAll(/<(meta|link|img|html|body)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    const a = attrs(m[2]);
    if (tag === "meta") {
      const key = (a.name ?? a.property ?? "").toLowerCase();
      if (key && a.content !== undefined && !(key === "theme-color" && /light/.test(a.media ?? ""))) (meta[key] ??= []).push(a.content.trim());
    } else if (tag === "link") {
      const rel = (a.rel ?? "").toLowerCase().split(/\s+/);
      const href = absolute(a.href, url);
      if (!href) continue;
      if (rel.includes("stylesheet")) stylesheets.push(href);
      else if (rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed")) touch.push({ href, size: largest(a.sizes) || 180 });
      else if (rel.includes("icon") && isRaster(href) && a.type !== "image/svg+xml") icons.push({ href, size: largest(a.sizes) });
      else if (rel.includes("mask-icon") && a.color) tileColor ??= a.color;
      if (rel.includes("preload") && a.as === "font") fontHints.push(fontFromFile(href));
      if (/fonts\.googleapis\.com/.test(href)) {
        const family = new URL(href).searchParams.get("family");
        if (family) fontHints.unshift(family.split(/[:|]/)[0].replace(/\+/g, " "));
      }
    } else if (tag === "img") {
      const src = absolute(a.src, url);
      const hay = `${a.src ?? ""} ${a.alt ?? ""} ${a.class ?? ""} ${a.id ?? ""}`.toLowerCase();
      if (src && isRaster(src) && hay.includes("logo")) logoImgs.push(src);
    } else {
      const hay = `${a.class ?? ""} ${a["data-theme"] ?? ""} ${a["data-color-mode"] ?? ""}`.toLowerCase();
      if (/\bdark\b/.test(hay)) darkClass = true;
    }
  }
  tileColor ??= meta["msapplication-tilecolor"]?.[0] ?? null;

  const inlineCss = [...doc.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const title = decode(doc.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const siteName = meta["og:site_name"]?.[0] || meta["application-name"]?.[0] || nameFromTitle(title, url);
  const og = absolute(meta["og:image"]?.[0], url);

  const bySize = (list: { href: string; size: number }[]) => list.sort((x, y) => y.size - x.size).map((i) => i.href);
  const logoCandidates = [...new Set([...bySize(touch), ...bySize(icons.filter((i) => i.size === 0 || i.size >= 64)), ...logoImgs, ...(og ? [og] : [])])];

  return {
    url,
    siteName: siteName ? siteName.slice(0, 60) : null,
    themeColors: meta["theme-color"] ?? [],
    colorScheme: meta["color-scheme"]?.[0] ?? null,
    darkClass,
    tileColor,
    inlineCss,
    stylesheets,
    logoCandidates,
    fontHints: fontHints.filter(Boolean),
  };
}

// "Linear – Plan and build" is Linear; "Agentic Infrastructure - Vercel" is
// Vercel. The piece that matches the domain wins, else the first.
function nameFromTitle(title: string, url: string): string | null {
  if (!title) return null;
  const parts = title
    .split(/\s+[|–—\-:·•]\s+/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(home|homepage|welcome|index)$/i.test(p));
  const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/g, "");
  const squash = (p: string) => p.toLowerCase().replace(/[^a-z0-9]/g, "");
  return parts.find((p) => squash(p) === host) ?? parts.find((p) => squash(p).startsWith(host)) ?? parts[0] ?? null;
}

// "InterVariable.woff2" -> Inter, "Sohne.cb178166.woff2" -> Sohne.
function fontFromFile(href: string): string {
  const file = decodeURIComponent(new URL(href).pathname.split("/").pop() ?? "");
  const base = file.split(".")[0].replace(/[-_](variable|var|regular|medium|bold|semibold|light|latin|normal|italic|wght|s|p)\b.*$/i, "").replace(/variable$/i, "");
  // Hashed file names carry no name worth showing.
  if (!/^[A-Za-z][A-Za-z -]{1,30}$/.test(base) || /^[a-f0-9]+$/i.test(base)) return "";
  return base.replace(/[-_]+/g, " ").trim();
}

const GENERIC = /^(inherit|initial|unset|sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica|helvetica neue|arial|apple color emoji|segoe ui emoji|noto sans|cursive)$/i;

// The first real family in a font-family list, with framework hashing
// ("__Inter_d65c78") taken off.
export function cleanFontFamily(value: string): string | null {
  for (const raw of value.split(",")) {
    const f = raw
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^__(.+?)_[a-f0-9]{5,8}$/i, "$1")
      .replace(/_/g, " ")
      .trim();
    if (!f || f.startsWith("var(") || GENERIC.test(f) || /fallback/i.test(f)) continue;
    const name = f.replace(/[-\s]?(var|variable)$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2");
    return name === name.toLowerCase() ? name.replace(/(^|[\s-])[a-z]/g, (c) => c.toUpperCase()) : name;
  }
  return null;
}

type Rule = { selector: string; decls: Record<string, string> };

function parseCss(css: string): { vars: Map<string, string>; rules: Rule[] } {
  const vars = new Map<string, string>();
  const rules: Rule[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const decls: Record<string, string> = {};
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      const prop = d.slice(0, i).trim();
      const value = d.slice(i + 1).trim();
      if (prop.startsWith("--")) {
        if (!vars.has(prop)) vars.set(prop, value);
      } else decls[prop.toLowerCase()] = value;
    }
    rules.push({ selector, decls });
  }
  return { vars, rules };
}

function resolveVars(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 6 || !value.includes("var(")) return value;
  return resolveVars(
    value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fallback) => vars.get(name) ?? fallback ?? ""),
    vars,
    depth + 1,
  );
}

const BAD_VAR = /(text|fg|foreground|border|shadow|muted|subtle|disabled|hover|focus|ring|gradient|success|error|danger|warning|info|critical|positive|negative|destructive|placeholder|overlay|contrast|inverse|on-)/;

function varWeight(name: string): number {
  const n = name.toLowerCase();
  if (BAD_VAR.test(n)) return 0;
  if (/brand/.test(n)) return 4;
  if (/primary/.test(n)) return 3;
  if (/accent/.test(n)) return 3;
  return 0;
}

const colorIn = (value: string): Rgb | null => {
  const direct = parseColor(value);
  if (direct) return direct;
  const m = value.match(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch)\([^)]*\)/i);
  return m ? parseColor(m[0]) : null;
};

const BODY = /(^|[\s,])(html|body|:root)(?=$|[\s,:.[{])/;
const BUTTON = /(button|\.btn\b|\.cta\b|primary)/i;

export function suggestBrand(page: PageInfo, css: string[] = []): BrandSuggestion {
  const { vars, rules } = parseCss([page.inlineCss, ...css].join("\n"));
  const candidates: { rgb: Rgb; score: number }[] = [];
  const add = (value: string | null | undefined, score: number) => {
    if (!value || score <= 0) return;
    const rgb = colorIn(resolveVars(value, vars));
    if (rgb && isChromatic(rgb)) candidates.push({ rgb, score });
  };

  for (const c of page.themeColors) add(c, 3);
  add(page.tileColor, 4);
  for (const [name, value] of vars) add(value, varWeight(name));

  let background: Rgb | null = null;
  let font: string | null = null;
  let headingFont: string | null = null;
  for (const { selector, decls } of rules) {
    if (selector.startsWith("@")) continue;
    const bg = decls["background-color"] ?? decls.background;
    if (BODY.test(selector)) {
      if (bg && !background) background = colorIn(resolveVars(bg, vars));
      if (decls["font-family"] && !font) font = cleanFontFamily(resolveVars(decls["font-family"], vars));
    } else if (/(^|[\s,])h[1-3](?=$|[\s,:.])/.test(selector) && decls["font-family"] && !headingFont) {
      headingFont = cleanFontFamily(resolveVars(decls["font-family"], vars));
    }
    if (BUTTON.test(selector) && !/:(hover|focus|active|disabled)/.test(selector)) add(bg, 2);
    if (/(^|[\s,])a(:link)?(?=$|[\s,])/.test(selector)) add(decls.color, 1);
  }

  // Group by hue so a brand's shades add up, then take the best one in the
  // strongest group. One weak hint is not enough to call it the brand.
  const groups = new Map<number, { score: number; best: { rgb: Rgb; score: number } }>();
  for (const c of candidates) {
    const key = Math.round(rgbToHsl(c.rgb).h / 30) % 12;
    const g = groups.get(key);
    const midness = (x: Rgb) => -Math.abs(rgbToHsl(x).l - 0.55);
    if (!g) groups.set(key, { score: c.score, best: c });
    else {
      g.score += c.score;
      if (c.score > g.best.score || (c.score === g.best.score && midness(c.rgb) > midness(g.best.rgb))) g.best = c;
    }
  }
  const ranked = [...groups.values()].sort((x, y) => y.score - x.score);
  const top = ranked[0] && ranked[0].score >= 2 ? ranked[0].best.rgb : null;
  const readable = top ? readableOnDark(top) : null;

  const themeHint = background ?? page.themeColors.map(parseColor).find((c): c is Rgb => !!c) ?? null;
  const theme: BrandSuggestion["theme"] = themeHint ? (isDark(themeHint) ? "dark" : "light") : page.darkClass || /^\s*dark\s*$/i.test(page.colorScheme ?? "") ? "dark" : null;

  return {
    name: page.siteName,
    accent: readable ? toHex(readable.color) : null,
    accentOriginal: top ? toHex(top) : null,
    colors: ranked.slice(0, 4).map((g) => toHex(g.best.rgb)),
    theme,
    font: font ?? headingFont ?? page.fontHints[0] ?? null,
    logoCandidates: page.logoCandidates,
  };
}
