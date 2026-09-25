// The widget embed and where it goes in common frameworks. The script tag is
// the same everywhere; only the file it lives in changes.

export type Framework = "next" | "react" | "vue" | "nuxt" | "html";

export function widgetSnippet(opts: { src: string; allowedSites: string[]; framework: Framework | "all" }) {
  const { src } = opts;
  const script = `<script src="${src}" async></script>`;
  const examples: Record<Framework, { file: string; code: string; note: string }> = {
    next: {
      file: "app/layout.tsx (App Router) or pages/_app.tsx (Pages Router)",
      code: `import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script src="${src}" strategy="afterInteractive" />
      </body>
    </html>
  );
}`,
      note: "Add the Script line to the existing root layout; do not replace the file. In the Pages Router put the same <Script> inside the component returned by pages/_app.tsx.",
    },
    react: {
      file: "index.html (Vite or Create React App: public/index.html)",
      code: `  <body>
    <div id="root"></div>
    ${script}
  </body>`,
      note: "Put the tag just before </body> in the HTML shell, not inside a component, so it loads once.",
    },
    vue: {
      file: "index.html (Vite)",
      code: `  <body>
    <div id="app"></div>
    ${script}
  </body>`,
      note: "Put the tag just before </body> in the HTML shell.",
    },
    nuxt: {
      file: "nuxt.config.ts",
      code: `export default defineNuxtConfig({
  app: {
    head: {
      script: [{ src: "${src}", async: true, tagPosition: "bodyClose" }],
    },
  },
});`,
      note: "Merge into the existing app.head.script array if there is one.",
    },
    html: {
      file: "every page, or the shared footer/layout template",
      code: `  ${script}
</body>`,
      note: "Paste before the closing </body> tag on every page that should show the launcher.",
    },
  };
  return {
    script,
    ...(opts.framework === "all" ? { examples } : { example: examples[opts.framework] }),
    openFromYourOwnButton: `<button data-openheard-open="feedback">Feedback</button>  or call window.openheard("open", "changelog")`,
    allowedSites: opts.allowedSites.length
      ? `Only these sites may embed it: ${opts.allowedSites.join(", ")}. Add the site with configure_widget allowed_sites if it is missing.`
      : "Any site may embed it. Restrict it with configure_widget allowed_sites once it is live.",
    appearance: "Look and tabs come from configure_widget; the snippet never changes.",
  };
}
