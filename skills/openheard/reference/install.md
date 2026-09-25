# Connecting the openheard MCP server

Make a key first: **Settings > API keys**, name it, copy it (it is shown once). One key reaches all your workspaces; turn on **Limit to this workspace** only for a key you share with a teammate or a script.

### Claude Code

```bash
claude mcp add --transport http openheard https://openheard.com/api/mcp \
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
      "url": "https://openheard.com/api/mcp",
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
      "args": ["-y", "mcp-remote", "https://openheard.com/api/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer oh_your_key_here" }
    }
  }
}
```

Restart Claude Desktop after saving.

### Local dev

```bash
# --account <email>: a key for all that person's workspaces. Without it the key is limited to --workspace <slug> (default "default")
OPENHEARD_LOCAL=1 bun run apps/web/src/scripts/make-api-key.ts --account you@example.com

claude mcp add --transport http openheard-local http://localhost:3001/api/mcp \
  --header "Authorization: Bearer oh_your_key_here"
```
