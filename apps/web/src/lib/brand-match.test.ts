// Reading a brand off a website: the extractor against saved pages, the
// contrast rule for the accent, the guard that keeps the fetcher off private
// networks, and the fetch pipeline with the network swapped for a fake. No
// test touches the real network.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DARK_UI, MIN_CONTRAST, contrast, parseColor, readableOnDark } from "./brand-color";
import { cleanFontFamily, parsePage, suggestBrand } from "./brand-extract";
import { matchWebsite } from "./brand-match";
import { BlockedUrlError, checkUrl, isPrivateAddress, safeFetch } from "./safe-fetch";

const FIXTURES = new URL("./brand-fixtures/", import.meta.url).pathname;
const fixture = (name: string) => readFileSync(FIXTURES + name, "utf8");
const brandOf = (file: string, url: string, css: string[] = []) => suggestBrand(parsePage(fixture(file), url), css.map(fixture));

describe("brand extraction from saved pages", () => {
  it("dark product site with no brand colour in its HTML: name, dark, font, touch icon, default accent", () => {
    const b = brandOf("dark-saas.html", "https://northwind.example/");
    expect(b).toMatchObject({ name: "Northwind", theme: "dark", font: "Inter", accent: null });
    expect(b.logoCandidates[0]).toBe("https://northwind.example/static/apple-touch-icon.png?v=2");
    // A tag inside a script is not a tag on the page.
    expect(b.logoCandidates.some((l) => l.includes("evil"))).toBe(false);
  });

  it("design-token site: follows var() chains to the brand colour and lightens it for the dark UI", () => {
    const b = brandOf("payments.html", "https://paylane.example/gb", ["payments.css"]);
    expect(b.name).toBe("Paylane");
    expect(b.accentOriginal).toBe("#533afd");
    expect(b.accent).not.toBe("#533afd");
    expect(contrast(parseColor(b.accent!)!, DARK_UI)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(b.theme).toBe("light");
    expect(b.font).toBe("Sohne");
    // Largest raster icon first, SVG and ICO skipped, social image last.
    expect(b.logoCandidates[0]).toBe("https://images.paylane.example/favicon.png?w=180&h=180");
    expect(b.logoCandidates.at(-1)).toBe("https://cdn.paylane.example/media/paylane.jpg");
    expect(b.logoCandidates.some((l) => /\.(svg|ico)$/.test(l))).toBe(false);
  });

  it("component-library site: bare HSL variables, hashed font names, og:site_name", () => {
    const b = brandOf("shadcn-light.html", "https://www.greenleaf.example/");
    expect(b).toMatchObject({ name: "Greenleaf", theme: "light", font: "Manrope", accent: "#21c45d" });
    expect(b.logoCandidates).toEqual(["https://www.greenleaf.example/icon-192.png", "https://www.greenleaf.example/brand/greenleaf-logo.png"]);
  });

  it("CMS site: theme-color, Google Fonts, entities in the title, a generic first title segment", () => {
    const b = brandOf("bakery.html", "https://riseandshine.example/");
    expect(b).toMatchObject({ name: "Rise & Shine Bakery", accent: "#e4572e", theme: "light", font: "Playfair Display" });
    expect(b.logoCandidates[0]).toContain("cropped-icon-192x192.png");
    expect(b.logoCandidates).toContain("https://riseandshine.example/wp-content/uploads/2024/01/logo.png");
  });

  it("plain page with only greys: no accent, so the default stays", () => {
    const b = brandOf("plain.html", "https://hello.example/");
    expect(b).toMatchObject({ name: "Hello", accent: null, colors: [], theme: "light", font: "Georgia", logoCandidates: [] });
  });
});

describe("brand name", () => {
  const nameOf = (head: string, url = "https://acme.example/") => parsePage(`<html><head>${head}</head><body></body></html>`, url).siteName;

  it("prefers og:site_name, then application-name, then the logo's alt text", () => {
    expect(nameOf('<title>Acme | Ship faster</title><meta property="og:site_name" content="Acme Cloud"><meta name="application-name" content="AcmeApp">')).toBe("Acme Cloud");
    expect(nameOf('<title>Ship faster</title><meta name="application-name" content="AcmeApp">')).toBe("AcmeApp");
    expect(nameOf('<title>Business Ideas That Already Make Money</title></head><body><img class="site-logo" src="/l.png" alt="Starter Story logo">')).toBe("Starter Story");
  });

  it("does not take a tagline title as the name", () => {
    expect(nameOf("<title>Business Ideas That Already Make Money</title>", "https://www.starterstory.example/")).toBe("Starterstory");
    expect(nameOf("<title>Business Ideas That Already Make Money</title>", "https://business-ideas.example/")).toBe("Business Ideas");
    // A long og:site_name is a sentence too; the title's short part wins.
    expect(nameOf('<title>Relay — Business ideas that already make money</title><meta property="og:site_name" content="The best place to find business ideas that make money">')).toBe("Relay");
  });

  it("splits the title on common separators and keeps the short brand-like part", () => {
    expect(nameOf("<title>Plan and build products | Relay</title>")).toBe("Relay");
    expect(nameOf("<title>Acme - The system for product teams</title>")).toBe("Acme");
    expect(nameOf("<title>Home · Birch</title>")).toBe("Birch");
    expect(nameOf("<title>Tally: forms that feel like a doc</title>")).toBe("Tally");
    expect(nameOf("<title>Welcome to the best feedback tool on the internet today — Acme Labs</title>")).toBe("Acme Labs");
  });

  it("falls back to the bare domain and caps the length", () => {
    expect(nameOf("", "https://www.northwind.example/")).toBe("Northwind");
    expect(nameOf('<meta property="og:site_name" content="A Very Long Brand Name That Keeps Going">', "https://acme.example/")).toBe("Acme");
    expect(nameOf("", "https://a-really-long-hyphenated-domain-name-here.example/")!.length).toBeLessThanOrEqual(32);
  });
});

describe("colours", () => {
  it("parses the forms sites use", () => {
    expect(parseColor("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseColor("rgb(83 58 253)")).toEqual({ r: 83, g: 58, b: 253 });
    expect(parseColor("rgba(83, 58, 253, 0.2)")).toBeNull();
    expect(parseColor("transparent")).toBeNull();
    expect(parseColor("hsl(0 100% 50%)")).toMatchObject({ r: 255, g: 0, b: 0 });
    const ok = parseColor("oklch(62.8% 0.2577 29.23)")!;
    expect(ok.r).toBeGreaterThan(250);
    expect(ok.g).toBeLessThan(10);
  });

  it("keeps readable colours and lightens dark ones", () => {
    expect(readableOnDark(parseColor("#6e8bff")!).adjusted).toBe(false);
    const dark = readableOnDark(parseColor("#1a237e")!);
    expect(dark.adjusted).toBe(true);
    expect(contrast(dark.color, DARK_UI)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("cleans font families", () => {
    expect(cleanFontFamily("'__Inter_d65c78', '__Inter_Fallback_d65c78'")).toBe("Inter");
    expect(cleanFontFamily("GeistSans, sans-serif")).toBe("Geist Sans");
    expect(cleanFontFamily("-apple-system, BlinkMacSystemFont, sans-serif")).toBeNull();
  });
});

describe("SSRF guard", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/",
    "javascript:alert(1)",
    "http://localhost/",
    "http://app.localhost/",
    "http://printer.local/",
    "http://intranet/",
    "http://127.0.0.1/",
    "http://0x7f.0.0.1/",
    "http://2130706433/",
    "http://10.0.0.5/",
    "http://172.20.1.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[::127.0.0.1]/",
    "http://[::a9fe:a9fe]/",
    "http://[2002:7f00:1::]/",
    "http://user:pass@example.com/",
    "http://example.com:8080/",
  ])("blocks %s", (url) => {
    expect(() => checkUrl(url)).toThrow(BlockedUrlError);
  });

  it("allows public addresses and names", () => {
    expect(checkUrl("https://example.com/").host).toBe("example.com");
    expect(checkUrl("http://93.184.216.34/").host).toBeNull();
    expect(isPrivateAddress("2606:4700::6810:84e5")).toBe(false);
    expect(isPrivateAddress("64:ff9b::a00:1")).toBe(true);
    expect(isPrivateAddress("2002:5db8:d822::1")).toBe(false);
  });

  it("reads a page with a bad entity or a malformed font file name", () => {
    const html = `<html><head><title>Acme &#99999999; &#x110000;</title><link rel="preload" as="font" href="/f/Inter%zz.woff2"></head></html>`;
    expect(() => parsePage(html, "https://acme.test/")).not.toThrow();
  });

  const page = (body: string, init: ResponseInit = {}) => new Response(body, { headers: { "content-type": "text/html" }, ...init });
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
  const publicDns = async () => ["93.184.216.34"];

  it("blocks a name that resolves to a private address", async () => {
    await expect(safeFetch("https://evil.example/", { maxBytes: 100, timeoutMs: 1000, fetchImpl: async () => page("hi"), resolve: async () => ["10.0.0.1"] })).rejects.toThrow("private");
    await expect(safeFetch("https://evil.example/", { maxBytes: 100, timeoutMs: 1000, fetchImpl: async () => page("hi"), resolve: async () => ["93.184.216.34", "::1"] })).rejects.toThrow("private");
  });

  it("checks every redirect hop and follows at most three", async () => {
    const seen: string[] = [];
    const toMetadata = async (url: string | URL | Request) => {
      seen.push(String(url));
      return seen.length === 1 ? redirect("http://169.254.169.254/latest") : page("secret");
    };
    await expect(safeFetch("https://ok.example/", { maxBytes: 100, timeoutMs: 1000, fetchImpl: toMetadata as typeof fetch, resolve: publicDns })).rejects.toThrow("private");
    expect(seen).toEqual(["https://ok.example/"]);

    let n = 0;
    const loop = (async () => redirect(`https://ok.example/${++n}`)) as typeof fetch;
    await expect(safeFetch("https://ok.example/", { maxBytes: 100, timeoutMs: 1000, fetchImpl: loop, resolve: publicDns })).rejects.toThrow("Too many redirects");
    expect(n).toBe(4);

    let m = 0;
    const three = (async () => (++m <= 3 ? redirect(`/hop${m}`) : page("done"))) as typeof fetch;
    const res = await safeFetch("https://ok.example/", { maxBytes: 100, timeoutMs: 1000, fetchImpl: three, resolve: publicDns });
    expect(res.url).toBe("https://ok.example/hop3");
  });

  it("caps the size: truncates pages, refuses oversized files", async () => {
    const big = (async () => page("x".repeat(5000))) as typeof fetch;
    const res = await safeFetch("https://ok.example/", { maxBytes: 1000, timeoutMs: 1000, truncate: true, fetchImpl: big, resolve: publicDns });
    expect(res.bytes.byteLength).toBe(1000);
    await expect(safeFetch("https://ok.example/", { maxBytes: 1000, timeoutMs: 1000, fetchImpl: big, resolve: publicDns })).rejects.toThrow("too large");
  });

  it("gives up on a slow server", async () => {
    const slow = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    await expect(safeFetch("https://ok.example/", { maxBytes: 100, timeoutMs: 50, fetchImpl: slow, resolve: publicDns })).rejects.toThrow();
  });
});

// A 64x64 PNG header is enough for the sniffer and the size check.
function png(width: number, height: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

describe("matchWebsite", () => {
  it("reads the page and its stylesheets, and previews the first usable logo", async () => {
    const files: Record<string, () => Response> = {
      "https://paylane.example/gb": () => new Response(fixture("payments.html"), { headers: { "content-type": "text/html; charset=utf-8" } }),
      "https://cdn.paylane.example/css/5f8c822d.css": () => new Response(fixture("payments.css")),
      "https://paylane.example/css/bb75c7a5.css": () => new Response("", { status: 404 }),
      // The first icon is not an image at all; the second is.
      "https://images.paylane.example/favicon.png?w=180&h=180": () => new Response("<html>nope</html>"),
      "https://images.paylane.example/favicon.png?w=96&h=96": () => new Response(png(96, 96)),
    };
    const fetchImpl = (async (url: string | URL | Request) => (files[String(url)] ?? (() => new Response("", { status: 404 })))()) as typeof fetch;
    const m = await matchWebsite("paylane.example/gb", { fetchImpl, resolve: async () => ["93.184.216.34"] });
    expect(m).toMatchObject({ name: "Paylane", accentOriginal: "#533afd", theme: "light", url: "https://paylane.example/gb" });
    expect(m.logo?.src).toBe("https://images.paylane.example/favicon.png?w=96&h=96");
    expect(m.logo?.preview.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("refuses a private address before fetching anything", async () => {
    let called = false;
    const fetchImpl = (async () => ((called = true), new Response(""))) as typeof fetch;
    await expect(matchWebsite("http://192.168.0.1/", { fetchImpl, resolve: async () => [] })).rejects.toThrow(BlockedUrlError);
    expect(called).toBe(false);
  });
});
