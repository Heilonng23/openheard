// A visitor's light / dark / auto choice on a public board, kept in
// localStorage per workspace. With no choice saved the board follows the
// workspace's own theme. The inline head script applies the saved choice
// before first paint; the hook keeps React in step afterwards.
import { useSyncExternalStore } from "react";

import { contrast, parseColor } from "./brand-color";

export type ThemeChoice = "light" | "dark" | "auto";

const CHANGE = "openheard:theme";
const key = (workspaceId: string) => `openheard:theme:${workspaceId}`;

function read(workspaceId: string): ThemeChoice | null {
  try {
    const v = localStorage.getItem(key(workspaceId));
    return v === "light" || v === "dark" || v === "auto" ? v : null;
  } catch {
    return null;
  }
}

export function saveThemeChoice(workspaceId: string, choice: ThemeChoice) {
  try {
    localStorage.setItem(key(workspaceId), choice);
  } catch {
    // private mode: the choice lasts for this page only
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
}

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

// The saved choice (or the workspace default) and whether the page is dark.
// The server and the first client render use the workspace default, so
// hydration matches; the head script has already set the real class.
export function useVisitorTheme(workspaceId: string, fallback: "light" | "dark", enabled = true) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const choice = (enabled && read(workspaceId)) || fallback;
      return `${choice}:${choice === "auto" ? systemDark() : choice === "dark"}`;
    },
    () => `${fallback}:${fallback === "dark"}`,
  );
  const [choice, dark] = snapshot.split(":");
  return { choice: choice as ThemeChoice, dark: dark === "true" };
}

// Runs in <head> before the body paints. Kept tiny and self-contained.
export function themeScript(workspaceId: string, fallback: "light" | "dark") {
  return `(function(){try{var v=localStorage.getItem(${JSON.stringify(key(workspaceId))});var d=v==="dark"||(v==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches)||(v!=="light"&&v!=="auto"&&${fallback === "dark"});document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
}

const WHITE = { r: 255, g: 255, b: 255 };
const INK = { r: 0x0d, g: 0x0d, b: 0x0f };

// Text on a brand-coloured surface: white when it reads well, else near-black.
export function brandForeground(accent: string): string {
  const c = parseColor(accent);
  if (!c) return "#ffffff";
  return contrast(c, WHITE) >= 4.5 || contrast(c, WHITE) >= contrast(c, INK) ? "#ffffff" : "#0d0d0f";
}
