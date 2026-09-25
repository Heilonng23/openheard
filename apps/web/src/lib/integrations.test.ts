// Outbound alerts: which URLs are accepted, which events go where, what the
// messages look like, and that delivery retries once, records the outcome and
// never fires for the demo workspace.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { integration } from "@openheard/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openheard/env/server", () => ({ env: { BETTER_AUTH_SECRET: "test-secret-not-a-real-one-32chars" } }));
vi.mock("@openheard/db", async () => ({ ...(await import("@openheard/db/schema/index")) }));

import { checkWebhookHost, deliver, dispatchEvent, seal, unseal } from "./integration-db";
import {
  type AlertEvent,
  checkIntegrationUrl,
  discordPayload,
  isPrivateIPv4,
  isPrivateIPv6,
  metaLine,
  ownedBoards,
  signBody,
  slackPayload,
  urlHint,
  wantsEvent,
  webhookPayload,
} from "./integrations";

const publicDns = async () => ["93.184.215.14"];

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return drizzle(client, { schema }) as unknown as Db;
}

const event: AlertEvent = {
  type: "post.created",
  workspace: { id: "acme", name: "Acme" },
  boardId: "features",
  url: "https://acme.openheard.com/p/7",
  title: "Dark mode <!channel> & more",
  author: "Sam",
  status: "Planned",
  votes: 12,
  postId: 7,
  at: "2026-09-25T12:00:00.000Z",
};

describe("checkIntegrationUrl", () => {
  it("accepts real Slack and Discord webhook hosts", () => {
    expect(checkIntegrationUrl("slack", "https://hooks.slack.com/services/T0/B0/abc").ok).toBe(true);
    expect(checkIntegrationUrl("discord", "https://discord.com/api/webhooks/123/tok-en_1").ok).toBe(true);
    expect(checkIntegrationUrl("discord", "https://discordapp.com/api/webhooks/123/tok").ok).toBe(true);
  });

  it("rejects look-alike hosts, http, ports and credentials", () => {
    for (const url of [
      "http://hooks.slack.com/services/T0/B0/abc",
      "https://hooks.slack.com.evil.com/services/T0/B0/abc",
      "https://evil.com/hooks.slack.com/services/x",
      "https://hooks.slack.com:8443/services/T0/B0/abc",
      "https://user:pw@hooks.slack.com/services/T0/B0/abc",
      "https://hooks.slack.com/",
    ])
      expect(checkIntegrationUrl("slack", url).ok, url).toBe(false);
    for (const url of ["https://discord.com/api/other/123/tok", "https://discord.com.evil.io/api/webhooks/1/t", "https://cdn.discord.com/api/webhooks/1/t"])
      expect(checkIntegrationUrl("discord", url).ok, url).toBe(false);
  });

  it("lets a plain webhook go to any public https host", () => {
    expect(checkIntegrationUrl("webhook", "https://example.com/hook?x=1").ok).toBe(true);
    for (const url of ["http://example.com/hook", "https://localhost/hook", "https://127.0.0.1/x", "https://10.0.0.4/x", "https://192.168.1.1/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://2130706433/x", "https://intranet/x", "https://db.internal/x", "https://example.com:8080/x", "https://100.64.0.1/x", "https://0.0.0.0/x", "https://0x7f000001/x", "https://printer.local/x"])
      expect(checkIntegrationUrl("webhook", url).ok, url).toBe(false);
    expect(checkIntegrationUrl("webhook", "https://93.184.215.14/x").ok).toBe(true);
  });

  it("allows localhost only when local dev asks for it", () => {
    expect(checkIntegrationUrl("webhook", "http://localhost:4555/hook").ok).toBe(false);
    expect(checkIntegrationUrl("webhook", "http://localhost:4555/hook", { allowLocal: true }).ok).toBe(true);
    expect(checkIntegrationUrl("slack", "http://localhost:4555/hook", { allowLocal: true }).ok).toBe(false);
  });

  it("shows only the last four characters back", () => {
    expect(urlHint("https://hooks.slack.com/services/T0/B0/abcdWXYZ")).toBe("WXYZ");
  });
});

describe("private addresses", () => {
  it("covers loopback, private, link-local, shared and reserved IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "100.127.255.255", "0.0.0.0", "198.18.0.1", "224.0.0.1", "255.255.255.255", "nonsense"])
      expect(isPrivateIPv4(ip), ip).toBe(true);
    for (const ip of ["93.184.215.14", "8.8.8.8", "172.32.0.1", "100.128.0.1", "1.1.1.1"]) expect(isPrivateIPv4(ip), ip).toBe(false);
  });

  it("covers IPv6 loopback, unique-local, link-local and IPv4 embedded in IPv6", () => {
    for (const ip of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a9fe:a9fe", "2002:c0a8:0101::1", "2001:db8::1", "::127.0.0.1", "zz::1"])
      expect(isPrivateIPv6(ip), ip).toBe(true);
    for (const ip of ["2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8"]) expect(isPrivateIPv6(ip), ip).toBe(false);
  });
});

describe("checkWebhookHost", () => {
  it("passes a name whose every answer is public", async () => {
    expect(await checkWebhookHost("https://hooks.example.com/x", async () => ["93.184.215.14", "2606:4700::1"])).toBeNull();
  });

  it("refuses a public name that resolves to a private address", async () => {
    for (const answers of [["127.0.0.1"], ["93.184.215.14", "10.0.0.5"], ["169.254.169.254"], ["::1"], ["fd00::7"], ["::ffff:192.168.1.1"]])
      expect(await checkWebhookHost("https://rebind.example.com/x", async () => answers), answers.join()).toBe("That host is not reachable from openheard");
  });

  it("refuses names that do not resolve or cannot be looked up", async () => {
    expect(await checkWebhookHost("https://gone.example.com/x", async () => [])).toBe("gone.example.com does not resolve");
    expect(await checkWebhookHost("https://x.example.com/x", async () => Promise.reject(new Error("down")))).toBe("Could not look up x.example.com");
  });

  it("re-applies the URL rules, so a stored private or http URL is never sent", async () => {
    expect(await checkWebhookHost("https://10.0.0.1/x", publicDns)).not.toBeNull();
    expect(await checkWebhookHost("http://example.com/x", publicDns)).toBe("Webhook URLs must use https");
    expect(await checkWebhookHost("https://metadata.google.internal/x", publicDns)).not.toBeNull();
  });

  it("stops delivery before any request goes out", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const result = await deliver("webhook", "https://rebind.example.com/h", null, event, fetchImpl, 0, async () => ["192.168.0.10"]);
    expect(result).toEqual({ ok: false, error: "That host is not reachable from openheard" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not follow redirects", async () => {
    const inits: RequestInit[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      inits.push(init);
      return new Response(null, { status: 302, headers: { location: "https://10.0.0.1/" } });
    }) as unknown as typeof fetch;
    const result = await deliver("webhook", "https://example.com/h", null, event, fetchImpl, 0, publicDns);
    expect(result.ok).toBe(false);
    expect(inits.every((i) => i.redirect === "manual")).toBe(true);
  });
});

describe("ownedBoards", () => {
  it("keeps picked boards that still exist and treats no pick as every board", () => {
    expect(ownedBoards(["a", "gone", "a"], ["a", "b"])).toEqual(["a"]);
    expect(ownedBoards(null, ["a"])).toBeNull();
    expect(ownedBoards([], ["a"])).toBeNull();
  });

  it("refuses a pick where no board is left instead of widening it to every board", () => {
    expect(() => ownedBoards(["gone"], ["a", "b"])).toThrow(/no longer exist/);
    expect(() => ownedBoards(["other-workspace-board"], [])).toThrow(/no longer exist/);
  });
});

describe("wantsEvent", () => {
  const rule = { enabled: true, events: ["post.created" as const, "changelog.published" as const], boardIds: ["features"] };
  it("filters by event and board", () => {
    expect(wantsEvent(rule, "post.created", "features")).toBe(true);
    expect(wantsEvent(rule, "post.created", "bugs")).toBe(false);
    expect(wantsEvent(rule, "comment.created", "features")).toBe(false);
  });
  it("sends changelog releases whatever boards are picked", () => {
    expect(wantsEvent(rule, "changelog.published", null)).toBe(true);
  });
  it("matches nothing when every picked board was deleted", () => {
    expect(wantsEvent({ ...rule, boardIds: ["deleted"] }, "post.created", "features")).toBe(false);
  });

  it("treats no board list as every board, and paused as nothing", () => {
    expect(wantsEvent({ ...rule, boardIds: null }, "post.created", "bugs")).toBe(true);
    expect(wantsEvent({ ...rule, enabled: false }, "post.created", "features")).toBe(false);
  });
});

describe("payloads", () => {
  it("builds a compact Slack message and escapes mentions", () => {
    const p = slackPayload(event);
    const text = p.blocks[0]!.text.text;
    expect(text).toContain("<https://acme.openheard.com/p/7|Dark mode &lt;!channel&gt; &amp; more>");
    expect(text).toContain("New post · by Sam · Planned · 12 votes");
    expect(text).not.toContain("<!channel>");
  });

  it("builds a Discord embed that cannot ping anyone", () => {
    const p = discordPayload(event);
    expect(p.allowed_mentions.parse).toEqual([]);
    expect(p.embeds[0]).toMatchObject({ title: event.title, url: event.url, description: "New post · by Sam · Planned · 12 votes", footer: { text: "Acme" } });
  });

  it("shows the status move on a status change", () => {
    expect(metaLine({ ...event, type: "post.status_changed", fromStatus: "Planned", status: "In progress" })).toBe("Status changed · by Sam · Planned → In progress · 12 votes");
  });

  it("gives webhooks the whole event as JSON", () => {
    expect(webhookPayload(event)).toMatchObject({ event: "post.created", test: false, workspace: { id: "acme" }, data: { postId: 7, votes: 12, status: "Planned", boardId: "features" } });
  });
});

describe("signature", () => {
  it("is an HMAC-SHA256 of timestamp.body a receiver can recompute", async () => {
    const body = JSON.stringify({ hello: "world" });
    const header = await signBody("whsec_test", body, 1_700_000_000);
    const expected = createHmac("sha256", "whsec_test").update(`1700000000.${body}`).digest("hex");
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });

  it("is sent on webhook deliveries only", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("ok");
    }) as unknown as typeof fetch;
    await deliver("webhook", "https://example.com/h", "whsec_x", event, fetchImpl, 0, publicDns);
    await deliver("slack", "https://hooks.slack.com/services/a/b/c", "whsec_x", event, fetchImpl);
    const [hook, slack] = calls.map((c) => c.init.headers as Record<string, string>);
    const expected = await signBody("whsec_x", calls[0]!.init.body as string, Math.floor(Date.parse(event.at) / 1000));
    expect(hook!["x-openheard-signature"]).toBe(expected);
    expect(hook!["x-openheard-event"]).toBe("post.created");
    expect(slack!["x-openheard-signature"]).toBeUndefined();
  });
});

describe("sealing", () => {
  it("round-trips and never stores the plain URL", async () => {
    const url = "https://hooks.slack.com/services/T0/B0/secret";
    const sealed = await seal(url);
    expect(sealed).not.toContain("secret");
    expect(await unseal(sealed)).toBe(url);
    await expect(unseal(sealed, "a-different-secret-entirely-32ch")).rejects.toThrow();
  });
});

describe("delivery", () => {
  it("retries once, then reports the error", async () => {
    let n = 0;
    const flaky = (async () => (++n === 1 ? new Response("busy", { status: 503 }) : new Response("ok"))) as unknown as typeof fetch;
    expect(await deliver("slack", "https://hooks.slack.com/services/a/b/c", null, event, flaky, 0)).toEqual({ ok: true });
    expect(n).toBe(2);
    const dead = (async () => new Response("no_service", { status: 404 })) as unknown as typeof fetch;
    expect(await deliver("slack", "https://hooks.slack.com/services/a/b/c", null, event, dead, 0)).toEqual({ ok: false, error: "HTTP 404: no_service" });
  });
});

describe("dispatchEvent", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
    for (const id of ["acme", "demo"]) {
      await db.insert(schema.workspace).values({ id, name: id === "acme" ? "Acme" : "Demo" });
      await db.insert(schema.status).values({ workspaceId: id, key: "open", label: "Pending", color: "#fff", kind: "open" });
      await db.insert(schema.board).values({ id: `${id}-features`, workspaceId: id, name: "Features" });
      await db.insert(schema.board).values({ id: `${id}-bugs`, workspaceId: id, name: "Bugs" });
      await db.insert(integration).values({
        id: `${id}-slack`,
        workspaceId: id,
        kind: "slack",
        urlEnc: await seal("https://hooks.slack.com/services/a/b/c"),
        urlHint: "/b/c",
        events: JSON.stringify(["post.created"]),
        boardIds: JSON.stringify([`${id}-features`]),
      });
    }
  });

  async function newPost(ws: string, boardId: string) {
    const [p] = await db.insert(schema.post).values({ workspaceId: ws, boardId, title: "Export to CSV", voteCount: 3 }).returning({ id: schema.post.id });
    return p!.id;
  }

  it("delivers matching events and records the result", async () => {
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(init.body as string);
      return new Response("ok");
    }) as unknown as typeof fetch;
    const postId = await newPost("acme", "acme-features");
    expect(await dispatchEvent(db, "acme", { type: "post.created", postId }, "https://acme.test", fetchImpl)).toBe(1);
    expect(bodies[0]).toContain("https://acme.test/p/");
    expect(bodies[0]).toContain("Pending · 3 votes");
    const [row] = await db.select().from(integration).where(eq(integration.id, "acme-slack"));
    expect(row!.lastStatus).toBe("ok");
  });

  it("skips boards that are not picked", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const postId = await newPost("acme", "acme-bugs");
    expect(await dispatchEvent(db, "acme", { type: "post.created", postId }, "https://acme.test", fetchImpl)).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never fires for the demo workspace", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const postId = await newPost("demo", "demo-features");
    expect(await dispatchEvent(db, "demo", { type: "post.created", postId }, "https://demo.test", fetchImpl)).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
