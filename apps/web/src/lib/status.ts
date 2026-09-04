import type { Status } from "@openheard/db/schema/feedback";

export const STATUS_ORDER: Status[] = ["review", "planned", "progress", "done", "closed", "open"];

export const STATUS_META: Record<Status, { label: string; dot: string; text: string }> = {
  open: { label: "Open", dot: "bg-muted-foreground/60", text: "text-muted-foreground" },
  review: { label: "Under review", dot: "bg-status-review", text: "text-status-review" },
  planned: { label: "Planned", dot: "bg-status-planned", text: "text-status-planned" },
  progress: { label: "In progress", dot: "bg-status-progress", text: "text-status-progress" },
  done: { label: "Shipped", dot: "bg-status-shipped", text: "text-status-shipped" },
  closed: { label: "Closed", dot: "bg-status-closed", text: "text-status-closed" },
};

export const ROADMAP_COLUMNS: Status[] = ["review", "planned", "progress", "done"];
