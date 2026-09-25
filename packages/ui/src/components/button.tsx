import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@openheard/ui/lib/utils";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";

// One button. Every variant shares the radius (8px), the heights (30 / 34 /
// 38) and the horizontal padding, so buttons line up wherever they sit. The
// primary variant can carry a static inset arrow square: a hugging button
// keeps its label left of the arrow, a full-width one centres the label and
// mirrors the arrow slot on the left so it sits in the true middle. Widths
// never change on hover or press.
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-lg text-[13px] font-semibold whitespace-nowrap select-none outline-none transition-[transform,background-color] duration-100 ease-out focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "bg-white text-[#0d0d0f] shadow-[inset_0_-1px_0_rgba(0,0,0,.14),0_1px_2px_rgba(0,0,0,.4)] hover:bg-[#f4f4f6] active:bg-[#e8e8ec] dark:bg-white",
        secondary:
          "border border-input bg-accent text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.08)] hover:bg-[color-mix(in_oklch,var(--accent),white_4%)] hover:text-foreground active:bg-[color-mix(in_oklch,var(--accent),black_8%)] aria-expanded:text-foreground",
        outline: "border border-border bg-transparent text-muted-foreground hover:border-input hover:bg-accent/60 hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/40",
        link: "h-auto rounded-none p-0 text-link underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-[30px] px-3 text-xs",
        default: "h-[34px] px-3.5",
        lg: "h-[38px] px-4 rounded-lg",
        icon: "size-[34px] px-0",
        "icon-sm": "size-[30px] px-0",
      },
      arrow: {
        true: "",
        false: "",
      },
      full: {
        true: "w-full",
        false: "",
      },
    },
    compoundVariants: [
      { arrow: true, size: "sm", className: "pr-[34px]" },
      { arrow: true, size: "default", className: "pr-[38px]" },
      { arrow: true, size: "lg", className: "pr-[42px]" },
      { arrow: true, full: true, size: "sm", className: "pl-[34px]" },
      { arrow: true, full: true, size: "default", className: "pl-[38px]" },
      { arrow: true, full: true, size: "lg", className: "pl-[42px]" },
    ],
    defaultVariants: { variant: "primary", size: "default", arrow: false, full: false },
  },
);

const arrowBox = cva(
  "pointer-events-none absolute top-1 right-1 bottom-1 z-10 grid place-items-center rounded-md transition-colors duration-150",
  {
    variants: {
      variant: {
        primary: "bg-black/[.08] shadow-[inset_0_1px_1px_rgba(0,0,0,.12)] group-hover/button:bg-black/[.11]",
        secondary: "bg-white/[.06] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]",
        outline: "bg-accent",
        ghost: "bg-accent",
        destructive: "bg-destructive/15",
        link: "hidden",
      },
      size: {
        sm: "w-[22px]",
        default: "w-[26px]",
        lg: "w-[30px]",
        icon: "hidden",
        "icon-sm": "hidden",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

function Button({ className, variant = "primary", size = "default", arrow = false, full = false, children, ...props }: ButtonProps) {
  const withArrow = !!arrow && size !== "icon" && size !== "icon-sm" && variant !== "link";
  return (
    <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, arrow: withArrow, full: !!full }), withArrow && !full && "justify-start", className)} {...props}>
      {withArrow ? (
        <>
          <span>{children}</span>
          <i aria-hidden className={arrowBox({ variant, size })}>
            <ArrowRightIcon weight="bold" className="size-[13px]" />
          </i>
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
