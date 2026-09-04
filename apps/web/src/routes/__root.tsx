import { Toaster } from "@openheard/ui/components/sonner";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";

import Footer from "../components/footer";
import Header from "../components/header";
import { getWorkspace } from "../functions/workspace";
import appCss from "../index.css?url";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  loader: () => getWorkspace(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: loaderData ? `${loaderData.workspace.name} · feedback` : "openheard" },
      { name: "description", content: loaderData?.workspace.tagline ?? "Open source feedback board." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  component: RootDocument,
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl px-8 py-24 text-center">
      <h1 className="text-xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-muted-foreground">That page does not exist. The board is one click back.</p>
    </main>
  ),
});

function RootDocument() {
  const data = Route.useLoaderData();
  const theme = data?.workspace.theme === "light" ? "" : "dark";
  return (
    <html lang="en" className={theme}>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="flex min-h-svh flex-col">
          <Header />
          <div className="flex flex-1 flex-col">
            <Outlet />
          </div>
          <Footer />
        </div>
        <Toaster position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
