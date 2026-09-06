// Realistic sample data for local dev. Never runs against production.
// Usage: bun run db:seed  (needs OPENHEARD_LOCAL=1, set by the root script)
import { createClient } from "@libsql/client";
import * as schema from "@openheard/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? "file:./local.db" }), { schema });

const day = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day);

async function main() {
  const users = await db.select().from(schema.user);
  if (users.length === 0) {
    console.log("Sign up once in the app first (that account becomes admin), then seed.");
    process.exit(1);
  }
  const admin = users.find((u) => u.role === "admin") ?? users[0];
  await db.insert(schema.workspace).values({ id: "default", name: "acme" }).onConflictDoNothing();
  await db.insert(schema.membership).values({ workspaceId: "default", userId: admin.id, role: "admin" }).onConflictDoNothing();
  await db.insert(schema.status).values(schema.DEFAULT_STATUSES.map((d, i) => ({ workspaceId: "default", ...d, position: i }))).onConflictDoNothing();

  const people = [
    ["Sarah Chen", "sarah@relay.io"],
    ["Alex Rivera", "alex@northwind.dev"],
    ["Jordan Lee", "jordan@stackline.app"],
    ["Chris Wong", "chris@lumen.co"],
    ["Taylor Brooks", "taylor@brooksware.com"],
    ["Maya Patel", "maya@fieldnotes.io"],
    ["Sam Martinez", "sam@driftlabs.dev"],
  ] as const;
  for (const [name, email] of people) {
    const id = crypto.randomUUID();
    await db.insert(schema.user).values({ id, name, email, role: "member", emailVerified: true }).onConflictDoNothing();
  }
  const members = (await db.select().from(schema.user)).filter((u) => u.id !== admin.id).map((u) => u.id);

  await db
    .insert(schema.board)
    .values([
      { id: "features", name: "Feature requests", description: "Things you wish the product did.", position: 0 },
      { id: "bugs", name: "Bugs", description: "Things that are broken.", position: 1 },
      { id: "integrations", name: "Integrations", description: "Tools you want us to talk to.", position: 2 },
    ])
    .onConflictDoNothing();
  const tags = ["Migration", "Integrations", "API", "Widget", "Theming", "Auth", "Changelog", "Moderation", "UX", "Hosting"];
  await db.insert(schema.tag).values(tags.map((t) => ({ id: t.toLowerCase(), name: t }))).onConflictDoNothing();

  type Seed = { board: string; title: string; body: string; status: schema.Status; votes: number; tags: string[]; days: number; pinned?: boolean; eta?: string };
  const posts: Seed[] = [
    { board: "features", title: "Import our old feedback board", body: "We have three years of posts in our old tool and switching means losing that history. A one-click import that keeps votes, authors and comments would make the move a no-brainer. Even a CSV path would be fine, as long as the vote counts survive.", status: "progress", votes: 142, tags: ["migration"], days: 2, pinned: true, eta: "v0.4" },
    { board: "integrations", title: "Slack notification when a post changes status", body: "Post to a channel when something moves to planned or shipped so the team sees it without opening the board.", status: "planned", votes: 89, tags: ["integrations"], days: 5 },
    { board: "features", title: "Public API for posts and votes", body: "Read posts, create them from our own app, and sync votes. Webhooks for changes would be enough to start.", status: "review", votes: 67, tags: ["api"], days: 7 },
    { board: "features", title: "Embed widget that matches our dark theme", body: "The floating widget is light only. A dark variant and a way to pass our accent color.", status: "planned", votes: 56, tags: ["widget", "theming"], days: 8 },
    { board: "features", title: "Vote without creating an account", body: "Email-only voting with a magic link. Sign-up is the biggest drop-off on our board.", status: "review", votes: 45, tags: ["auth"], days: 12 },
    { board: "features", title: "Changelog RSS feed", body: "So we can pipe releases into our newsletter tool.", status: "done", votes: 34, tags: ["changelog"], days: 21 },
    { board: "features", title: "Merge duplicate posts and keep both vote counts", body: "Right now merging drops the votes on the merged post. Sum them, and notify voters of the survivor.", status: "progress", votes: 28, tags: ["moderation"], days: 20 },
    { board: "features", title: "SSO with Okta and SAML", body: "Enterprise customers ask for it before they will even look at a board.", status: "review", votes: 21, tags: ["auth"], days: 30 },
    { board: "features", title: "Board-level custom domains", body: "feedback.acme.com for one board, ideas.acme.com for another.", status: "review", votes: 19, tags: ["hosting"], days: 33 },
    { board: "features", title: "Per-board moderators", body: "Let a support lead moderate Bugs without giving them the whole admin.", status: "planned", votes: 17, tags: ["moderation"], days: 25 },
    { board: "features", title: "Magic link sign-in", body: "No passwords anywhere. Email, click, in.", status: "done", votes: 52, tags: ["auth"], days: 40 },
    { board: "features", title: "Keyboard navigation on the board", body: "j and k to move, v to vote, enter to open.", status: "done", votes: 22, tags: ["ux"], days: 35 },
    { board: "bugs", title: "Vote count flickers after voting on Safari", body: "Tap the vote pill on iOS Safari and the number jumps to the old value for a frame before settling.", status: "open", votes: 6, tags: ["ux"], days: 1 },
    { board: "bugs", title: "Changelog page 404s when there are no entries", body: "Fresh install, click Changelog, get a 404 instead of an empty state.", status: "closed", votes: 3, tags: [], days: 14 },
    { board: "integrations", title: "GitHub issues two-way sync", body: "Create an issue from a post and pull its status back when it closes.", status: "open", votes: 41, tags: ["integrations"], days: 3 },
    { board: "integrations", title: "Linear sync", body: "Same as GitHub issues but for Linear. Status mapping should be configurable.", status: "open", votes: 26, tags: ["integrations"], days: 4 },
  ];

  let i = 0;
  for (const p of posts) {
    const author = members[i % members.length]!;
    const [row] = await db
      .insert(schema.post)
      .values({ boardId: p.board, authorId: author, title: p.title, body: p.body, status: p.status, voteCount: p.votes, pinned: p.pinned ?? false, eta: p.eta, createdAt: at(p.days), statusChangedAt: at(Math.max(0, p.days - 2)) })
      .returning({ id: schema.post.id });
    if (p.tags.length) await db.insert(schema.postTag).values(p.tags.map((tagId) => ({ postId: row.id, tagId })));
    // Real vote rows for the seeded members, the rest of the count is "history".
    const voters = members.slice(0, Math.min(members.length, p.votes));
    if (voters.length) await db.insert(schema.vote).values(voters.map((userId) => ({ postId: row.id, userId }))).onConflictDoNothing();
    if (p.status !== "open") {
      await db.insert(schema.activity).values({ postId: row.id, actorId: admin.id, type: "status", fromStatus: "open", toStatus: p.status === "done" || p.status === "progress" ? "review" : p.status, createdAt: at(Math.max(0, p.days - 1)) });
      if (p.status === "progress" || p.status === "done")
        await db.insert(schema.activity).values({ postId: row.id, actorId: admin.id, type: "status", fromStatus: "review", toStatus: p.status, note: p.status === "progress" ? "Started on this. Aiming for the next release." : undefined, createdAt: at(Math.max(0, p.days - 3)) });
    }
    if (i % 2 === 0) {
      await db.insert(schema.comment).values({ postId: row.id, authorId: members[(i + 1) % members.length]!, body: "Same boat here. We would also want the status mapping to be editable.", createdAt: at(Math.max(0, p.days - 1)) });
    }
    i++;
  }
  // comment counts
  const counts = await db.select({ postId: schema.comment.postId }).from(schema.comment);
  const byPost = new Map<number, number>();
  for (const c of counts) byPost.set(c.postId, (byPost.get(c.postId) ?? 0) + 1);
  for (const [postId, n] of byPost) {
    await db.update(schema.post).set({ commentCount: n }).where(eq(schema.post.id, postId));
  }

  const shipped = await db.select({ id: schema.post.id, title: schema.post.title }).from(schema.post);
  const find = (t: string) => shipped.find((p) => p.title === t)?.id;
  const entries = [
    { title: "RSS for the changelog, and magic links", version: "v0.3.2", days: 2, body: "You can now follow the changelog from any reader, or pipe it into your newsletter tool. Sign-in also got simpler: enter an email, click the link, you are in. No passwords anywhere in openheard now.", posts: [find("Changelog RSS feed"), find("Magic link sign-in")] },
    { title: "Keyboard navigation on the board", version: "v0.3.1", days: 9, body: "Move through posts with j and k, vote with v, open with enter. It sounds small, but it is the difference between a board you skim and a board you actually read.", posts: [find("Keyboard navigation on the board")] },
    { title: "Self-host in one command", version: "v0.3.0", days: 16, body: "The whole thing is one Cloudflare Worker with D1 behind it. Point a domain at it and you have a board. Runs on the free tier.", posts: [] },
  ];
  for (const e of entries) {
    const [row] = await db.insert(schema.changelogEntry).values({ title: e.title, version: e.version, body: e.body, authorId: admin.id, publishedAt: at(e.days), createdAt: at(e.days) }).returning({ id: schema.changelogEntry.id });
    const ids = e.posts.filter((x): x is number => typeof x === "number");
    if (ids.length) await db.insert(schema.changelogPost).values(ids.map((postId) => ({ entryId: row.id, postId })));
  }
  console.log(`seeded ${posts.length} posts, ${entries.length} changelog entries`);
}

main();
