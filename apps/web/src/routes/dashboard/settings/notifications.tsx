import { LoadingButton } from "@openheard/ui/components/interior/loading-button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead, Toggle } from "@/components/admin/panel";
import { getNotificationPrefs, saveNotificationPrefs } from "@/functions/settings";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/notifications")({
  loader: () => getNotificationPrefs(),
  head: () => ({ meta: [{ title: "Notifications · settings" }] }),
  component: Notifications,
});

function Notifications() {
  const saved = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState(saved);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  async function save() {
    await saveNotificationPrefs({ data: form });
    await router.invalidate();
  }

  return (
    <>
      <PageHead title="Notifications" sub="What lands in your inbox for this workspace. Sending starts once an email provider is connected." />
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
      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <span className="text-xs text-faint">{dirty ? "Unsaved changes" : "Saved"}</span>
        <LoadingButton onAction={save} disabled={!dirty} successLabel="Saved" onError={(err) => toast.error(err instanceof Error ? err.message : "Could not save")}>
          Save
        </LoadingButton>
      </div>
    </>
  );
}
