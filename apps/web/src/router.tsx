import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreload: "intent",
    defaultPendingMs: 3_000,
    defaultPendingMinMs: 0,
    defaultStaleTime: 60_000,
    defaultGcTime: 300_000,
    defaultViewTransition: true,
    context: { user: null },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => (
      <main className="mx-auto max-w-3xl px-8 py-24 text-center">
        <h1 className="text-xl font-semibold">Nothing here</h1>
        <p className="mt-2 text-muted-foreground">That page does not exist.</p>
        <a href="/" className="mt-4 inline-block text-sm font-medium hover:underline">Back to the board</a>
      </main>
    ),
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
