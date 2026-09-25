import type { Icon } from "@phosphor-icons/react";
import { BookOpenIcon, ChatCircleIcon, CodeIcon, CreditCardIcon, GearIcon, InfoIcon, LightbulbIcon, PlugsIcon, RocketIcon, ShieldCheckIcon, UsersIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";

import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import { type Block, type HelpIcon as HelpIconName, type Inline } from "@/lib/help";
import { requestComposer } from "@/lib/pending-action";

const ICONS: Record<HelpIconName, Icon> = {
  book: BookOpenIcon,
  rocket: RocketIcon,
  card: CreditCardIcon,
  plug: PlugsIcon,
  shield: ShieldCheckIcon,
  gear: GearIcon,
  users: UsersIcon,
  chat: ChatCircleIcon,
  lightbulb: LightbulbIcon,
  code: CodeIcon,
};

export function HelpIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const I = ICONS[(name ?? "book") as HelpIconName] ?? BookOpenIcon;
  return <I className={className} />;
}

// The square the collection icon sits in on the help home and collection page.
export function HelpIconBox({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-foreground", className)}>
      <HelpIcon name={name} className="size-4" />
    </span>
  );
}

export function HelpLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-xs font-medium text-muted-foreground", className)}>{children}</div>;
}

// Everything the help center cannot answer goes to the board's composer.
export function AskOnBoard({ full }: { full?: boolean }) {
  const navigate = useNavigate();
  return (
    <Button
      arrow
      full={full}
      onClick={() => navigate({ to: "/" }).then(requestComposer)}
    >
      Ask on the board
    </Button>
  );
}

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return <Fragment key={i}>{n.v}</Fragment>;
          case "code":
            return (
              <code key={i} className="rounded-md border border-input bg-secondary px-1.5 py-px font-mono text-[0.86em] text-foreground">
                {n.v}
              </code>
            );
          case "strong":
            return (
              <strong key={i} className="font-semibold text-foreground">
                <InlineNodes nodes={n.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <InlineNodes nodes={n.c} />
              </em>
            );
          case "link": {
            const external = /^https?:/i.test(n.href);
            return (
              <a key={i} href={n.href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} className="text-link underline decoration-link/30 underline-offset-[3px] hover:decoration-link">
                <InlineNodes nodes={n.c} />
              </a>
            );
          }
          case "img":
            return <img key={i} src={n.src} alt={n.alt} loading="lazy" className="my-2 max-w-full rounded-xl border" />;
        }
      })}
    </>
  );
}

// Article body. Paragraph text sits one tier below the headings so the
// structure reads at a glance.
export function Markdown({ blocks, className }: { blocks: Block[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-5 text-[16px] leading-[1.7] text-muted-foreground", className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h": {
            const H = `h${b.level}` as "h2" | "h3" | "h4";
            return (
              <H
                key={i}
                id={b.id}
                className={cn(
                  "scroll-mt-24 font-semibold tracking-[-0.02em] text-foreground",
                  b.level === 2 ? "mt-4 text-[22px] leading-[1.3]" : b.level === 3 ? "mt-2 text-[18px] leading-[1.35]" : "text-[16px]",
                )}
              >
                <InlineNodes nodes={b.c} />
              </H>
            );
          }
          case "p":
            return (
              <p key={i}>
                <InlineNodes nodes={b.c} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="flex flex-col gap-2">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="mt-[11px] size-1 shrink-0 rounded-full bg-faint" aria-hidden />
                    <span className="min-w-0">
                      <InlineNodes nodes={item} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="flex flex-col gap-2.5" start={b.start}>
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-3.5">
                    <span className="w-5 shrink-0 pt-[3px] text-[12px] text-faint tabular-nums" aria-hidden>
                      {String((b.start ?? 1) + j).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 text-foreground/85">
                      <InlineNodes nodes={item} />
                    </span>
                  </li>
                ))}
              </ol>
            );
          case "quote":
            // Quotes render as a callout: the one place a note needs to stand out.
            return (
              <aside key={i} className="flex gap-3 rounded-xl border bg-card px-4 py-3.5 text-[15px] leading-[1.6] text-foreground">
                <InfoIcon className="mt-[3px] size-[18px] shrink-0 text-link" />
                <Markdown blocks={b.c} className="gap-2 text-[15px] leading-[1.6] text-foreground" />
              </aside>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-xl border bg-card px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-foreground/85 [scrollbar-width:thin]">
                <code>{b.v}</code>
              </pre>
            );
          case "hr":
            return <hr key={i} className="my-2 border-border" />;
        }
      })}
    </div>
  );
}
