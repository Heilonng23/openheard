import { LoadingButton } from "@openheard/ui/components/interior/loading-button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead, Toggle } from "@/components/admin/panel";
import { getEmailPrefs, saveEmailPrefs } from "@/functions/notifications";
import { getNotificationPrefs, saveNotificationPrefs } from "@/functions/settings";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/notifications")({
  loader: async () => ({ team: await getNotificationPrefs(), email: await getEmailPrefs() }),
  head: () => ({ meta: [{ title: "Notifications · settings" }] }),
  component: Notifications,
});

function Notifications() {
  const saved = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState(saved.team);
  const [email, setEmail] = useState(saved.email);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved.team) || JSON.stringify(email) !== JSON.stringify(saved.email);

  async function save() {
    const [, res] = await Promise.all([saveNotificationPrefs({ data: form }), saveEmailPrefs({ data: email })]);
    if (res.confirmSent) {
      toast.success("Check your inbox to confirm changelog emails");
      // Off until the link is clicked, which is what the saved prefs say too.
      setEmail((e) => ({ ...e, changelog: false }));
    }
    await router.invalidate();
  }

  return (
    <>
      <PageHead title="Notifications" sub="What lands in your inbox for this workspace." />
      <SectionHead title="Email me when" />
      <Row label="Someone posts" help="A new post lands in Pending.">
        <Toggle on={form.notifyNewPost} onChange={(v) => setForm({ ...form, notifyNewPost: v })} label="New post" />
      </Row>
      <Row label="Someone comments" help="A public comment on any post.">
        <Toggle on={form.notifyComment} onChange={(v) => setForm({ ...form, notifyComment: v })} label="New comment" />
      </Row>
      <Row label="A status changes" help="Another admin moves a post.">
        <Toggle on={form.notifyStatus} onChange={(v) => setForm({ ...form, notifyStatus: v })} label="Status change" />
      </Row>
      <Row label="A post I follow moves" help="Posts you voted on, commented on or wrote change status.">
        <Toggle on={email.followedPosts} onChange={(v) => setEmail({ ...email, followedPosts: v })} label="Posts I follow" />
      </Row>
      <Row label="Something ships" help="Each new changelog entry.">
        <Toggle on={email.changelog} onChange={(v) => setEmail({ ...email, changelog: v })} label="Changelog" />
      </Row>
      {email.workspaceStatusEmails !== undefined && (
        <>
          <div className="pt-6">
            <SectionHead title="Emails to your users" />
          </div>
          <Row label="Status updates" help="Voters, commenters and the author hear when their post changes status, with your note.">
            <Toggle on={email.workspaceStatusEmails} onChange={(v) => setEmail({ ...email, workspaceStatusEmails: v })} label="Status emails to users" />
          </Row>
        </>
      )}
      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <span className="text-xs text-faint">{dirty ? "Unsaved changes" : "Saved"}</span>
        <LoadingButton onAction={save} disabled={!dirty} successLabel="Saved" onError={(err) => toast.error(err instanceof Error ? err.message : "Could not save")}>
          Save
        </LoadingButton>
      </div>
    </>
  );
}
