import { afterEach, describe, expect, it, vi } from "vitest";

import { requestComposer, takeComposerRequest } from "./pending-action";

describe("requestComposer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the request for a board that mounts after it was made", () => {
    vi.stubGlobal("window", new EventTarget());
    requestComposer();
    expect(takeComposerRequest()).toBe(true);
    expect(takeComposerRequest()).toBe(false);
  });

  it("lets a board already listening take it from the event", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    let opened = 0;
    target.addEventListener("openheard:open-composer", () => {
      if (takeComposerRequest()) opened++;
    });
    requestComposer();
    expect(opened).toBe(1);
    expect(takeComposerRequest()).toBe(false);
  });
});
