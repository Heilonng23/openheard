// End-to-end run of the MCP server against local dev, printing a markdown
// transcript. Usage: bun run src/scripts/mcp-e2e.ts <origin> <key> > transcript.md
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [origin = "http://localhost:3140", key = ""] = process.argv.slice(2);
const client = new Client({ name: "openheard-e2e", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", origin), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));

const out: string[] = [];
const log = (s: string) => out.push(s);
let step = 0;

async function call(name: string, args: Record<string, unknown> = {}, note?: string) {
  step++;
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const text = r.content[0]!.text;
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // plain error text
  }
  if (pretty.length > 2500) pretty = pretty.slice(0, 2500) + "\n… (cut)";
  log(`### ${step}. ${name}${r.isError ? " (error)" : ""}`);
  if (note) log(note);
  log("```json\n// arguments\n" + JSON.stringify(args, null, 2) + "\n```");
  log("```json\n// result\n" + pretty + "\n```\n");
  if (r.isError) return { error: text };
  return JSON.parse(text);
}

const { tools } = await client.listTools();
const { prompts } = await client.listPrompts();
log(`# MCP end-to-end run\n\nServer: ${origin}/api/mcp, account key. ${tools.length} tools, ${prompts.length} prompts: ${prompts.map((p) => p.name).join(", ")}.\n`);
log(`Tools: ${tools.map((t) => t.name).join(", ")}\n`);

const slug = `northwind-${Date.now().toString(36).slice(-4)}`;
await call("list_workspaces");
await call("match_website", { url: "https://linear.app" }, "Preview only; nothing changes.");
const created = await call("create_workspace", { name: "Northwind feedback", slug, website: "https://linear.app" });
const ws = created.id as string;
await call("get_workspace", { workspace: ws });
const bugs = await call("create_board", { workspace: ws, name: "Bugs", description: "Something is broken" });
await call("create_board", { workspace: ws, name: "Integrations", description: "Connect Northwind to other tools" });
await call("create_board", { workspace: ws, name: "Bugs" }, "Same name again: returns the existing board instead of a duplicate.");
await call("create_status", { workspace: ws, label: "Beta", kind: "progress", color: "#b08cff", on_roadmap: true, position: 4 });
await call("list_statuses", { workspace: ws });
await call("configure_widget", { workspace: ws, accent: "#ff0" }, "A bad accent is refused with the reason.");
await call("configure_widget", { workspace: ws, theme: "auto", accent: "brand", launcher: "label", label: "Feedback", position: "bottom-left", tabs: ["feedback", "changelog"], allowed_sites: ["https://northwind.example"] });
await call("get_widget_snippet", { workspace: ws, framework: "next" });
const a = await call("create_post", { workspace: ws, board: "Bugs", title: "Export to CSV fails on large boards", body: "Times out after 30s with 2k posts." });
const b = await call("create_post", { workspace: ws, board: bugs.id, title: "CSV export times out", body: "Same here, big workspace." });
await call("vote", { workspace: ws, post_id: a.id });
await call("find_duplicates", { workspace: ws, post_id: b.id });
await call("merge_posts", { workspace: ws, from: b.id, into: a.id }, "Without confirm the merge is refused.");
await call("merge_posts", { workspace: ws, from: b.id, into: a.id, confirm: true });
await call("set_status", { workspace: ws, post_id: a.id, status: "In progress", note: "Picked up this week" });
await call("add_internal_note", { workspace: ws, post_id: a.id, body: "Two enterprise accounts asked for this." });
await call("list_comments", { workspace: ws, post_id: a.id });
const col = await call("create_help_collection", { workspace: ws, title: "Getting started", icon: "rocket" });
const art = await call("create_help_article", { workspace: ws, title: "How do I export my posts?", body: "Open **Settings > Export** and pick CSV.\n\nLarge boards export in the background.", collection_id: col.id });
await call("publish_help_article", { workspace: ws, id: art.id });
const page = await fetch(art.url);
log(`Public help page ${art.url} answered HTTP ${page.status}.\n`);
const entry = await call("draft_changelog", { workspace: ws, title: "Faster CSV export", body: "Exports of any size now finish in seconds.", version: "v1.1.0", post_ids: [a.id] });
await call("publish_changelog", { workspace: ws, id: entry.id });
await call("publish_changelog", { workspace: ws, id: entry.id }, "Publishing twice does nothing.");
await call("get_post", { workspace: ws, id: a.id });
await call("summarize_feedback", { workspace: ws });
await call("list_posts", { workspace: "peazehub-nope" }, "A workspace the owner does not administer is refused.");

console.log(out.join("\n"));
await client.close();
