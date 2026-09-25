import { createFileRoute } from "@tanstack/react-router";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKey, apiErrorResponse } from "@/lib/api-auth";
import { createMcpServer } from "@/lib/mcp/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

async function handleMcp(request: Request): Promise<Response> {
  try {
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const auth = request.headers.get("authorization");
    const key = auth?.startsWith("Bearer ") ? auth.slice(7, 20) : ip;
    const rl = await rateLimit(`mcp:${key}`, { window: 60, max: 60 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!);

    const ctx = await authenticateApiKey(request);
    const server = createMcpServer(ctx, new URL(request.url).origin);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return response;
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: ({ request }) => handleMcp(request),
      POST: ({ request }) => handleMcp(request),
      DELETE: ({ request }) => handleMcp(request),
    },
  },
});
