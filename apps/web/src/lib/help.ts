// Help center helpers that run on both sides: slugs, search terms, and a small
// markdown parser. Nothing here touches the database, so routes and
// components may import it freely.

export const HELP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Collection icons. Stored by name; components/help-icon.tsx maps each to a
// Phosphor glyph.
export const HELP_ICONS = ["book", "rocket", "card", "plug", "shield", "gear", "users", "chat", "lightbulb", "code"] as const;
export type HelpIcon = (typeof HELP_ICONS)[number];

// "How do I export my data?" -> "how-do-i-export-my-data". Accents fold to
// their base letter; anything else that is not a letter or digit becomes a
// dash. Empty input gives an empty slug, which callers must replace.
export function slugify(text: string, max = 80): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > max / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

// The first free slug: `base`, then `base-2`, `base-3`... The root is cut
// back to make room for the suffix, so the result never passes `max`.
export function uniqueSlug(base: string, taken: Iterable<string>, fallback = "article", max = 80): string {
  const root = slugify(base, max) || fallback;
  const used = new Set(taken);
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${root.slice(0, max - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

// Words too common to say anything about what an article covers.
const STOP_WORDS = new Set(
  "a am an and are as at be but by can could do does doing for from get has have how if in into is it its me my no not of off on or our out own so the then there this that to us we what when where which who why will with would you your".split(" "),
);

// Lowercased search words worth matching on: at least 2 characters, no stop
// words, no duplicates, at most `max`. A query made only of stop words falls
// back to its longest word so "how" still searches for something.
export function searchTerms(q: string, max = 6): string[] {
  const words = q.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  const useful = [...new Set(words.filter((w) => w.length >= 2 && !STOP_WORDS.has(w)))];
  if (useful.length) return useful.slice(0, max);
  const longest = words.sort((a, b) => b.length - a.length)[0];
  return longest ? [longest] : [];
}

// The part of an address one person controls: the whole IPv4 address, or
// the /64 prefix of an IPv6 one, since a single connection is usually handed
// a whole /64 and can pick any address inside it.
export function networkOf(ip: string): string {
  const addr = ip.trim().toLowerCase();
  if (!addr.includes(":")) return addr;
  const [head = "", tail] = addr.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

// LIKE treats % and _ as wildcards. Every query using this must say ESCAPE '\'.
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

// Plain text of a markdown body, for excerpts and meta descriptions.
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Headings are skipped: "Steps Open settings." reads worse than the prose.
export function summary(md: string, max = 160): string {
  const text = plainText(md.replace(/^\s{0,3}#{1,6}\s.*$/gm, ""));
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : max).replace(/[,.;:]$/, "") + "…";
}

// ---------------------------------------------------------------------------
// Markdown. Articles are written by the team, but they still render to React
// nodes rather than HTML, so nothing in a body can inject markup. Covers what
// help articles need: headings, paragraphs, lists, quotes, code, rules,
// images, links, bold, italic, inline code.

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "img"; src: string; alt: string };

export type Block =
  | { t: "h"; level: 2 | 3 | 4; id: string; text: string; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul" | "ol"; start?: number; items: Inline[][] }
  | { t: "quote"; c: Block[] }
  | { t: "code"; lang: string; v: string }
  | { t: "hr" };

export type TocItem = { id: string; text: string; level: 2 | 3 };

// Links may go to the web, to mail, or elsewhere on this site. Anything else
// (javascript:, data:) renders as plain text.
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return h;
  if (/^(\/(?!\/)|#)/.test(h)) return h;
  return null;
}

export function safeImage(src: string): string | null {
  const s = src.trim();
  return /^(https:|\/(?!\/))/i.test(s) ? s : null;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if (rest[0] === "\\" && /^\\[\\`*_[\]()!#>-]/.test(rest)) {
      text += rest[1];
      i += 2;
    } else if ((m = /^`([^`]+)`/.exec(rest))) {
      flush();
      out.push({ t: "code", v: m[1]! });
      i += m[0].length;
    } else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest))) {
      const src = safeImage(m[2]!);
      flush();
      if (src) out.push({ t: "img", src, alt: m[1]! });
      else out.push({ t: "text", v: m[1]! });
      i += m[0].length;
    } else if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest))) {
      const href = safeHref(m[2]!);
      flush();
      const c = parseInline(m[1]!);
      if (href) out.push({ t: "link", href, c });
      else out.push(...c);
      i += m[0].length;
    } else if ((m = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest))) {
      flush();
      out.push({ t: "strong", c: parseInline(m[2]!) });
      i += m[0].length;
    } else if ((m = /^(\*|_)(?=\S)([\s\S]*?\S)\1(?![*_\w])/.exec(rest)) && (rest[0] === "*" || !/\w/.test(src[i - 1] ?? ""))) {
      flush();
      out.push({ t: "em", c: parseInline(m[2]!) });
      i += m[0].length;
    } else if ((m = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/.exec(rest)) && !/\w/.test(src[i - 1] ?? "")) {
      flush();
      out.push({ t: "link", href: m[0], c: [{ t: "text", v: m[0] }] });
      i += m[0].length;
    } else {
      text += rest[0];
      i++;
    }
  }
  flush();
  return out;
}

export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : n.t === "img" ? n.alt : inlineText(n.c))).join("");
}

const LIST_ITEM = /^\s{0,3}([-*+]|(\d{1,9})[.)])\s+(.*)$/;

// Quotes nest by recursion. Past this depth the markers stay as literal text,
// so a body of thousands of ">" cannot run the parser out of stack.
const MAX_QUOTE_DEPTH = 8;

// Block structure first, inline second. `ids` is shared across nested quotes so
// heading anchors stay unique in the whole document.
export function parseMarkdown(src: string, ids: Map<string, number> = new Map(), depth = 0): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ").trim()) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;

    if (!line.trim()) {
      flushPara();
      continue;
    }
    if ((m = /^\s{0,3}(```|~~~)\s*([\w+-]*)\s*$/.exec(line))) {
      flushPara();
      const fence = m[1]!;
      const code: string[] = [];
      while (++i < lines.length && !lines[i]!.trimStart().startsWith(fence)) code.push(lines[i]!);
      blocks.push({ t: "code", lang: m[2] ?? "", v: code.join("\n") });
      continue;
    }
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      flushPara();
      const c = parseInline(m[2]!);
      const text = inlineText(c);
      // One h1 per page is the article title, so body headings start at h2.
      const level = Math.min(4, Math.max(2, m[1]!.length)) as 2 | 3 | 4;
      const base = slugify(text, 60) || "section";
      const n = ids.get(base) ?? 0;
      ids.set(base, n + 1);
      blocks.push({ t: "h", level, id: n ? `${base}-${n + 1}` : base, text, c });
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      blocks.push({ t: "hr" });
      continue;
    }
    if (depth < MAX_QUOTE_DEPTH && /^\s{0,3}>/.test(line)) {
      flushPara();
      const quoted: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i]!)) quoted.push(lines[i++]!.replace(/^\s{0,3}>\s?/, ""));
      i--;
      blocks.push({ t: "quote", c: parseMarkdown(quoted.join("\n"), ids, depth + 1) });
      continue;
    }
    if ((m = LIST_ITEM.exec(line)) && (!para.length || m[2] === undefined || m[2] === "1")) {
      flushPara();
      const ordered = m[2] !== undefined;
      const items: string[][] = [];
      while (i < lines.length) {
        const cur = lines[i]!;
        const item = LIST_ITEM.exec(cur);
        if (item && (item[2] !== undefined) === ordered) items.push([item[3]!]);
        else if (cur.trim() && /^\s{2,}/.test(cur) && items.length) items[items.length - 1]!.push(cur.trim());
        else break;
        i++;
      }
      i--;
      const parsed = items.map((it) => parseInline(it.join(" ")));
      blocks.push(ordered ? { t: "ol", start: Number(m[2]) || 1, items: parsed } : { t: "ul", items: parsed });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

// "On this page": h2 and h3 only, deeper headings are too fine to navigate by.
export function tableOfContents(blocks: Block[]): TocItem[] {
  return blocks.flatMap((b) => (b.t === "h" && b.level <= 3 ? [{ id: b.id, text: b.text, level: b.level as 2 | 3 }] : []));
}

// Minutes at a relaxed 220 words a minute, never less than one.
export function readingMinutes(md: string): number {
  const words = plainText(md).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
