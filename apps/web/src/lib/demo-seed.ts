// The sample board: people, boards, tags, posts, comments, votes, activity and
// changelog. Used by `bun run db:seed` for the local "default" workspace and by
// the nightly demo reset. Board and tag ids are global primary keys, so every
// workspace but "default" prefixes them with its own id.
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { eq, inArray } from "drizzle-orm";

const day = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day);

// Reserved by RFC 6761: nothing can ever be delivered to it.
export const SEED_EMAIL_DOMAIN = "demo.invalid";

export const SEED_PEOPLE = [
  ["Sarah Chen", "sarah"],
  ["Alex Rivera", "alex"],
  ["Jordan Lee", "jordan"],
  ["Chris Wong", "chris"],
  ["Taylor Brooks", "taylor"],
  ["Maya Patel", "maya"],
  ["Sam Martinez", "sam"],
] as const;

const BOARDS = [
  { slug: "features", name: "Feature requests", description: "Things you wish the product did." },
  { slug: "bugs", name: "Bugs", description: "Things that are broken." },
  { slug: "integrations", name: "Integrations", description: "Tools you want us to talk to." },
] as const;

const TAGS = ["Migration", "Integrations", "API", "Widget", "Theming", "Auth", "Changelog", "Moderation", "UX", "Hosting"] as const;

type Seed = { board: string; title: string; body: string; status: schema.Status; votes: number; tags: string[]; days: number; pinned?: boolean; eta?: string };

const POSTS: Seed[] = [
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

const ENTRIES = [
  { title: "RSS for the changelog, and magic links", version: "v0.3.2", days: 2, body: "You can now follow the changelog from any reader, or pipe it into your newsletter tool. Sign-in also got simpler: enter an email, click the link, you are in. No passwords anywhere in openheard now.", posts: ["Changelog RSS feed", "Magic link sign-in"] },
  { title: "Keyboard navigation on the board", version: "v0.3.1", days: 9, body: "Move through posts with j and k, vote with v, open with enter. It sounds small, but it is the difference between a board you skim and a board you actually read.", posts: ["Keyboard navigation on the board"] },
  { title: "Self-host in one command", version: "v0.3.0", days: 16, body: "The whole thing is one Cloudflare Worker with D1 behind it. Point a domain at it and you have a board. Runs on the free tier.", posts: [] },
];

// A small help center: two collections, five articles, one of them with
// enough structure to show the table of contents.
const HELP = [
  {
    slug: "getting-started",
    title: "Getting started",
    icon: "rocket",
    description: "Set up your board and invite the people who will use it.",
    articles: [
      {
        slug: "post-your-first-idea",
        title: "Post your first idea",
        excerpt: "Where to click, what makes a good title, and what happens after you post.",
        body: "Anyone with the link can suggest something. Click **Post idea** on the board, or press `c` anywhere.\n\n## Write a title people can vote on\n\nOne sentence that says what you want, not how to build it. \"Export posts to CSV\" gets more votes than \"Add a button to settings\".\n\n## Check for duplicates first\n\nAs you type, similar posts and help articles appear under the title. If one already covers it, vote on that instead: votes on one post count for more than the same request split across three.\n\n> Three posts asking for the same thing with ten votes each read as three small requests. One post with thirty reads as a priority.\n\n## After you post\n\nYou get the first vote. The team moves the post through **Under review**, **Planned**, **In progress** and **Shipped**, and everyone who voted hears about each step.",
      },
      {
        slug: "how-voting-works",
        title: "How voting works",
        excerpt: "One vote per person per post, and what the team does with the count.",
        body: "Each person gets one vote per post. Click the arrow on the right of a post to vote, click it again to take the vote back.\n\nVotes are a signal, not a queue. The team reads the comments too, so say what you are trying to do and what you use today.\n\n> Signed out? Some boards let you vote without an account. If yours does not, sign in with your email and the vote is kept.",
      },
      {
        slug: "keyboard-shortcuts",
        title: "Keyboard shortcuts",
        excerpt: "Move through the board without a mouse.",
        body: "## On the board\n\n- `j` and `k` move between posts\n- `v` votes on the selected post\n- `enter` opens it\n- `/` jumps to search\n- `c` starts a new post\n\n## In a dialog\n\n- `cmd enter` submits\n- `esc` closes without saving",
      },
    ],
  },
  {
    slug: "account-and-billing",
    title: "Account and billing",
    icon: "card",
    description: "Sign-in, email updates, plans and invoices.",
    articles: [
      {
        slug: "sign-in-with-a-magic-link",
        title: "Sign in with a magic link",
        excerpt: "No password: enter your email and click the link we send.",
        body: "Enter your email on the sign-in screen and we send you a link. Click it on the same device and you are in.\n\n## The email did not arrive\n\n1. Check spam and promotions folders.\n2. Wait a minute: some company mail servers hold new senders briefly.\n3. Ask for a new link. Each link works once and expires after 10 minutes.\n\n## Signing in on a new device\n\nRequest a link from that device. Links opened elsewhere sign in the browser that opened them.",
      },
      {
        slug: "change-plan-or-download-invoices",
        title: "Change your plan or download invoices",
        excerpt: "Upgrade, cancel, or get a PDF invoice from the billing page.",
        body: "Open **Settings**, then **Billing**. From there you can switch between monthly and yearly, cancel, or update your card.\n\n## Invoices\n\nEvery payment has a PDF invoice under **Billing history**. Add your company name and VAT number before downloading and they appear on every future invoice.\n\n## Cancelling\n\nYour board stays online until the end of the period you paid for, then moves to the free plan. Nothing is deleted.",
      },
    ],
  },
] as const;

// Board and tag ids sit in URLs and are unique across the whole install, so
// every workspace but "default" carries its id as a prefix. Same rule as
// saveBoard in functions/settings.ts.
export const scopedId = (workspaceId: string, slug: string) => (workspaceId === "default" ? slug : `${workspaceId}-${slug}`);

// The seeded accounts a reset can safely delete again.
export const seedUserId = (workspaceId: string, handle: string) => `${workspaceId}-user-${handle}`;

async function assertUnowned(db: Db, table: typeof schema.board | typeof schema.tag, ids: string[], ws: string) {
  const rows = await db.select({ id: table.id, workspaceId: table.workspaceId }).from(table).where(inArray(table.id, ids));
  const foreign = rows.find((r) => r.workspaceId !== ws);
  if (foreign) throw new Error(`Id ${foreign.id} is already in use by another workspace`);
}

export async function seedDemoContent(db: Db, workspaceId: string, adminId: string) {
  const ws = workspaceId;
  const scoped = (slug: string) => scopedId(ws, slug);

  const members: string[] = [];
  for (const [name, handle] of SEED_PEOPLE) {
    const id = seedUserId(ws, handle);
    await db
      .insert(schema.user)
      .values({ id, name, email: `${handle}.${ws}@${SEED_EMAIL_DOMAIN}`, role: "member", emailVerified: true })
      .onConflictDoUpdate({ target: schema.user.id, set: { name } });
    members.push(id);
  }

  // Board and tag ids are global primary keys. Refuse to seed over a row that
  // belongs to somebody else rather than silently adopting or renaming it.
  await assertUnowned(db, schema.board, BOARDS.map((b) => scoped(b.slug)), ws);
  await assertUnowned(db, schema.tag, TAGS.map((t) => scoped(t.toLowerCase())), ws);
  await db
    .insert(schema.board)
    .values(BOARDS.map((b, i) => ({ id: scoped(b.slug), workspaceId: ws, name: b.name, description: b.description, position: i })))
    .onConflictDoNothing();
  await db
    .insert(schema.tag)
    .values(TAGS.map((t) => ({ id: scoped(t.toLowerCase()), workspaceId: ws, name: t })))
    .onConflictDoNothing();

  let i = 0;
  for (const p of POSTS) {
    const author = members[i % members.length]!;
    const [row] = await db
      .insert(schema.post)
      .values({ workspaceId: ws, boardId: scoped(p.board), authorId: author, title: p.title, body: p.body, status: p.status, voteCount: p.votes, pinned: p.pinned ?? false, eta: p.eta, createdAt: at(p.days), statusChangedAt: at(Math.max(0, p.days - 2)) })
      .returning({ id: schema.post.id });
    if (p.tags.length) await db.insert(schema.postTag).values(p.tags.map((t) => ({ postId: row.id, tagId: scoped(t) })));
    // Real vote rows for the seeded members, the rest of the count is "history".
    const voters = members.slice(0, Math.min(members.length, p.votes));
    if (voters.length) await db.insert(schema.vote).values(voters.map((userId) => ({ postId: row.id, userId }))).onConflictDoNothing();
    if (p.status !== "open") {
      await db.insert(schema.activity).values({ postId: row.id, actorId: adminId, type: "status", fromStatus: "open", toStatus: p.status === "done" || p.status === "progress" ? "review" : p.status, createdAt: at(Math.max(0, p.days - 1)) });
      if (p.status === "progress" || p.status === "done")
        await db.insert(schema.activity).values({ postId: row.id, actorId: adminId, type: "status", fromStatus: "review", toStatus: p.status, note: p.status === "progress" ? "Started on this. Aiming for the next release." : undefined, createdAt: at(Math.max(0, p.days - 3)) });
    }
    if (i % 2 === 0) {
      await db.insert(schema.comment).values({ postId: row.id, authorId: members[(i + 1) % members.length]!, body: "Same boat here. We would also want the status mapping to be editable.", createdAt: at(Math.max(0, p.days - 1)) });
    }
    i++;
  }

  const seeded = await db.select({ id: schema.post.id, title: schema.post.title }).from(schema.post).where(eq(schema.post.workspaceId, ws));
  const find = (t: string) => seeded.find((p) => p.title === t)?.id;
  for (const { id } of seeded) {
    const n = (await db.select({ id: schema.comment.id }).from(schema.comment).where(eq(schema.comment.postId, id))).length;
    if (n) await db.update(schema.post).set({ commentCount: n }).where(eq(schema.post.id, id));
  }

  for (const e of ENTRIES) {
    const [row] = await db
      .insert(schema.changelogEntry)
      .values({ workspaceId: ws, title: e.title, version: e.version, body: e.body, authorId: adminId, publishedAt: at(e.days), createdAt: at(e.days) })
      .returning({ id: schema.changelogEntry.id });
    const ids = e.posts.map(find).filter((x): x is number => typeof x === "number");
    if (ids.length) await db.insert(schema.changelogPost).values(ids.map((postId) => ({ entryId: row.id, postId })));
  }

  const articles = await seedHelpCenter(db, ws, adminId);

  return { posts: POSTS.length, entries: ENTRIES.length, articles };
}

// Slugs are unique per workspace, so a second seed leaves an existing help
// center alone instead of failing on it.
export async function seedHelpCenter(db: Db, ws: string, adminId: string): Promise<number> {
  let articles = 0;
  const hasHelp = (await db.select({ id: schema.helpCollection.id }).from(schema.helpCollection).where(eq(schema.helpCollection.workspaceId, ws)).limit(1)).length > 0;
  for (const [i, c] of hasHelp ? [] : HELP.entries()) {
    const [col] = await db
      .insert(schema.helpCollection)
      .values({ workspaceId: ws, slug: c.slug, title: c.title, description: c.description, icon: c.icon, position: i })
      .returning({ id: schema.helpCollection.id });
    for (const [j, a] of c.articles.entries()) {
      const when = at(30 - articles * 4);
      await db.insert(schema.helpArticle).values({
        workspaceId: ws,
        collectionId: col.id,
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        body: a.body,
        status: "published",
        position: j,
        helpfulCount: 12 - articles * 2,
        unhelpfulCount: articles % 2,
        authorId: adminId,
        publishedAt: when,
        createdAt: when,
        updatedAt: when,
      });
      articles++;
    }
  }
  return articles;
}
