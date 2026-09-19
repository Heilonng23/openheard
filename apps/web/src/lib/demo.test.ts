import { describe, expect, it } from "vitest";

import { SETTINGS_NAV } from "./admin-nav";
import { DEMO_HIDDEN_SETTINGS, DEMO_WORKSPACE_ID, assertNotDemo, isDemo } from "./demo";
import { scopedId, seedUserId } from "./demo-seed";
import { isMarketingHost, workspaceSlugFromHost } from "./session";

describe("demo workspace", () => {
  it("only recognises the demo workspace", () => {
    expect(isDemo({ id: DEMO_WORKSPACE_ID })).toBe(true);
    expect(isDemo({ id: "acme" })).toBe(false);
    expect(isDemo(null)).toBe(false);
  });

  it("blocks locked actions on demo and allows them elsewhere", () => {
    expect(() => assertNotDemo({ id: DEMO_WORKSPACE_ID })).toThrow();
    expect(() => assertNotDemo({ id: "acme" })).not.toThrow();
  });

  it("hides only settings that exist in the nav", () => {
    const slugs = SETTINGS_NAV.flatMap((g) => g.items.map(([slug]) => slug as string));
    for (const hidden of DEMO_HIDDEN_SETTINGS) expect(slugs).toContain(hidden);
  });
});

describe("seed ids", () => {
  it("keeps default unprefixed and scopes every other workspace", () => {
    expect(scopedId("default", "features")).toBe("features");
    expect(scopedId(DEMO_WORKSPACE_ID, "features")).toBe("demo-features");
    expect(seedUserId(DEMO_WORKSPACE_ID, "sarah")).toBe("demo-user-sarah");
  });
});

describe("workspace resolution", () => {
  it("maps a subdomain to a workspace and everything else to default", () => {
    expect(workspaceSlugFromHost("demo.openheard.com", "openheard.com")).toBe(DEMO_WORKSPACE_ID);
    expect(workspaceSlugFromHost("openheard.com", "openheard.com")).toBe("default");
    expect(workspaceSlugFromHost("www.openheard.com", "openheard.com")).toBe("default");
    expect(workspaceSlugFromHost("feedback.acme.com", "openheard.com")).toBe("default");
  });

  it("treats the apex as marketing but never a workspace subdomain", () => {
    expect(isMarketingHost("openheard.com", "openheard.com")).toBe(true);
    expect(isMarketingHost("demo.openheard.com", "openheard.com")).toBe(false);
  });
});
