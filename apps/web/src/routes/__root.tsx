import { Toaster } from "@openheard/ui/components/sonner";
import { HeadContent, Outlet, Scripts, ScrollRestoration, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";

import Footer from "../components/footer";
import Header from "../components/header";
import { SignInDialog } from "../components/sign-in-dialog";

import { getWorkspace } from "../functions/workspace";
import appCss from "../index.css?url";
import geistLatinFont from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

export interface RouterAppContext {}

const OPENPANEL_CLIENT_ID = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_OPENPANEL_CLIENT_ID;

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
      { rel: "preload", href: geistLatinFont, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    // Analytics only when a client id is set at build time, so self-hosters send nothing by default.
    scripts: OPENPANEL_CLIENT_ID
      ? [
          { src: "https://openpanel.dev/op1.js", defer: true, async: true },
          {
            children: `window.op=window.op||function(){(window.op.q=window.op.q||[]).push(arguments)};window.op('init',${JSON.stringify({ clientId: OPENPANEL_CLIENT_ID, trackScreenViews: true, trackOutgoingLinks: true, trackAttributes: true })});`,
          },
        ]
      : [],
  }),
  component: RootDocument,
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl px-8 py-24 text-center">
      <h1 className="text-xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-muted-foreground">That page or workspace does not exist.</p>
    </main>
  ),
});

const BARE_PAGES = ["/login", "/reset-password", "/join/", "/new", "/welcome", "/start"];

function RootDocument() {
  const data = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
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
        {admin ? (
          <div className="h-dvh overflow-hidden">
            <Outlet />
          </div>
        ) : marketing ? (
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
        <SignInDialog />
        <Toaster position="bottom-right" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
