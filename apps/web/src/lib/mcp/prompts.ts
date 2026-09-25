import { z } from "zod";

// Ready-made workflows an MCP client can offer as commands. Each one is a
// plan the agent follows with the tools; nothing here writes by itself.

type Prompt = {
  name: string;
  title: string;
  description: string;
  args: Record<string, z.ZodOptional<z.ZodString>>;
  text: (args: Record<string, string | undefined>) => string;
};

const ws = (a: Record<string, string | undefined>) => (a.workspace ? ` Pass workspace: "${a.workspace}" to every tool.` : "");

export const PROMPTS: Prompt[] = [
  {
    name: "weekly-triage",
    title: "Weekly triage",
    description: "Review the week's feedback: dedupe, set statuses, reply to what is waiting.",
    args: { workspace: z.string().optional().describe("Workspace slug; leave empty for the key's home workspace") },
    text: (a) =>
      `Run a weekly triage of our openheard feedback.${ws(a)}

1. Call summarize_feedback. Show me a short overview: new this week, top voted, rising, stale planned items, and posts waiting for a reply.
2. For each new or rising post, call find_duplicates with its post_id. List likely duplicate pairs with both titles and vote counts. Do not merge yet.
3. Propose a status for each open post (planned, closed with a reason, or leave open) in one table.
4. Draft a short public reply for each post in needsReply.
5. Stop and ask me to approve. Then run what I approved: merge_posts (confirm: true only for pairs I agreed to), bulk_set_status, add_comment for the replies.
6. End with what changed, with post URLs.`,
  },
  {
    name: "setup-openheard",
    title: "Set up openheard",
    description: "Create or set up a workspace from a website: branding, boards, statuses, widget and the snippet in this codebase.",
    args: {
      website: z.string().optional().describe("Product website, e.g. https://example.com"),
      name: z.string().optional().describe("Product name"),
      workspace: z.string().optional().describe("Existing workspace slug to set up instead of creating one"),
    },
    text: (a) =>
      `Set up openheard for ${a.name ?? "this product"}${a.website ? ` (${a.website})` : ""}.

1. ${a.workspace ? `Use workspace "${a.workspace}".` : "Call list_workspaces. If one fits this product, use it (ask the user when more than one could). If none fits and the key is not limited to one workspace, call create_workspace with the name and website."}
2. ${a.website ? `Call match_website with ${a.website} and show me the name, accent, theme and logo. After I agree, call apply_branding.` : "Ask me for the product website, then match_website and apply_branding."}
3. Look at list_boards and list_statuses. Suggest 2 to 4 boards that fit the product (for example Feature requests, Bugs, Integrations) and any extra status. Create them after I agree.
4. Suggest widget settings that match the brand (configure_widget: theme, accent 'brand', launcher, position, tabs, allowed_sites with the production origin).
5. Call get_widget_snippet with the framework this repository uses (look at package.json: next, react, vue, nuxt, or plain html). Add the snippet to the root layout file it names, once, without replacing the file. Show me the diff.
6. Finish with the board URL, dashboard URL and what is left for me to do.`,
  },
  {
    name: "ship-and-announce",
    title: "Ship and announce",
    description: "Close the loop on shipped work: link posts, draft the changelog, publish it and tell voters.",
    args: {
      what: z.string().optional().describe("What shipped, in a sentence or a list of post ids"),
      version: z.string().optional().describe("Version label, e.g. v1.4.0"),
      workspace: z.string().optional().describe("Workspace slug; leave empty for the key's home workspace"),
    },
    text: (a) =>
      `We shipped ${a.what ?? "something"}${a.version ? ` in ${a.version}` : ""}. Announce it through openheard.${ws(a)}

1. Find the posts this ships: search list_posts (status planned or progress first) and find_duplicates with the description. Show me the matches with votes and ask which to link.
2. Call draft_changelog with a clear title, a short markdown body written for users (what changed, why it matters, how to use it) and the post ids.${a.version ? ` Use version ${a.version}.` : ""}
3. Show me the draft and who will hear about it: publishing moves every linked post to done, emails its voters and followers once, and emails changelog subscribers.
4. After I approve, call publish_changelog. Then add a short public comment on each linked post saying it shipped, with the changelog URL.
5. If a help article covers this feature, search_help_articles and offer an update_help_article.`,
  },
  {
    name: "reply-to-feedback",
    title: "Reply to feedback",
    description: "Read a post and its thread, then draft a reply and next step for it.",
    args: {
      post_id: z.string().optional().describe("Post id"),
      workspace: z.string().optional().describe("Workspace slug; leave empty for the key's home workspace"),
    },
    text: (a) =>
      `Help me answer feedback post ${a.post_id ?? "(ask me which one)"}.${ws(a)}

1. Call get_post and list_comments (internal notes included) and read the thread.
2. Check find_duplicates for the post, and search_help_articles for an existing answer.
3. Draft a short, friendly public reply in plain words: thank them, answer the question or say what happens next. Link a help article if one fits. No promises on dates unless the post has an ETA.
4. Suggest a status change and any internal note.
5. Wait for my go-ahead, then add_comment, set_status (with a note if it moves) and add_internal_note as agreed.`,
  },
];
