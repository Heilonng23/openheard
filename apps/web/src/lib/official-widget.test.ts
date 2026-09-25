import { describe, expect, it } from "vitest";

import { officialWidgetSrc } from "./official-widget";
import { isMarketingHost } from "./session";

const BOARD = "https://feedback.openheard.com";
const src = (host: string, pathname: string, rootDomain: string | null = "openheard.com") =>
  officialWidgetSrc({ marketing: isMarketingHost(host, rootDomain), rootDomain, pathname }, BOARD);

describe("official feedback widget", () => {
  it("loads on the apex marketing pages", () => {
    expect(src("openheard.com", "/")).toBe("https://feedback.openheard.com/widget.js");
    expect(src("www.openheard.com", "/privacy")).toBe("https://feedback.openheard.com/widget.js");
    expect(src("openheard.com", "/terms")).toBe("https://feedback.openheard.com/widget.js");
  });

  it("never loads on workspace boards, the demo or the app", () => {
    expect(src("acme.openheard.com", "/")).toBeNull();
    expect(src("feedback.openheard.com", "/")).toBeNull();
    expect(src("demo.openheard.com", "/")).toBeNull();
    expect(src("acme.openheard.com", "/landing")).toBeNull();
    for (const path of ["/dashboard", "/widget", "/login", "/new", "/changelog"]) expect(src("openheard.com", path)).toBeNull();
  });

  it("never loads on a self-hosted install", () => {
    expect(src("feedback.acme.com", "/", null)).toBeNull();
    expect(src("localhost", "/landing", "localhost")).toBeNull();
    expect(src("acme.com", "/", "acme.com")).toBeNull();
  });
});
