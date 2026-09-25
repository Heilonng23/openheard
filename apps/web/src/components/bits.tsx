import { cn } from "@openheard/ui/lib/utils";

import { findStatus, tint, useStatuses } from "@/lib/status";

// Dot + label on a 15% tint of the status colour. Used on the post page and in timelines.
export function StatusChip({ status, className, showOpen = false }: { status: string; className?: string; showOpen?: boolean }) {
  const m = findStatus(useStatuses(), status);
  // A new post has no status to announce yet; board rows show nothing either.
  // Timelines pass showOpen, since "moved to" needs somewhere to point.
  if (m.kind === "open" && !showOpen) return null;
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 pl-2 text-xs font-semibold", className)} style={{ background: tint(m.color), color: m.color }}>
      <span className="size-[7px] rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

// Dot + muted label, for list rows.
export function StatusLabel({ status, className }: { status: string; className?: string }) {
  const m = findStatus(useStatuses(), status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold", className)}>
      <span className="size-[7px] rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-[7px] rounded-full", className)} style={{ background: color }} />;
}

export function TagChip({ children, active, className }: { children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md border bg-secondary px-1.5 text-[12px] text-muted-foreground", active && "border-foreground/40 text-foreground", className)}>
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border bg-secondary px-1 font-mono text-[11px] text-muted-foreground", className)}>
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
  return <span className="inline-flex h-[18px] items-center rounded-full bg-link/10 px-1.5 text-[11px] font-semibold text-link">team</span>;
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-xs text-muted-foreground tabular-nums", className)}>{children}</span>;
}
