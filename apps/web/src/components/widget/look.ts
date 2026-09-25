import { useEffect, useMemo, useState } from "react";

import { WIDGET_TABS, readWidgetSettings, widgetTabs, type WidgetRadius, type WidgetTabName } from "@/lib/widget-settings";

// What the loader on the host page may change about the panel: the resolved
// theme (it answers "auto" from the visitor's system), accent, corners and
// tabs. They come in the iframe URL, then as "openheard:config" messages when
// they change, which is how the settings preview updates without a reload.
export type WidgetLook = { theme?: "dark" | "light"; accent?: string; radius?: WidgetRadius; tabs?: string };

const HEX = /^#[0-9a-f]{3,8}$/i;
const RADIUS: Record<WidgetRadius, string> = { sharp: "0.25rem", soft: "0.5rem", round: "0.75rem" };

export function parseLook(s: Record<string, unknown>): WidgetLook {
  return {
    theme: s.theme === "light" || s.theme === "dark" ? s.theme : undefined,
    accent: typeof s.accent === "string" && HEX.test(s.accent) ? s.accent : undefined,
    radius: typeof s.radius === "string" && s.radius in RADIUS ? (s.radius as WidgetRadius) : undefined,
    tabs: typeof s.tabs === "string" && s.tabs ? s.tabs : undefined,
  };
}

type WorkspaceLike = Parameters<typeof widgetTabs>[0];

// Applies the look to the document and returns the tabs to show, in order.
export function useWidgetLook(ws: WorkspaceLike, initial: WidgetLook): WidgetTabName[] {
  const [look, setLook] = useState(initial);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== window.parent || e.data?.type !== "openheard:config" || !e.data.config) return;
      setLook(parseLook(e.data.config));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (look.theme) html.classList.toggle("dark", look.theme === "dark");
    for (const v of ["--link", "--ring"]) {
      if (look.accent) html.style.setProperty(v, look.accent);
    }
    html.style.setProperty("--radius", RADIUS[look.radius ?? "soft"]);
  }, [look.theme, look.accent, look.radius]);

  return useMemo(() => {
    // data-tabs on the host replaces the saved choice, but never brings back a
    // tab the workspace hides everywhere.
    const override = look.tabs?.split(",").filter((t): t is WidgetTabName => (WIDGET_TABS as readonly string[]).includes(t));
    const settings = readWidgetSettings(ws.widgetSettings);
    return widgetTabs(ws, override?.length ? { ...settings, tabs: WIDGET_TABS.filter((t) => override.includes(t)) } : settings);
  }, [ws, look.tabs]);
}
