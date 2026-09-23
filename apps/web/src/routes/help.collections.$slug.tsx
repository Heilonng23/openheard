import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { HelpIconBox } from "@/components/help/bits";
import { CollectionNav, HelpLayout, MobileNav, StillStuck } from "@/components/help/layout";
import { ErrorState, HelpArticleSkeleton } from "@/components/states";
import { getHelpCollection } from "@/functions/help";

export const Route = createFileRoute("/help/collections/$slug")({
  loader: async ({ params }) => {
    const data = await getHelpCollection({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { title, description } = loaderData.collection;
    const desc = description ?? `Help articles about ${title.toLowerCase()}.`;
    return {
      meta: [
        { title: `${title} · Help center` },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: CollectionPage,
  errorComponent: ({ error }) => <ErrorState message={(error as Error)?.message} retry="/help" />,
  pendingComponent: HelpArticleSkeleton,
});

function CollectionPage() {
  const { collection, nav } = Route.useLoaderData();
  const n = collection.articles.length;
  return (
    <HelpLayout nav={<CollectionNav nav={nav} collection={collection.slug} />} mobileNav={nav.length ? <MobileNav nav={nav} value={`c:${collection.slug}`} /> : null} rail={<StillStuck />}>
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-mono text-[13px] text-faint lowercase">
        <Link to="/help" className="hover:text-muted-foreground">
          help
        </Link>
        <span aria-hidden>/</span>
        <span className="text-muted-foreground" aria-current="page">
          {collection.title}
        </span>
      </nav>
      <div className="mt-5 flex items-start gap-4 border-b pb-7">
        <HelpIconBox name={collection.icon} className="mt-1 size-10 [&_svg]:size-5" />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-[28px] leading-[1.2] font-semibold tracking-[-0.025em]">{collection.title}</h1>
          {collection.description ? <p className="mt-2 text-[16px] text-muted-foreground">{collection.description}</p> : null}
          <span className="mt-3 font-mono text-[12px] text-faint">
            {n} {n === 1 ? "article" : "articles"}
          </span>
        </div>
      </div>
      {n ? (
        <ul className="flex flex-col">
          {collection.articles.map((a) => (
            <li key={a.id}>
              <Link to="/help/$slug" params={{ slug: a.slug }} className="group/a flex items-center gap-4 border-b py-4">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-semibold tracking-[-0.01em] text-foreground/90 group-hover/a:text-foreground">{a.title}</span>
                  {a.excerpt ? <span className="line-clamp-2 text-[14px] leading-[1.5] text-muted-foreground">{a.excerpt}</span> : null}
                </span>
                <ArrowRightIcon className="size-4 shrink-0 text-faint transition-transform duration-150 group-hover/a:translate-x-0.5 group-hover/a:text-muted-foreground motion-reduce:transition-none" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">Nothing published in this collection yet.</p>
      )}
    </HelpLayout>
  );
}
