import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { workspace } from "./feedback";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const INTEGRATION_KINDS = ["slack", "discord", "webhook"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const INTEGRATION_EVENTS = ["post.created", "comment.created", "post.status_changed", "changelog.published"] as const;
export type IntegrationEvent = (typeof INTEGRATION_EVENTS)[number];

// One outbound destination per kind per workspace. The URL (and the signing
// secret for plain webhooks) is stored encrypted; `url_hint` is the last four
// characters, the only part the dashboard ever shows again.
export const integration = sqliteTable(
  "integration",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: text("kind").$type<IntegrationKind>().notNull(),
    urlEnc: text("url_enc").notNull(),
    urlHint: text("url_hint").notNull(),
    secretEnc: text("secret_enc"),
    // JSON arrays. A null board list means every board.
    events: text("events").notNull(),
    boardIds: text("board_ids"),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    lastStatus: text("last_status").$type<"ok" | "error">(),
    lastError: text("last_error"),
    lastAt: integer("last_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("integration_workspace_kind_idx").on(t.workspaceId, t.kind)],
);
