import type { StatusKind } from "@openheard/db/schema/feedback";
import { useLoaderData } from "@tanstack/react-router";

// A status as the client sees it. Colours are hex from the database, so
// everything renders with inline styles rather than Tailwind classes.
export type StatusInfo = { key: string; label: string; color: string; kind: StatusKind; position: number; onRoadmap: boolean };

export function useStatuses(): StatusInfo[] {
  const root = useLoaderData({ from: "__root__" });
  return root.statuses;
}

export function findStatus(list: StatusInfo[], key: string): StatusInfo {
  return list.find((s) => s.key === key) ?? { key, label: key, color: "#7a7a85", kind: "open", position: 99, onRoadmap: false };
}

export const roadmapStatuses = (list: StatusInfo[]) => list.filter((s) => s.onRoadmap);

// Dashboard glyph per kind, used in the sidebar and the inbox.
export const KIND_ICON: Record<StatusKind, "circle-dashed" | "circle" | "circle-half" | "spinner-gap" | "check-circle" | "x-circle"> = {
  open: "circle-dashed",
  review: "circle",
  planned: "circle-half",
  progress: "spinner-gap",
  done: "check-circle",
  closed: "x-circle",
};

export const KIND_LABEL: Record<StatusKind, string> = {
  open: "New posts land here",
  review: "Being looked at",
  planned: "Committed, not started",
  progress: "Being built",
  done: "Shipped",
  closed: "Will not do, or merged",
};

// Tints for chips: colour at 15 percent over the surface.
export const tint = (hex: string, alpha = 0.15) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
