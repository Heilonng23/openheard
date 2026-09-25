---
name: openheard
description: Run an openheard feedback board through its MCP server - connect it, set up a workspace from a website, install the widget in this codebase, triage and dedupe feedback, reply, ship and announce changelog entries, keep the help center current. Use when the user mentions openheard, feedback triage, their roadmap, changelog, help center or feedback widget.
---

# openheard

openheard is a feedback board with voting, a roadmap, a changelog, a help center and an embeddable widget. Its MCP server (`/api/mcp`) exposes every admin action as a tool. Every write runs the dashboard's own code, so status changes and changelog publishes email real people.

## Rules

- Ask before anything people will see or get emailed: `set_status` (emails followers), `publish_changelog` (emails voters and subscribers), `add_comment` (public), `invite_member`.
- Destructive tools (`delete_*`, `merge_posts`, `disconnect`) need `confirm: true`. Show what goes, get a yes, then set it.
- With an account key, run `list_workspaces` first and pass `workspace` on every call. Never guess a slug.
- Boards, statuses and tags accept names. When a call fails, the error lists what exists; use that list rather than guessing again.
- Link things in replies: every result carries a `url`.

## 1. Connect

If the `openheard` tools are missing, the server is not connected:

1. The user makes a key: **Settings > API keys**. Pick **Account key** to manage several workspaces or create new ones; pick **Workspace key** for one board.
2. Add it (Claude Code):
   ```bash
   claude mcp add --transport http openheard https://<workspace>.openheard.com/api/mcp --header "Authorization: Bearer oh_..."
   ```
   Self-hosted: use the install's own origin. Cursor and Claude Desktop: see [reference/install.md](reference/install.md).
3. Check with `get_workspace`.

Never paste the key into a committed file. For `.mcp.json` use `${OPENHEARD_KEY}` from the environment.

## 2. Set up a new workspace

1. `match_website` with the product site. Show the name, accent, theme and logo.
2. Account key and no workspace yet: `create_workspace` (name, slug of 5+ characters, website). The website's brand is applied on creation. Otherwise use `apply_branding` with `website`, or with the fields the user kept.
3. `list_boards` / `list_statuses`. Propose 2 to 4 boards that fit the product (Feature requests exists already; add for example Bugs or Integrations) and any extra status (`kind` decides behaviour: `done` = shipped, `closed` = declined). Create them after a yes.
4. `configure_widget`: theme `auto`, accent `brand`, launcher and position to taste, `allowed_sites` with the production origin (plus `http://localhost:<port>` while developing).
5. Install the snippet. See [reference/widget-install.md](reference/widget-install.md):
   - Detect the framework from `package.json` (next, nuxt, vue, react/vite) or plain HTML.
   - `get_widget_snippet` with that `framework`.
   - Add it once to the root layout file named in the result. Edit the existing file; never replace it. Show the diff.
6. Finish with the board URL, the dashboard URL and what the user still has to do (deploy, invite the team with `invite_member`, connect Slack with `connect_slack` then `send_test`).

## 3. Weekly triage

1. `summarize_feedback`. Report: new this week, top voted, rising, stale planned or in-progress items, and posts nobody has answered (`needsReply`).
2. Duplicates: `find_duplicates` with the `post_id` of each new or rising post. Only suggest a merge when the titles really mean the same thing. Merge into the post with more votes (`merge_posts from=<duplicate> into=<keeper> confirm=true` after a yes).
3. Statuses: propose one per open post in a table (planned, closed with a one-line reason, or leave open). Apply with `bulk_set_status`. Pass `note` when the reason matters to voters.
4. Replies: draft short public replies for `needsReply` posts. Thank the author, answer or say what happens next, and link a help article if `search_help_articles` finds one. Post them with `add_comment`. Context for the team goes in `add_internal_note`.
5. Stale items: ask whether each stale planned post is still planned. Update the `eta` with `update_post`, or move it back.

## 4. Ship and announce

1. Find what shipped: `list_posts` with status planned or progress, plus `find_duplicates` with the feature description as `text`. Confirm the list with the user.
2. `draft_changelog`: a user-facing title, a short markdown body (what changed, why it matters, how to use it), `version` if they tag releases, and `post_ids`.
3. Before publishing, say who hears about it. `publish_changelog` moves every linked post to done and emails its voters and followers once, and emails confirmed changelog subscribers. Editing afterwards (`update_changelog`) sends nothing new.
4. After `publish_changelog`, optionally `add_comment` on each linked post with the changelog URL.
5. Update or write the help article for the feature (below).

## 5. Keep the help center current

- `list_help` shows collections and every article with its status. `search_help_articles` finds published ones by keywords.
- Before writing, search. Update what exists (`update_help_article`) rather than adding a near-copy.
- New article: `create_help_article`. Phrase the title as the question people ask, give a one-line `excerpt`, write a markdown body with short steps, and set `collection_id`. It stays a draft until `publish_help_article`.
- Group articles with `create_help_collection` (icons: book, rocket, card, plug, shield, gear, users, chat, lightbulb, code).
- Repeated questions in feedback (the same how-to asked in posts) are a cue for a new article. Reply on those posts with its URL.

## Tool map

[reference/tools.md](reference/tools.md) lists every tool by area. The server's own prompts (`weekly-triage`, `setup-openheard`, `ship-and-announce`, `reply-to-feedback`) walk through the same flows.
