import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { workspace } from "./feedback";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const HELP_STATUSES = ["draft", "published"] as const;
export type HelpStatus = (typeof HELP_STATUSES)[number];

// The help center: collections group articles, articles are markdown. Slugs
// are unique per workspace because they sit in public URLs (/help/<slug>).
export const helpCollection = sqliteTable(
  "help_collection",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // A name from a short fixed list of icons, picked in the dashboard.
    icon: text("icon"),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("help_collection_slug_uidx").on(t.workspaceId, t.slug)],
);

export const helpArticle = sqliteTable(
  "help_article",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    // Deleting a collection leaves its articles uncategorised, not gone.
    collectionId: integer("collection_id").references(() => helpCollection.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    // One line under the title and in search results. Optional.
    excerpt: text("excerpt"),
    body: text("body").notNull().default(""),
    status: text("status", { enum: HELP_STATUSES }).notNull().default("draft"),
    position: integer("position").notNull().default(0),
    helpfulCount: integer("helpful_count").notNull().default(0),
    unhelpfulCount: integer("unhelpful_count").notNull().default(0),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("help_article_slug_uidx").on(t.workspaceId, t.slug), index("help_article_ws_status_idx").on(t.workspaceId, t.status), index("help_article_collection_idx").on(t.collectionId)],
);

// One "was this helpful?" answer per reader per article. `voter` is
// "u:<user id>" when signed in, "a:<browser token>" otherwise.
export const helpArticleFeedback = sqliteTable(
  "help_article_feedback",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => helpArticle.id, { onDelete: "cascade" }),
    voter: text("voter").notNull(),
    helpful: integer("helpful", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.voter] })],
);

export const helpCollectionRelations = relations(helpCollection, ({ many }) => ({ articles: many(helpArticle) }));

export const helpArticleRelations = relations(helpArticle, ({ one }) => ({
  collection: one(helpCollection, { fields: [helpArticle.collectionId], references: [helpCollection.id] }),
  author: one(user, { fields: [helpArticle.authorId], references: [user.id] }),
}));
