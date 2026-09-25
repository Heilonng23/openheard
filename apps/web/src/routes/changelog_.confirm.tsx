import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { EmailLinkPage } from "@/components/email-link-page";
import { confirmChangelog } from "@/functions/notifications";

export const Route = createFileRoute("/changelog_/confirm")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : "" }),
  head: () => ({ meta: [{ title: "Confirm subscription" }, { name: "robots", content: "noindex" }] }),
  component: ConfirmPage,
});

type Result = Awaited<ReturnType<typeof confirmChangelog>>;

// Confirms from the browser, so a link scanner cannot opt someone in.
function ConfirmPage() {
  const { t } = Route.useSearch();
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!t) return setResult({ ok: false });
    confirmChangelog({ data: { t } }).then(setResult, () => setResult({ ok: false }));
  }, [t]);

  if (!result) return <EmailLinkPage title="Confirming" body="One moment." />;
  if (!result.ok) return <EmailLinkPage title="This link has expired" body="Confirm links last 7 days. Subscribe again from the changelog." />;
  return <EmailLinkPage title="You are subscribed" body={`One email from ${result.workspaceName} each time something ships. Every email has a link to stop.`} />;
}
