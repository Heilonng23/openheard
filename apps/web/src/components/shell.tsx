import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@openheard/ui/lib/utils";

// The one column every page lives on. Feed on the left, optional rail on the
// right. Rail collapses under the feed on small screens.
export function Shell({ children, rail, className }: { children: ReactNode; rail?: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto grid w-full max-w-[1072px] flex-1 grid-cols-1 gap-8 px-4 pt-7 pb-6 md:px-8 md:pt-10", rail && "lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-12", className)}>
      <main className="flex min-w-0 flex-col gap-5">{children}</main>
      {rail ? <aside className="flex flex-col gap-6 lg:pt-0">{rail}</aside> : null}
    </div>
  );
}

export function RailLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-2 text-xs font-medium text-muted-foreground">{children}</div>;
}

export function RailItem({ active, onClick, label, count, color, to, search }: { active?: boolean; onClick?: () => void; label: ReactNode; count?: number | string; color?: string; to?: string; search?: Record<string, unknown> }) {
  const cls = cn(
    "flex w-full items-center justify-between rounded-md px-2.5 py-[7px] text-left text-[13px] active:scale-[0.99]",
    active ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    !onClick && !to && "cursor-default hover:bg-transparent hover:text-muted-foreground",
  );
  const inner = (
    <>
      <span className="flex items-center gap-2.5">
        {color ? <span className="size-[7px] rounded-full" style={{ background: color }} /> : null}
        {label}
      </span>
      {count !== undefined ? <span className="text-xs text-faint tabular-nums">{count}</span> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} search={search} preload="viewport" className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
