import { MARK_D } from "@/components/mark-path";

// The character alone, no box. Sized by height so it sits level with text next to it.
export default function Logo({ size = 24 }: { size?: number }) {
  const h = size;
  const w = (h * 715) / 501;
  return (
    <span className="inline-flex shrink-0 items-center justify-center text-foreground" style={{ width: w, height: h }} aria-hidden>
      <svg width={w} height={h} viewBox="173 269 715 501" fill="currentColor">
        <g transform="translate(0,1024) scale(0.1,-0.1)">
          <path d={MARK_D} />
        </g>
      </svg>
    </span>
  );
}
