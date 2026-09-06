// Small RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes.
// Enough for the exports feedback tools produce, without a dependency.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// Map a competitor's column names onto ours. First match wins.
const COLS = {
  title: ["title", "name", "post title", "post"],
  body: ["content", "details", "description", "body", "text"],
  votes: ["upvote count", "votes", "vote count", "score", "upvotes"],
  createdAt: ["date", "created", "created at", "createdat", "created_at"],
  authorName: ["author", "author name", "user", "name"],
  authorEmail: ["author email", "email", "user email"],
  tags: ["tags", "labels", "categories"],
  board: ["board name", "board", "category"],
  status: ["status", "state"],
  eta: ["eta", "estimated"],
};

export type ImportRow = {
  title: string;
  body: string;
  votes: number;
  createdAt?: string;
  authorName?: string;
  authorEmail?: string;
  tags: string[];
  board?: string;
  status?: string;
  eta?: string;
};

export function toImportRows(records: Record<string, string>[]): ImportRow[] {
  if (records.length === 0) return [];
  const keys = Object.keys(records[0]!);
  const pick = (names: string[]) => keys.find((k) => names.includes(k.toLowerCase()));
  const col = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, pick(names)])) as Record<keyof typeof COLS, string | undefined>;
  return records
    .map((r) => {
      const get = (k: keyof typeof COLS) => (col[k] ? r[col[k]!] ?? "" : "");
      const email = get("authorEmail");
      return {
        title: get("title"),
        body: get("body"),
        votes: Math.max(0, parseInt(get("votes") || "0", 10) || 0),
        createdAt: get("createdAt") || undefined,
        authorName: get("authorName") || undefined,
        authorEmail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : undefined,
        tags: get("tags")
          .split(/[,;|]/)
          .map((t) => t.trim())
          .filter(Boolean),
        board: get("board") || undefined,
        status: get("status") || undefined,
        eta: get("eta") || undefined,
      };
    })
    .filter((r) => r.title.length > 0);
}
