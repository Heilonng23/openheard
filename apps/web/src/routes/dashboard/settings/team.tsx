import { Button } from "@openheard/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { CaretDownIcon, EnvelopeSimpleIcon, TrashSimpleIcon, XIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { SectionHead } from "@/components/admin/panel";
import { Avatar } from "@/components/bits";
import { listMembers, setRole } from "@/functions/admin";
import { createInvite, listInvites, removeMember, revokeInvite } from "@/functions/invites";
import { since } from "@/lib/time";
import { PageHead } from "@/routes/dashboard/settings";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/settings/team")({
  loader: async () => {
    const [members, invites] = await Promise.all([listMembers(), listInvites()]);
    return { members, invites };
  },
  head: () => ({ meta: [{ title: "Team · settings" }] }),
  component: Team,
});

function Team() {
  const { members, invites } = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const admins = members.filter((m) => m.role === "admin").length;

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    try {
      await createInvite({ data: { email: inviteEmail } });
      setInviteEmail("");
      toast.success(`Invite sent to ${inviteEmail}`);
      router.invalidate();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send invite");
    }
    setInviteBusy(false);
  }

  return (
    <>
      <PageHead title="Team" sub="Admins run the board and see internal notes. Members are everyone else who signed up." />
      <form className="flex items-center gap-2 rounded-lg border bg-card py-2.5 pr-2.5 pl-3.5" onSubmit={handleInvite}>
        <EnvelopeSimpleIcon className="size-3.5 text-faint" />
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          required
          placeholder="teammate@company.com"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
        />
        <Button size="sm" arrow type="submit" disabled={inviteBusy}>
          {inviteBusy ? "Sending…" : "Send invite"}
        </Button>
      </form>

      {invites.length > 0 ? (
        <div className="pt-5">
          <SectionHead title="Pending invites" right={<span className="text-xs text-faint">{invites.length}</span>} />
          {invites.map((inv) => (
            <div key={inv.token} className="flex items-center gap-3 border-t py-2.5">
              <EnvelopeSimpleIcon className="size-3.5 text-faint" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{inv.email}</span>
              <span className="text-xs capitalize text-faint">{inv.role}</span>
              <span className="text-xs text-faint">{since(inv.createdAt)}</span>
              <button
                type="button"
                className="rounded p-1 text-faint hover:bg-accent hover:text-foreground"
                onClick={() =>
                  revokeInvite({ data: { token: inv.token } })
                    .then(() => router.invalidate())
                    .then(() => toast.success("Invite revoked"))
                    .catch((e) => toast.error(e.message))
                }
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="pt-7">
        <SectionHead title="People" right={<span className="text-xs text-faint">{admins} {admins === 1 ? "admin" : "admins"}</span>} />
      </div>
      {members.map((m) => {
        const you = m.id === root.user?.id;
        return (
          <div key={m.id} className="flex items-center gap-3 border-t py-3">
            <Avatar name={m.name} image={m.image} size={30} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                {m.name}
                {you ? <span className="rounded-full bg-secondary px-1.5 text-[11px] font-normal text-faint">you</span> : null}
              </span>
              <span className="text-xs text-faint">{m.email}</span>
            </div>
            <span className="text-xs text-faint">joined {since(m.createdAt)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger disabled={you} className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-input bg-card px-2 text-xs capitalize outline-none hover:bg-accent disabled:opacity-60">
                {m.role} <CaretDownIcon className="size-2.5 text-faint" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-32">
                {(["admin", "member"] as const).map((r) => (
                  <DropdownMenuItem
                    key={r}
                    disabled={r === m.role}
                    className="capitalize"
                    onClick={() =>
                      setRole({ data: { userId: m.id, role: r } })
                        .then(() => router.invalidate())
                        .then(() => toast.success(`${m.name} is now ${r}`))
                        .catch((e) => toast.error(e.message))
                    }
                  >
                    {r}
                  </DropdownMenuItem>
                ))}
                {!you ? (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() =>
                      removeMember({ data: { userId: m.id } })
                        .then(() => router.invalidate())
                        .then(() => toast.success(`${m.name} removed`))
                        .catch((e) => toast.error(e.message))
                    }
                  >
                    <TrashSimpleIcon className="mr-1.5 size-3.5" /> Remove
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </>
  );
}
