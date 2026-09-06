import type { Icon } from "@phosphor-icons/react";
import {
  CaretDownIcon,
  CaretUpIcon,
  ChatCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleDashedIcon,
  CircleHalfIcon,
  CircleIcon,
  DotsSixVerticalIcon,
  FunnelSimpleIcon,
  PlusIcon,
  SortAscendingIcon,
  SpinnerGapIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Panel } from "@/components/admin/panel";
import { listRoadmapAdmin } from "@/functions/admin";
import { setStatus } from "@/functions/posts";
import { KIND_ICON, roadmapStatuses, useStatuses } from "@/lib/status";
import type { StatusInfo } from "@/lib/status";
import { cn } from "@openheard/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@openheard/ui/components/dropdown-menu";

type Search = { sort?: "top" | "new"; board?: string };

export const Route = createFileRoute("/dashboard/roadmap")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    sort: s.sort === "new" ? "new" : undefined,
    board: typeof s.board === "string" ? s.board : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    return listRoadmapAdmin({ data: { sort: deps.sort ?? "top", board: deps.board } });
  },
  head: () => ({ meta: [{ title: "Roadmap · openheard" }] }),
  component: Roadmap,
});

const GLYPH: Record<(typeof KIND_ICON)[keyof typeof KIND_ICON], Icon> = {
  "circle-dashed": CircleDashedIcon,
  circle: CircleIcon,
  "circle-half": CircleHalfIcon,
  "spinner-gap": SpinnerGapIcon,
  "check-circle": CheckCircleIcon,
  "x-circle": XCircleIcon,
};

type PostItem = Awaited<ReturnType<typeof listRoadmapAdmin>>[number];

const collisionDetection: CollisionDetection = (args) => {
  const pw = pointerWithin(args);
  if (pw.length > 0) return pw;
  return closestCorners(args);
};

const SORT_TRANSITION = { duration: 180, easing: "cubic-bezier(0.25,1,0.5,1)" };
const NO_TRANSITION = { duration: 0, easing: "linear" };

function Roadmap() {
  const serverPosts = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/roadmap" });
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const statuses = useStatuses();
  const columns = roadmapStatuses(statuses);
  const sort = search.sort ?? "top";

  const [posts, setPosts] = useState(serverPosts);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragOriginalStatus = useRef<string | null>(null);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Sync when loader data changes (sort/filter changed)
  const [prevServer, setPrevServer] = useState(serverPosts);
  if (serverPosts !== prevServer) {
    setPrevServer(serverPosts);
    setPosts(serverPosts);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const grouped = useCallback(
    (col: StatusInfo) => posts.filter((p) => p.status === col.key),
    [posts],
  );

  function onDragStart(e: DragStartEvent) {
    const id = e.active.id as number;
    setDraggingId(id);
    const post = posts.find((p) => p.id === id);
    if (post) dragOriginalStatus.current = post.status;
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id as number;
    const overType = over.data.current?.type;

    let targetStatus: string;
    if (overType === "column") {
      targetStatus = String(over.id);
    } else {
      const overPost = posts.find((p) => p.id === over.id);
      if (!overPost) return;
      targetStatus = overPost.status;
    }

    setPosts((prev) => {
      const activePost = prev.find((p) => p.id === activeId);
      if (!activePost) return prev;

      const sameColumn = activePost.status === targetStatus;

      if (sameColumn) {
        if (overType !== "column" && typeof over.id === "number") {
          const oldIdx = prev.findIndex((p) => p.id === activeId);
          const newIdx = prev.findIndex((p) => p.id === over.id);
          if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            return arrayMove(prev, oldIdx, newIdx);
          }
        }
        return prev;
      }

      const updated = prev.map((p) => (p.id === activeId ? { ...p, status: targetStatus } : p));

      if (overType !== "column" && typeof over.id === "number") {
        const oldIdx = updated.findIndex((p) => p.id === activeId);
        const newIdx = updated.findIndex((p) => p.id === over.id);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          return arrayMove(updated, oldIdx, newIdx);
        }
      }

      return updated;
    });
  }

  async function onDragEnd(_e: DragEndEvent) {
    const postId = draggingId;
    const originalStatus = dragOriginalStatus.current;
    setDraggingId(null);
    dragOriginalStatus.current = null;

    if (postId == null || originalStatus == null) return;

    const post = posts.find((p) => p.id === postId);
    if (!post || post.status === originalStatus) return;

    const newStatus = post.status;
    try {
      await setStatus({ data: { postId, status: newStatus } });
      await router.invalidate();
    } catch (err) {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: originalStatus } : p)));
      toast.error(err instanceof Error ? err.message : "Could not move post");
    }
  }

  const draggingPost = draggingId != null ? posts.find((p) => p.id === draggingId) : null;

  return (
    <Panel
      title="Roadmap"
      actions={
        <span className="hidden text-[13px] text-faint lg:inline">
          Drag cards between columns to change status
        </span>
      }
    >
      <div className="flex flex-col gap-0 h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-5 pt-3 pb-2.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground">
              <SortAscendingIcon className="size-3.5" />
              {sort === "top" ? "Most votes" : "Newest"}
              <CaretDownIcon className="size-2.5 text-faint" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-36">
              {(["top", "new"] as const).map((s) => (
                <DropdownMenuItem key={s} onClick={() => navigate({ search: (p) => ({ ...p, sort: s === "top" ? undefined : s }) })}>
                  {s === "top" ? "Most votes" : "Newest"}
                  {sort === s ? <CheckIcon weight="bold" className="ml-auto size-3" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] outline-none hover:bg-accent hover:text-foreground", search.board ? "text-foreground" : "text-muted-foreground")}>
              <FunnelSimpleIcon className="size-3.5" />
              Filter
              <CaretDownIcon className="size-2.5 text-faint" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuLabel className="text-[11px] tracking-[0.06em] text-faint uppercase">Board</DropdownMenuLabel>
              {root.boards.map((b) => (
                <DropdownMenuItem key={b.id} onClick={() => navigate({ search: (p) => ({ ...p, board: p.board === b.id ? undefined : b.id }) })}>
                  <span className="flex-1">{b.name}</span>
                  {search.board === b.id ? <CheckIcon weight="bold" className="size-3" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex-1" />
        </div>

        {/* Kanban columns */}
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <div className="flex flex-1 gap-0 overflow-x-auto px-5 pb-5">
            {columns.map((col) => {
              const items = grouped(col);
              return <Column key={col.key} status={col} items={items} navigate={navigate} motionOk={!reducedMotion.current} />;
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {draggingPost ? <Card post={draggingPost} overlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </Panel>
  );
}

function Column({
  status,
  items,
  navigate,
  motionOk,
}: {
  status: StatusInfo;
  items: PostItem[];
  navigate: ReturnType<typeof useNavigate>;
  motionOk: boolean;
}) {
  const G = GLYPH[KIND_ICON[status.kind]];
  const filled = status.kind === "done" || status.kind === "closed";

  return (
    <div className="flex min-w-[260px] flex-1 flex-col">
      {/* Column header */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <G weight={filled ? "fill" : "regular"} className="size-4 shrink-0" style={{ color: status.color }} />
        <span className="text-[14px] font-semibold">{status.label}</span>
        <span className="text-[13px] text-faint tabular-nums">{items.length}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard/inbox", search: { status: status.key } })}
          className="inline-flex size-6 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground"
          title={`New post in ${status.label}`}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      {/* Droppable area */}
      <DroppableColumn statusKey={status.key}>
        <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {items.map((p) => (
            <SortableCard key={p.id} post={p} motionOk={motionOk} />
          ))}
        </SortableContext>
        {items.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8 text-[13px] text-faint">
            Nothing {status.label.toLowerCase()} yet
          </div>
        ) : null}
      </DroppableColumn>
    </div>
  );
}

function DroppableColumn({ statusKey, children }: { statusKey: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useSortable({
    id: statusKey,
    data: { type: "column" },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-1 flex-col gap-2 rounded-lg p-2 transition-colors duration-150",
        isOver ? "bg-link/[.08] ring-1 ring-link/30" : "bg-transparent",
      )}
    >
      {children}
    </div>
  );
}

function SortableCard({ post, motionOk }: { post: PostItem; motionOk: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: post.id,
    data: { type: "card", status: post.status },
    transition: motionOk ? SORT_TRANSITION : NO_TRANSITION,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} className="rounded-lg border-2 border-dashed border-link/30 bg-link/[.06]">
        <div className="invisible">
          <Card post={post} />
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab select-none active:cursor-grabbing">
      <Card post={post} />
    </div>
  );
}

function Card({ post, overlay }: { post: PostItem; overlay?: boolean }) {
  return (
    <div
      className={cn(
        "group/card flex flex-col gap-2 rounded-lg border bg-card p-3",
        overlay && "rotate-[2deg] shadow-[0_8px_24px_rgba(0,0,0,.4)] ring-2 ring-link/40",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[14px] font-semibold leading-[1.35]">{post.title}</span>
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-faint opacity-0 group-hover/card:opacity-100">
          <DotsSixVerticalIcon className="size-3.5" />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-md bg-secondary px-2 font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-link" />
          {post.board.name}
        </span>
        {post.commentCount ? (
          <span className="inline-flex items-center gap-1 text-faint">
            <ChatCircleIcon className="size-[11px]" /> {post.commentCount}
          </span>
        ) : null}
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 font-mono text-faint tabular-nums">
          <CaretUpIcon weight="bold" className="size-[9px]" /> {post.voteCount}
        </span>
      </div>
    </div>
  );
}
