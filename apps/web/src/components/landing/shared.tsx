import type { ReactNode } from "react";

import { cn } from "@openheard/ui/lib/utils";

// Framing copied from the magicui agent template, measured from its source:
//
//   <div class="max-w-7xl mx-auto border-x relative">      outer column, 1280
//     <div class="absolute left-6 border-l" />              inner rail, 24px in
//     <div class="absolute right-6 border-r" />
//     <main class="divide-y">                                one hairline between sections
//       <section>                                            plain sections: hero, pricing, faq, cta
//       <section class="px-10"><div class="border-x mx-10">  framed sections: inner column, 40+40 inset
//         <div class="absolute -left-14 w-14 stripes" />     striped gutters outside the inner frame
//
// Page = outer column. Framed = inner column with stripes. SectionHeader is
// centred in p-14 with a bottom hairline, as in the template.

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative mx-auto max-w-7xl md:border-x md:border-border", className)}>
      <div aria-hidden className="absolute top-0 left-6 z-10 hidden h-full w-px border-l border-border md:block" />
      <div aria-hidden className="absolute top-0 right-6 z-10 hidden h-full w-px border-r border-border md:block" />
      {children}
    </div>
  );
}

function Stripes({ side }: { side: "left" | "right" }) {
  return <div aria-hidden className={cn("absolute top-0 hidden h-full w-14 bg-[size:10px_10px] text-foreground/5 [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)] md:block", side === "left" ? "-left-14" : "-right-14")} />;
}

export function Framed({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("relative flex w-full scroll-mt-16 flex-col items-center justify-center px-0 md:px-10", className)}>
      <div className="relative w-full border-x border-border md:mx-10">
        <Stripes side="left" />
        <Stripes side="right" />
        {children}
      </div>
    </section>
  );
}

export function SectionHeader({ title, sub, eyebrow, className }: { title: ReactNode; sub?: ReactNode; eyebrow?: string; className?: string }) {
  return (
    <div className={cn("h-full w-full border-b border-border p-6 md:p-14", className)}>
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-2 text-center">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <h2 className="text-3xl font-medium tracking-tighter text-balance md:text-4xl">{title}</h2>
        {sub ? <p className="font-medium text-balance text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("font-mono text-[12px] tracking-[0.1em] text-link uppercase", className)}>{children}</div>;
}

// Product screenshot in a hairline frame. Crops from the top-left so the
// header and first rows of the real app are what you see.
export function Shot({ src, alt = "", className, imgClassName }: { src: string; alt?: string; className?: string; imgClassName?: string }) {
  const webp = src.replace(/\.png$/, ".webp");
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-input bg-card", className)}>
      <picture>
        <source srcSet={webp} type="image/webp" />
        <img src={src} alt={alt} className={cn("block w-full", imgClassName)} loading="lazy" decoding="async" />
      </picture>
    </div>
  );
}
