import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold">What should we build next?</h1>
      <p className="mt-1 text-muted-foreground">
        Vote on what matters. We read every post and reply on the ones we ship.
      </p>
      <div className="mt-6 rounded-lg border bg-card p-6 text-muted-foreground">
        No posts yet. The board, roadmap and changelog land here next.
      </div>
    </main>
  );
}
