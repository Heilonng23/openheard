import { createAuth } from "@openheard/auth";
import { createMiddleware } from "@tanstack/react-start";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const session = await createAuth().api.getSession({
    headers: request.headers,
  });
  return next({
    context: { session },
  });
});
