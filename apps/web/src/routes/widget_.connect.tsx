import { CheckCircleIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import Logo from "@/components/logo";
import { getUser } from "@/functions/get-user";
import { widgetSessionToken } from "@/functions/widget";
import { MSG } from "@/lib/widget-auth";

// Opened by the widget as a first-party popup. Signs in through the normal
// login page if needed, then hands the session to the widget iframe that
// opened it (same origin only) and closes itself.
export const Route = createFileRoute("/widget_/connect")({
  beforeLoad: async () => {
    const user = await getUser();
    if (!user) throw redirect({ to: "/login", search: { redirect: "/widget/connect" } });
  },
  head: () => ({ meta: [{ title: "Signed in" }] }),
  component: Connect,
});

function Connect() {
  const [state, setState] = useState<"working" | "done" | "orphan">("working");

  useEffect(() => {
    let cancelled = false;
    widgetSessionToken()
      .then(({ token }) => {
        if (cancelled) return;
        const opener = window.opener as Window | null;
        if (!token || !opener) return setState("orphan");
        opener.postMessage({ type: MSG.session, token }, window.location.origin);
        setState("done");
        window.close();
      })
      .catch(() => !cancelled && setState("orphan"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-[320px] flex-col items-center gap-4 text-center">
        <Logo size={28} />
        {state === "working" ? (
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        ) : (
          <>
            <CheckCircleIcon weight="fill" className="size-6 text-status-shipped" />
            <div className="flex flex-col gap-1">
              <h1 className="text-[18px] font-semibold tracking-[-0.02em]">You are signed in</h1>
              <p className="text-sm text-muted-foreground">
                {state === "done" ? "You can close this window." : "Close this tab and press Continue in the feedback panel."}
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
