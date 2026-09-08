import { LoadingButton } from "@openheard/ui/components/interior/loading-button";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead } from "@/components/admin/panel";
import { Avatar } from "@/components/bits";
import { saveProfile } from "@/functions/settings";
import { PageHead } from "@/routes/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings/profile")({
  head: () => ({ meta: [{ title: "Profile · settings" }] }),
  component: Profile,
});

function Profile() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const me = root.user!;
  const [name, setName] = useState(me.name);
  const dirty = name.trim() !== me.name;

  function save() {
    saveProfile({ data: { name } })
      .then(() => router.invalidate())
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save"));
  }

  return (
    <>
      <PageHead title="Profile" sub="How you appear on posts and replies." />
      <SectionHead title="You" />
      <Row label="Picture" help="Upload lands with image support.">
        <Avatar name={me.name} image={me.image} size={36} />
      </Row>
      <Row label="Name" help="Shown on your comments and in the team list.">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" className="h-8 w-[280px] rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none focus:border-ring/60" />
      </Row>
      <Row label="Email" help="Used to sign in. Changing it lands with email support.">
        <span className="text-[13px] text-muted-foreground">{me.email}</span>
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
