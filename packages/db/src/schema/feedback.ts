import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

// Every status has a "kind" that tells the app what it means, regardless of
// what the workspace calls it. Kinds are fixed; statuses are per workspace.
export const STATUS_KINDS = ["open", "review", "planned", "progress", "done", "closed"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];
// Legacy alias: post.status holds the status key, which for the default set
// equals the kind.
export const STATUSES = STATUS_KINDS;
export type Status = string;

export const DEFAULT_STATUSES: { key: string; label: string; color: string; kind: StatusKind; onRoadmap: boolean }[] = [
  { key: "open", label: "Pending", color: "#f2b53d", kind: "open", onRoadmap: false },
  { key: "review", label: "Under review", color: "#b08cff", kind: "review", onRoadmap: true },
  { key: "planned", label: "Planned", color: "#f2b53d", kind: "planned", onRoadmap: true },
  { key: "progress", label: "In progress", color: "#6e8bff", kind: "progress", onRoadmap: true },
  { key: "done", label: "Shipped", color: "#3ecf8e", kind: "done", onRoadmap: true },
  { key: "closed", label: "Closed", color: "#7a7a85", kind: "closed", onRoadmap: false },
];

// A workspace is one public board plus its team. The id doubles as the
// subdomain slug in the cloud version. Self-hosted installs use "default".
export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull().default("openheard"),
  tagline: text("tagline").notNull().default("Vote on what matters. We read every post and reply on the ones we ship."),
  theme: text("theme").notNull().default("dark"),
  poweredBy: integer("powered_by", { mode: "boolean" }).notNull().default(true),
  requireApproval: integer("require_approval", { mode: "boolean" }).notNull().default(false),
  // Branding. Accent is a hex; null means the openheard blue.
  accent: text("accent"),
  logoUrl: text("logo_url"),
  website: text("website"),
  heardAboutUs: text("heard_about_us"),
  // Access. Who may post, whether logged-out visitors can vote, which public
  // tabs exist.
  whoCanPost: text("who_can_post", { enum: ["anyone", "members"] }).notNull().default("anyone"),
  anonymousVoting: integer("anonymous_voting", { mode: "boolean" }).notNull().default(false),
  showRoadmap: integer("show_roadmap", { mode: "boolean" }).notNull().default(true),
  showChangelog: integer("show_changelog", { mode: "boolean" }).notNull().default(true),
  // App-side default: SQLite cannot ALTER TABLE ADD a column with a function default.
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`0`)
    .$defaultFn(() => new Date()),
});

export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

// Who belongs to which workspace, and as what. One account, many workspaces.
export const membership = sqliteTable(
  "membership",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull().default("member"),
    // Email preferences, per workspace. Sending lands with an email provider.
    notifyNewPost: integer("notify_new_post", { mode: "boolean" }).notNull().default(true),
    notifyComment: integer("notify_comment", { mode: "boolean" }).notNull().default(true),
    notifyStatus: integer("notify_status", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("membership_user_idx").on(t.userId)],
);

export const status = sqliteTable(
  "status",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull(),
    kind: text("kind", { enum: STATUS_KINDS }).notNull(),
    position: integer("position").notNull().default(0),
    onRoadmap: integer("on_roadmap", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.key] })],
);

export const board = sqliteTable("board", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .default("default")
    .references(() => workspace.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

export const tag = sqliteTable("tag", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .default("default")
    .references(() => workspace.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const post = sqliteTable(
  "post",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id")
      .notNull()
      .default("default")
      .references(() => workspace.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status").notNull().default("open"),
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
    index("post_workspace_idx").on(t.workspaceId),
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

export const anonymousVote = sqliteTable(
  "anonymous_vote",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    anonToken: text("anon_token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.anonToken] })],
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
    // Internal notes are written by the team and only shown in the dashboard.
    internal: integer("internal", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("comment_post_idx").on(t.postId)],
);

// Emoji reactions on comments. One row per user per emoji per comment.
export const commentReaction = sqliteTable(
  "comment_reaction",
  {
    commentId: integer("comment_id")
      .notNull()
      .references(() => comment.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId, t.emoji] })],
);

// Images on posts and comments. The file lives in object storage under `key`
// (workspace id, then this id); the row says who it belongs to. A fresh upload
// has neither post nor comment until the post or comment it was pasted into
// is published, and unclaimed rows are swept nightly.
export const attachment = sqliteTable(
  "attachment",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    postId: integer("post_id").references(() => post.id, { onDelete: "cascade" }),
    commentId: integer("comment_id").references(() => comment.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id").references(() => user.id, { onDelete: "set null" }),
    key: text("key").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [
    index("attachment_workspace_idx").on(t.workspaceId),
    index("attachment_post_idx").on(t.postId),
    index("attachment_comment_idx").on(t.commentId),
  ],
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
  workspaceId: text("workspace_id")
    .notNull()
    .default("default")
    .references(() => workspace.id, { onDelete: "cascade" }),
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

export const workspaceRelations = relations(workspace, ({ many }) => ({ members: many(membership), boards: many(board) }));

export const membershipRelations = relations(membership, ({ one }) => ({
  workspace: one(workspace, { fields: [membership.workspaceId], references: [workspace.id] }),
  user: one(user, { fields: [membership.userId], references: [user.id] }),
}));

// API keys for the HTTP API, MCP and CLI. Only the hash is stored; the plain
// key is shown once at creation.
export const apiKey = sqliteTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("api_key_workspace_idx").on(t.workspaceId)],
);

export const invite = sqliteTable(
  "invite",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ROLES }).notNull().default("member"),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("invite_workspace_idx").on(t.workspaceId), index("invite_token_idx").on(t.token)],
);

export const inviteRelations = relations(invite, ({ one }) => ({
  workspace: one(workspace, { fields: [invite.workspaceId], references: [workspace.id] }),
}));

export const boardRelations = relations(board, ({ one, many }) => ({ workspace: one(workspace, { fields: [board.workspaceId], references: [workspace.id] }), posts: many(post) }));

export const postRelations = relations(post, ({ one, many }) => ({
  board: one(board, { fields: [post.boardId], references: [board.id] }),
  author: one(user, { fields: [post.authorId], references: [user.id] }),
  tags: many(postTag),
  votes: many(vote),
  comments: many(comment),
  activity: many(activity),
  attachments: many(attachment),
}));

export const postTagRelations = relations(postTag, ({ one }) => ({
  post: one(post, { fields: [postTag.postId], references: [post.id] }),
  tag: one(tag, { fields: [postTag.tagId], references: [tag.id] }),
}));

export const voteRelations = relations(vote, ({ one }) => ({
  post: one(post, { fields: [vote.postId], references: [post.id] }),
  user: one(user, { fields: [vote.userId], references: [user.id] }),
}));

export const anonymousVoteRelations = relations(anonymousVote, ({ one }) => ({
  post: one(post, { fields: [anonymousVote.postId], references: [post.id] }),
}));

export const commentRelations = relations(comment, ({ one, many }) => ({
  post: one(post, { fields: [comment.postId], references: [post.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
  reactions: many(commentReaction),
  attachments: many(attachment),
}));

export const attachmentRelations = relations(attachment, ({ one }) => ({
  post: one(post, { fields: [attachment.postId], references: [post.id] }),
  comment: one(comment, { fields: [attachment.commentId], references: [comment.id] }),
}));

export const commentReactionRelations = relations(commentReaction, ({ one }) => ({
  comment: one(comment, { fields: [commentReaction.commentId], references: [comment.id] }),
  user: one(user, { fields: [commentReaction.userId], references: [user.id] }),
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
