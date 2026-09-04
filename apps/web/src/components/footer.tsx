import { useLoaderData } from "@tanstack/react-router";

export default function Footer() {
  const data = useLoaderData({ from: "__root__" });
  if (data && !data.workspace.poweredBy) return null;
  return (
    <footer className="flex justify-center gap-2 border-t px-6 py-5 text-xs text-muted-foreground">
      <span>
        Powered by{" "}
        <a href="https://github.com/Heilonng23/openheard" className="text-link hover:text-link/80">
          openheard
        </a>
      </span>
      <span className="text-border">·</span>
      <span>open source, self-hosted</span>
    </footer>
  );
}
