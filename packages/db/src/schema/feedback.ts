import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const STATUSES = ["open", "review", "planned", "progress", "done", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  open: "Open",
  review: "Under review",
  planned: "Planned",
  progress: "In progress",
  done: "Shipped",
  closed: "Closed",
};

// One install, one workspace. Multi-tenant is a later problem.
export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull().default("openheard"),
  tagline: text("tagline").notNull().default("Vote on what matters. We read every post and reply on the ones we ship."),
  theme: text("theme").notNull().default("dark"),
  poweredBy: integer("powered_by", { mode: "boolean" }).notNull().default(true),
  requireApproval: integer("require_approval", { mode: "boolean" }).notNull().default(false),
});

export const board = sqliteTable("board", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

export const tag = sqliteTable("tag", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const post = sqliteTable(
  "post",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status", { enum: STATUSES }).notNull().default("open"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    voteCount: integer("vote_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    mergedIntoId: integer("merged_into_id"),
    eta: text("eta"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
    statusChangedAt: integer("status_changed_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [
    index("post_board_idx").on(t.boardId),
    index("post_status_idx").on(t.status),
    index("post_votes_idx").on(t.voteCount),
  ],
);

export const postTag = sqliteTable(
  "post_tag",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] })],
);

export const vote = sqliteTable(
  "vote",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("vote_user_idx").on(t.userId)],
);

export const comment = sqliteTable(
  "comment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("comment_post_idx").on(t.postId)],
);

// Status changes, merges and pins. Rendered inline with comments as a timeline.
export const activity = sqliteTable(
  "activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type", { enum: ["status", "merge", "pin"] }).notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("activity_post_idx").on(t.postId)],
);

export const changelogEntry = sqliteTable("changelog_entry", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  version: text("version"),
  authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

export const changelogPost = sqliteTable(
  "changelog_post",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => changelogEntry.id, { onDelete: "cascade" }),
    postId: integer("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.postId] }), uniqueIndex("changelog_post_uidx").on(t.entryId, t.postId)],
);

export const boardRelations = relations(board, ({ many }) => ({ posts: many(post) }));

export const postRelations = relations(post, ({ one, many }) => ({
  board: one(board, { fields: [post.boardId], references: [board.id] }),
  author: one(user, { fields: [post.authorId], references: [user.id] }),
  tags: many(postTag),
  votes: many(vote),
  comments: many(comment),
  activity: many(activity),
}));

export const postTagRelations = relations(postTag, ({ one }) => ({
  post: one(post, { fields: [postTag.postId], references: [post.id] }),
  tag: one(tag, { fields: [postTag.tagId], references: [tag.id] }),
}));

export const voteRelations = relations(vote, ({ one }) => ({
  post: one(post, { fields: [vote.postId], references: [post.id] }),
  user: one(user, { fields: [vote.userId], references: [user.id] }),
}));

export const commentRelations = relations(comment, ({ one }) => ({
  post: one(post, { fields: [comment.postId], references: [post.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  post: one(post, { fields: [activity.postId], references: [post.id] }),
  actor: one(user, { fields: [activity.actorId], references: [user.id] }),
}));

export const changelogEntryRelations = relations(changelogEntry, ({ one, many }) => ({
  author: one(user, { fields: [changelogEntry.authorId], references: [user.id] }),
  posts: many(changelogPost),
}));

export const changelogPostRelations = relations(changelogPost, ({ one }) => ({
  entry: one(changelogEntry, { fields: [changelogPost.entryId], references: [changelogEntry.id] }),
  post: one(post, { fields: [changelogPost.postId], references: [post.id] }),
}));
