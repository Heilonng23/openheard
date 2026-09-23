import { Skeleton } from "@openheard/ui/components/skeleton";

export function ErrorState({ message, retry }: { message?: string; retry?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">{message ?? "An unexpected error occurred."}</p>
      {retry ? (
        <a href={retry} className="mt-1 text-sm font-medium text-link hover:underline">
          Try again
        </a>
      ) : (
        <a href="/" className="mt-1 text-sm font-medium text-link hover:underline">
          Go home
        </a>
      )}
    </div>
  );
}

export function DashboardErrorState({ message, retry }: { message?: string; retry?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 py-3 pr-3">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border bg-background px-6">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message ?? "An unexpected error occurred."}</p>
        {retry ? (
          <a href={retry} className="mt-3 text-sm font-medium text-link hover:underline">
            Try again
          </a>
        ) : (
          <a href="/dashboard" className="mt-3 text-sm font-medium text-link hover:underline">
            Back to dashboard
          </a>
        )}
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1072px] flex-1 flex-col gap-5 px-4 pt-7 pb-6 md:px-8 md:pt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-12">
      <div className="flex flex-col gap-6">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-start gap-6 py-4">
            <Skeleton className="hidden h-4 w-8 md:block" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full max-w-[500px]" />
              <div className="flex gap-3 pt-0.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
            <Skeleton className="h-14 w-12 rounded-lg" />
          </div>
        ))}
      </div>
      <aside className="hidden flex-col gap-6 lg:flex">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
      </aside>
    </div>
  );
}

export function RoadmapSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1072px] flex-1 flex-col gap-6 px-4 pt-7 pb-6 md:px-8 md:pt-10">
      <div className="grid grid-cols-1 gap-7 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2">
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="flex items-start gap-3 border-t py-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-8 w-10 rounded-lg" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PostSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1072px] flex-1 flex-col gap-5 px-4 pt-7 pb-6 md:px-8 md:pt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-12">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-start gap-6">
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-7 w-3/4" />
            <div className="flex gap-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-32" />
            </div>
          </div>
          <Skeleton className="h-16 w-14 rounded-lg" />
        </div>
        <Skeleton className="h-20 w-full max-w-[640px]" />
        <Skeleton className="mt-4 h-px w-full" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
      <aside className="hidden flex-col gap-6 lg:flex">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      </aside>
    </div>
  );
}

export function ChangelogSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1072px] flex-1 flex-col gap-5 px-4 pt-7 pb-6 md:px-8 md:pt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-12">
      <div className="flex flex-col gap-5">
        <div className="flex items-end justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-8 border-b py-7">
            <div className="flex w-24 flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-14 rounded-md" />
            </div>
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
      <aside className="hidden flex-col gap-6 lg:flex">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      </aside>
    </div>
  );
}

export function DashboardShellSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-[#0a0a0b] text-foreground">
      <aside className="hidden w-60 shrink-0 md:block">
        <div className="flex h-full flex-col px-4 pt-3.5 pb-4">
          <Skeleton className="mb-1 h-7 w-28 rounded-md" />
          <div className="flex flex-col gap-1 pt-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
          <div className="flex flex-col gap-1 pt-6">
            <Skeleton className="mb-1 h-3.5 w-16" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        </div>
      </aside>
      <DashboardPanelSkeleton />
    </div>
  );
}

export function DashboardPanelSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col py-3 pr-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b px-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-[30px] w-[220px] rounded-lg" />
        </div>
        <div className="flex flex-col gap-0 p-5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex h-13 items-center gap-3.5 border-b px-0">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-4 w-2/3" />
              <span className="flex-1" />
              <Skeleton className="h-7 w-10 rounded-md" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HelpHomeSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1072px] flex-1 flex-col px-4 md:px-8">
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center pt-14 pb-12 md:pt-20">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-9 w-72" />
        <Skeleton className="mt-4 h-4 w-64" />
        <Skeleton className="mt-8 h-12 w-full rounded-xl" />
        <div className="mt-8 flex w-full flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-3/4" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 border-t md:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex gap-4 border-b py-8 md:px-10 md:first:border-r md:first:pl-0">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HelpArticleSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1072px] flex-1 grid-cols-1 gap-10 px-4 pt-8 pb-10 md:px-8 md:pt-12 lg:grid-cols-[200px_minmax(0,1fr)_200px] lg:gap-12">
      <div className="hidden flex-col gap-3 lg:flex">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-3 w-40" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-4 w-56" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      </div>
      <div className="hidden flex-col gap-3 lg:flex">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}
