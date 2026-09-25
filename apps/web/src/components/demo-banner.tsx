import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

const KEY = "oh:demo-banner";

// One hairline row above the dashboard. Dismissal is local to the browser, so
// a visitor who already knows is not told twice.
export function DemoBanner() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(localStorage.getItem(KEY) !== "dismissed");
  }, []);
  if (!shown) return null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b px-4">
      <span className="text-xs font-medium text-muted-foreground">Demo</span>
      <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">Everything here is shared, and everything resets every night.</p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(KEY, "dismissed");
          setShown(false);
        }}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors duration-150 hover:bg-accent hover:text-foreground"
        aria-label="Dismiss"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
