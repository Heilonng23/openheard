// Image attachment rules, shared by the composer and the upload route. Pure:
// no server imports, so the browser can check a file before sending it.

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 4;

// What a published attachment looks like to the UI and the API.
export type AttachmentView = { id: string; url: string; contentType: string; width: number | null; height: number | null };

export const attachmentPath = (id: string) => `/uploads/${id}`;

export function toAttachmentView(a: { id: string; contentType: string; width: number | null; height: number | null }, origin = ""): AttachmentView {
  return { id: a.id, url: origin + attachmentPath(a.id), contentType: a.contentType, width: a.width, height: a.height };
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// The sentence shown next to the composer, or null when the file is fine.
export function checkImage(file: { type: string; size: number; name?: string }): string | null {
  const type = file.type.toLowerCase();
  if (type === "image/svg+xml" || /\.svg$/i.test(file.name ?? "")) return "SVG files are not supported. Use PNG, JPEG, GIF or WebP.";
  if (!(IMAGE_TYPES as readonly string[]).includes(type)) return `${file.name ? `${file.name} is not` : "That is not"} an image we accept. Use PNG, JPEG, GIF or WebP.`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name ?? "That image"} is ${formatBytes(file.size)}. Images can be up to ${formatBytes(MAX_IMAGE_BYTES)}.`;
  if (file.size === 0) return `${file.name ?? "That image"} is empty.`;
  return null;
}

export const tooManyImages = () => `Up to ${MAX_IMAGES} images each.`;

// The type the bytes say they are. The browser's Content-Type is a claim; the
// server stores and serves this instead.
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && ascii(b, 0, 6).match(/^GIF8[79]a$/)) return "image/gif";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

function ascii(b: Uint8Array, at: number, len: number) {
  return String.fromCharCode(...b.subarray(at, at + len));
}

// Pixel size from the header alone, so the page can reserve space before the
// image loads. Null when the header is not one we read; that is fine.
export function imageSize(b: Uint8Array, type: ImageType): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (type === "image/png") return ok(v.getUint32(16), v.getUint32(20));
    if (type === "image/gif") return ok(v.getUint16(6, true), v.getUint16(8, true));
    if (type === "image/webp") {
      const chunk = ascii(b, 12, 4);
      if (chunk === "VP8X") return ok(1 + (v.getUint32(24, true) & 0xffffff), 1 + (v.getUint32(27, true) & 0xffffff));
      if (chunk === "VP8 ") return ok(v.getUint16(26, true) & 0x3fff, v.getUint16(28, true) & 0x3fff);
      if (chunk === "VP8L") {
        const bits = v.getUint32(21, true);
        return ok(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff));
      }
      return null;
    }
    // JPEG: walk the segments to the first start-of-frame marker.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return ok(v.getUint16(i + 7), v.getUint16(i + 5));
      i += 2 + v.getUint16(i + 2);
    }
    return null;
  } catch {
    return null;
  }
}

function ok(width: number, height: number) {
  return width > 0 && height > 0 ? { width, height } : null;
}
