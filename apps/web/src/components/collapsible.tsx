import type { ReactNode } from "react";

import { cn } from "@openheard/ui/lib/utils";

// Height animation without measuring: grid rows go 0fr -> 1fr. 180ms, off
// under reduced motion. Content stays mounted so keyboard focus survives.
export function Collapsible({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]", className)} aria-hidden={!open}>
      <div className={cn("min-h-0 overflow-hidden transition-opacity duration-150", open ? "opacity-100" : "opacity-0")}>{children}</div>
    </div>
  );
}
