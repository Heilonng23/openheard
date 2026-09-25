// Colour parsing and contrast for reading a brand off a website. Pure: no
// server imports, so tests and the browser can use it.

export type Rgb = { r: number; g: number; b: number };

const clamp = (n: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, n));

export function toHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((n) => Math.round(clamp(n)).toString(16).padStart(2, "0")).join("");
}

const NAMED: Record<string, string> = { black: "#000000", white: "#ffffff" };

// Hex, rgb(), hsl(), oklch(), a bare "H S% L%" triplet (a common way to store
// theme colours in CSS variables) and black/white. Anything else, including
// transparent and colours with alpha under a half, is null.
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase().replace(/\s*!important$/, "");
  if (NAMED[s]) return parseColor(NAMED[s]);
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 128) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  m = s.match(/^(rgba?|hsla?|oklch)\((.*)\)$/);
  const parts = (m ? m[2] : s).split(/[\s,/]+/).filter(Boolean);
  const fn = m?.[1] ?? (parts.length === 3 && parts[1].endsWith("%") && parts[2].endsWith("%") ? "hsl" : null);
  if (!fn || parts.length < 3) return null;
  if (parts[3] !== undefined && alpha(parts[3]) < 0.5) return null;
  const num = (p: string) => parseFloat(p);
  if (fn.startsWith("rgb")) {
    const ch = (p: string) => (p.endsWith("%") ? num(p) * 2.55 : num(p));
    const [r, g, b] = parts.slice(0, 3).map(ch);
    return [r, g, b].every(Number.isFinite) ? { r: clamp(r), g: clamp(g), b: clamp(b) } : null;
  }
  if (fn.startsWith("hsl")) {
    const h = num(parts[0].replace(/deg$/, ""));
    const sat = num(parts[1]) / 100;
    const l = num(parts[2]) / 100;
    return [h, sat, l].every(Number.isFinite) ? hslToRgb({ h, s: clamp(sat, 0, 1), l: clamp(l, 0, 1) }) : null;
  }
  // oklch(L C H), L as 0..1 or a percentage.
  const L = parts[0].endsWith("%") ? num(parts[0]) / 100 : num(parts[0]);
  const C = parts[1].endsWith("%") ? (num(parts[1]) / 100) * 0.4 : num(parts[1]);
  const H = (num(parts[2].replace(/deg$/, "")) * Math.PI) / 180;
  if (![L, C, H].every(Number.isFinite)) return null;
  return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H));
}

function alpha(p: string) {
  return p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p);
}

function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const [r, g, bl] = lin.map((c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055));
  return { r: clamp(r), g: clamp(g), b: clamp(bl) };
}

export type Hsl = { h: number; s: number; l: number };

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const k = (n: number) => (n + (((h % 360) + 360) % 360) / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4) };
}

export function luminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// The public board's dark background. The accent fills the voted pill under
// near-black text and colours links on this background, so it has to read
// against it both ways.
export const DARK_UI = { r: 0x0d, g: 0x0d, b: 0x0f };
export const MIN_CONTRAST = 4.5;

// Lightens a colour, keeping its hue, until it reads on the dark UI.
export function readableOnDark(c: Rgb): { color: Rgb; adjusted: boolean } {
  if (contrast(c, DARK_UI) >= MIN_CONTRAST) return { color: c, adjusted: false };
  const hsl = rgbToHsl(c);
  for (let l = hsl.l; l <= 0.95; l += 0.02) {
    const next = hslToRgb({ ...hsl, l });
    if (contrast(next, DARK_UI) >= MIN_CONTRAST) return { color: next, adjusted: true };
  }
  return { color: hslToRgb({ ...hsl, l: 0.95 }), adjusted: true };
}

// Colourful enough to be a brand colour rather than a grey, and neither
// almost black nor almost white.
export function isChromatic(c: Rgb): boolean {
  const { s, l } = rgbToHsl(c);
  return s >= 0.25 && l >= 0.18 && l <= 0.88;
}

export const isDark = (c: Rgb) => luminance(c) < 0.4;
