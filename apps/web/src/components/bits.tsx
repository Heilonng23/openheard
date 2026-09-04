import type { Status } from "@openheard/db/schema/feedback";
import { cn } from "@openheard/ui/lib/utils";

import { STATUS_META } from "@/lib/status";

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-full border bg-secondary px-2 text-xs font-medium text-muted-foreground", className)}>
      <span className={cn("size-[7px] rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span className={cn("inline-block size-[7px] rounded-full", STATUS_META[status].dot, className)} />;
}

export function TagChip({ children, active, className }: { children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-[5px] border bg-secondary px-1.5 text-[11.5px] text-muted-foreground", active && "border-foreground/40 text-foreground", className)}>
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border bg-secondary px-1 font-mono text-[10.5px] text-muted-foreground", className)}>
      {children}
    </kbd>
  );
}

export function Avatar({ name, image, size = 26, className }: { name: string; image?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return image ? (
    <img src={image} alt="" width={size} height={size} className={cn("rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border bg-accent font-semibold text-foreground", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function TeamBadge() {
  return <span className="inline-flex h-[18px] items-center rounded-full border border-link/30 bg-link/10 px-1.5 text-[10.5px] font-medium text-link">team</span>;
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs tracking-[0.01em] text-muted-foreground", className)}>{children}</span>;
}
