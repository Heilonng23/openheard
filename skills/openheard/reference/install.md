# Connecting the openheard MCP server

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

`bun run apps/web/src/scripts/mcp-e2e.ts http://localhost:3001 oh_...` runs the whole setup flow against a local server with an account key and prints a transcript.
