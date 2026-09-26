import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { WorkspaceLogo } from "@/components/logo";

// The small centred page behind a link in an email: confirm, unsubscribe.
export function EmailLinkPage({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <WorkspaceLogo size={32} />
        <div className="flex flex-col items-center gap-1.5 text-center" aria-live="polite">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
        {children}
        <Link to="/" className="text-sm text-faint hover:text-foreground">
          Go to the board
        </Link>
      </div>
    </main>
  );
}
