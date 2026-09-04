# openheard design rules

Read this before writing any UI. Every agent run obeys it. When a rule and a
library default disagree, the rule wins.

## Direction

Black and white, blue as a whisper. The finish of Linear, Stripe, Vercel:
restraint, density where the work is, air where the reading is. It should
look like a product a team paid for, not an admin template.

## Tokens (packages/ui/src/styles/globals.css is the source of truth)

- Background `#0d0d0f`, cards `#121214`, raised `#18181b`, hover `#202024`.
- Borders `#1f1f23`, strong `#2a2a30`. Borders are barely visible on purpose.
- Text `#ededf0`, muted `#9a9aa3`, faint `#63636b`.
- Accent blue `#6e8bff`. Only for: links, focus rings, the logo mark, the
  "in progress" status. Never as a button fill, never as a big splash.
- Primary action is white on black. The active vote pill is white.
- Statuses, all muted: review `#a99bd6`, planned `#cdb37a`,
  in progress `#6e8bff`, shipped `#7fb894`, closed `#63636b`.
- Light theme mirrors this on warm white `#f7f5f0`; same accent, same rules.

## Type

- Geist for everything. Geist Mono for counts, IDs, keyboard hints, labels.
- Scale: 12 13 14 16 20 24 30. Weights: 400 and 600 only.
- Headings get `letter-spacing: -0.02em`. Body stays at 0.
- Under 13px is meta only, never something the user must read.
- No italics. No serif.

## Spacing and shape

- Scale: 4 8 12 16 24 32 48. Nothing in between.
- Radius: 6px controls, 8px inputs, 12px cards. Pills are 999px. Not 8px
  on everything.
- One surface treatment per element: a border OR a shadow, not both.
  Cards use a border. Popovers use a shadow.

## Layout

- The board is a dense list, not a card grid. Vote pill, title, one-line
  excerpt, status dot, comment count, tags.
- Admins see the public pages with an inline control strip per post.
  There is no separate admin dashboard.
- Settings is one compact area with a left nav. Eight sections maximum.

## Interactions

- Every click responds under 100ms. Votes update optimistically and sync
  after.
- Transitions 150 to 250ms. `ease-out` entering, `ease-in` leaving. Nothing
  bounces. Nothing over 400ms.
- Hover is a one-shade background lift, not a color change.
- Keyboard first: `j` `k` move, `v` vote, `enter` open, `/` search,
  `cmd+k` command palette, `esc` closes. Hints are visible, not hidden.
- Signature moment: the vote pill turns white with a small scale pulse and
  the number ticks up. That is the one animation we polish.
- Focus rings are visible and blue.
- Loading is a skeleton matching the layout. Never a lone spinner.
- Errors sit next to the thing that failed and say what to do.
- Empty states say what to do next, in one line, with the action.

## Copy

- Lowercase product name: openheard.
- Sentences, not labels with colons. No exclamation marks. No emoji.
- Demo data uses real-sounding posts, never lorem ipsum or Acme.

## Slop tells (banned)

Inter, gradients as decoration, glow behind text, glassy blur panels,
cards with a colored left border, three-column icon rows, feature grids of
four, "supercharge" style headlines, a shadow and a border on the same
element, emoji in UI, spinners centered in empty space, purple anything.

## Icons

Phosphor, regular weight at 16px in controls, 20px in navigation. Never
Lucide, never emoji as icons.
