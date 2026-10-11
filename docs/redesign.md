# Redesign plan (branch `redesign`)

Status: **phase 1 (foundations) done; phase 2 (shell) next** (see [Decisions](#decisions)).

Goal: make hivemind feel distinctive, smooth and fun on desktop and mobile while keeping every
behaviour, every privacy rule and the architecture in [AGENTS.md](../AGENTS.md). The redesign is
web-only: no domain, use case, endpoint or contract changes unless a question below says otherwise.

## 1. Audit of the current site

Audited live under `npm run dev` in demo mode, at 1280 px and 375 px, light and dark themes, as
Demo Admin, on the index, a TMDB list, a seeded after-close list, the results page and the editor.

### Navigation and shell

| #   | Finding                                                                                                                                                                                                                                                                                           | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| N1  | **Two menus with no clear split.** "Menu" holds Lists, About, Privacy. The avatar menu holds Roles, Backups (Admin), Download my data, Delete my data, Sign out. Privacy lives in one menu, "my data" in the other; Admin tools hide under the account; "New list" exists only on the index page. | high     |
| N2  | Both `<details>` menus can be open at once, they don't close on an outside click, and they overlap on mobile.                                                                                                                                                                                     | medium   |
| N3  | On mobile the demo banner and the header take ~120 px before any content. The site name wraps against the buttons.                                                                                                                                                                                | medium   |
| N4  | Footer is three paragraphs of small print; Privacy is repeated there and in the menu.                                                                                                                                                                                                             | low      |

### List page (the core experience)

| #   | Finding                                                                                                                                                                                                                                            | Severity |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| L1  | **Horizontal overflow on phones.** The section jump-links ("Rate entries · Leaderboard · Nominate · Full results") overflow: at 360 px the page is 404 px wide. Breaks the "no horizontal scrolling at 320 px" rule; happy-dom tests can't see it. | high     |
| L2  | **The score slider reads as a score of 1 when unrated** (thumb sits at the minimum). "Not rated" is in the accent red, so it looks like an error. A 10-step slider is imprecise by thumb, and dragging while scrolling can save a score.           | high     |
| L3  | Four explanatory paragraphs (context, sort order, results link, progress) before the first entry; "Full results" is linked twice; the scale is repeated in meta and on every card.                                                                 | medium   |
| L4  | Standings are shown twice: on every card ("Rank 1 · 6.3 · 1 vote") and in the sidebar leaderboard.                                                                                                                                                 | medium   |
| L5  | Nominating is a collapsed `<details>` in the sidebar, which on mobile sits below every entry.                                                                                                                                                      | medium   |
| L6  | Header actions misalign on desktop (Edit floats mid-row, Copy member link at the edge). Copy feedback is a paragraph that shifts the layout.                                                                                                       | low      |
| L7  | Seeded entries render an empty `<p class="entry__meta">`.                                                                                                                                                                                          | low      |
| L8  | No sense of progress or reward while rating: "0 of 3 rated" is plain text.                                                                                                                                                                         | medium   |

### Leaderboard and results

| #   | Finding                                                                                                                                                                                                                                                                                                                                | Severity |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R1  | **The two views disagree.** The list page's leaderboard places provisional entries in their computed place ("Rank 1 · 6.3"), as AGENTS.md specifies. The results page says "No entry has enough votes for a place yet" and lists them separately, with the raw average ("average 8.0"). Same data, two stories, two different numbers. | high     |
| R2  | The leaderboard is a plain text list; nothing celebrates the top of a ranking.                                                                                                                                                                                                                                                         | medium   |
| R3  | On an after-close list the "Full results" link still shows, leading to a page that only says results are hidden.                                                                                                                                                                                                                       | low      |

### Index, landing, admin

| #   | Finding                                                                                                                                                                    | Severity |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| I1  | The index numbers cards 01, 02… inside each group. The numbers look like ranks but mean nothing.                                                                           | medium   |
| I2  | Landing page is a heading and buttons; demo personas are plain buttons.                                                                                                    | low      |
| A1  | Editor fieldsets nest oddly ("Who can take part" sits inside "Rating"; "Nominations per member" is both the legend and the label). The section nav covers 3 of 6 sections. | medium   |
| A2  | "New list" page has no page title (tab shows only the site name).                                                                                                          | low      |

### Visual language

- Fonts are named system fonts (Palatino, Avenir) that don't exist on most Linux and Android
  devices, so the site looks different everywhere (DejaVu/Trebuchet fallbacks).
- Green-grey neutrals with a brick-red accent, thin rules and 4 px radii: it reads as an internal
  tool. No depth, no motion, no visual identity tied to the name.
- What's already good and must survive: the token contrast test, axe on every route, skip link,
  focus management, 44 px targets, strict CSP.

## 2. Design direction: "Night cinema" (decided)

Dark-first, poster-led, with neon accents: a screening room where the community's picks are the
show. The risk is that lists aren't only movies (albums, board games, any preset), so the cinema
language lives in the frame, never in the words: no "film" copy outside the `tmdb-movie` adapter, and
text-only items get a **title card** (the item's title set like an opening credit on a coloured
panel) so they look intentional next to posters rather than like missing images.

- **Palette.** Near-black blue-ink background, layered surfaces, a marquee-gold accent for
  primary actions and scores, and a neon pink highlight for "you" (your score, your nomination).
  Cyan focus ring. A light "matinee" theme with the same roles on warm paper. Status colours (open,
  scheduled, closed, archived, draft) are a small consistent set used as pills and card edges.
- **Motif, used sparingly.** Marquee bulbs for the ballot progress (one bulb per entry, lit as you
  rate), ticket-stub shapes for countdown chips, a spotlight glow behind the #1 entry. No motif on
  buttons or inputs: clarity first.
- **Depth.** Soft glows instead of drop shadows in dark, elevation in light; 12–16 px radii;
  posters as the hero of a card.
- **Motion.** Short and purposeful: score "pop" on save, bulbs lighting, sheet slide-up,
  standings reorder, route cross-fade via the View Transitions API where supported. Everything off
  under `prefers-reduced-motion`.
- **Type.** One self-hosted display face for headings and numbers, system UI for body text.
- **Themes.** Light, dark, or follow the system, chosen by the member (Q7). The choice is stored
  only in the browser's `localStorage` and the privacy page says so.

## 3. Information architecture

### One menu

Replace both menus with a single account/menu trigger:

- **Desktop header:** brand (community icon + site name) · primary links inline (**Lists**,
  **About**) · avatar button. The avatar opens one popover with sections:
  1. Identity: avatar, display name, "Admin" pill.
  2. **Admin** (Admins only): New list, Roles, Backups.
  3. **Your data:** Privacy, Download my data, Delete my data.
  4. Sign out.
- **Mobile header:** brand · avatar (or a menu icon when signed out). It opens the same content as
  a bottom sheet (native `<dialog>`: focus trap, Escape and backdrop for free), with Lists and About
  at the top.
- **Signed out:** brand · Sign in. About and Privacy stay in the footer and the sheet.
- One component, two presentations, one source of menu items (`lib/navigation.ts`, pure and
  tested), so the Admin/member rules for the menu live in one place.

### List page

- **Hero:** title, status pill, countdown chip ("Voting closes in 28 days"), description, actions
  (Share, and Edit for Admins in an overflow menu). Copy feedback becomes a toast.
- **Tabs, not anchors:** `Rate` · `Standings` · `Nominate` (only when nominations are open),
  synced to the URL (`?tab=standings`) so they deep-link. On mobile the tab bar is sticky. On
  desktop ≥ 1024 px: entries left, standings in a sticky right column, and Nominate opens a dialog.
- **Ballot marquee:** "4 of 12 rated" as a row of bulbs that light up; a "Next unrated" button.
- **Entry card:** poster or title card, title, subtitle, nominator (when shown), and the **score chips**
  (Q3; a slider remains only for scales wider than 11 steps). Standings appear on cards only as a
  small rank badge; the numbers live in Standings (fixes
  L4). Saving is optimistic with a per-card spinner, rolled back with an inline error on failure.
- **Entry details** (Q5): tapping a card opens a sheet with a large poster, standing,
  public scores (when visible) and the score chips.
- **Focus rating mode** (Q4): "Rate one by one" shows unrated entries one at a time, large,
  with Next/Skip. Pure UI over the same ballot endpoint.
- **Nominate sheet:** search box with results as poster rows, remaining nominations counter,
  duplicate/limit errors inline.
- Fewer words: the explanatory copy moves into one collapsible "How this list works" line.

### Standings and results

- **Podium** for the top three (spotlight on #1), then rows with a score bar scaled to the list's range,
  vote count and "you: 7". Provisional rows keep their place with a dashed treatment and "needs 2
  more votes" (per AGENTS.md).
- **Sealed results** (after-close): a "sealed" card with the reveal countdown instead of a notice.
- The results page becomes the full-width, shareable version of Standings, using the same
  component, so R1 can't recur (see Q6).

### Index and landing

- Index: cards in a responsive grid, status edge colour, countdown chip, source icon; groups stay
  (Open and upcoming / Voting closed / Archived). Drop the meaningless 01–05 numbering.
- Landing: bold hero with the community badge, a one-line pitch, Sign in, Join server; demo
  personas as three tappable cards.

### Admin

- Editor: flat sections (Basics, Items, Rating, Scores, Who can take part, Nominations, Schedule),
  a sticky section nav covering all of them, and a sticky save bar on mobile. Lifecycle actions
  (schedule, close, archive, visibility) grouped in a "Lifecycle" panel with the existing confirm
  dialogs.
- Roles and Backups get the same card/table treatment.

## 4. Architecture: system vs UI, and themes

The existing rules stay: the web app imports only types from `contracts.ts`, styling lives only in
static CSS under `src/web/public` (CSP `style-src 'self'`), ESLint rejects `<style>` and `style`
bindings.

### Layers inside `src/web`

| Layer         | Folder                        | Holds                                                                                                                                       | May import                                            |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| System        | `services/`, `state/`, `lib/` | API calls, session/site state, pure helpers (unchanged)                                                                                     | contracts types, each other                           |
| System (new)  | `composables/`                | Headless behaviour per feature: `useList`, `useBallot`, `useLeaderboard`, `useNominate`, `useToast`, `useTheme`. No markup, no class names. | system layers                                         |
| UI primitives | `components/ui/`              | `AppDialog`, `AppToasts`, then `AppMenu`, `AppTabs`, `ScoreChips`… as phases need them. Props in, events out.                               | `lib/` only; **never** services, state or composables |
| Feature UI    | `components/`, `pages/`       | Templates that wire composables to primitives                                                                                               | everything above                                      |

New dependency-cruiser rules (each with a fixture case in `test/boundaries/`):

- `web-ui-primitives-dumb`: `src/web/components/ui/` may not import `services/`, `state/` or
  `composables/`.
- `web-composables-headless`: `src/web/composables/` may not import `components/` or `pages/`.

A fork that wants a different frontend keeps `services/ state/ lib/ composables/` and rewrites
`components/` and `pages/`; a fork that wants a different look only replaces the theme.

### Theme files

```
src/web/public/
  styles.css                 entry: @layer order + @imports, nothing else
  themes/night/tokens.css    colours (light + dark), type, radii, shadows, motion: the reskin surface
  styles/legacy.css          pre-redesign rules, lowest layer; each phase moves what it keeps out
  styles/base.css            reset, typography, focus, utilities
  styles/components.css      primitives (dialog, sheet, menu, tabs, chips, pills, cards)
  styles/pages.css           page layouts
```

- Cascade layers: `@layer tokens, base, components, pages, overrides;` A fork adds an
  `overrides` file without touching ours.
- Components use **role tokens only** (`--bg`, `--surface`, `--accent`, `--radius`…), never raw
  colours: a test scans `styles/*.css` for colour literals outside `themes/`.
- Each colour token is one `light-dark(light, dark)` value, so a theme states both modes once.
  `color-scheme` follows the system, and `<html data-theme="light|dark">` pins it (Q7).
- `test/web/contrast.test.ts` reads `themes/night/tokens.css` and keeps checking every pair in both
  modes; new tokens (status colours, chip states) join the pair list.
- Which theme is loaded is the `@import` line in `styles.css`. A `VITE_THEME` env switch is **not**
  added until a second theme exists ("configurable when earned").
- `docs/theming.md` documents the token list and the class-name contract (BEM, as today).

## 5. Phases (one PR, one commit series)

Each phase leaves `npm run check` green and the site usable.

1. **Foundations.** Split CSS into layers and the `night` token file (new palette); update the
   contrast test and add the colour-literal test; `AppDialog` (with `ConfirmDialog` on top of it)
   and `AppToasts` + `useToast`; the two boundary rules and fixtures; Playwright layout suite
   (no horizontal overflow at 320/375/1280 px) and its CI job; `docs/theming.md`.
2. **Shell.** Display font, merged navigation (popover/sheet), theme toggle, header, compact demo
   banner, footer, route transitions.
3. **List page and voting.** Hero, tabs, ballot marquee, entry cards and title cards, score chips,
   optimistic save, nominate sheet, entry details sheet, focus rating mode; fix L1–L8.
4. **Standings and results.** Shared standings component, podium, score bars, sealed state;
   resolve R1–R3.
5. **Index and landing.**
6. **Admin.** Editor sections and sticky save bar, lifecycle panel, Roles, Backups; fix A1–A2.
7. **Content and polish.** About, Privacy, Not found; a11y cases for every new state in
   `a11y.test.ts`; AGENTS.md "Web app" section updated; README screenshots.

## Decisions

| #   | Question                         | Decision                                                                                                                                      |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Visual direction                 | **Night cinema**: dark-first, poster-led, neon accents; title cards for items without images                                                  |
| Q2  | Fonts                            | **Self-host one OFL display face** (woff2 in `public/fonts`, no npm dependency; the CSP already allows `font-src 'self'`); system UI for body |
| Q3  | Score input                      | **Tap chips** (a radio group); slider kept only for scales wider than 11 steps                                                                |
| Q4  | Focus rating mode                | **Yes**, phase 3                                                                                                                              |
| Q5  | Entry details sheet              | **Yes**, phase 3                                                                                                                              |
| Q6  | Results page vs leaderboard (R1) | **Unify**: provisional entries in their computed place on both, from one shared component; weighted score first, raw average secondary        |
| Q7  | Theme toggle                     | **Light / Dark / System**, stored only in `localStorage`; the privacy page says so                                                            |
| Q8  | Real-browser layout tests        | **Yes**: `@playwright/test` as a dev dependency, a small overflow suite at 320/375/1280 px against the built app with a mocked API, run in CI |

## Open questions

- **Theme flash.** The CSP forbids inline scripts, so a saved theme is applied by the app's module
  script, after the stylesheet. A member whose saved choice differs from their system may see a
  brief flash on a full page load. Acceptable for now; the fix (a tiny same-origin script in
  `<head>`) would be the only non-TypeScript file in the web app.
- **Display face.** Candidate: a variable OFL grotesque with character for titles and numbers
  (shortlist in phase 2, with a screenshot comparison).
