# openheard design rules

Read this before writing any UI. Every agent run obeys it. When a rule and a
library default disagree, the rule wins. The Pencil frames (Board, Roadmap,
Post, Changelog, New post dialog, Sign in) are the reference; when this file
and the frames disagree, ask.

## Direction

Near-black, white type, blue only where something is active. Familiar
feedback-board structure, our own details: lowercase mono nav,
ranked rows, hairline lists instead of boxed cards, a status timeline on every
post. It should feel like a tool people are happy to vote and comment in, not
an admin panel.

## Tokens (packages/ui/src/styles/globals.css is the source of truth)

- Background `#0d0d0f`, surface `#121214`, raised `#18181b`, hover `#202024`.
- Borders `#1f1f23`, strong `#2a2a30`. Hairlines, barely there.
- Text `#ededf0`, muted `#9a9aa3`, faint `#63636b`.
- Accent blue `#6e8bff`. Used for: the active nav dot, the voted pill fill,
  the "in progress" status, focus rings, links, the team badge. Never as a
  wash, never behind text blocks.
- Primary button is white on black with an inset arrow square on the right.
- Statuses: review `#a99bd6`, planned `#cdb37a`, in progress `#6e8bff`,
  shipped `#7fb894`, closed `#63636b`.
- Light theme mirrors on warm white `#f7f5f0`, same rules.

## Type

- Geist for everything. Geist Mono for the nav, counts, ranks, dates, version
  tags, keyboard hints, section labels (11px, tracked, uppercase).
- Scale: 11 12 13 14 15 18 20 24. Weights 400 500 600.
- Headings get `letter-spacing: -0.02em`.
- Nav labels are lowercase: `board roadmap changelog`.

## Layout

- One 1008px column, centered, on every page. Header content sits on the same
  column as the page.
- Header: mark + wordmark, hairline divider, mono nav with a 5px blue dot
  before the active item. Right: search (220px, `/` hint), avatar.
- Board: feed (720) + rail (240). Rail holds only: "Post idea" button, boards
  with counts, roadmap counts. No filter sidebar, no tags panel.
- Roadmap: four hairline columns, full width, no rail: Under review, Planned,
  In progress, Shipped.
- Post: feed + rail. Rail holds: voters stack, details, copy link.
- Changelog: date and version rail on the left of each entry, "shipped from"
  chips linking back to posts, subscribe box in the rail.
- Footer: keyboard hints centered, "powered by openheard" beside them.

## Components

- Vote pill: 48x56, vertical, caret + mono count, on the RIGHT of the row.
  Voted: blue fill, near-black text, soft blue glow. This is the signature.
- Post row: mono rank (`01`) at left on Trending, title 15/600, one-line
  excerpt, meta row (status dot + label, comment count, author, age).
- Status chip: dot + label, tinted background of the status colour at 10%.
- Timeline: four steps with a hairline between them, current step has a glow.
- Buttons: primary is white with the inset arrow; secondary is raised with a
  1px inner top highlight. Pressed state translates 1px and darkens.

## Interactions

- Every click responds under 100ms. Votes are optimistic.
- Transitions 150 to 250ms, ease-out in, ease-in out. Nothing bounces.
- Hover is a one-shade lift, not a colour change.
- Keyboard: `j` `k` move, `v` vote, `enter` open, `/` search, `c` new post,
  `cmd+enter` submit, `esc` close. Hints are visible in the footer.
- Respect `prefers-reduced-motion`.
- Loading is a skeleton matching the layout. Errors sit next to the thing
  that failed. Empty states say what to do next in one line.

## Copy

- Lowercase product name: openheard. Sentences, not labels. No exclamation
  marks. No emoji. Demo data uses real-sounding posts.

## Banned

Inter, gradients as decoration, glow behind text, glassy blur panels, a card
around every element, cards with a coloured left border, feature grids, a
shadow and a border on the same element, spinners centred in empty space,
purple anything, Lucide icons, emoji as icons, Claude in git history.
