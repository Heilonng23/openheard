# openheard widget

The widget puts your board inside your own app. Users get a launcher button in
the corner that opens a panel with three tabs:

- **Feedback**: browse posts, vote, and post a new idea
- **Roadmap**: what is planned and in progress
- **Changelog**: what shipped, with a "new" badge on the launcher when there is
  a release the user has not seen

It works on any site. The copy-paste snippet and a live preview are in the
dashboard under **Settings → Widget**.

## Install

Add one tag before `</body>`:

```html
<script src="https://acme.openheard.com/widget.js" async></script>
```

Use your own workspace address. On a self-hosted install that is the origin
the board runs on, for example `https://feedback.example.com/widget.js`.

The script is under 4 KB gzipped, loads with `async`, and does nothing until
the page has parsed. The panel itself only loads when someone hovers or opens
the launcher.

## Options

Set them as data attributes on the script tag.

| Attribute | Values | Default |
| --- | --- | --- |
| `data-position` | `bottom-right`, `bottom-left` | `bottom-right` |
| `data-accent` | a hex colour, e.g. `#3ecf8e` | the workspace accent |
| `data-launcher` | `false` hides the button | shown |
| `data-open-on-load` | present to open the panel right away | closed |

```html
<script
  src="https://acme.openheard.com/widget.js"
  data-position="bottom-left"
  data-accent="#3ecf8e"
  async
></script>
```

## Open it from your own UI

Any element with `data-openheard-open` opens the widget. Give it a tab name to
land on that tab:

```html
<button data-openheard-open>Feedback</button>
<button data-openheard-open="changelog">What's new</button>
```

Or call the JavaScript API:

```js
window.openheard("open");              // open on the last tab
window.openheard("open", "roadmap");   // feedback | roadmap | changelog
window.openheard("close");
window.openheard("toggle");
```

Calls made before the script has loaded are safe if you queue them:

```html
<script>
  window.openheard = window.openheard || function () {
    (window.openheard.q = window.openheard.q || []).push(arguments);
  };
</script>
```

Escape closes the panel.

## The "new" badge

The loader reads `/widget.json` for the time of the latest published changelog
entry and compares it with the last time this browser opened the Changelog tab,
stored in `localStorage` on your site. If the user has never opened it, entries
from the last 30 days count as new. Opening the Changelog tab clears the badge.

## Signing in

Voting and posting need an account unless the workspace allows anonymous
votes (Settings → Access). Browsers do not send your board's login
cookie to an iframe on another site, so the widget signs in through a small
popup on the board's own domain:

1. The user presses **Continue** in the panel.
2. A popup opens the normal sign-in page (password, magic link or Google).
3. The popup hands the session to the panel and closes itself.

If the user is already signed in to the board, the popup closes at once. The
session is kept in the panel's own storage, which the browser partitions per
embedding site, so it never reaches your page's scripts.

## Security

- `/widget` is the only route that may be framed (`Content-Security-Policy:
  frame-ancestors *`). Every other page, the sign-in popup included, still
  sends `X-Frame-Options: DENY`.
- The loader renders into a closed shadow root, so your styles do not reach
  it and its styles do not reach your page.
- The loader only accepts messages from its own iframe on the board's origin.
  Nothing secret crosses between your page and the panel: only "close",
  "open this tab" and "the changelog was seen".
- `/widget.js` and `/widget.json` are public and readable from any origin.
