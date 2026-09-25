import { describe, expect, it, vi } from "vitest";

import { rowKeyDown } from "./context";

function press(key: string, onRow: boolean) {
  const row = {};
  const open = vi.fn();
  const preventDefault = vi.fn();
  rowKeyDown(open)({ key, target: (onRow ? row : {}) as EventTarget, currentTarget: row as EventTarget, preventDefault });
  return { opened: open.mock.calls.length, prevented: preventDefault.mock.calls.length };
}

describe("rowKeyDown", () => {
  it("opens the row on Enter or Space", () => {
    expect(press("Enter", true)).toEqual({ opened: 1, prevented: 1 });
    expect(press(" ", true)).toEqual({ opened: 1, prevented: 1 });
    expect(press("a", true)).toEqual({ opened: 0, prevented: 0 });
  });

  it("leaves keys on the vote button inside the row alone", () => {
    expect(press("Enter", false)).toEqual({ opened: 0, prevented: 0 });
    expect(press(" ", false)).toEqual({ opened: 0, prevented: 0 });
  });
});
