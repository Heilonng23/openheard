import { CheckCircleIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { WorkspaceLogo } from "@/components/logo";
import { getUser } from "@/functions/get-user";
import { connectWidget } from "@/functions/widget";
import { MSG } from "@/lib/widget-auth";

const NONCE = /^[0-9a-f]{32}$/;

// Opened by the widget as a first-party popup. Signs in through the normal
// login page if needed, then hands a fresh widget token to the widget iframe
// that opened it (same origin only), tagged with the nonce it was opened
// with, and closes itself.
export const Route = createFileRoute("/widget_/connect")({
  validateSearch: (s: Record<string, unknown>): { nonce?: string } => ({
    nonce: typeof s.nonce === "string" && NONCE.test(s.nonce) ? s.nonce : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const user = await getUser();
    const back = search.nonce ? `/widget/connect?nonce=${search.nonce}` : "/widget/connect";
    if (!user) throw redirect({ to: "/login", search: { redirect: back } });
  },
  head: () => ({ meta: [{ title: "Signed in" }] }),
  component: Connect,
});

function Connect() {
  const { nonce } = Route.useSearch();
  const [state, setState] = useState<"working" | "done" | "orphan">("working");

  useEffect(() => {
    let cancelled = false;
    const opener = window.opener as Window | null;
    // Opened by hand, or by something other than the widget: nothing to hand over.
    if (!nonce || !opener) {
      setState("orphan");
      return;
    }
    connectWidget()
      .then(({ token }) => {
        if (cancelled) return;
        if (!token) return setState("orphan");
        opener.postMessage({ type: MSG.session, token, nonce }, window.location.origin);
        setState("done");
        window.close();
      })
      .catch(() => !cancelled && setState("orphan"));
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-[320px] flex-col items-center gap-4 text-center">
        <WorkspaceLogo size={28} />
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
