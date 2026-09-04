// The mark: a sound wave, the one place besides links the accent lives.
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[7px] bg-primary"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="var(--primary-foreground)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14c3-6 5-6 8 0s5 6 8 0" />
      </svg>
    </span>
  );
}
