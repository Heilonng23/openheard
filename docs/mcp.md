# openheard MCP server

Run your feedback board by talking to an agent. The MCP server gives Claude Code, Cursor, Claude Desktop or any [Model Context Protocol](https://modelcontextprotocol.io) client everything an admin does in the dashboard: triage posts, merge duplicates, set statuses and reply, set up boards and statuses, brand the board from a website, configure and install the widget, write the help center, ship changelog entries, connect Slack or Discord, and invite the team. Every write runs the same code as the dashboard, emails and alerts included.

**Endpoint:** `https://<your-workspace>.openheard.com/api/mcp` (self-hosted: `https://your-domain/api/mcp`)
**Transport:** Streamable HTTP (stateless)
**Auth:** `Authorization: Bearer <key>`, a key from **Settings > API keys**

## Keys

- **Workspace key**: acts as an admin of the workspace it was made in, and nothing else. Good for a project repo or a teammate's tool.
- **Account key**: acts as you in every workspace you administer, and can create new workspaces. Tools take an optional `workspace` argument (the slug); without it the key's own workspace is used. Only admins can make one, and it stops reaching a workspace the moment you stop being an admin there.

A workspace key that names another workspace is refused, as is an account key naming a workspace you do not administer.

## Install

Make a key first: **Settings > API keys**, pick **Workspace key** or **Account key**, name it, copy it (it is shown once).

### Claude Code

```bash
claude mcp add --transport http openheard https://acme.openheard.com/api/mcp \
  --header "Authorization: Bearer oh_your_key_here"
```

Add `--scope user` to have it in every project, or `--scope project` to share it through `.mcp.json` (keep the key out of git: use `"Authorization": "Bearer ${OPENHEARD_KEY}"` there). Check with `claude mcp list`.

Install the skill as well, so the agent knows the workflows:

```bash
cp -r skills/openheard ~/.claude/skills/openheard
```

### Cursor

**Settings > MCP > Add new MCP server**, or `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openheard": {
      "url": "https://acme.openheard.com/api/mcp",
      "headers": { "Authorization": "Bearer oh_your_key_here" }
    }
  }
}
```

### Claude Desktop

Claude Desktop talks to local servers, so bridge with `mcp-remote` in `claude_desktop_config.json` (**Settings > Developer > Edit config**):

```json
{
  "mcpServers": {
    "openheard": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://acme.openheard.com/api/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer oh_your_key_here" }
    }
  }
}
```

Restart Claude Desktop after saving.

### Local dev

```bash
# Workspace key for "default", or --workspace <slug>, or an account key with --account <email>
OPENHEARD_LOCAL=1 bun run apps/web/src/scripts/make-api-key.ts --account you@example.com

claude mcp add --transport http openheard-local http://localhost:3001/api/mcp \
  --header "Authorization: Bearer oh_your_key_here"
```

## How the tools behave

- **Names or ids.** Boards, statuses and tags accept their name or id; statuses also their label (`"In progress"`).
- **Helpful errors.** A miss says what exists: `Board 'bugs' not found; boards are: 'acme-features (Feature requests)'`.
- **Compact output.** Lists return ids, titles, counts and URLs; long bodies are cut to an excerpt unless you pass `include_body: true`.
- **Idempotent where it can be.** Setting the current status, voting twice, creating a board or tag that exists, publishing a published entry: all return the current state and change nothing.
- **Destructive tools need `confirm: true`.** `delete_*`, `merge_posts` and `disconnect` refuse without it. Agents are told to ask you first.
- **Annotations.** Every tool carries MCP `readOnlyHint` / `destructiveHint` / `idempotentHint`, so clients can auto-approve reads and ask before deletes.

## Prompts

Clients that show MCP prompts (Claude Code lists them as `/mcp__openheard__<name>`) get four ready-made workflows:

| Prompt | What it does |
|--------|--------------|
| `weekly-triage` | Summarize the week, find duplicates, propose statuses and replies, then apply what you approve |
| `setup-openheard` | Create or brand a workspace from a website, add boards and statuses, configure the widget and insert the snippet into this codebase |
| `ship-and-announce` | Find the posts a release ships, draft the changelog, publish it (voters and subscribers are emailed) and reply on each post |
| `reply-to-feedback` | Read a post and its thread, check duplicates and help articles, draft a reply and a status change |

## Tools

Every workspace tool also takes `workspace` (account keys only).

### Workspaces and branding

| Tool | What it does | Kind |
|------|--------------|------|
| `list_workspaces` | List the workspaces this key can act on, with your role and board URL. | read |
| `create_workspace` | Create a new workspace (a feedback board with roadmap, changelog and help center) owned by you. | write |
| `get_workspace` | Read the workspace's settings: name, description, branding, public board tabs, who can post, approval and email settings, and its URLs. | read |
| `update_workspace` | Change workspace settings. | write |
| `match_website` | Preview the brand of a website: name, accent colour, theme and logo. | read |
| `apply_branding` | Apply a brand to the workspace. | write |

### Posts

| Tool | What it does | Kind |
|------|--------------|------|
| `list_posts` | List feedback posts, newest, top voted or trending. | read |
| `get_post` | Read one post in full: body, public comments, status history, images and similar posts that may be duplicates. | read |
| `create_post` | Create a feedback post on a board, for example from a support email or a call note. | write |
| `update_post` | Edit a post: title, body, board, tags, ETA or pin. | write |
| `set_status` | Move a post to a status (e.g. | write |
| `bulk_set_status` | Move several posts to one status at once, e.g. | write |
| `merge_posts` | Merge a duplicate into the post that stays. | needs `confirm: true` |
| `delete_post` | Delete a post with its votes and comments, for spam or test posts. | needs `confirm: true` |
| `vote` | Vote on a post as the key's owner, for example when a customer asked for it in a call. | write |
| `add_comment` | Post a public reply on a post as the key's owner. | write |
| `add_internal_note` | Add a note on a post that only the team sees in the dashboard, e.g. | write |
| `list_comments` | List a post's comments oldest first, including internal notes (marked internal: true). | read |

### Boards, statuses and tags

| Tool | What it does | Kind |
|------|--------------|------|
| `list_boards` | List boards with their ids and post counts. | read |
| `create_board` | Add a board, e.g. | write |
| `update_board` | Rename a board or change its description. | write |
| `delete_board` | Delete an empty board. | needs `confirm: true` |
| `list_statuses` | List statuses in board order with key, label, colour, kind (open, review, planned, progress, done, closed), whether they show on the roadmap, and post counts. | read |
| `create_status` | Add a status. | write |
| `update_status` | Change a status's label, colour, kind, roadmap placement or position. | write |
| `delete_status` | Delete a status no post uses. | needs `confirm: true` |
| `reorder_statuses` | Set the status order used on the board and roadmap. | write |
| `list_tags` | List tags with their ids. | read |
| `create_tag` | Add a tag for grouping posts across boards, e.g. | write |
| `update_tag` | Rename a tag. | write |
| `delete_tag` | Delete a tag and remove it from every post. | needs `confirm: true` |

### Widget

| Tool | What it does | Kind |
|------|--------------|------|
| `get_widget_settings` | Read how the embeddable feedback widget looks and which sites may embed it. | read |
| `configure_widget` | Change the widget's look, tabs or allowed sites. | write |
| `get_widget_snippet` | Get the exact script tag that embeds the widget, plus where to put it for a framework (Next.js, React, Vue, Nuxt, plain HTML). | read |

### Help center

| Tool | What it does | Kind |
|------|--------------|------|
| `list_help` | List help collections and every article, drafts included, with status and URL. | read |
| `search_help_articles` | Search published help articles by keywords, best match first. | read |
| `get_help_article` | Read one help article with its full markdown body, drafts included. | read |
| `create_help_article` | Write a help center article. | write |
| `update_help_article` | Edit a help article. | write |
| `publish_help_article` | Publish a draft help article so readers and the widget can find it. | write |
| `unpublish_help_article` | Turn a published help article back into a draft. | write |
| `delete_help_article` | Delete a help article. | needs `confirm: true` |
| `create_help_collection` | Add a collection that groups help articles. | write |
| `update_help_collection` | Edit a help collection. | write |
| `delete_help_collection` | Delete a help collection. | needs `confirm: true` |

### Changelog

| Tool | What it does | Kind |
|------|--------------|------|
| `list_changelog` | List changelog entries newest first, drafts included, with linked posts. | read |
| `draft_changelog` | Write a changelog entry as a draft, linking the posts it ships. | write |
| `update_changelog` | Edit a changelog entry. | write |
| `publish_changelog` | Publish a draft. | write |
| `delete_changelog` | Delete a changelog entry. | needs `confirm: true` |

### Integrations

| Tool | What it does | Kind |
|------|--------------|------|
| `list_integrations` | List connected Slack, Discord and webhook destinations with their events and last delivery. | read |
| `connect_slack` | Send new posts, comments, status changes and changelog releases to a Slack channel through an incoming webhook URL (hooks.slack.com). | write |
| `connect_discord` | Send feedback events to a Discord channel through its webhook URL (discord.com/api/webhooks/...). | write |
| `connect_webhook` | POST signed JSON for feedback events to your own HTTPS endpoint. | write |
| `send_test` | Send a sample message to a connected Slack, Discord or webhook destination and report whether it arrived. | write |
| `disconnect` | Remove a Slack, Discord or webhook connection. | needs `confirm: true` |

### Team

| Tool | What it does | Kind |
|------|--------------|------|
| `list_members` | List team members with their role, and invites not yet accepted. | read |
| `invite_member` | Email someone an invite to the team. | write |

### Insights

| Tool | What it does | Kind |
|------|--------------|------|
| `summarize_feedback` | One-call overview for triage: post counts by status and board, new posts this week, top voted open requests, posts rising this week, planned or in-progress items with no status change for a while, and open posts nobody on the team has answered. | read |
| `find_duplicates` | Find posts that look like the same request, by shared title words, for a post id or for text you are about to post. | read |

## Rate limits

60 requests per minute per key, account keys included (per IP without a key). Over the limit the server answers `429` with `Retry-After`. Website matching (`match_website`, `apply_branding`, `create_workspace` with a website) has its own limit of 5 a minute and 30 an hour per person.

## Example

> **You:** Triage this week's feedback.
>
> **Claude:** *(summarize_feedback, then find_duplicates on the new posts)* 14 new posts. "CSV export times out" looks like a duplicate of #71 "Export to CSV fails on large boards" (9 votes). Merge it? I would also move #64 and #70 to planned and reply to the three unanswered posts; drafts below.
>
> **You:** Yes to all.
>
> **Claude:** *(merge_posts with confirm: true, bulk_set_status, add_comment x3)* Done. Links: ...

## Runtime

The server uses the Web Standards Streamable HTTP transport (`WebStandardStreamableHTTPServerTransport`), stateless, one server per request. It runs on Cloudflare Workers in production and on Bun or Node locally.
