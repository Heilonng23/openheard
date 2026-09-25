// @vitest-environment jsdom
// The loader script on a host page: a tab asked for before the frame is ready
// must not outlive the open that asked for it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

const SOURCE = readFileSync(join(__dirname, "widget-loader.js"), "utf8");
const ORIGIN = "https://feedback.example.test";

type Api = (cmd: string, arg?: string) => void;

function load() {
  const script = document.createElement("script");
  script.src = ORIGIN + "/widget.js";
  document.head.appendChild(script);
  let frame: HTMLIFrameElement | undefined;
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string, opts?: ElementCreationOptions) => {
    const el = create(tag, opts);
    if (tag === "iframe") frame = el as HTMLIFrameElement;
    return el;
  }) as typeof document.createElement);
  // jsdom gives no window to a frame inside a shadow root, so render in place.
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element) {
    return this as unknown as ShadowRoot;
  });
  new Function(SOURCE)();
  const api = (window as unknown as { openheard: Api }).openheard;
  return {
    api,
    ready() {
      if (!frame?.contentWindow) throw new Error("no frame");
      const sent = vi.spyOn(frame.contentWindow, "postMessage");
      window.dispatchEvent(new MessageEvent("message", { data: { type: "openheard:ready" }, origin: ORIGIN, source: frame.contentWindow }));
      return sent.mock.calls.map((c) => c[0] as { type: string; tab?: string; home?: boolean });
    },
    frameSrc: () => frame?.src ?? "",
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  delete (window as unknown as Record<string, unknown>).__openheardWidget;
  delete (window as unknown as Record<string, unknown>).openheard;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

it("drops a queued tab when the widget closes and reopens with none before the frame is ready", () => {
  const w = load();
  w.api("open", "changelog");
  expect(w.frameSrc()).toContain("tab=changelog");
  w.api("close");
  w.api("open");
  const opens = w.ready().filter((m) => m.type === "openheard:open");
  expect(opens).toHaveLength(1);
  expect(opens[0].tab).toBeUndefined();
  // The frame was first loaded for changelog, so it is told to go back to the first tab.
  expect(opens[0].home).toBe(true);
});

it("still opens on a tab asked for before the frame is ready", () => {
  const w = load();
  w.api("open", "roadmap");
  const opens = w.ready().filter((m) => m.type === "openheard:open");
  expect(opens).toHaveLength(1);
  expect(opens[0].tab).toBe("roadmap");
  expect(opens[0].home).toBe(false);
});
