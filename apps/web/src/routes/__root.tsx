import { Suspense, lazy } from "react";
import { Toaster } from "@openheard/ui/components/sonner";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useLocation } from "@tanstack/react-router";

import Footer from "../components/footer";
import Header from "../components/header";

const Landing = lazy(() => import("../components/landing/page").then((m) => ({ default: m.Landing })));
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
      <p className="mt-2 text-muted-foreground">That page or workspace does not exist.</p>
    </main>
  ),
});

const BARE_PAGES = ["/login", "/reset-password", "/join/", "/new", "/welcome"];

function RootDocument() {
  const data = Route.useLoaderData();
  const { pathname } = useLocation();
  const admin = pathname.startsWith("/dashboard");
  // /landing previews the marketing page anywhere; on the cloud root domain
  // the marketing page is the home page.
  const marketing = pathname === "/landing" || (!!data?.marketing && pathname === "/");
  const bare = BARE_PAGES.some((p) => pathname === p || pathname.startsWith(p));
  const theme = data?.workspace.theme === "light" && !admin && !marketing ? "" : "dark";
  // Workspace accent applies to the public board only; the dashboard keeps ours.
  const accent = !admin && data?.workspace.accent ? ({ "--link": data.workspace.accent, "--ring": data.workspace.accent } as React.CSSProperties) : undefined;
  return (
    <html lang="en" className={theme} style={accent}>
      <head>
        <HeadContent />
      </head>
      <body>
        {data?.marketing && pathname === "/" ? (
          <Suspense>
            <Landing />
          </Suspense>
        ) : admin || marketing ? (
          <Outlet />
        ) : bare ? (
          <div className="flex min-h-svh flex-col">
            <Outlet />
          </div>
        ) : (
          <div className="flex min-h-svh flex-col">
            <Header />
            <div className="flex flex-1 flex-col">
              <Outlet />
            </div>
            <Footer />
          </div>
        )}
        <Toaster position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
