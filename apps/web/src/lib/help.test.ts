import { describe, expect, it } from "vitest";

import { type Block, HELP_SLUG, escapeLike, networkOf, parseInline, parseMarkdown, safeHref, safeImage, searchTerms, slugify, summary, tableOfContents, uniqueSlug } from "./help";

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("How do I export my data?")).toBe("how-do-i-export-my-data");
  });

  it("folds accents and drops symbols at the edges", () => {
    expect(slugify("  Café & Crème — déjà vu!  ")).toBe("cafe-creme-deja-vu");
  });

  it("gives an empty slug for text with no letters or digits", () => {
    expect(slugify("¿¡!?")).toBe("");
  });

  it("cuts long titles on a word boundary", () => {
    const slug = slugify("Connect your workspace to Slack and get a message every time a post changes status", 40);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("connect-your-workspace-to-slack-and-get");
  });

  it("always produces something the slug rule accepts", () => {
    for (const t of ["Hello World", "A--B", "x", "100% uptime", "Ünïcödé"]) expect(HELP_SLUG.test(slugify(t))).toBe(true);
  });
});

describe("uniqueSlug", () => {
  it("keeps a free slug as is", () => {
    expect(uniqueSlug("Getting started", ["billing"])).toBe("getting-started");
  });

  it("numbers a taken slug from 2", () => {
    expect(uniqueSlug("Getting started", ["getting-started", "getting-started-2"])).toBe("getting-started-3");
  });

  it("falls back when the title has no usable characters", () => {
    expect(uniqueSlug("???", [])).toBe("article");
    expect(uniqueSlug("???", ["collection"], "collection")).toBe("collection-2");
  });

  it("stays within 80 characters when a long slug collides", () => {
    const title = "a".repeat(80);
    expect(uniqueSlug(title, [title])).toBe(`${"a".repeat(78)}-2`);
    const taken = [title];
    for (let i = 0; i < 10; i++) taken.push(uniqueSlug(title, taken));
    expect(taken.at(-1)).toBe(`${"a".repeat(77)}-11`);
    expect(taken.every((s) => s.length <= 80 && HELP_SLUG.test(s))).toBe(true);
  });
});

describe("networkOf", () => {
  it("keeps an IPv4 address whole", () => {
    expect(networkOf(" 203.0.113.7 ")).toBe("203.0.113.7");
  });

  it("folds every IPv6 address in a /64 together", () => {
    expect(networkOf("2001:db8:0:1:aaaa::1")).toBe("2001:db8:0:1::/64");
    expect(networkOf("2001:0DB8:0000:0001:ffff:ffff:ffff:ffff")).toBe("2001:db8:0:1::/64");
    expect(networkOf("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(networkOf("::1")).toBe("0:0:0:0::/64");
  });
});

describe("searchTerms", () => {
  it("drops stop words, short words and duplicates", () => {
    expect(searchTerms("How do I export my data to CSV and export again?")).toEqual(["export", "data", "csv", "again"]);
  });

  it("keeps a stop-word-only query searchable", () => {
    expect(searchTerms("how")).toEqual(["how"]);
  });

  it("returns nothing for punctuation", () => {
    expect(searchTerms("?!%")).toEqual([]);
  });

  it("strips accents so queries match either spelling", () => {
    expect(searchTerms("Résumé")).toEqual(["resume"]);
  });
});

describe("escapeLike", () => {
  it("escapes wildcards and the escape character", () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
  });
});

describe("summary", () => {
  it("strips markdown, skips headings and cuts on a word", () => {
    const s = summary("## Setup\n\nOpen **Settings**, then [API keys](/dashboard) and create one for your integration today.", 50);
    expect(s).toBe("Open Settings, then API keys and create one for…");
  });
});

describe("markdown", () => {
  it("parses headings with unique anchors and builds the table of contents", () => {
    const blocks = parseMarkdown("# Intro\ntext\n## Setup\n### Setup\n#### Deep");
    expect(blocks.map((b) => b.t)).toEqual(["h", "p", "h", "h", "h"]);
    expect(tableOfContents(blocks)).toEqual([
      { id: "intro", text: "Intro", level: 2 },
      { id: "setup", text: "Setup", level: 2 },
      { id: "setup-2", text: "Setup", level: 3 },
    ]);
  });

  it("parses lists, code and quotes", () => {
    const blocks = parseMarkdown("- one\n- two\n\n1. first\n2. second\n\n```sh\nbun install\n```\n\n> note\n\n---");
    expect(blocks).toEqual([
      { t: "ul", items: [[{ t: "text", v: "one" }], [{ t: "text", v: "two" }]] },
      { t: "ol", start: 1, items: [[{ t: "text", v: "first" }], [{ t: "text", v: "second" }]] },
      { t: "code", lang: "sh", v: "bun install" },
      { t: "quote", c: [{ t: "p", c: [{ t: "text", v: "note" }] }] },
      { t: "hr" },
    ]);
  });

  it("keeps quotes past eight levels as text instead of recursing", () => {
    // The longest body the editor accepts, all quote markers.
    const blocks = parseMarkdown("> ".repeat(24999) + "x");
    let depth = 0;
    let node: Block = blocks[0]!;
    while (node.t === "quote") {
      depth++;
      node = node.c[0]!;
    }
    expect(depth).toBe(8);
    expect(node.t).toBe("p");
  });

  it("parses inline marks", () => {
    expect(parseInline("a **b** _c_ `d` [e](https://x.test)")).toEqual([
      { t: "text", v: "a " },
      { t: "strong", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "code", v: "d" },
      { t: "text", v: " " },
      { t: "link", href: "https://x.test", c: [{ t: "text", v: "e" }] },
    ]);
  });

  it("leaves underscores inside words alone", () => {
    expect(parseInline("snake_case_name")).toEqual([{ t: "text", v: "snake_case_name" }]);
  });

  it("refuses script links and renders their text instead", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.test")).toBeNull();
    expect(parseInline("[click](javascript:alert(1))")[0]).toEqual({ t: "text", v: "click" });
    expect(safeHref("/help/billing")).toBe("/help/billing");
  });

  it("refuses paths a browser reads as another host", () => {
    expect(safeHref("/\\evil.test")).toBeNull();
    expect(safeHref("/\\/evil.test")).toBeNull();
    expect(parseInline("[docs](/\\evil.test)")[0]).toEqual({ t: "text", v: "docs" });
    expect(safeImage("/\\evil.test/x.png")).toBeNull();
    expect(safeImage("//evil.test/x.png")).toBeNull();
    expect(safeImage("/uploads/abc")).toBe("/uploads/abc");
  });
});
