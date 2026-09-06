import { Bento, Closing, Faq, Footer, Loop, Own, Pricing, Products } from "./bottom";
import { Page } from "./shared";
import { Agents, Hero, Nav } from "./top";

// Template page: outer column with rails, navbar inside it, main with one
// hairline between every section.
export function Landing() {
  return (
    <div className="isolate min-h-svh bg-background font-sans text-foreground antialiased">
      <Page>
        <Nav />
        <main className="flex w-full flex-col items-center justify-center divide-y divide-border">
          <Hero />
          <Agents />
          <Products />
          <Bento />
          <Loop />
          <Own />
          <Pricing />
          <Faq />
          <Closing />
          <Footer />
        </main>
      </Page>
    </div>
  );
}
