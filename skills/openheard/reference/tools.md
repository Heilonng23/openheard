# openheard MCP tools

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
