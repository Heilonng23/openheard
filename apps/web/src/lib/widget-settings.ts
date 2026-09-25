import { z } from "zod";

// How the widget looks and which tabs it shows, saved per workspace in
// workspace.widget_settings. The loader reads them from /widget.json, so a
// change lands on every site without touching the snippet; data-* attributes
// on the script tag still win.

export const WIDGET_THEMES = ["dark", "light", "auto"] as const;
export const WIDGET_LAUNCHERS = ["icon", "label", "hidden"] as const;
export const WIDGET_ICONS = ["chat", "lightbulb", "megaphone", "question", "sparkle"] as const;
export const WIDGET_POSITIONS = ["bottom-right", "bottom-left"] as const;
export const WIDGET_RADII = ["sharp", "soft", "round"] as const;
export const WIDGET_TABS = ["feedback", "roadmap", "changelog"] as const;
export const WIDGET_LABEL_MAX = 24;
export const DEFAULT_ACCENT = "#6e8bff";

export type WidgetTheme = (typeof WIDGET_THEMES)[number];
export type WidgetLauncher = (typeof WIDGET_LAUNCHERS)[number];
export type WidgetIcon = (typeof WIDGET_ICONS)[number];
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];
export type WidgetRadius = (typeof WIDGET_RADII)[number];
export type WidgetTabName = (typeof WIDGET_TABS)[number];

export const widgetSettingsSchema = z.object({
  theme: z.enum(WIDGET_THEMES),
  // null follows the workspace brand accent.
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a hex colour like #6e8bff")
    .transform((s) => s.toLowerCase())
    .nullable(),
  launcher: z.enum(WIDGET_LAUNCHERS),
  label: z.string().trim().min(1, "The label needs some text").max(WIDGET_LABEL_MAX, `The label is at most ${WIDGET_LABEL_MAX} characters`),
  icon: z.enum(WIDGET_ICONS),
  position: z.enum(WIDGET_POSITIONS),
  radius: z.enum(WIDGET_RADII),
  // In display order; the first one opens by default.
  tabs: z
    .array(z.enum(WIDGET_TABS))
    .min(1, "Keep at least one tab on")
    .transform((t) => WIDGET_TABS.filter((name) => t.includes(name))),
});

export type WidgetSettings = z.output<typeof widgetSettingsSchema>;

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  theme: "dark",
  accent: null,
  launcher: "icon",
  label: "Feedback",
  icon: "chat",
  position: "bottom-right",
  radius: "soft",
  tabs: [...WIDGET_TABS],
};

// Whatever is stored, field by field: a bad or missing value falls back to
// its default instead of throwing away the rest.
export function readWidgetSettings(stored: unknown): WidgetSettings {
  const raw = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const shape = widgetSettingsSchema.shape;
  const out = { ...DEFAULT_WIDGET_SETTINGS } as Record<string, unknown>;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    if (!(key in raw)) continue;
    const parsed = shape[key].safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as WidgetSettings;
}

type WorkspaceLike = { accent: string | null; showRoadmap: boolean; showChangelog: boolean; widgetSettings?: unknown };

// The tabs a visitor actually gets: the widget's own choice, minus what the
// workspace hides everywhere. Never empty.
export function widgetTabs(ws: WorkspaceLike, settings = readWidgetSettings(ws.widgetSettings)): WidgetTabName[] {
  const tabs = settings.tabs.filter((t) => (t === "roadmap" ? ws.showRoadmap : t === "changelog" ? ws.showChangelog : true));
  return tabs.length ? tabs : ["feedback"];
}

// The public body of /widget.json. Everything here is safe for any origin.
export function widgetMeta(ws: WorkspaceLike & { name: string }, latestChangelogAt: number | null) {
  const s = readWidgetSettings(ws.widgetSettings);
  const tabs = widgetTabs(ws, s);
  return {
    name: ws.name,
    accent: s.accent ?? ws.accent ?? DEFAULT_ACCENT,
    theme: s.theme,
    launcher: s.launcher,
    label: s.label,
    icon: s.icon,
    position: s.position,
    radius: s.radius,
    tabs,
    changelog: tabs.includes("changelog"),
    latestChangelogAt: tabs.includes("changelog") ? latestChangelogAt : null,
  };
}
