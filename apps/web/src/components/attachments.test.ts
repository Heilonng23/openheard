// @vitest-environment jsdom
// The composer's image drafts: what happens to an upload the user gave up on,
// and to drafts whose publish failed.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useImageDrafts } from "./attachments";

const png = (name = "a.png") => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });

let answer: (res: Response) => void;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (answer = r))));
});
afterEach(() => vi.unstubAllGlobals());

const failed = () => new Response(JSON.stringify({ error: "Upload failed. Try again." }), { status: 500 });
const stored = (id: string) => new Response(JSON.stringify({ attachment: { id, url: `/uploads/${id}`, contentType: "image/png", width: 1, height: 1 } }), { status: 201 });

describe("useImageDrafts", () => {
  it("says nothing when an upload the user already removed fails", async () => {
    const { result } = renderHook(() => useImageDrafts());
    act(() => result.current.add([png()]));
    const key = result.current.drafts[0]!.key;
    act(() => result.current.remove(key));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    await act(async () => answer(failed()));
    expect(result.current.error).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("still reports a failed upload that is in the composer", async () => {
    const { result } = renderHook(() => useImageDrafts());
    act(() => result.current.add([png()]));
    await act(async () => answer(failed()));
    await waitFor(() => expect(result.current.error).toBe("Upload failed. Try again."));
    expect(result.current.drafts).toEqual([]);
  });

  it("puts drafts back after a failed publish", async () => {
    const { result } = renderHook(() => useImageDrafts());
    act(() => result.current.add([png()]));
    await act(async () => answer(stored("img1")));
    await waitFor(() => expect(result.current.ids).toEqual(["img1"]));
    const saved = result.current.drafts;
    act(() => result.current.reset());
    expect(result.current.ids).toEqual([]);
    act(() => result.current.restore(saved));
    expect(result.current.ids).toEqual(["img1"]);
    // Restored drafts can still be removed like any other.
    act(() => result.current.remove(saved[0]!.key));
    expect(result.current.drafts).toEqual([]);
  });
});
