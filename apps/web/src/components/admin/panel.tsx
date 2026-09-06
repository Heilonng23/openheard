import { BellIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import { Kbd } from "@/components/bits";
import { cn } from "@openheard/ui/lib/utils";

// The rounded content panel every admin page lives in, with its top bar.
export function Panel({ title, children, className, actions }: { title: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col py-3 pr-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b px-5">
          <div className="text-[17px] font-semibold">{title}</div>
          <div className="flex items-center gap-2">
            {actions}
            <form
              className="relative hidden md:block"
              onSubmit={(e) => {
                e.preventDefault();
                navigate({ to: "/", search: q ? { q } : {} });
              }}
            >
              <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-[13px] -translate-y-1/2 text-faint" />
              <input
                data-admin-search
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search posts"
                className="h-[30px] w-[220px] rounded-lg border bg-card pr-10 pl-7 text-[13px] outline-none placeholder:text-faint focus:border-ring/60"
              />
              <Kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">⌘K</Kbd>
            </form>
            <button type="button" className="inline-flex size-[30px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" title="Notifications">
              <BellIcon className="size-[15px]" />
            </button>
          </div>
        </div>
        <div key={typeof title === "string" ? title : undefined} className={cn("min-h-0 flex-1 overflow-auto animate-in fade-in-0 duration-150 motion-reduce:animate-none", className)}>{children}</div>
      </div>
    </div>
  );
}

export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pb-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {right}
    </div>
  );
}

// Settings row: label and description left, control right, hairline above.
export function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-t py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-[13px] font-semibold">{label}</div>
        {help ? <div className="text-xs text-faint">{help}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-5 w-[34px] shrink-0 items-center rounded-full border p-0.5 transition-colors", on ? "border-link bg-link" : "border-input bg-secondary")}
    >
      <span className={cn("size-3.5 rounded-full transition-transform", on ? "translate-x-[14px] bg-[#0d0d0f]" : "translate-x-0 bg-muted-foreground")} />
    </button>
  );
}
