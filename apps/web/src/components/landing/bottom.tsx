import { CaretDownIcon, CaretUpIcon, CheckIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import { Collapsible } from "../collapsible";
import Logo from "../logo";
import { AnimatedList } from "./magic/animated-list";
import { BlurFade } from "./magic/blur-fade";
import { NumberTicker } from "./magic/number-ticker";
import { AnimatedSpan, Terminal, TypingAnimation } from "./magic/terminal";
import { Eyebrow, Framed, SectionHeader, Shot } from "./shared";
import { GITHUB } from "./top";

/* ---------------------------------------------------------------- product */

const products = [
  { id: "board", eyebrow: "Board", title: "A board users actually use.", sub: "Post, vote, comment. Duplicates merge without losing votes. Keyboard first, one accent colour, no clutter.", points: ["Public or private boards", "One vote per user, anonymous voting optional", "Tags, search, trending and top sorts"], shot: "/landing/board.png", alt: "Public feedback board showing feature requests ranked by votes", center: true },
  { id: "roadmap", eyebrow: "Roadmap", title: "A roadmap that stays honest.", sub: "Statuses are data. Drag a card in the dashboard and the public roadmap, the board and the changelog all agree.", points: ["Columns come from your statuses", "Vote counts on every card", "Hide it until you are ready"], shot: "/landing/dashboard-roadmap.png", alt: "Dashboard roadmap view with kanban columns for Planned, In Progress and Shipped", center: false },
  { id: "changelog", eyebrow: "Changelog", title: "Close the loop.", sub: "Write what shipped, link the posts, publish. Everyone who voted gets an email. RSS for the rest.", points: ["Entries link back to the requests", "Voters notified on publish", "RSS feed, version tags, drafts"], shot: "/landing/changelog.png", alt: "Changelog page with published entries linked to shipped requests", center: true },
  { id: "dashboard", eyebrow: "Dashboard", title: "An inbox, not a CRM.", sub: "Every post in one list with status, board, tags and votes. Filter, pin, merge, add an internal note, move on.", points: ["Quick filters by status, board and tag", "Internal notes and reactions", "CSV import and export"], shot: "/landing/dashboard-inbox.png", alt: "Dashboard inbox showing all posts with status filters and vote counts", center: false },
];

// Template growth section: Framed, SectionHeader, then a 2-col grid with
// divide-x, each item p-6, content on top, title + description at the end.
export function Products() {
  return (
    <Framed id="product">
      <SectionHeader title="Post. Vote. Ship. Tell them." sub="Four screens. Each one does its job and stays out of the way." />
      {products.map((p, i) => (
        <div key={p.id} className={cn("grid divide-y divide-border border-b border-border last:border-b-0 md:grid-cols-2 md:divide-x md:divide-y-0", i % 2 === 1 && "md:divide-x-reverse md:[&>*:first-child]:order-2")}>
          <div className="flex flex-col justify-center gap-2 p-6">
            <Eyebrow className="mb-1">{p.eyebrow}</Eyebrow>
            <h3 className="text-lg font-semibold tracking-tighter text-balance">{p.title}</h3>
            <p className="max-w-[46ch] text-pretty text-muted-foreground">{p.sub}</p>
            <ul role="list" className="mt-2 flex flex-col gap-2 text-[14px] text-muted-foreground">
              {p.points.map((pt) => (
                <li key={pt} className="flex items-start gap-2.5">
                  <CheckIcon weight="bold" className="mt-1 size-3.5 shrink-0 text-link" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden p-4 md:p-6">
            <BlurFade inView>
              <Shot src={p.shot} alt={p.alt} className="aspect-[16/10]" imgClassName={cn("w-full md:w-[150%] md:max-w-none", p.center && "md:-ml-[25%]")} />
            </BlurFade>
          </div>
        </div>
      ))}
    </Framed>
  );
}

/* ------------------------------------------------------------------ bento */

const inboxRows = [
  { title: "Dark mode for the embedded widget", meta: "In progress · Mara Lindqvist · 2d", votes: 128, hot: true },
  { title: "Merge duplicate posts without losing votes", meta: "Planned · Tomás Ferreira · 5d", votes: 86 },
  { title: "Slack notifications when a post changes status", meta: "Under review · Aiko Tanaka · 1w", votes: 54 },
  { title: "Public API for creating posts from our app", meta: "Devraj Patel · 1w", votes: 41 },
];

function PostRow({ title, meta, votes, hot }: (typeof inboxRows)[number]) {
  return (
    <div className={cn("flex w-full items-center gap-4 rounded-xl border px-5 py-4", hot ? "border-input bg-secondary" : "border-border bg-card")}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        <div className="mt-1 text-[12px] text-faint">{meta}</div>
      </div>
      <div className={cn("flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5 font-mono text-[14px] font-medium", hot ? "bg-link text-white" : "border border-input bg-accent text-foreground")}>
        <CaretUpIcon weight="bold" className="size-3" />
        {hot ? <NumberTicker value={votes} startValue={votes - 9} /> : votes}
      </div>
    </div>
  );
}

const columns = [
  ["Planned", "bg-status-planned", ["Slack notifications", "CSV export"]],
  ["In progress", "bg-status-progress", ["Merge duplicates"]],
  ["Shipped", "bg-status-shipped", ["Dark mode widget"]],
] as const;

// Template bento: Framed, SectionHeader, grid md:grid-cols-2 overflow-hidden,
// each cell min-h 500 with a hairline top and left that run off-screen,
// art area clipped at 400, then title + description in p-6.
export function Bento() {
  return (
    <Framed>
      <SectionHeader title="Small tool. Whole loop." sub="Four things a feedback board has to get right. Nothing else." />
      <div className="grid grid-cols-1 overflow-hidden md:grid-cols-2">
        <Cell title="Votes that rank the inbox" desc="One vote per user, no anonymous pile-ons unless you allow it. The board sorts itself.">
          <div className="relative w-full max-w-[440px]">
            <AnimatedList delay={1600} className="w-full">
              {inboxRows.map((r) => (
                <PostRow key={r.title} {...r} />
              ))}
            </AnimatedList>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background to-transparent" />
          </div>
        </Cell>
        <Cell title="Close the loop" desc="Publish what shipped, link the posts, and every voter gets told. That is the whole point.">
          <div className="w-full max-w-[440px] rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center rounded-full bg-status-shipped text-[#0d0d0f]">
                <CheckIcon weight="bold" className="size-3" />
              </span>
              <span className="text-[15px] font-medium">This week: widget dark mode, merge, Slack alerts</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">Three shipped requests, 268 votes between them. Linked below.</p>
            <div className="mt-3 flex gap-2">
              {["Dark mode", "Merge", "Slack"].map((t) => (
                <span key={t} className="rounded-md border border-border bg-background px-2 py-0.5 text-[12px] text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 font-mono text-[12px] text-status-shipped">
              <PaperPlaneTiltIcon className="size-3.5" />
              Published · 128 voters notified
            </div>
          </div>
        </Cell>
        <Cell title="A roadmap that stays honest" desc="Statuses are data. Drag a card and the board, the roadmap and the changelog agree.">
          <div className="grid w-full max-w-[480px] grid-cols-3 gap-2 md:gap-3">
            {columns.map(([name, dot, cards]) => (
              <div key={name} className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground md:gap-2 md:text-[12px]">
                  <span className={cn("size-2 rounded-full", dot)} />
                  {name}
                </div>
                {cards.map((c) => (
                  <div key={c} className={cn("rounded-lg border bg-card p-2 text-[12px] font-medium md:p-3 md:text-[13px]", name === "Shipped" ? "border-status-shipped/60" : "border-border")}>
                    {c}
                    <div className="mt-1 font-mono text-[10px] font-normal text-faint md:mt-1.5 md:text-[11px]">▲ {c.length * 7}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Cell>
        <Cell title="Ask it from Claude or Cursor" desc="API keys, an HTTP API and an MCP server. Your agent reads the top requests before you plan a sprint.">
          <Terminal title="claude" className="max-w-[440px]">
            <TypingAnimation delay={200}>› What are the top requests from paying users?</TypingAnimation>
            <AnimatedSpan delay={1800} className="pl-4 text-link">└ openheard.listPosts sort=top segment=paying</AnimatedSpan>
            <AnimatedSpan delay={2300} className="text-muted-foreground">● 1. Dark mode for the widget · 128</AnimatedSpan>
            <AnimatedSpan delay={2600} className="text-muted-foreground">● 2. Merge duplicates · 86</AnimatedSpan>
            <AnimatedSpan delay={2900} className="text-muted-foreground">● 3. Slack status alerts · 54</AnimatedSpan>
          </Terminal>
        </Cell>
      </div>
    </Framed>
  );
}

function Cell({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[400px] flex-col items-start justify-end p-0.5 md:min-h-[520px] before:absolute before:top-0 before:-left-0.5 before:z-10 before:h-screen before:w-px before:bg-border before:content-[''] after:absolute after:-top-0.5 after:left-0 after:z-10 after:h-px after:w-screen after:bg-border after:content-['']">
      <div className="relative flex size-full h-full max-h-[320px] flex-1 items-center justify-center overflow-hidden p-4 md:max-h-[380px] md:p-6">{children}</div>
      <div className="flex flex-col gap-2 p-6">
        <h3 className="text-lg font-semibold tracking-tighter">{title}</h3>
        <p className="text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- loop */

const moments = [
  ["01", "Post", "Submission acknowledged. The author gets a link to follow."],
  ["02", "Vote", "Status changes reach every voter, not just the author."],
  ["03", "Ship", "The changelog entry links the request. Voters are told."],
  ["04", "Return", "Weekly digest of new ideas brings them back to vote again."],
];

export function Loop() {
  return (
    <Framed>
      <div className="grid divide-y divide-border md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:divide-x md:divide-y-0">
        <div className="flex flex-col gap-4 p-6">
          <Eyebrow>The loop</Eyebrow>
          <h2 className="max-w-[20ch] text-3xl font-medium tracking-tighter text-balance md:text-4xl">Feedback tools go quiet after collection.</h2>
          <div className="flex max-w-[60ch] flex-col gap-4 leading-relaxed text-pretty text-muted-foreground">
            <p>A user writes an idea, it lands in a dashboard, and that is the last they hear. openheard treats every post as the start of a loop, not the end of one.</p>
            <p>When someone votes, they hear about it. When it moves to Planned, they hear about it. When it ships, they get the changelog entry that says so, with their request linked.</p>
            <p>None of it is configured. Turn the board on and the loop runs the same day.</p>
          </div>
        </div>
        <div className="flex flex-col p-6" role="list">
          {moments.map(([n, t, d], i) => (
            <div key={n} role="listitem" className={cn("flex gap-5 py-5 first:pt-0 last:pb-0", i < moments.length - 1 && "border-b border-border")}>
              <span className="pt-0.5 font-mono text-[13px] text-link">{n}</span>
              <div>
                <p className="text-[16px] font-medium">{t}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Framed>
  );
}

/* ------------------------------------------------------------------- own */

const own = [
  ["One command on Cloudflare", "A Worker and a D1 database on the free tier. Point a domain at it and you have a board."],
  ["SQLite or D1, nothing else", "No Postgres, no Redis, no queue. One Worker, one database, your domain."],
  ["AGPL-3, fork it", "Read every line. Change what you want. Running it for your own users is always free."],
  ["Cloud when you want it", "Same code, we host it. Move between the two with a CSV."],
];

const OWN_ADVANCE_MS = 5000;

export function Own() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number>(0);

  const advance = useCallback(() => {
    setActive((i) => (i + 1) % own.length);
    setProgress(0);
    startRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (paused) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    startRef.current = Date.now() - progress * OWN_ADVANCE_MS;

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(elapsed / OWN_ADVANCE_MS, 1);
      setProgress(p);
      if (p >= 1) {
        advance();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, active, advance, progress]);

  const select = (i: number) => {
    setActive(i);
    setProgress(0);
    startRef.current = Date.now();
  };

  return (
    <section id="own" className="relative flex w-full scroll-mt-16 flex-col items-center justify-center gap-5">
      <SectionHeader title="Self-host is not a trial. It is the full product, forever." />
      <div className="grid w-full items-center gap-6 px-4 pb-10 md:grid-cols-[400px_1fr] md:gap-10 md:px-6" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="flex flex-col">
          {own.map(([t, d], i) => (
            <button key={t} type="button" onClick={() => select(i)} className={cn("relative flex flex-col gap-1 overflow-hidden rounded-lg px-4 py-3 text-left transition-colors md:px-5 md:py-4", active === i ? "bg-secondary/60" : "hover:bg-accent/40")}>
              {active === i && (
                <div className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-link" style={{ height: `${progress * 100}%`, transition: paused ? "none" : undefined }} />
              )}
              <span className={cn("text-[15px] font-medium", active === i ? "text-foreground" : "text-muted-foreground")}>{t}</span>
              <Collapsible open={active === i}>
                <span className="block pt-1 text-[14px] leading-relaxed text-muted-foreground">{d}</span>
              </Collapsible>
            </button>
          ))}
        </div>
        <Terminal title="zsh — ~/openheard" className="min-h-[280px] md:min-h-[320px]">
          <TypingAnimation delay={200}>$ bunx openheard deploy</TypingAnimation>
          <AnimatedSpan delay={1600} className="pl-4 text-status-shipped">✓ Worker openheard-acme created</AnimatedSpan>
          <AnimatedSpan delay={2100} className="pl-4 text-status-shipped">✓ D1 database migrated (7 tables)</AnimatedSpan>
          <AnimatedSpan delay={2600} className="pl-4 text-status-shipped">✓ First sign-up becomes admin</AnimatedSpan>
          <AnimatedSpan delay={3200} className="pl-4 text-link">→ https://feedback.acme.com</AnimatedSpan>
        </Terminal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- pricing */

const plans = [
  { name: "Free", price: "$0", per: "/month", desc: "Everything you need to start collecting feedback.", cta: "Start for free", lead: "Included", items: ["Unlimited users and votes", "2 boards, public roadmap and changelog", "3 admins", "openheard.com subdomain", "CSV import and export"] },
  { name: "Pro", price: "$19", per: "/month", desc: "For teams that ship every week.", cta: "Start free trial", primary: true, lead: "Everything in Free, plus", items: ["Unlimited boards and admins", "Custom domain", "Email notifications to voters", "API keys and MCP server", "Image uploads", "Priority support"] },
];

// Template pricing: plain section gap-10 pb-10, SectionHeader, cards in a
// grid with rows [header, button, hr, features], round check circles.
export function Pricing() {
  return (
    <section id="pricing" className="relative flex w-full scroll-mt-16 flex-col items-center justify-center gap-10 pb-10">
      <SectionHeader title="Unlimited users. Every plan." sub="Charging per seat for a feedback tool is backwards. Pay for hosting, never for people." />
      <div className="mx-auto grid w-full max-w-[820px] gap-4 px-6 min-[650px]:grid-cols-2">
        {plans.map((p) => (
          <div key={p.name} className={cn("relative grid h-full grid-rows-[auto_auto_auto_1fr] rounded-xl border", p.primary ? "border-input bg-accent" : "border-border bg-[#f9fafb]/[0.02]")}>
            <div className="flex flex-col gap-4 p-4">
              <p className="text-sm">
                {p.name}
                {p.primary ? <span className="ml-2 inline-flex h-6 w-fit items-center justify-center rounded-full bg-[#4a6ae0] px-2 text-xs font-medium text-white">Popular</span> : null}
              </p>
              <div className="mt-2 flex items-baseline">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">{p.price}</span>
                <span className="ml-2 text-muted-foreground">{p.per}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <Button full size="lg" nativeButton={false} variant={p.primary ? "primary" : "secondary"} render={<Link to="/start" />}>
                {p.cta}
              </Button>
            </div>
            <hr className="border-border" />
            <div className="p-4">
              <p className="mb-4 text-sm text-muted-foreground">{p.lead}</p>
              <ul role="list" className="space-y-3">
                {p.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-sm">
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", p.primary ? "border-border bg-muted-foreground/40" : "border-primary/20")}>
                      <CheckIcon weight="bold" className="size-2.5" />
                    </span>
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <p className="px-6 text-center text-[14px] text-muted-foreground">
        Self-hosting is free forever, no tier, no limits. AGPL-3.{" "}
        <a href="#own" className="text-foreground underline underline-offset-4">
          Deploy on your own Cloudflare account
        </a>
        .
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------- faq */

const faq = [
  ["Is it really free to self-host?", "Yes. AGPL-3 means the code is free to use, modify and deploy. Running it on your own infrastructure for your own users is always free. The licence only asks that you publish changes if you distribute a modified version."],
  ["Can I import my existing board?", "Yes. Export a CSV from your current tool and drop it into Settings. Posts, votes, authors and statuses come across in one step."],
  ["What is the stack?", "TanStack Start, Drizzle, SQLite locally and D1 on Cloudflare, Better Auth. One Worker, one database. No Postgres, no Redis, no queue."],
  ["Is there a managed cloud?", "Yes, with a free tier. Same code as self-host. Start in the cloud and move to your own account later with a CSV, or the other way round."],
  ["What does AGPL-3 mean for me?", "Use it, change it, run it. If you distribute a modified version or offer it as a service to others, you publish your changes. Using it for your own product is not that."],
  ["How do I contribute?", "Read CONTRIBUTING.md in the repo. Local setup is one command and takes about two minutes."],
];

// Template FAQ: plain section gap-10 pb-10, max-w-3xl px-10, each row a
// bordered bg-accent pill, answer in a matching box under it.
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative flex w-full flex-col items-center justify-center gap-10 pb-10">
      <SectionHeader title="Frequently asked, plainly answered." sub="Everything else is in the docs and the README." />
      <div className="mx-auto grid w-full max-w-3xl gap-2 px-6 md:px-10">
        {faq.map(([q, a], i) => (
          <div key={q} className="grid gap-2">
            <div>
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className={cn("flex w-full cursor-pointer items-center justify-between gap-6 rounded-lg border border-border bg-accent px-4 py-3.5 text-left text-[15px] font-medium", open === i && "ring-2 ring-ring/20")}>
                {q}
                <CaretDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open === i && "rotate-180")} />
              </button>
            </div>
            <Collapsible open={open === i}>
              <div className="rounded-lg border border-border bg-accent p-3 text-[14px] leading-relaxed font-medium text-muted-foreground">{a}</div>
            </Collapsible>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- closing */

// Template CTA: a 400px rounded card with a background, title in the upper
// half, button and subtext pinned at the bottom.
export function Closing() {
  return (
    <section id="cta" className="flex w-full flex-col items-center justify-center">
      <div className="w-full">
        <div className="relative z-20 h-[400px] w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div aria-hidden className="absolute inset-0 [background:radial-gradient(60%_80%_at_50%_0%,rgba(110,139,255,.28),transparent_70%)]" />
          <div className="absolute inset-0 -top-24 flex flex-col items-center justify-center md:-top-40">
            <h2 className="max-w-xs text-center text-3xl font-medium tracking-tighter text-balance md:max-w-xl md:text-7xl">Your users have opinions.</h2>
            <div className="absolute bottom-10 flex flex-col items-center justify-center gap-3">
              <Button size="lg" arrow nativeButton={false} render={<Link to="/start" />}>
                Start for free
              </Button>
              <span className="text-sm text-muted-foreground">Or self-host in one command</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- footer */

const footerCols = [
  ["Product", [["Board", "#product"], ["Agents", "#agents"], ["Pricing", "#pricing"], ["Changelog", "/changelog"]]],
  ["Open source", [["GitHub", GITHUB], ["Contributing", GITHUB + "/blob/main/CONTRIBUTING.md"], ["Security", GITHUB + "/blob/main/SECURITY.md"], ["Licence", GITHUB + "/blob/main/LICENSE"]]],
  ["Legal", [["Privacy", "/privacy"], ["Terms", "/terms"]]],
] as const;

// Template footer: p-10, brand block left (max-w-xs), link columns right,
// then a faded decorative band at the bottom.
export function Footer() {
  return (
    <footer id="footer" className="w-full pb-0">
      <div className="flex flex-col p-6 md:flex-row md:items-center md:justify-between md:p-10">
        <div className="mx-0 flex max-w-xs flex-col items-start justify-start gap-y-5">
          <Link to="/" className="flex items-center gap-2.5 text-xl font-semibold">
            <Logo size={30} />
            openheard
          </Link>
          <p className="font-medium tracking-tight text-muted-foreground">Open source feedback board. Post, vote, roadmap, changelog. Self-host or cloud.</p>
          <p className="font-mono text-[12px] text-muted-foreground">AGPL-3.0 · © {new Date().getFullYear()} openheard</p>
        </div>
        <div className="pt-5 md:w-1/2">
          <div className="flex flex-col items-start justify-start gap-y-5 md:flex-row md:items-start md:justify-between lg:pl-10">
            {footerCols.map(([title, links]) => (
              <ul key={title} role="list" className="flex flex-col gap-y-2">
                <li className="mb-2 text-sm font-semibold">{title}</li>
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-[15px]/snug text-muted-foreground hover:text-foreground">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
      <div className="relative z-0 mt-16 h-40 w-full md:h-56">
        <div className="absolute inset-0 z-10 bg-linear-to-t from-transparent from-40% to-background" />
        <div aria-hidden className="absolute inset-0 mx-6 bg-[size:14px_14px] text-foreground/10 [background-image:radial-gradient(currentColor_1px,transparent_1px)]" />
      </div>
    </footer>
  );
}
