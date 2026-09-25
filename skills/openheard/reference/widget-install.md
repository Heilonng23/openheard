# Installing the widget in a codebase

Always get the tag from `get_widget_snippet`: the `src` is the workspace's own `widget.js`. Add it once, in the file that wraps every page.

| Framework | Detect by | File | How |
|-----------|-----------|------|-----|
| Next.js App Router | `next` in package.json, `app/layout.tsx` exists | `app/layout.tsx` | `import Script from "next/script"`, then `<Script src="..." strategy="afterInteractive" />` as the last child of `<body>` |
| Next.js Pages Router | `pages/_app.tsx` exists | `pages/_app.tsx` | Same `<Script>` next to `<Component {...pageProps} />` |
| Nuxt | `nuxt` in package.json | `nuxt.config.ts` | `app.head.script: [{ src, async: true, tagPosition: "bodyClose" }]`, merged into any existing array |
| React or Vue on Vite | `vite` plus `react` or `vue` | `index.html` | Plain `<script src="..." async></script>` before `</body>` |
| Create React App | `react-scripts` | `public/index.html` | Same, before `</body>` |
| Astro, SvelteKit, Remix | their config file | Root layout (`src/layouts/*.astro`, `src/app.html`, `app/root.tsx`) | Plain tag before `</body>` |
| Plain HTML, templates | no package.json | Shared footer or every page | Plain tag before `</body>` |

Checks after inserting:

- The site's origin is in `allowed_sites` (`get_widget_settings`), or the list is empty. Add `http://localhost:<port>` for local testing.
- The tag appears once. Search the repo for `widget.js` before adding.
- To open it from the product's own button: `<button data-openheard-open="feedback">` or `window.openheard("open", "changelog")`, and set `launcher: "hidden"` if that button is the only way in.
- Look and tabs are changed with `configure_widget`; the snippet never needs editing again.
