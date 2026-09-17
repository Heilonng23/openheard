import { createFileRoute } from "@tanstack/react-router";

import { Landing } from "@/components/landing/page";

// Preview of the marketing page. In the cloud it is also served at the root
// domain, see __root.tsx.
export const Route = createFileRoute("/landing")({
  head: () => {
    const title = "openheard · the open source Canny alternative";
    const description =
      "Collect feedback, let users vote, ship a public roadmap and changelog. Self-host in one command or use the cloud. Works with Claude, Cursor and any MCP agent.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  component: Landing,
});
