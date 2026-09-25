// Who gets a status or changelog email, run against the real schema, plus the
// signed links inside those emails.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openheard/env/server", () => ({ env: {} }));

import { signEmailToken, verifyEmailToken } from "./email-token";
import { buildChangelogEmails, buildStatusEmails, changelogRecipients, deliver, pickRecipients, statusRecipients } from "./notify";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;
const KEY = "test-secret-not-a-real-one-32chars";

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzle(client, { schema }) as unknown as Db;
}

const WS = { id: "acme", name: "Acme", statusEmails: true };
const ADMIN = { id: "admin", email: "admin@acme.test" };
let db: Db;

beforeEach(async () => {
  db = await freshDb();
  await db.insert(schema.workspace).values([{ id: "acme", name: "Acme" }, { id: "other", name: "Other" }, { id: "demo", name: "Demo" }]);
  await db.insert(schema.user).values(
    ["admin", "author", "voter", "commenter", "both", "quiet", "outsider"].map((id) => ({ id, name: id, email: `${id === "both" ? "Both" : id}@acme.test` })),
  );
  await db.insert(schema.board).values({ id: "b", workspaceId: "acme", name: "Ideas" });
  await db.insert(schema.post).values([
    { id: 1, workspaceId: "acme", boardId: "b", authorId: "author", title: "Dark mode" },
    { id: 2, workspaceId: "acme", boardId: "b", authorId: "admin", title: "CSV export" },
  ]);
  await db.insert(schema.vote).values([
    { postId: 1, userId: "voter" },
    { postId: 1, userId: "both" },
    { postId: 1, userId: "admin" },
    { postId: 1, userId: "quiet" },
    { postId: 2, userId: "both" },
  ]);
  await db.insert(schema.anonymousVote).values({ postId: 1, anonToken: "anon-cookie" });
  await db.insert(schema.comment).values([
    { postId: 1, authorId: "commenter", body: "yes please" },
    { postId: 1, authorId: "both", body: "and me" },
    { postId: 1, authorId: "admin", body: "on it" },
  ]);
  await db.insert(schema.emailOptout).values({ workspaceId: "acme", email: "quiet@acme.test", kind: "status" });
});

const emails = (rs: { email: string }[]) => rs.map((r) => r.email).sort();

describe("pickRecipients", () => {
  it("dedupes by address, case-insensitively", () => {
    const out = pickRecipients(
      [
        { userId: "a", email: "Sam@x.test" },
        { userId: "a", email: "sam@x.test" },
        { userId: null, email: " SAM@x.test " },
      ],
      { optedOut: new Set() },
    );
    expect(out).toEqual([{ userId: "a", email: "sam@x.test" }]);
  });

  it("drops the actor by id and by address, opted-out, demo and reserved addresses", () => {
    const out = pickRecipients(
      [
        { userId: "me", email: "me@x.test" },
        { userId: null, email: "ME@x.test" },
        { userId: "gone", email: "gone@x.test" },
        { userId: "demo-admin", email: "admin@demo.invalid" },
        { userId: "x", email: "someone@example.invalid" },
        { userId: "x", email: "" },
        { userId: "ok", email: "ok@x.test" },
      ],
      { actorId: "me", actorEmail: "me@x.test", optedOut: new Set(["gone@x.test"]) },
    );
    expect(emails(out)).toEqual(["ok@x.test"]);
  });
});

describe("status change recipients", () => {
  it("is the author, voters and commenters once each, minus the actor and opt-outs", async () => {
    const out = await statusRecipients(db, WS, [1], ADMIN);
    // both@ voted and commented: one email. admin moved it: none. quiet@
    // unsubscribed. The anonymous vote has no address and cannot appear.
    expect(emails(out)).toEqual(["author@acme.test", "both@acme.test", "commenter@acme.test", "voter@acme.test"]);
  });

  it("is nobody when the workspace turned status emails off", async () => {
    expect(await statusRecipients(db, { ...WS, statusEmails: false }, [1], ADMIN)).toEqual([]);
  });

  it("is nobody in the demo workspace", async () => {
    expect(await statusRecipients(db, { ...WS, id: "demo" }, [1], ADMIN)).toEqual([]);
  });

  it("only honours opt-outs from the same workspace", async () => {
    await db.insert(schema.emailOptout).values({ workspaceId: "other", email: "voter@acme.test", kind: "status" });
    expect(emails(await statusRecipients(db, WS, [1], ADMIN))).toContain("voter@acme.test");
  });

  it("builds one email per person with a signed unsubscribe link and one-click header", async () => {
    const out = await buildStatusEmails({
      db,
      workspace: WS,
      origin: "https://acme.example.com",
      actor: ADMIN,
      change: { postId: 1, postTitle: "Dark <mode>", from: { label: "Planned", color: "#cdb37a" }, to: { label: "Shipped", color: "#7fb894" }, note: "Out today" },
      key: KEY,
    });
    expect(out).toHaveLength(4);
    const mail = out.find((m) => m.to === "voter@acme.test")!;
    expect(mail.subject).toBe("Dark <mode> is now shipped");
    expect(mail.html).toContain("Dark &lt;mode&gt;");
    expect(mail.html).toContain("Out today");
    expect(mail.html).toContain("https://acme.example.com/p/1");
    const token = mail.html.match(/unsubscribe\?t=([\w.-]+)/)![1];
    expect(await verifyEmailToken(token, KEY)).toMatchObject({ k: "status", w: "acme", e: "voter@acme.test" });
    expect(mail.headers?.["List-Unsubscribe"]).toContain("/api/unsubscribe?t=");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("changelog recipients", () => {
  beforeEach(async () => {
    const now = new Date();
    await db.insert(schema.changelogSubscriber).values([
      { workspaceId: "acme", email: "reader@elsewhere.test", confirmedAt: now },
      { workspaceId: "acme", email: "voter@acme.test", confirmedAt: now },
      { workspaceId: "acme", email: "pending@elsewhere.test", confirmedAt: null },
      { workspaceId: "acme", email: "left@elsewhere.test", confirmedAt: now },
      { workspaceId: "acme", email: "admin@acme.test", confirmedAt: now },
      { workspaceId: "other", email: "stranger@elsewhere.test", confirmedAt: now },
    ]);
    await db.insert(schema.emailOptout).values({ workspaceId: "acme", email: "left@elsewhere.test", kind: "changelog" });
  });

  it("merges followers of linked posts with confirmed subscribers, one each", async () => {
    const out = await changelogRecipients(db, WS, [1, 2], ADMIN);
    expect(emails(out)).toEqual(["author@acme.test", "both@acme.test", "commenter@acme.test", "reader@elsewhere.test", "voter@acme.test"]);
    expect(out.find((r) => r.email === "voter@acme.test")).toMatchObject({ follows: true, subscribed: true });
    expect(out.find((r) => r.email === "reader@elsewhere.test")).toMatchObject({ follows: false, subscribed: true });
  });

  it("still reaches subscribers when status emails are off", async () => {
    const out = await changelogRecipients(db, { ...WS, statusEmails: false }, [1], ADMIN);
    expect(emails(out)).toEqual(["reader@elsewhere.test", "voter@acme.test"]);
  });

  it("gives someone who is both a link for each kind", async () => {
    const out = await buildChangelogEmails({ db, workspace: WS, origin: "https://acme.example.com", actor: ADMIN, entry: { title: "Dark mode", version: "v1.2", body: "It is here." }, posts: [{ id: 1, title: "Dark mode" }], key: KEY });
    const mail = out.find((m) => m.to === "voter@acme.test")!;
    expect(mail.html).toContain("Stop emails about posts you follow");
    expect(mail.html).toContain("Stop changelog emails");
    const reader = out.find((m) => m.to === "reader@elsewhere.test")!;
    expect(reader.html).not.toContain("Stop emails about posts you follow");
    expect(reader.subject).toBe("Acme shipped: Dark mode");
  });
});

describe("email tokens", () => {
  it("round-trips and normalises the address", async () => {
    const t = await signEmailToken({ k: "changelog", w: "acme", e: "Sam@X.test" }, KEY);
    expect(await verifyEmailToken(t, KEY)).toEqual({ k: "changelog", w: "acme", e: "sam@x.test" });
  });

  it("rejects another secret, a tampered body and junk", async () => {
    const t = await signEmailToken({ k: "status", w: "acme", e: "sam@x.test" }, KEY);
    expect(await verifyEmailToken(t, "another-secret-entirely-32-chars!")).toBeNull();
    const [, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ k: "status", w: "other", e: "sam@x.test" })).replace(/=+$/, "");
    expect(await verifyEmailToken(`${forged}.${sig}`, KEY)).toBeNull();
    expect(await verifyEmailToken("nope", KEY)).toBeNull();
    expect(await verifyEmailToken(`${t}.extra`, KEY)).toBeNull();
  });

  it("expires confirm links and refuses one with no expiry", async () => {
    const t = await signEmailToken({ k: "confirm", w: "acme", e: "sam@x.test", x: 1000 }, KEY);
    expect(await verifyEmailToken(t, KEY, 999)).toMatchObject({ k: "confirm" });
    expect(await verifyEmailToken(t, KEY, 1001)).toBeNull();
    const forever = await signEmailToken({ k: "confirm", w: "acme", e: "sam@x.test" }, KEY);
    expect(await verifyEmailToken(forever, KEY)).toBeNull();
  });
});

describe("deliver", () => {
  const msg = (to: string) => ({ to, subject: "s", html: "h", text: "t" });

  it("retries a rate limit, stops at the daily cap and never throws", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const send = vi.fn(async (to: string) => {
      calls++;
      if (to === "slow@x.test" && calls < 3) return { ok: false, code: "E_RATE_LIMIT_EXCEEDED" };
      if (to === "cap@x.test") return { ok: false, code: "E_DAILY_LIMIT_EXCEEDED" };
      return { ok: true };
    });
    const run = deliver([msg("slow@x.test")], send);
    await vi.runAllTimersAsync();
    expect(await run).toEqual({ sent: 1, failed: 0, skipped: 0 });
    vi.useRealTimers();

    const capped = await deliver([msg("cap@x.test"), ...Array.from({ length: 10 }, (_, i) => msg(`p${i}@x.test`))], send);
    expect(capped.failed).toBeGreaterThanOrEqual(1);
    expect(capped.skipped).toBeGreaterThan(0);
  });
});
