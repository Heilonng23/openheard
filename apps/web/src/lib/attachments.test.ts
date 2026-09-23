import { describe, expect, it } from "vitest";

import { MAX_IMAGE_BYTES, checkImage, formatBytes, imageSize, sniffImageType, toAttachmentView } from "./attachments";

const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));

// 37x21 images written by ffmpeg, and a 1x1 lossless WebP.
const PNG = bytes("iVBORw0KGgoAAAANSUhEUgAAACUAAAAVCAIAAABOhrD5AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAJklEQVR4nGNkYPjPQEfAQk/LRu0btW/UvlH7Ru0btW/UvlH7qAAApkkBURlg1SEAAAAASUVORK5CYII=");
const JPEG = bytes(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAFQAlAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjgDf0oAAAAAAAAAB/9k=",
);
const GIF = Uint8Array.from([...Buffer.from("GIF89a"), 37, 0, 21, 0, 0, 0, 0]);
const WEBP = bytes("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("checkImage", () => {
  it("accepts the four image types under the cap", () => {
    for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) expect(checkImage({ type, size: 1000, name: "a" })).toBeNull();
  });

  it("rejects SVG by type and by name", () => {
    expect(checkImage({ type: "image/svg+xml", size: 100 })).toMatch(/SVG files are not supported/);
    expect(checkImage({ type: "", size: 100, name: "logo.SVG" })).toMatch(/SVG files are not supported/);
  });

  it("rejects other types with the accepted list", () => {
    expect(checkImage({ type: "application/pdf", size: 100, name: "spec.pdf" })).toBe("spec.pdf is not an image we accept. Use PNG, JPEG, GIF or WebP.");
    expect(checkImage({ type: "image/heic", size: 100 })).toMatch(/Use PNG, JPEG, GIF or WebP/);
  });

  it("rejects files over 5 MB and names the size", () => {
    expect(checkImage({ type: "image/png", size: MAX_IMAGE_BYTES })).toBeNull();
    expect(checkImage({ type: "image/png", size: 10 * 1024 * 1024, name: "shot.png" })).toBe("shot.png is 10 MB. Images can be up to 5 MB.");
  });

  it("rejects empty files", () => {
    expect(checkImage({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
});

describe("sniffImageType", () => {
  it("reads the type from the bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(GIF)).toBe("image/gif");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("refuses SVG, HTML and short input whatever they claim to be", () => {
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<!doctype html><script>1</script>"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("imageSize", () => {
  it("reads dimensions from the header", () => {
    expect(imageSize(PNG, "image/png")).toEqual({ width: 37, height: 21 });
    expect(imageSize(JPEG, "image/jpeg")).toEqual({ width: 37, height: 21 });
    expect(imageSize(GIF, "image/gif")).toEqual({ width: 37, height: 21 });
    expect(imageSize(WEBP, "image/webp")).toEqual({ width: 1, height: 1 });
  });

  it("returns null for a truncated header instead of throwing", () => {
    expect(imageSize(PNG.subarray(0, 18), "image/png")).toBeNull();
    expect(imageSize(JPEG.subarray(0, 40), "image/jpeg")).toBeNull();
  });
});

describe("toAttachmentView", () => {
  it("builds a relative or absolute url", () => {
    const a = { id: "abc", contentType: "image/png", width: 2, height: 1 };
    expect(toAttachmentView(a).url).toBe("/uploads/abc");
    expect(toAttachmentView(a, "https://acme.openheard.com").url).toBe("https://acme.openheard.com/uploads/abc");
  });
});

it("formats sizes the way the errors read", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(2048)).toBe("2 KB");
  expect(formatBytes(10.24 * 1024 * 1024)).toBe("10.2 MB");
});
