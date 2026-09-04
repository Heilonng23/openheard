import { Skeleton } from "@openheard/ui/components/skeleton";

// Loading is a skeleton that matches the layout, never a lone spinner.
export default function Loader() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 pt-8">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
