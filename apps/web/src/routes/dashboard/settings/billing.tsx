import { Button } from "@openheard/ui/components/button";
import { CheckIcon } from "@phosphor-icons/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionHead } from "@/components/admin/panel";
import { getBilling, openPortal, startCheckout } from "@/functions/billing";
import { PLANS } from "@/lib/plans";
import { fullDate } from "@/lib/time";
import { PageHead } from "@/routes/dashboard/settings";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/dashboard/settings/billing")({
  validateSearch: (s: Record<string, unknown>) => ({ checkout: s.checkout === "success" ? ("success" as const) : undefined }),
  loader: () => getBilling(),
  head: () => ({ meta: [{ title: "Billing · settings" }] }),
  component: Billing,
});

function Billing() {
  const b = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [interval, setBillingInterval] = useState<"month" | "year">("year");
  const [busy, setBusy] = useState(false);

  // Stripe redirects back before the webhook lands. Poll a few times so the page flips to Pro on its own.
  useEffect(() => {
    if (search.checkout !== "success" || b.plan === "pro") return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      router.invalidate();
      if (tries >= 10) clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, [search.checkout, b.plan, router]);

  async function go(fn: () => Promise<{ url: string }>) {
    setBusy(true);
    try {
      const { url } = await fn();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work");
      setBusy(false);
    }
  }

  const pro = b.plan === "pro";
  const price = interval === "month" ? PLANS.pro.monthly : PLANS.pro.yearly;

  return (
    <>
      <PageHead title="Billing" sub="Plans are per account. Every workspace you own counts against the limit." />

      <SectionHead title="Current plan" />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <div className="text-[15px] font-semibold">{PLANS[b.plan].name}</div>
          <div className="text-[13px] text-muted-foreground">
            {b.owned} of {b.limit} workspaces used
            {pro && b.renewsAt ? <span className="text-faint"> · renews {fullDate(b.renewsAt)}</span> : null}
          </div>
        </div>
        {pro ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => go(() => openPortal())}>
            Manage subscription
          </Button>
        ) : b.hasCustomer ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => go(() => openPortal())}>
            Billing history
          </Button>
        ) : null}
      </div>

      {!pro ? (
        <>
          <SectionHead
            title="Upgrade to Pro"
            right={
              <div className="flex gap-0.5 rounded-md bg-secondary p-0.5">
                {(["month", "year"] as const).map((i) => (
                  <button key={i} type="button" onClick={() => setBillingInterval(i)} className={cn("rounded-md px-2.5 py-1 text-xs", interval === i ? "bg-accent text-foreground" : "text-faint hover:text-muted-foreground")}>
                    {i === "month" ? "Monthly" : "Yearly, save 33%"}
                  </button>
                ))}
              </div>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Plan name="Free" price="$0" per="forever" current={b.plan === "free"} features={[`${PLANS.free.workspaces} workspaces`, "Unlimited posts and votes", "Public roadmap and changelog", "API and MCP server"]} />
            <Plan
              name="Pro"
              price={`$${price}`}
              per={interval === "month" ? "per month" : "per year"}
              highlight
              features={[`${PLANS.pro.workspaces} workspaces`, "Everything in Free", "Priority support"]}
              action={
                b.configured ? (
                  <Button size="sm" full disabled={busy} onClick={() => go(() => startCheckout({ data: { interval } }))}>
                    Upgrade
                  </Button>
                ) : (
                  <p className="text-center text-xs text-faint">Pro is coming soon.</p>
                )
              }
            />
          </div>
        </>
      ) : null}
    </>
  );
}

function Plan({ name, price, per, features, current, highlight, action }: { name: string; price: string; per: string; features: string[]; current?: boolean; highlight?: boolean; action?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border p-4", highlight ? "border-link/50 bg-link/[.04]" : "bg-card")}>
      <div className="flex items-baseline justify-between">
        <div className="text-[14px] font-semibold">{name}</div>
        {current ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Current</span> : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold tracking-[-0.02em]">{price}</span>
        <span className="text-[12px] text-faint">{per}</span>
      </div>
      <ul className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <CheckIcon weight="bold" className="size-3 text-status-shipped" /> {f}
          </li>
        ))}
      </ul>
      {action ? <div className="mt-auto pt-1">{action}</div> : null}
    </div>
  );
}
