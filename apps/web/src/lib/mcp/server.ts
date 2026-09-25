import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { STATUS_KINDS } from "@openheard/db/schema/feedback";
import { INTEGRATION_EVENTS } from "@openheard/db/schema/integrations";
import { z } from "zod";

import { type ApiContext, ApiError, apiOps } from "@/lib/api-auth";
import { mutateCreatePost, mutateDraftChangelog, mutatePublishChangelog, queryGetPost, queryListPosts } from "@/lib/api-actions";
import { HELP_ICONS } from "@/lib/help";
import { helpArticleBySlug, searchHelpArticles } from "@/lib/help-db";
import * as content from "@/lib/ops/content";
import { type OpCtx, OpError, needActor } from "@/lib/ops/context";
import { summarizeFeedback } from "@/lib/ops/insights";
import * as integrations from "@/lib/ops/integrations";
import * as posts from "@/lib/ops/posts";
import * as setup from "@/lib/ops/setup";
import * as ws from "@/lib/ops/workspace";
import { WIDGET_ICONS, WIDGET_LAUNCHERS, WIDGET_POSITIONS, WIDGET_RADII, WIDGET_TABS, WIDGET_THEMES, readWidgetSettings } from "@/lib/widget-settings";

import { PROMPTS } from "./prompts";
import { widgetSnippet } from "./snippet";

// The openheard MCP server: everything an admin does in the dashboard, as
// tools. Every write goes through lib/ops, the same code the dashboard runs.

type Ctx = OpCtx & { query: string; api: ApiContext };
type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

const WORKSPACE_ARG = z
  .string()
  .optional()
  .describe("Workspace slug to act on. Only account keys may name another workspace; leave empty for the key's own workspace. See list_workspaces.");
const CONFIRM_ARG = z.boolean().optional().describe("Must be true. Ask the user first; this cannot be undone.");

const ok = (data: unknown): Result => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
const fail = (message: string): Result => ({ content: [{ type: "text", text: message }], isError: true });

function errorText(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

const excerpt = (s: string, max = 160) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);

export function createMcpServer(api: ApiContext, requestOrigin: string) {
  const server = new McpServer(
    { name: "openheard", version: "0.2.0" },
    {
      instructions:
        "openheard is a feedback board with a roadmap, changelog, help center and an embeddable widget. " +
        "Start with get_workspace or summarize_feedback to see where things stand. Account keys can work across workspaces: call list_workspaces and pass `workspace` to other tools. " +
        "Destructive tools (delete_*, merge_posts, disconnect) need confirm: true; ask the user before setting it. Ids come from the list_* tools; boards, statuses and tags also accept their names.",
    },
  );

  const link = (ctx: Ctx, path: string) => `${ctx.origin}${path}${ctx.query}`;
  const postLink = (ctx: Ctx, id: number) => link(ctx, `/p/${id}`);

  function tool<S extends z.ZodRawShape>(
    name: string,
    meta: { title: string; description: string; annotations?: Annotations; destructive?: boolean; account?: boolean },
    input: S,
    run: (args: z.infer<z.ZodObject<S>>, ctx: Ctx) => Promise<unknown>,
  ) {
    const shape = {
      ...input,
      ...(meta.account ? {} : { workspace: WORKSPACE_ARG }),
      ...(meta.destructive ? { confirm: CONFIRM_ARG } : {}),
    };
    const annotations: Annotations = { openWorldHint: false, ...meta.annotations, ...(meta.destructive ? { destructiveHint: true, readOnlyHint: false } : {}) };
    server.registerTool(name, { title: meta.title, description: meta.description, inputSchema: shape, annotations }, (async (raw: Record<string, unknown>) => {
      try {
        if (meta.destructive && raw.confirm !== true) {
          return fail(`${name} cannot be undone. Confirm with the user, then call it again with confirm: true.`);
        }
        const target = await apiOps(api, requestOrigin, raw.workspace as string | undefined);
        const ctx: Ctx = { ...target, api };
        return ok(await run(raw as z.infer<z.ZodObject<S>>, ctx));
      } catch (err) {
        return fail(errorText(err));
      }
    }) as never);
  }

  const READ: Annotations = { readOnlyHint: true };
  const WRITE: Annotations = { readOnlyHint: false, destructiveHint: false };
  const IDEMPOTENT: Annotations = { ...WRITE, idempotentHint: true };

  // ------------------------------------------------------------------
  // Workspaces and account

  tool(
    "list_workspaces",
    {
      title: "List workspaces",
      description: "List the workspaces this key can act on, with your role and board URL. Use it first with an account key to pick the `workspace` argument for other tools.",
      annotations: READ,
      account: true,
    },
    {},
    async (_args, ctx) => {
      if (api.scope === "workspace") return { scope: "workspace", workspaces: [{ id: ctx.workspace.id, name: ctx.workspace.name, role: "admin", url: link(ctx, "/") }] };
      const rows = await ws.workspacesOf(api.db, api.userId!);
      return {
        scope: "account",
        default: api.workspaceId,
        workspaces: rows.map((r) => ({ id: r.id, name: r.name, role: r.role, website: r.website })),
      };
    },
  );

  tool(
    "create_workspace",
    {
      title: "Create workspace",
      description:
        "Create a new workspace (a feedback board with roadmap, changelog and help center) owned by you. Needs an account key. With `website`, the board starts in that site's colours and logo. Afterwards pass `workspace: <id>` to other tools to set it up.",
      annotations: WRITE,
      account: true,
    },
    {
      name: z.string().min(2).max(60).describe("Product or company name, shown on the board"),
      slug: z.string().max(32).optional().describe("URL slug, at least 5 characters (letters, numbers, dashes). Defaults to the name."),
      website: z.string().url().max(200).optional().describe("Product website, e.g. https://example.com; its colours and logo are applied"),
      who_can_post: z.enum(["anyone", "members"]).optional().describe("Who may post: anyone signed in (default) or only team members"),
    },
    async (args, ctx) => {
      if (api.scope !== "account") throw new OpError("Creating workspaces needs an account key. Create one in Settings > API keys > Account key.", 403);
      const owner = needActor(ctx, "Creating a workspace");
      const { id } = await ws.createWorkspace(api.db, owner, { name: args.name, slug: args.slug, website: args.website, whoCanPost: args.who_can_post });
      const next = await apiOps(api, requestOrigin, id);
      return {
        id,
        url: `${next.origin}/${next.query}`,
        dashboard: `${next.origin}/dashboard${next.query}`,
        accent: next.workspace.accent,
        theme: next.workspace.theme,
        logo: !!next.workspace.logoUrl,
        next: `Pass workspace: '${id}' to other tools. It has the default statuses and one board, 'Feature requests'.`,
      };
    },
  );

  tool(
    "get_workspace",
    {
      title: "Get workspace",
      description: "Read the workspace's settings: name, description, branding, public board tabs, who can post, approval and email settings, and its URLs.",
      annotations: READ,
    },
    {},
    async (_args, ctx) => {
      const w = ctx.workspace;
      return {
        id: w.id,
        name: w.name,
        description: w.tagline,
        website: w.website,
        branding: { theme: w.theme, accent: w.accent, logo: w.logoUrl ? link(ctx, w.logoUrl) : null },
        publicBoard: { showRoadmap: w.showRoadmap, showChangelog: w.showChangelog, poweredBy: w.poweredBy },
        access: { whoCanPost: w.whoCanPost, anonymousVoting: w.anonymousVoting, requireApproval: w.requireApproval },
        statusEmails: w.statusEmails,
        urls: { board: link(ctx, "/"), roadmap: link(ctx, "/roadmap"), changelog: link(ctx, "/changelog"), help: link(ctx, "/help"), dashboard: link(ctx, "/dashboard") },
      };
    },
  );

  tool(
    "update_workspace",
    {
      title: "Update workspace",
      description: "Change workspace settings. Only the fields you pass change. Use apply_branding for the logo.",
      annotations: IDEMPOTENT,
    },
    {
      name: z.string().min(1).max(60).optional().describe("Workspace name shown on the board"),
      description: z.string().max(200).optional().describe("One-line description under the name on the public board"),
      website: z.string().url().max(200).nullable().optional().describe("Product website"),
      theme: z.enum(["dark", "light"]).optional().describe("Public board theme"),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().describe("Brand accent as hex, e.g. #6e8bff; null for the default blue"),
      show_roadmap: z.boolean().optional().describe("Show the Roadmap tab on the public board"),
      show_changelog: z.boolean().optional().describe("Show the Changelog tab on the public board"),
      powered_by: z.boolean().optional().describe("Show the small 'powered by openheard' line"),
      who_can_post: z.enum(["anyone", "members"]).optional().describe("anyone: any signed-in visitor; members: only your team"),
      anonymous_voting: z.boolean().optional().describe("Let logged-out visitors vote"),
      require_approval: z.boolean().optional().describe("New posts wait in the review status until an admin approves them"),
      status_emails: z.boolean().optional().describe("Email voters, commenters and the author when a post changes status"),
    },
    async (a, ctx) =>
      ws.updateWorkspace(ctx, {
        name: a.name,
        tagline: a.description,
        website: a.website,
        theme: a.theme,
        accent: a.accent,
        showRoadmap: a.show_roadmap,
        showChangelog: a.show_changelog,
        poweredBy: a.powered_by,
        whoCanPost: a.who_can_post,
        anonymousVoting: a.anonymous_voting,
        requireApproval: a.require_approval,
        statusEmails: a.status_emails,
      }),
  );

  tool(
    "match_website",
    {
      title: "Match website branding",
      description: "Preview the brand of a website: name, accent colour, theme and logo. Changes nothing; follow with apply_branding to keep what you like.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    { url: z.string().min(3).max(200).describe("Website address, e.g. example.com or https://example.com") },
    async ({ url }, ctx) => {
      const m = await ws.matchBrand(ctx, url);
      return { url: m.url, name: m.name, accent: m.accent, accentOriginal: m.accentOriginal, theme: m.theme, colors: m.colors.slice(0, 6), logoSrc: m.logo?.src ?? null };
    },
  );

  tool(
    "apply_branding",
    {
      title: "Apply branding",
      description:
        "Apply a brand to the workspace. Either pass `website` to match and apply everything found in one step, or pass the fields you kept from match_website (logo_src copies the logo into openheard storage).",
      annotations: { ...WRITE, openWorldHint: true },
    },
    {
      website: z.string().max(200).optional().describe("Match this site and apply its name-free brand: accent, theme and logo"),
      name: z.string().max(60).optional().describe("Workspace name to set"),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Accent hex, e.g. #ff5a1f"),
      theme: z.enum(["dark", "light"]).optional().describe("Public board theme"),
      logo_src: z.string().url().optional().describe("Logo image URL, usually logoSrc from match_website"),
      remove_logo: z.boolean().optional().describe("Remove the current logo"),
    },
    async (a, ctx) => {
      let { accent, theme, logo_src } = a;
      let matched: string | null = null;
      if (a.website) {
        const m = await ws.matchBrand(ctx, a.website);
        matched = m.url;
        accent ??= m.accent ?? undefined;
        theme ??= m.theme ?? undefined;
        logo_src ??= m.logo?.src;
      }
      const result = await ws.applyBrand(ctx, { name: a.name, accent, theme, logoSrc: logo_src, removeLogo: a.remove_logo });
      return { matched, ...result, branding: { theme: ctx.workspace.theme, accent: ctx.workspace.accent, logo: ctx.workspace.logoUrl ? link(ctx, ctx.workspace.logoUrl) : null } };
    },
  );

  // ------------------------------------------------------------------
  // Posts

  const postRow = (ctx: Ctx, p: { id: number; title: string; body: string; status: string; voteCount: number; commentCount: number; boardId: string; pinned: boolean; tags: string[]; eta: string | null }, body: boolean) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    votes: p.voteCount,
    comments: p.commentCount,
    board: p.boardId,
    ...(p.pinned ? { pinned: true } : {}),
    ...(p.tags.length ? { tags: p.tags } : {}),
    ...(p.eta ? { eta: p.eta } : {}),
    ...(body ? { body: p.body } : { excerpt: excerpt(p.body, 140) }),
    url: postLink(ctx, p.id),
  });

  tool(
    "list_posts",
    {
      title: "List posts",
      description: "List feedback posts, newest, top voted or trending. Filter by status, board or search words. Merged posts are left out. Bodies are cut to an excerpt unless include_body is true.",
      annotations: READ,
    },
    {
      status: z.string().optional().describe("Status key or label, e.g. open, planned, 'In progress'"),
      board: z.string().optional().describe("Board id or name"),
      q: z.string().max(120).optional().describe("Search words in title and body"),
      sort: z.enum(["top", "new", "trending"]).default("trending").describe("top: most votes; new: newest; trending: votes weighted by age"),
      limit: z.number().int().min(1).max(100).default(30).describe("Max results"),
      offset: z.number().int().min(0).default(0).describe("Skip this many, for paging"),
      include_body: z.boolean().default(false).describe("Return full bodies instead of excerpts"),
    },
    async (a, ctx) => {
      const status = a.status ? (await posts.resolveStatus(ctx, a.status)).key : undefined;
      const board = a.board ? (await posts.resolveBoard(ctx, a.board)).id : undefined;
      const r = await queryListPosts(ctx.db, ctx.workspace.id, { status, board, q: a.q, sort: a.sort, limit: a.limit, offset: a.offset });
      return { total: r.total, offset: r.offset, posts: r.posts.map((p) => postRow(ctx, p, a.include_body)) };
    },
  );

  tool(
    "get_post",
    {
      title: "Get post",
      description: "Read one post in full: body, public comments, status history, images and similar posts that may be duplicates. Internal notes come from list_comments.",
      annotations: READ,
    },
    { id: z.number().int().describe("Post id") },
    async ({ id }, ctx) => {
      const p = await queryGetPost(ctx.db, ctx.workspace.id, id, ctx.origin).catch((err) => {
        if (err instanceof ApiError && err.status === 404) throw new OpError(`Post ${id} not found in workspace '${ctx.workspace.id}'`, 404);
        throw err;
      });
      const similar = await posts.similarPosts(ctx, p.title, { excludeId: id, limit: 3 });
      return {
        ...p,
        url: postLink(ctx, id),
        activity: p.activity.slice(0, 10),
        similar: similar.map((s) => ({ id: s.id, title: s.title, votes: s.voteCount, status: s.status })),
      };
    },
  );

  tool(
    "create_post",
    {
      title: "Create post",
      description: "Create a feedback post on a board, for example from a support email or a call note. Check find_duplicates first so votes are not split.",
      annotations: WRITE,
    },
    {
      title: z.string().min(4).max(140).describe("Post title, 4 to 140 characters"),
      board: z.string().describe("Board id or name (list_boards)"),
      body: z.string().max(5000).optional().describe("Details, markdown"),
      author_email: z.string().email().optional().describe("Credit an existing user by email"),
    },
    async (a, ctx) => {
      const b = await posts.resolveBoard(ctx, a.board);
      const { id } = await mutateCreatePost(ctx.db, ctx.workspace.id, { title: a.title, body: a.body, boardId: b.id, authorEmail: a.author_email }, ctx.origin);
      return { id, url: postLink(ctx, id) };
    },
  );

  tool(
    "update_post",
    {
      title: "Update post",
      description: "Edit a post: title, body, board, tags, ETA or pin. Only the fields you pass change. Use set_status for status.",
      annotations: IDEMPOTENT,
    },
    {
      id: z.number().int().describe("Post id"),
      title: z.string().min(4).max(140).optional().describe("New title"),
      body: z.string().max(5000).optional().describe("New body, markdown"),
      board: z.string().optional().describe("Move to this board (id or name)"),
      tags: z.array(z.string()).max(8).optional().describe("Replace the tags with these (names or ids); [] clears them"),
      create_missing_tags: z.boolean().default(false).describe("Create tags that do not exist yet instead of failing"),
      eta: z.string().max(40).nullable().optional().describe("Expected delivery shown on the roadmap, e.g. 'Q3' or 'March'; null clears it"),
      pinned: z.boolean().optional().describe("Pin to the top of the board"),
    },
    async (a, ctx) => {
      await posts.ownPost(ctx, a.id);
      if (a.title !== undefined || a.body !== undefined) await posts.setPostText(ctx, a.id, { title: a.title, body: a.body });
      if (a.board) await posts.setPostBoard(ctx, a.id, a.board);
      if (a.tags) {
        const ids = await posts.resolveTags(ctx, a.tags, a.create_missing_tags ? { create: async (n) => (await setup.saveTag(ctx, n)).id } : {});
        await posts.setPostTags(ctx, a.id, ids);
      }
      if (a.eta !== undefined) await posts.setPostEta(ctx, a.id, a.eta);
      if (a.pinned !== undefined) await posts.setPinned(ctx, a.id, a.pinned);
      const p = await queryGetPost(ctx.db, ctx.workspace.id, a.id, ctx.origin);
      return postRow(ctx, p, false);
    },
  );

  tool(
    "set_status",
    {
      title: "Set status",
      description:
        "Move a post to a status (e.g. planned, progress, done, closed). Voters, commenters and the author are emailed if status emails are on; an optional note goes in the email and the timeline. Setting the current status again does nothing.",
      annotations: IDEMPOTENT,
    },
    {
      post_id: z.number().int().describe("Post id"),
      status: z.string().describe("Status key or label (list_statuses)"),
      note: z.string().max(2000).optional().describe("Short note for followers, e.g. why it was declined"),
    },
    async (a, ctx) => ({ id: a.post_id, ...(await posts.setPostStatus(ctx, a.post_id, a.status, a.note)) }),
  );

  tool(
    "bulk_set_status",
    {
      title: "Set status on many posts",
      description: "Move several posts to one status at once, e.g. after triage. Each post is handled on its own; failures are listed without stopping the rest.",
      annotations: IDEMPOTENT,
    },
    {
      post_ids: z.array(z.number().int()).min(1).max(100).describe("Post ids"),
      status: z.string().describe("Status key or label"),
      note: z.string().max(2000).optional().describe("Note for followers of every post"),
    },
    async (a, ctx) => {
      await posts.resolveStatus(ctx, a.status);
      const results = [];
      for (const id of [...new Set(a.post_ids)]) {
        try {
          results.push({ id, ...(await posts.setPostStatus(ctx, id, a.status, a.note)) });
        } catch (err) {
          results.push({ id, error: errorText(err) });
        }
      }
      return { changed: results.filter((r) => "changed" in r && r.changed).length, results };
    },
  );

  tool(
    "merge_posts",
    {
      title: "Merge duplicate posts",
      description: "Merge a duplicate into the post that stays. Votes (one per person) and comments move over, the duplicate is closed and its URL points to the one that stays.",
      destructive: true,
    },
    {
      from: z.number().int().describe("The duplicate post id, which is closed"),
      into: z.number().int().describe("The post id that stays"),
    },
    async (a, ctx) => ({ ...(await posts.mergePosts(ctx, a.from, a.into)), url: postLink(ctx, a.into) }),
  );

  tool(
    "delete_post",
    {
      title: "Delete post",
      description: "Delete a post with its votes and comments, for spam or test posts. Prefer merge_posts for duplicates and the closed status for declined ideas.",
      destructive: true,
    },
    { id: z.number().int().describe("Post id") },
    async ({ id }, ctx) => posts.deletePost(ctx, id),
  );

  tool(
    "vote",
    {
      title: "Vote",
      description: "Vote on a post as the key's owner, for example when a customer asked for it in a call. voted: false removes your vote.",
      annotations: IDEMPOTENT,
    },
    {
      post_id: z.number().int().describe("Post id"),
      voted: z.boolean().default(true).describe("true to vote, false to remove the vote"),
    },
    async (a, ctx) => ({ id: a.post_id, ...(await posts.setVote(ctx, a.post_id, needActor(ctx, "Voting").id, a.voted)) }),
  );

  tool(
    "add_comment",
    {
      title: "Reply publicly",
      description: "Post a public reply on a post as the key's owner. Everyone can read it; use add_internal_note for team-only notes.",
      annotations: WRITE,
    },
    {
      post_id: z.number().int().describe("Post id"),
      body: z.string().min(1).max(5000).describe("Reply text, markdown"),
    },
    async (a, ctx) => ({ ...(await posts.addComment(ctx, { postId: a.post_id, body: a.body, internal: false })), url: postLink(ctx, a.post_id) }),
  );

  tool(
    "add_internal_note",
    {
      title: "Add internal note",
      description: "Add a note on a post that only the team sees in the dashboard, e.g. customer names, revenue or links to tickets.",
      annotations: WRITE,
    },
    {
      post_id: z.number().int().describe("Post id"),
      body: z.string().min(1).max(5000).describe("Note text"),
    },
    async (a, ctx) => posts.addComment(ctx, { postId: a.post_id, body: a.body, internal: true }),
  );

  tool(
    "list_comments",
    {
      title: "List comments",
      description: "List a post's comments oldest first, including internal notes (marked internal: true).",
      annotations: READ,
    },
    {
      post_id: z.number().int().describe("Post id"),
      include_internal: z.boolean().default(true).describe("Include team-only notes"),
    },
    async (a, ctx) => ({ comments: await posts.listComments(ctx, a.post_id, { internal: a.include_internal ? undefined : false }) }),
  );

  // ------------------------------------------------------------------
  // Boards, statuses, tags

  tool("list_boards", { title: "List boards", description: "List boards with their ids and post counts.", annotations: READ }, {}, async (_a, ctx) => ({ boards: await setup.listBoards(ctx) }));

  tool(
    "create_board",
    { title: "Create board", description: "Add a board, e.g. 'Bugs' or 'Integrations'. Posts live on exactly one board.", annotations: WRITE },
    {
      name: z.string().min(1).max(60).describe("Board name"),
      description: z.string().max(200).optional().describe("One line shown under the name"),
    },
    async (a, ctx) => {
      const existing = (await setup.listBoards(ctx)).find((b) => b.name.toLowerCase() === a.name.trim().toLowerCase());
      if (existing) return { id: existing.id, created: false, note: "A board with this name already exists" };
      return setup.saveBoard(ctx, { name: a.name, description: a.description });
    },
  );

  tool(
    "update_board",
    { title: "Update board", description: "Rename a board or change its description.", annotations: IDEMPOTENT },
    {
      board: z.string().describe("Board id or current name"),
      name: z.string().min(1).max(60).optional().describe("New name"),
      description: z.string().max(200).nullable().optional().describe("New description; null clears it"),
    },
    async (a, ctx) => {
      const id = (await posts.resolveBoard(ctx, a.board)).id;
      const b = (await setup.listBoards(ctx)).find((x) => x.id === id)!;
      return setup.saveBoard(ctx, { id: b.id, name: a.name ?? b.name, description: a.description === undefined ? b.description : a.description });
    },
  );

  tool(
    "delete_board",
    { title: "Delete board", description: "Delete an empty board. Move its posts away first (update_post with board).", destructive: true },
    { board: z.string().describe("Board id or name") },
    async (a, ctx) => setup.deleteBoard(ctx, a.board),
  );

  tool(
    "list_statuses",
    {
      title: "List statuses",
      description: "List statuses in board order with key, label, colour, kind (open, review, planned, progress, done, closed), whether they show on the roadmap, and post counts.",
      annotations: READ,
    },
    {},
    async (_a, ctx) => ({ statuses: await setup.listStatusesWithCounts(ctx) }),
  );

  const kindArg = z.enum(STATUS_KINDS).describe("What the status means: open (new), review, planned, progress, done (shipped) or closed (declined)");

  tool(
    "create_status",
    { title: "Create status", description: "Add a status. Its kind decides behaviour: done statuses count as shipped, closed ones as declined. Use position to place it.", annotations: WRITE },
    {
      label: z.string().min(1).max(30).describe("Label shown to people, e.g. 'Beta'"),
      kind: kindArg,
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6e8bff").describe("Hex colour"),
      on_roadmap: z.boolean().default(true).describe("Show as a column on the public roadmap"),
      position: z.number().int().min(0).optional().describe("0-based place in the status order; default last"),
    },
    async (a, ctx) => {
      const existing = (await setup.listStatusesWithCounts(ctx)).find((s) => s.label.toLowerCase() === a.label.trim().toLowerCase());
      if (existing) return { key: existing.key, created: false, note: "A status with this label already exists" };
      const r = await setup.saveStatus(ctx, { label: a.label, color: a.color, kind: a.kind, onRoadmap: a.on_roadmap });
      if (a.position !== undefined) {
        const keys = (await setup.listStatusesWithCounts(ctx)).map((s) => s.key).filter((k) => k !== r.key);
        keys.splice(a.position, 0, r.key);
        await setup.reorderStatuses(ctx, keys);
      }
      return r;
    },
  );

  tool(
    "update_status",
    { title: "Update status", description: "Change a status's label, colour, kind, roadmap placement or position. Only the fields you pass change.", annotations: IDEMPOTENT },
    {
      key: z.string().describe("Status key (list_statuses)"),
      label: z.string().min(1).max(30).optional().describe("New label"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("New hex colour"),
      kind: kindArg.optional(),
      on_roadmap: z.boolean().optional().describe("Show as a column on the public roadmap"),
      position: z.number().int().min(0).optional().describe("0-based place in the status order"),
    },
    async (a, ctx) => {
      const all = await setup.listStatusesWithCounts(ctx);
      const s = await posts.resolveStatus(ctx, a.key);
      await setup.saveStatus(ctx, { key: s.key, label: a.label ?? s.label, color: a.color ?? s.color, kind: a.kind ?? s.kind, onRoadmap: a.on_roadmap ?? s.onRoadmap });
      if (a.position !== undefined) {
        const keys = all.map((x) => x.key).filter((k) => k !== s.key);
        keys.splice(a.position, 0, s.key);
        await setup.reorderStatuses(ctx, keys);
      }
      return { key: s.key, statuses: (await setup.listStatusesWithCounts(ctx)).map((x) => x.key) };
    },
  );

  tool(
    "delete_status",
    { title: "Delete status", description: "Delete a status no post uses. Keep at least one open and one closed status.", destructive: true },
    { key: z.string().describe("Status key") },
    async (a, ctx) => setup.deleteStatus(ctx, a.key),
  );

  tool(
    "reorder_statuses",
    { title: "Reorder statuses", description: "Set the status order used on the board and roadmap. Keys you leave out keep their order after these.", annotations: IDEMPOTENT },
    { keys: z.array(z.string()).min(1).max(30).describe("Status keys in the order you want") },
    async (a, ctx) => setup.reorderStatuses(ctx, a.keys),
  );

  tool("list_tags", { title: "List tags", description: "List tags with their ids.", annotations: READ }, {}, async (_a, ctx) => ({ tags: await setup.listTags(ctx) }));

  tool(
    "create_tag",
    { title: "Create tag", description: "Add a tag for grouping posts across boards, e.g. 'mobile' or 'enterprise'. Creating an existing tag returns it.", annotations: IDEMPOTENT },
    { name: z.string().min(1).max(30).describe("Tag name") },
    async (a, ctx) => setup.saveTag(ctx, a.name),
  );

  tool(
    "update_tag",
    { title: "Rename tag", description: "Rename a tag. Posts keep it.", annotations: IDEMPOTENT },
    { tag: z.string().describe("Tag id or current name"), name: z.string().min(1).max(30).describe("New name") },
    async (a, ctx) => setup.renameTag(ctx, a.tag, a.name),
  );

  tool(
    "delete_tag",
    { title: "Delete tag", description: "Delete a tag and remove it from every post.", destructive: true },
    { tag: z.string().describe("Tag id or name") },
    async (a, ctx) => setup.deleteTag(ctx, a.tag),
  );

  // ------------------------------------------------------------------
  // Widget

  const widgetView = (ctx: Ctx) => {
    const s = readWidgetSettings(ctx.workspace.widgetSettings);
    return { ...s, accent: s.accent ?? "brand", allowedSites: ctx.workspace.widgetOrigins?.split(" ") ?? [] };
  };

  tool(
    "get_widget_settings",
    { title: "Get widget settings", description: "Read how the embeddable feedback widget looks and which sites may embed it.", annotations: READ },
    {},
    async (_a, ctx) => widgetView(ctx),
  );

  tool(
    "configure_widget",
    {
      title: "Configure widget",
      description: "Change the widget's look, tabs or allowed sites. Only the fields you pass change; the live snippet picks changes up by itself.",
      annotations: IDEMPOTENT,
    },
    {
      theme: z.enum(WIDGET_THEMES).optional().describe("dark, light, or auto (follows the visitor's system)"),
      accent: z.string().optional().describe("Hex colour like #6e8bff, or 'brand' to follow the workspace accent"),
      launcher: z.enum(WIDGET_LAUNCHERS).optional().describe("icon: round button; label: button with text; hidden: open it from your own button"),
      label: z.string().max(24).optional().describe("Launcher text when launcher is 'label'"),
      icon: z.enum(WIDGET_ICONS).optional().describe("Launcher icon"),
      position: z.enum(WIDGET_POSITIONS).optional().describe("Corner of the page"),
      radius: z.enum(WIDGET_RADII).optional().describe("Corner rounding of the panel"),
      tabs: z.array(z.enum(WIDGET_TABS)).min(1).optional().describe("Tabs to show; the first opens by default"),
      allowed_sites: z.array(z.string()).max(20).optional().describe("Origins allowed to embed the widget, e.g. ['https://example.com']; [] allows any site"),
    },
    async (a, ctx) => {
      const patch = { theme: a.theme, accent: a.accent === undefined ? undefined : a.accent === "brand" ? null : a.accent, launcher: a.launcher, label: a.label, icon: a.icon, position: a.position, radius: a.radius, tabs: a.tabs };
      if (Object.values(patch).some((v) => v !== undefined)) await ws.saveWidgetSettings(ctx, ws.mergeWidgetSettings(ctx.workspace.widgetSettings, patch));
      if (a.allowed_sites) await ws.saveWidgetOrigins(ctx, a.allowed_sites.join(" "));
      return widgetView(ctx);
    },
  );

  tool(
    "get_widget_snippet",
    {
      title: "Get widget snippet",
      description:
        "Get the exact script tag that embeds the widget, plus where to put it for a framework (Next.js, React, Vue, Nuxt, plain HTML). Add it once to the root layout so it loads on every page.",
      annotations: READ,
    },
    { framework: z.enum(["next", "react", "vue", "nuxt", "html", "all"]).default("all").describe("Return the example for this framework only") },
    async (a, ctx) => widgetSnippet({ src: `${ctx.origin}/widget.js${ctx.query}`, allowedSites: ctx.workspace.widgetOrigins?.split(" ") ?? [], framework: a.framework }),
  );

  // ------------------------------------------------------------------
  // Help center

  tool(
    "list_help",
    { title: "List help center", description: "List help collections and every article, drafts included, with status and URL. Bodies are left out; read one with get_help_article.", annotations: READ },
    {},
    async (_a, ctx) => {
      const { collections, articles } = await content.listHelp(ctx);
      return {
        collections: collections.map((c) => ({ id: c.id, title: c.title, slug: c.slug, icon: c.icon })),
        articles: articles.map((x) => ({ id: x.id, title: x.title, slug: x.slug, status: x.status, collectionId: x.collectionId, updatedAt: x.updatedAt, url: link(ctx, `/help/${x.slug}`) })),
      };
    },
  );

  tool(
    "search_help_articles",
    { title: "Search help articles", description: "Search published help articles by keywords, best match first. Use before writing a new article or answering a question.", annotations: READ },
    { q: z.string().min(1).max(120).describe("Search words, e.g. 'export csv'"), limit: z.number().int().min(1).max(25).default(8).describe("Max results") },
    async (a, ctx) => ({ articles: (await searchHelpArticles(ctx.db, ctx.workspace.id, a.q, { limit: a.limit })).map((h) => ({ ...h, url: link(ctx, `/help/${h.slug}`) })) }),
  );

  tool(
    "get_help_article",
    { title: "Get help article", description: "Read one help article with its full markdown body, drafts included. Pass id or slug.", annotations: READ },
    { id: z.number().int().optional().describe("Article id"), slug: z.string().optional().describe("Article slug") },
    async (a, ctx) => {
      if (a.id) {
        const r = await content.helpArticleById(ctx.db, ctx.workspace.id, a.id);
        if (!r) throw new OpError(`Help article ${a.id} not found`, 404);
        return { id: r.id, title: r.title, slug: r.slug, status: r.status, excerpt: r.excerpt, collectionId: r.collectionId, body: r.body, url: link(ctx, `/help/${r.slug}`) };
      }
      if (!a.slug) throw new OpError("Pass an id or a slug");
      const r = await helpArticleBySlug(ctx.db, ctx.workspace.id, a.slug, { drafts: true });
      if (!r) throw new OpError(`Help article '${a.slug}' not found`, 404);
      return { ...r, url: link(ctx, `/help/${r.slug}`) };
    },
  );

  const articleInput = {
    title: z.string().min(3).max(140).describe("Article title, phrased like the question people ask"),
    body: z.string().max(50000).optional().describe("Markdown body"),
    excerpt: z.string().max(240).optional().describe("One-line summary for lists and search"),
    slug: z.string().max(80).optional().describe("URL slug; derived from the title when empty"),
    collection_id: z.number().int().nullable().optional().describe("Collection id (list_help); null for none"),
  };

  tool(
    "create_help_article",
    { title: "Create help article", description: "Write a help center article. It stays a draft unless publish is true.", annotations: WRITE },
    { ...articleInput, publish: z.boolean().default(false).describe("Publish now instead of saving a draft") },
    async (a, ctx) => {
      const r = await content.saveHelpArticle(ctx, { title: a.title, body: a.body, excerpt: a.excerpt, slug: a.slug, collectionId: a.collection_id ?? null, publish: a.publish });
      return { ...r, url: link(ctx, `/help/${r.slug}`) };
    },
  );

  async function saveArticle(ctx: Ctx, id: number, patch: { title?: string; body?: string; excerpt?: string; slug?: string; collection_id?: number | null; publish?: boolean }) {
    const cur = await content.helpArticleById(ctx.db, ctx.workspace.id, id);
    if (!cur) throw new OpError(`Help article ${id} not found`, 404);
    const r = await content.saveHelpArticle(ctx, {
      id,
      title: patch.title ?? cur.title,
      body: patch.body ?? cur.body,
      excerpt: patch.excerpt ?? cur.excerpt ?? "",
      slug: patch.slug ?? cur.slug,
      collectionId: patch.collection_id === undefined ? cur.collectionId : patch.collection_id,
      publish: patch.publish ?? cur.status === "published",
    });
    return { ...r, url: link(ctx, `/help/${r.slug}`) };
  }

  tool(
    "update_help_article",
    { title: "Update help article", description: "Edit a help article. Only the fields you pass change; it stays published or draft as it was.", annotations: IDEMPOTENT },
    { id: z.number().int().describe("Article id"), ...articleInput, title: articleInput.title.optional() },
    async (a, ctx) => saveArticle(ctx, a.id, a),
  );

  tool(
    "publish_help_article",
    { title: "Publish help article", description: "Publish a draft help article so readers and the widget can find it.", annotations: IDEMPOTENT },
    { id: z.number().int().describe("Article id") },
    async (a, ctx) => saveArticle(ctx, a.id, { publish: true }),
  );

  tool(
    "unpublish_help_article",
    { title: "Unpublish help article", description: "Turn a published help article back into a draft.", annotations: IDEMPOTENT },
    { id: z.number().int().describe("Article id") },
    async (a, ctx) => saveArticle(ctx, a.id, { publish: false }),
  );

  tool(
    "delete_help_article",
    { title: "Delete help article", description: "Delete a help article. Unpublish instead if it may come back.", destructive: true },
    { id: z.number().int().describe("Article id") },
    async (a, ctx) => content.deleteHelpArticle(ctx, a.id),
  );

  const collectionInput = {
    title: z.string().min(2).max(80).describe("Collection title, e.g. 'Getting started'"),
    description: z.string().max(200).optional().describe("One line under the title"),
    icon: z.enum(HELP_ICONS).nullable().optional().describe("Icon"),
    slug: z.string().max(80).optional().describe("URL slug; derived from the title when empty"),
  };

  tool(
    "create_help_collection",
    { title: "Create help collection", description: "Add a collection that groups help articles.", annotations: WRITE },
    collectionInput,
    async (a, ctx) => content.saveHelpCollection(ctx, { title: a.title, description: a.description, icon: a.icon ?? null, slug: a.slug }),
  );

  tool(
    "update_help_collection",
    { title: "Update help collection", description: "Edit a help collection. Only the fields you pass change.", annotations: IDEMPOTENT },
    { id: z.number().int().describe("Collection id"), ...collectionInput, title: collectionInput.title.optional() },
    async (a, ctx) => {
      const cur = (await content.listHelp(ctx)).collections.find((c) => c.id === a.id);
      if (!cur) throw new OpError(`Collection ${a.id} not found`, 404);
      return content.saveHelpCollection(ctx, {
        id: a.id,
        title: a.title ?? cur.title,
        description: a.description ?? cur.description ?? "",
        icon: a.icon === undefined ? (cur.icon as (typeof HELP_ICONS)[number] | null) : a.icon,
        slug: a.slug ?? cur.slug,
      });
    },
  );

  tool(
    "delete_help_collection",
    { title: "Delete help collection", description: "Delete a help collection. Its articles stay, without a collection.", destructive: true },
    { id: z.number().int().describe("Collection id") },
    async (a, ctx) => content.deleteHelpCollection(ctx, a.id),
  );

  // ------------------------------------------------------------------
  // Changelog

  tool(
    "list_changelog",
    { title: "List changelog", description: "List changelog entries newest first, drafts included, with linked posts. Bodies are cut unless include_body is true.", annotations: READ },
    {
      drafts: z.boolean().default(true).describe("Include unpublished drafts"),
      include_body: z.boolean().default(false).describe("Return full bodies"),
      limit: z.number().int().min(1).max(100).default(20).describe("Max entries"),
    },
    async (a, ctx) => {
      const entries = await content.listChangelogAdmin(ctx, { drafts: a.drafts });
      return {
        entries: entries.slice(0, a.limit).map((e) => ({
          id: e.id,
          title: e.title,
          version: e.version,
          publishedAt: e.publishedAt,
          draft: !e.publishedAt,
          ...(a.include_body ? { body: e.body } : { excerpt: excerpt(e.body) }),
          posts: e.posts.map((p) => ({ id: p.id, title: p.title })),
        })),
        url: link(ctx, "/changelog"),
      };
    },
  );

  tool(
    "draft_changelog",
    {
      title: "Draft changelog entry",
      description: "Write a changelog entry as a draft, linking the posts it ships. Nothing is sent until publish_changelog.",
      annotations: WRITE,
    },
    {
      title: z.string().min(3).max(140).describe("Entry title, e.g. 'Dark mode is here'"),
      body: z.string().max(20000).optional().describe("Markdown body"),
      version: z.string().max(40).optional().describe("Version label, e.g. v1.2.0"),
      post_ids: z.array(z.number().int()).max(50).optional().describe("Posts this release ships"),
    },
    async (a, ctx) => mutateDraftChangelog(ctx, { title: a.title, body: a.body, version: a.version, postIds: a.post_ids }),
  );

  tool(
    "update_changelog",
    { title: "Update changelog entry", description: "Edit a changelog entry. Only the fields you pass change. Editing a published entry sends no new emails.", annotations: IDEMPOTENT },
    {
      id: z.number().int().describe("Entry id"),
      title: z.string().min(3).max(140).optional().describe("New title"),
      body: z.string().max(20000).optional().describe("New markdown body"),
      version: z.string().max(40).nullable().optional().describe("New version label; null clears it"),
      post_ids: z.array(z.number().int()).max(50).optional().describe("Replace the linked posts"),
    },
    async (a, ctx) => {
      const cur = await content.changelogById(ctx, a.id);
      const r = await content.saveChangelog(ctx, {
        id: a.id,
        title: a.title ?? cur.title,
        body: a.body ?? cur.body,
        version: a.version === undefined ? cur.version : a.version,
        postIds: a.post_ids ?? cur.postIds,
        publish: !!cur.publishedAt,
      });
      return { id: r.id, published: r.published, shipped: r.shipped };
    },
  );

  tool(
    "publish_changelog",
    {
      title: "Publish changelog entry",
      description:
        "Publish a draft. Linked posts move to the done status, and the first publish emails changelog subscribers plus everyone who voted on or follows the linked posts. Publishing twice does nothing.",
      annotations: IDEMPOTENT,
    },
    { id: z.number().int().describe("Entry id") },
    async (a, ctx) => ({ ...(await mutatePublishChangelog(ctx, a.id)), url: link(ctx, "/changelog") }),
  );

  tool(
    "delete_changelog",
    { title: "Delete changelog entry", description: "Delete a changelog entry. Linked posts keep their status.", destructive: true },
    { id: z.number().int().describe("Entry id") },
    async (a, ctx) => content.deleteChangelog(ctx, a.id),
  );

  // ------------------------------------------------------------------
  // Integrations

  tool(
    "list_integrations",
    { title: "List integrations", description: "List connected Slack, Discord and webhook destinations with their events and last delivery. URLs show only their last characters.", annotations: READ },
    {},
    async (_a, ctx) => (await integrations.listIntegrations(ctx)).integrations,
  );

  const eventsArg = z.array(z.enum(INTEGRATION_EVENTS)).min(1).default([...INTEGRATION_EVENTS]).describe(`Events to send: ${INTEGRATION_EVENTS.join(", ")}. Default all.`);
  const boardsArg = z.array(z.string()).optional().describe("Only posts on these boards (ids or names); default every board");

  async function connect(ctx: Ctx, kind: "slack" | "discord" | "webhook", a: { url: string; events: (typeof INTEGRATION_EVENTS)[number][]; boards?: string[] }) {
    const boardIds = a.boards?.length ? await Promise.all(a.boards.map(async (b) => (await posts.resolveBoard(ctx, b)).id)) : null;
    const r = await integrations.saveIntegration(ctx, { kind, url: a.url, events: a.events, boardIds });
    return { ...r, next: "Call send_test to check it arrives." };
  }

  tool(
    "connect_slack",
    { title: "Connect Slack", description: "Send new posts, comments, status changes and changelog releases to a Slack channel through an incoming webhook URL (hooks.slack.com). Replaces an existing Slack connection.", annotations: IDEMPOTENT },
    { url: z.string().url().describe("Slack incoming webhook URL"), events: eventsArg, boards: boardsArg },
    async (a, ctx) => connect(ctx, "slack", a),
  );

  tool(
    "connect_discord",
    { title: "Connect Discord", description: "Send feedback events to a Discord channel through its webhook URL (discord.com/api/webhooks/...). Replaces an existing Discord connection.", annotations: IDEMPOTENT },
    { url: z.string().url().describe("Discord webhook URL"), events: eventsArg, boards: boardsArg },
    async (a, ctx) => connect(ctx, "discord", a),
  );

  tool(
    "connect_webhook",
    {
      title: "Connect webhook",
      description: "POST signed JSON for feedback events to your own HTTPS endpoint. The signing secret is returned once, on first connect; store it to verify the x-openheard-signature header.",
      annotations: IDEMPOTENT,
    },
    { url: z.string().url().describe("HTTPS endpoint"), events: eventsArg, boards: boardsArg },
    async (a, ctx) => connect(ctx, "webhook", a),
  );

  const kindArg2 = z.enum(["slack", "discord", "webhook"]).describe("Which connection");

  tool(
    "send_test",
    { title: "Send test message", description: "Send a sample message to a connected Slack, Discord or webhook destination and report whether it arrived.", annotations: { ...WRITE, openWorldHint: true } },
    { kind: kindArg2 },
    async (a, ctx) => integrations.testIntegration(ctx, a.kind),
  );

  tool(
    "disconnect",
    { title: "Disconnect integration", description: "Remove a Slack, Discord or webhook connection.", destructive: true },
    { kind: kindArg2 },
    async (a, ctx) => integrations.deleteIntegration(ctx, a.kind),
  );

  // ------------------------------------------------------------------
  // Team

  tool(
    "list_members",
    { title: "List team", description: "List team members with their role, and invites not yet accepted.", annotations: READ },
    {},
    async (_a, ctx) => {
      const r = await ws.listMembers(ctx);
      return { members: r.members.map((m) => ({ name: m.name, email: m.email, role: m.role })), pendingInvites: r.pendingInvites };
    },
  );

  tool(
    "invite_member",
    { title: "Invite team member", description: "Email someone an invite to the team. Admins manage everything; members can post and comment as the team.", annotations: WRITE },
    { email: z.string().email().describe("Email address"), role: z.enum(["admin", "member"]).default("member").describe("Role once they join") },
    async (a, ctx) => ws.createInvite(ctx, a),
  );

  // ------------------------------------------------------------------
  // Insights

  tool(
    "summarize_feedback",
    {
      title: "Summarize feedback",
      description:
        "One-call overview for triage: post counts by status and board, new posts this week, top voted open requests, posts rising this week, planned or in-progress items with no status change for a while, and open posts nobody on the team has answered.",
      annotations: READ,
    },
    {
      stale_days: z.number().int().min(1).max(365).default(30).describe("Planned or in-progress posts unchanged this many days count as stale"),
      top: z.number().int().min(1).max(20).default(5).describe("How many posts per list"),
    },
    async (a, ctx) => {
      const s = await summarizeFeedback(ctx, { staleDays: a.stale_days, top: a.top });
      const withUrl = <T extends { id: number }>(rows: T[]) => rows.map((r) => ({ ...r, url: postLink(ctx, r.id) }));
      return { ...s, topVoted: withUrl(s.topVoted), risingThisWeek: withUrl(s.risingThisWeek), stalePlanned: withUrl(s.stalePlanned), needsReply: withUrl(s.needsReply) };
    },
  );

  tool(
    "find_duplicates",
    {
      title: "Find duplicates",
      description: "Find posts that look like the same request, by shared title words, for a post id or for text you are about to post. Review them, then merge_posts.",
      annotations: READ,
    },
    {
      post_id: z.number().int().optional().describe("Find posts similar to this one"),
      text: z.string().max(300).optional().describe("Or: find posts similar to this title or sentence"),
      limit: z.number().int().min(1).max(20).default(5).describe("Max candidates"),
    },
    async (a, ctx) => {
      let text = a.text;
      if (a.post_id) text = (await posts.ownPost(ctx, a.post_id)).title;
      if (!text) throw new OpError("Pass post_id or text");
      const rows = await posts.similarPosts(ctx, text, { excludeId: a.post_id, limit: a.limit, minLength: a.post_id ? 5 : 4 });
      return { for: a.post_id ? { id: a.post_id, title: text } : { text }, candidates: rows.map((r) => ({ id: r.id, title: r.title, votes: r.voteCount, status: r.status, sharedWords: r.shared, url: postLink(ctx, r.id) })) };
    },
  );

  // ------------------------------------------------------------------
  // Prompts

  for (const p of PROMPTS) {
    server.registerPrompt(p.name, { title: p.title, description: p.description, argsSchema: p.args }, ((args: Record<string, string | undefined>) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: p.text(args) } }],
    })) as never);
  }

  return server;
}
