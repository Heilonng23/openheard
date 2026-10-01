import { CheckIcon, FileTextIcon, ImageIcon, RocketIcon, XIcon } from "@phosphor-icons/react";

import { cn } from "@openheard/ui/lib/utils";
import { BlurFade } from "./magic/blur-fade";
import { Eyebrow, Framed, SectionHeader, Shot } from "./shared";

/* --------------------------------------------------------------- surfaces */

// The places feedback reaches beyond the board: the widget in your own app,
// the help center, and images on posts and comments. Widget leads with a real
// screenshot; the other two are small mocks of the actual UI, like the bento.

const widgetPoints = ["One script tag, about 6 KB, works on any site", "Theme, accent, launcher, position, corners and tabs", "Limit it to your own sites, sign-in tokens expire in 12 hours"];
const helpPoints = ["Collections with icons, search, popular and related", "Readers mark an article helpful or not", "Matching articles show up before someone posts"];
const uploadPoints = ["Paste, drop or pick up to four images", "PNG, JPEG, GIF or WebP, 5 MB each", "Click any image to open it full size"];

export function Surfaces() {
  return (
    <Framed id="widget">
      <SectionHeader title="Put the board inside your app." sub="A widget for feedback, the roadmap and what's new, plus a help center that answers questions before they become posts." />
      <div className="grid divide-y divide-border border-b border-border md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:divide-x md:divide-y-0">
        <div className="flex flex-col justify-center gap-2 p-6">
          <Eyebrow className="mb-1">Widget</Eyebrow>
          <h3 className="text-lg font-semibold tracking-tighter text-balance">Feedback without leaving your product.</h3>
          <p className="max-w-[46ch] text-pretty text-muted-foreground">Users vote, post and read the changelog from a panel in the corner. A dot on the launcher tells them something new shipped.</p>
          <Points items={widgetPoints} />
        </div>
        <div className="overflow-hidden p-4 md:p-6">
          <BlurFade inView>
            <Shot src="/landing/widget.png" alt="openheard widget open over a web app, showing the Feedback tab with posts ranked by votes" className="aspect-[3/2]" />
          </BlurFade>
        </div>
      </div>
      <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        <Card eyebrow="Help center" title="Answer it once." sub="Write guides in markdown and publish them at /help." points={helpPoints}>
          <HelpMock />
        </Card>
        <Card eyebrow="Images" title="Show, don't describe." sub="Screenshots on posts and comments, from the board or the dashboard." points={uploadPoints}>
          <UploadMock />
        </Card>
      </div>
    </Framed>
  );
}

function Points({ items }: { items: string[] }) {
  return (
    <ul role="list" className="mt-2 flex flex-col gap-2 text-[14px] text-muted-foreground">
      {items.map((pt) => (
        <li key={pt} className="flex items-start gap-2.5">
          <CheckIcon weight="bold" className="mt-1 size-3.5 shrink-0 text-link" />
          {pt}
        </li>
      ))}
    </ul>
  );
}

function Card({ eyebrow, title, sub, points, children }: { eyebrow: string; title: string; sub: string; points: string[]; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-[260px] items-center justify-center overflow-hidden p-4 md:min-h-[300px] md:p-6">{children}</div>
      <div className="flex flex-col gap-2 p-6 pt-0">
        <Eyebrow className="mb-1">{eyebrow}</Eyebrow>
        <h3 className="text-lg font-semibold tracking-tighter text-balance">{title}</h3>
        <p className="max-w-[46ch] text-pretty text-muted-foreground">{sub}</p>
        <Points items={points} />
      </div>
    </div>
  );
}

// The new-post dialog as someone types: help articles that match appear under
// the title, the same "From the help center" list the real dialog shows.
function HelpMock() {
  const hits = [
    { title: "How voting works", col: "Getting started" },
    { title: "Post your first idea", col: "Getting started" },
  ];
  return (
    <div className="w-full max-w-[420px] rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3.5 text-[15px] font-medium">
        Let people vote more than once<span aria-hidden className="ml-px inline-block h-4 w-px translate-y-0.5 bg-foreground motion-safe:animate-pulse" />
      </div>
      <div className="flex flex-col gap-1 px-4 pt-2 pb-3">
        <div className="pt-1 pb-1.5 text-xs font-medium text-muted-foreground">From the help center</div>
        {hits.map((h) => (
          <div key={h.title} className="flex min-h-11 items-center gap-2.5 rounded-lg bg-secondary px-2.5 py-2 text-[13px]">
            <FileTextIcon className="size-4 shrink-0 text-faint" />
            <span className="flex-1 truncate">{h.title}</span>
            <span className="hidden shrink-0 items-center gap-1 text-[11px] text-faint min-[420px]:inline-flex">
              <RocketIcon className="size-3" />
              {h.col}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A comment composer with two screenshots attached, like the draft tray.
function UploadMock() {
  return (
    <div className="w-full max-w-[420px] rounded-xl border border-border bg-card p-4">
      <p className="text-[14px] leading-relaxed text-muted-foreground">The export button is cut off on small screens, see the second one.</p>
      <div className="mt-3 flex gap-2">
        <Thumb />
        <Thumb crop />
        <div className="flex size-20 items-center justify-center rounded-lg border border-dashed border-input text-faint">
          <ImageIcon className="size-5" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[12px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <ImageIcon className="size-3.5 text-link" />
          Paste or drop images
        </span>
        <span className="tabular-nums">2 of 4</span>
      </div>
    </div>
  );
}

// A tiny drawn screenshot: header bar, two rows, one with a voted pill.
function Thumb({ crop }: { crop?: boolean }) {
  return (
    <div className="relative size-20 overflow-hidden rounded-lg border border-input bg-background p-2">
      <div className="h-1.5 w-8 rounded-full bg-foreground/20" />
      <div className={cn("mt-2 flex items-center gap-1.5", crop && "translate-x-3")}>
        <div className="flex-1 space-y-1">
          <div className="h-1 w-full rounded-full bg-foreground/15" />
          <div className="h-1 w-2/3 rounded-full bg-foreground/10" />
        </div>
        <div className="h-4 w-3 rounded-sm bg-link" />
      </div>
      <div className="mt-2 space-y-1">
        <div className="h-1 w-full rounded-full bg-foreground/15" />
        <div className="h-1 w-1/2 rounded-full bg-foreground/10" />
      </div>
      <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-background/80 text-muted-foreground">
        <XIcon className="size-2.5" />
      </span>
    </div>
  );
}
