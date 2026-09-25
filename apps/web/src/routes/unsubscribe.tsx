import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@openheard/ui/components/button";
import { EmailLinkPage } from "@/components/email-link-page";
import { unsubscribe } from "@/functions/notifications";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : "" }),
  head: () => ({ meta: [{ title: "Unsubscribe" }, { name: "robots", content: "noindex" }] }),
  component: UnsubscribePage,
});

type Result = Awaited<ReturnType<typeof unsubscribe>>;

const WHAT = { status: "updates on posts you voted on, commented on or wrote", changelog: "changelog emails" } as const;

// Runs from the browser, not the loader, so a mail scanner that fetches the
// link without running scripts does not unsubscribe anyone.
function UnsubscribePage() {
  const { t } = Route.useSearch();
  const [result, setResult] = useState<Result | null>(null);
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!t) return setResult({ ok: false });
    unsubscribe({ data: { t } }).then(setResult, () => setResult({ ok: false }));
  }, [t]);

  async function toggle(undo: boolean) {
    setBusy(true);
    try {
      await unsubscribe({ data: { t, undo } });
      setUndone(undo);
    } finally {
      setBusy(false);
    }
  }

  if (!result) return <EmailLinkPage title="Unsubscribing" body="One moment." />;
  if (!result.ok) return <EmailLinkPage title="This link does not work" body="It may have been copied incompletely. Use the link from the latest email." />;
  const what = WHAT[result.kind];
  return undone ? (
    <EmailLinkPage title="You are back on the list" body={`You will get ${what} from ${result.workspaceName} again.`}>
      <Button variant="secondary" disabled={busy} onClick={() => toggle(false)}>
        Unsubscribe again
      </Button>
    </EmailLinkPage>
  ) : (
    <EmailLinkPage title="You are unsubscribed" body={`No more ${what} from ${result.workspaceName}.`}>
      <Button variant="secondary" disabled={busy} onClick={() => toggle(true)}>
        Undo
      </Button>
    </EmailLinkPage>
  );
}
