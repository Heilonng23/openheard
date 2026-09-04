const units: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.35, "week"],
  [12, "month"],
  [Infinity, "year"],
];

// "2d", "3w": short enough to sit in a meta row.
export function ago(date: Date | number | string): string {
  let diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 45) return "now";
  const short: Record<string, string> = { second: "s", minute: "m", hour: "h", day: "d", week: "w", month: "mo", year: "y" };
  for (const [size, unit] of units) {
    if (diff < size) return `${Math.max(1, Math.round(diff))}${short[unit]}`;
    diff /= size;
  }
  return "";
}

export function longDate(date: Date | number | string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fullDate(date: Date | number | string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
