// Server only: server.ts and tests. Kept out of widget-origins.ts because the
// settings page imports that one, and this pulls in the session resolver.
import { frameAncestors } from "./widget-origins";

// The directive for a request to /widget, from its workspace's list.
export async function frameAncestorsFor(request: Request): Promise<string> {
  try {
    const { workspaceFromRequest } = await import("./session");
    return frameAncestors((await workspaceFromRequest(request))?.widgetOrigins);
  } catch {
    // Without the workspace's list we cannot tell who may frame it.
    return "frame-ancestors 'self'";
  }
}
