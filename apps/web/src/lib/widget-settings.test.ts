// Widget appearance settings: what the server accepts, and what /widget.json
// hands the loader once they are stored on the workspace row.
import { createClient } from "@libsql/client";
import * as schema from "@openheard/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_SETTINGS, readWidgetSettings, widgetMeta, widgetSettingsSchema } from "./widget-settings";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;

async function freshDb() {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return drizzle(client, { schema });
}

const valid = { ...DEFAULT_WIDGET_SETTINGS, theme: "light", accent: "#3ECF8E", launcher: "label", label: "  Ideas  ", position: "bottom-left", tabs: ["changelog", "feedback"] };

describe("widget settings validation", () => {
  it("accepts a full set and normalises it", () => {
    const s = widgetSettingsSchema.parse(valid);
    expect(s.accent).toBe("#3ecf8e");
    expect(s.label).toBe("Ideas");
    // Tabs keep the widget's own order whatever order they arrive in.
    expect(s.tabs).toEqual(["feedback", "changelog"]);
  });

  it("rejects bad colours, enum values and long labels", () => {
    for (const bad of [
      { accent: "red" },
      { accent: "#12345" },
      { accent: "#1234567" },
      { theme: "sepia" },
      { launcher: "floating" },
      { icon: "rocket" },
      { position: "top-left" },
      { radius: "pill" },
      { label: "x".repeat(25) },
      { label: "   " },
      { tabs: [] },
      { tabs: ["help-desk"] },
    ]) {
      expect(widgetSettingsSchema.safeParse({ ...valid, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(widgetSettingsSchema.safeParse({ ...valid, label: "x".repeat(24) }).success).toBe(true);
    expect(widgetSettingsSchema.safeParse({ ...valid, accent: null }).success).toBe(true);
  });

  it("reads stored values field by field, falling back to defaults", () => {
    expect(readWidgetSettings(null)).toEqual(DEFAULT_WIDGET_SETTINGS);
    expect(readWidgetSettings({ theme: "auto", radius: "wobbly", tabs: [] })).toEqual({ ...DEFAULT_WIDGET_SETTINGS, theme: "auto" });
  });
});

describe("/widget.json payload", () => {
  it("serves the saved settings with the brand accent as the fallback", async () => {
    const db = await freshDb();
    await db.insert(schema.workspace).values({ id: "acme", name: "acme", accent: "#ff8fab" });
    const stored = widgetSettingsSchema.parse({ ...valid, accent: null, tabs: ["feedback", "roadmap"] });
    await db.update(schema.workspace).set({ widgetSettings: stored }).where(eq(schema.workspace.id, "acme"));
    const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, "acme"));

    expect(widgetMeta(ws!, 1_700_000_000_000)).toEqual({
      name: "acme",
      accent: "#ff8fab",
      theme: "light",
      launcher: "label",
      label: "Ideas",
      icon: "chat",
      position: "bottom-left",
      radius: "soft",
      tabs: ["feedback", "roadmap"],
      // Changelog is off in the widget, so no "new" badge either.
      changelog: false,
      latestChangelogAt: null,
    });
  });

  it("uses defaults for a workspace that never saved, minus tabs hidden everywhere", async () => {
    const db = await freshDb();
    await db.insert(schema.workspace).values({ id: "acme", name: "acme", showRoadmap: false });
    const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, "acme"));
    const meta = widgetMeta(ws!, 42);
    expect(meta).toMatchObject({ accent: "#6e8bff", theme: "dark", launcher: "icon", position: "bottom-right", tabs: ["feedback", "changelog"], changelog: true, latestChangelogAt: 42 });
  });

  it("never serves an empty tab list", () => {
    const meta = widgetMeta({ name: "acme", accent: null, showRoadmap: false, showChangelog: true, widgetSettings: { tabs: ["roadmap"] } }, null);
    expect(meta.tabs).toEqual(["feedback"]);
  });
});
