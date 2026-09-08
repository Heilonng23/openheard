# openheard MCP Server

The MCP server exposes the same capabilities as the REST API as [Model Context Protocol](https://modelcontextprotocol.io) tools. Any MCP-compatible client (Claude Code, Cursor, Windsurf, etc.) can manage your feedback board conversationally.

**Endpoint:** `/api/mcp`
**Transport:** Streamable HTTP (stateless)
**Auth:** Same `Bearer` API key as the REST API

## Rate limits

The MCP endpoint is rate-limited to **60 requests per minute** per API key (or per IP if no key is provided). Exceeding the limit returns HTTP `429` with a `Retry-After` header indicating seconds until the window resets.

## Setup

### Claude Code

```bash
claude mcp add openheard \
  --transport http \
  "https://your-domain.com/api/mcp" \
  --header "Authorization: Bearer oh_your_key_here"
```

Or add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "openheard": {
      "type": "http",
      "url": "https://your-domain.com/api/mcp",
      "headers": {
        "Authorization": "Bearer oh_your_key_here"
      }
    }
  }
}
```

### Cursor

In Cursor settings → MCP Servers, add:

```json
{
  "openheard": {
    "url": "https://your-domain.com/api/mcp",
    "headers": {
      "Authorization": "Bearer oh_your_key_here"
    }
  }
}
```

### Local dev

```bash
# Generate a key
OPENHEARD_LOCAL=1 bun run apps/web/src/scripts/make-api-key.ts

# Point at local
claude mcp add openheard-local \
  --transport http \
  "http://localhost:3001/api/mcp" \
  --header "Authorization: Bearer oh_your_key_here"
```

## Available tools

| Tool               | Description                                              |
|--------------------|----------------------------------------------------------|
| list_posts         | List posts with filters (status, board, search, sort)    |
| get_post           | Get a single post with comments and activity             |
| create_post        | Create a new feedback post                               |
| set_status         | Change a post's status                                   |
| add_comment        | Add a comment to a post                                  |
| list_statuses      | List all statuses in the workspace                       |
| list_boards        | List all boards                                          |
| list_changelog     | List published changelog entries                         |
| draft_changelog    | Create a draft changelog entry linked to posts           |
| publish_changelog  | Publish a draft (linked posts move to done)              |

## Example conversation

> **You:** Show me the top 5 most-voted posts
>
> **Claude:** *(calls list_posts with sort=top, limit=5)*
>
> Here are your top posts: ...

> **You:** Move post #3 to planned
>
> **Claude:** *(calls set_status with post_id=3, status=planned)*
>
> Done — post #3 is now "Planned".

## Runtime compatibility

The MCP server uses the Web Standards Streamable HTTP transport (`WebStandardStreamableHTTPServerTransport`). It runs on:

- Cloudflare Workers (production)
- Local dev with Bun/Node (OPENHEARD_LOCAL=1)
- Any runtime supporting the Fetch API
