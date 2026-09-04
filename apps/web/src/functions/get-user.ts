import { createServerFn } from "@tanstack/react-start";

import { sessionMiddleware } from "@/lib/session";

export const getUser = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => context.user);
