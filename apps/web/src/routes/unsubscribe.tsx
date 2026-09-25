import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!t) return setResult({ ok: false });
    unsubscribe({ data: { t } }).then(setResult, () => setResult({ ok: false }));
  }, [t]);

  if (!result) return <EmailLinkPage title="Unsubscribing" body="One moment." />;
  if (!result.ok) return <EmailLinkPage title="This link does not work" body="It may have been copied incompletely. Use the link from the latest email." />;
  return (
    <EmailLinkPage
      title="You are unsubscribed"
      body={`${result.workspaceName} will stop emailing you ${WHAT[result.kind]}. Changed your mind? Turn it back on in your notification settings or the changelog page.`}
    />
  );
}
