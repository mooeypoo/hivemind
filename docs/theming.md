# Theming

The web app separates **system** (behaviour) from **UI** (markup and looks) so a community that
forks hivemind can restyle it, or replace its frontend, without touching how it works.

## What to change for what

| You want to…                          | Change                                                          | Keep                                          |
| ------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Change colours, fonts, corners, speed | `src/web/public/themes/night/tokens.css` (or a copy, see below) | everything else                               |
| Adjust a few rules                    | add a stylesheet imported into the `overrides` layer            | our stylesheets, untouched, for easy merges   |
| Restyle components                    | `src/web/public/styles/*.css`                                   | the class names in the templates              |
| Build your own frontend               | `src/web/components/`, `src/web/pages/`                         | `services/`, `state/`, `lib/`, `composables/` |

## Files

```
src/web/public/
  styles.css               entry: declares the layer order and imports the rest
  themes/night/tokens.css  the theme: every colour, font, radius, shadow and duration
  styles/legacy.css        pre-redesign rules, shrinking phase by phase (docs/redesign.md)
  styles/components.css    UI primitives (dialog, toasts, …)
```

Everything is plain CSS served as static files: the Content Security Policy (`style-src 'self'`)
blocks `<style>` blocks and `style` attributes, so ESLint rejects them in `.vue` files.

## Cascade layers

```css
@layer tokens, legacy, base, components, pages, overrides;
```

A later layer wins over an earlier one regardless of selector specificity. Put fork-specific
rules in `overrides`:

```css
/* styles.css */
@import url('my-community/overrides.css') layer(overrides);
```

## Tokens

Stylesheets in `styles/` use tokens only; a test fails if they contain a colour literal (`#hex`,
`rgb()`, `hsl()`, `oklch()`…). Each colour token is written once for both modes:

```css
--accent: light-dark(#9a4600, #ffc94d);
```

The browser picks the light or dark value from `color-scheme`, which follows the system unless
the member chose Light or Dark (`<html data-theme="light|dark">`).

| Token                                             | Role                                                    |
| ------------------------------------------------- | ------------------------------------------------------- |
| `--bg`, `--surface`, `--surface-2`                | page, raised panels, inset or hovered panels            |
| `--text`, `--muted`                               | body text, secondary text                               |
| `--border`, `--control-border`                    | decorative rules; boundaries of inputs and buttons      |
| `--accent`, `--accent-text`, `--accent-soft`      | primary actions, links and scores; text on accent; tint |
| `--highlight`                                     | what is yours: your score, your nomination              |
| `--danger`, `--success`, `--focus`                | errors and destructive actions; confirmations; focus    |
| `--backdrop`, `--shadow-color`, `--shadow-raised` | behind dialogs; elevation                               |
| `--radius`, `--radius-lg`, `--space`              | shape and rhythm                                        |
| `--font-display`, `--font-body`                   | headings and numbers; everything else                   |
| `--duration-fast`, `--duration`, `--ease-out`     | motion; zero under `prefers-reduced-motion`             |

`test/web/contrast.test.ts` checks the colour pairs that matter in both modes (4.5:1 for text,
3:1 for control borders and focus). If you add a colour token that text sits on, add its pairs.

## Making your own theme

1. Copy `themes/night/` to `themes/<name>/` and edit the values.
2. Point the theme import in `styles.css` and the path in `test/web/contrast.test.ts` at it.
3. Run `npm run check` (contrast) and `npm run test:e2e` (layout).

## Class names

Templates use BEM-style classes (`block`, `block__element`, `block--modifier`), and those class
names are the contract between templates and stylesheets. Primitives in `components/ui/` own
their blocks (`.dialog`, `.toast`); pages and feature components own theirs.
